// Optional native test backend. Always creates its own empty, loopback-only
// cluster; never consumes PGHOST, DATABASE_URL, Supabase config or credentials.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, openSync, closeSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function openDatabase() {
  const bin = process.env.SPEXTAR_TEST_POSTGRES_BIN;
  if (!bin) {
    const moduleName = process.env.PGLITE_MODULE_PATH;
    const { PGlite } = await import(moduleName ? pathToFileURL(moduleName).href : '@electric-sql/pglite');
    return new PGlite();
  }
  const driver = process.env.SPEXTAR_TEST_PG_MODULE;
  if (!driver) throw new Error('Set SPEXTAR_TEST_PG_MODULE to the installed pg module index.js');
  const { default: pg } = await import(pathToFileURL(path.resolve(driver)).href);
  pg.types.setTypeParser(20, Number); // bounded fixture counts, matching PGlite
  const directory = mkdtempSync(path.join(tmpdir(), 'spextar-disposable-pg-'));
  const data = path.join(directory, 'data');
  const executable = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^PG/.test(key)) delete env[key];
  const run = (name, args) => {
    // Windows postgres descendants can retain pg_ctl's pipe handles indefinitely.
    // A file captures diagnostics without waiting for server-owned pipes to close.
    const output = path.join(directory, `${name}.log`), fd = openSync(output, 'w');
    let result;
    try { result = spawnSync(executable(name), args, { env, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 60000 }); }
    finally { closeSync(fd); }
    if (result.status !== 0) throw new Error(`${name}: ${result.error ?? readFileSync(output, 'utf8')}`);
  };
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  writeFileSync(path.join(data, 'pg_hba.conf'), 'host all all 127.0.0.1/32 trust\nhost all all 0.0.0.0/0 reject\nhost all all ::0/0 reject\n');
  console.log('Initializing isolated PostgreSQL at', directory, 'port', port);
  try {
    // No shared Unix socket directory: unprivileged Linux runners cannot write
    // the distribution's /var/run/postgresql. Tests use loopback TCP exclusively.
    const sockets = process.platform === 'win32' ? '' : " -c unix_socket_directories=''";
    run('pg_ctl', ['-D', data, '-l', path.join(directory, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}${sockets}`, '-w', 'start']);
  } catch (e) {
    // Even a startup timeout must not leave our own newly created server running.
    try { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); } catch { /* preserve startup diagnostic */ }
    throw e;
  }
  const clients = [];
  const connect = async () => {
    const client = new pg.Client({
      host: '127.0.0.1', port, user: 'postgres', database: 'postgres',
      // Truthy explicit values also prevent pg's empty-value environment fallback.
      password: () => '', ssl: false, options: '-c timezone=UTC',
      application_name: 'spextar-disposable-validation', connectionTimeoutMillis: 10000,
    });
    await client.connect(); clients.push(client);
    await client.query("set statement_timeout='15s'; set lock_timeout='5s'");
    return client;
  };
  try {
    const client = await connect();
    console.log('Native disposable engine:', (await client.query('select version()')).rows[0].version);
    console.log('New local cluster:', directory, 'port', port);
    return {
      native: true, connect,
      // Always a newly allocated synthetic loopback cluster; useful for local CLI checks.
      localConnectionString: `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
      // Fixture arrays are JSONB values, not PostgreSQL array parameters.
      query: (sql, args) => client.query(sql, args?.map(v => Array.isArray(v) ? JSON.stringify(v) : v)),
      exec: sql => client.query(sql),
      close: async () => {
        await Promise.allSettled(clients.map(c => c.end()));
        run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
      },
    };
  } catch (e) { await Promise.allSettled(clients.map(c => c.end())); run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); throw e; }
}

export async function recordReplay(db, files) {
  if (!db.native) return;
  const inventory = JSON.parse(readFileSync(new URL('../readiness/application-contract.json', import.meta.url), 'utf8')).rpcs;
  for (const group of ['atomicParameters', 'documentTopicOperations', 'reviewOperations', 'releaseOperations']) {
    for (const [name, parameters] of Object.entries(inventory[group])) {
      const rows = (await db.query(`select p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [name])).rows;
      assert.equal(rows.length, 1, `No overload/signature discovery: ${name}`);
      assert.deepEqual(rows[0].proargnames, parameters, `Exact RPC arguments: ${name}`);
    }
  }
  console.log('All 15 inventoried public RPC names/argument lists match native catalog; no overloads.');
  const contract = {};
  for (const [name, sql] of Object.entries({
    columns: `select table_schema,table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema in ('public','app_private') order by 1,2,ordinal_position`,
    functions: `select n.nspname,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') order by 1,2,pg_get_function_identity_arguments(p.oid)`,
    policies: `select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','app_private') order by 1,2,3`,
    tables: `select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private') and c.relkind='r' order by 1,2`,
    constraints: `select n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private') order by 1,2,3`,
    triggers: `select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private') and not t.tgisinternal order by 1,2,3`,
    indexes: `select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','app_private') order by 1,2,3`,
    types: `select n.nspname,t.typname,t.typtype,e.enumlabel,e.enumsortorder from pg_type t join pg_namespace n on n.oid=t.typnamespace left join pg_enum e on e.enumtypid=t.oid where n.nspname in ('public','app_private') order by 1,2,e.enumsortorder`,
  })) contract[name] = (await db.query(sql)).rows;
  console.log('Exact ordered native replay:', files.length, 'migrations; pgcrypto', (await db.query("select extversion from pg_extension where extname='pgcrypto'")).rows[0].extversion);
  console.log('Replayed contract SHA256:', createHash('sha256').update(JSON.stringify(contract)).digest('hex'));
  return contract;
}
