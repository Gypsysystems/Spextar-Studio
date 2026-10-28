import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isolatedEnvironment, privateCanary } from '../../scripts/readiness';

const source = path.resolve(process.cwd(), 'scripts/readiness.ts');
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const subject = 'SYNTHETIC_SESSION_SUBJECT_DO_NOT_LOG';
const session = `${encode({ alg: 'HS256' })}.${encode({ role: 'authenticated', sub: subject })}.synthetic`;
const service = `${encode({ alg: 'HS256' })}.${encode({ role: 'service_role', sub: subject })}.synthetic`;
const url = 'https://synthetic-cli-project.supabase.co';
const publicKey = 'sb_publishable_synthetic_cli_not_an_issued_key';
const secret = 'sb_' + 'secret_synthetic_cli_not_an_issued_key';
const database = 'postgresql://synthetic_cli:synthetic_password@invalid.example/db';
const pem = '-----BEGIN ' + 'PRIVATE KEY-----';
const forbidden = [url, 'synthetic-cli-project.supabase.co', publicKey, secret, privateCanary,
  session, service, subject, session.split('.')[1], service.split('.')[1], database, 'synthetic_password', pem];
const roots: string[] = [];

async function fixture(folder = 'studio') {
  const root = await mkdtemp(path.join(tmpdir(), 'spextar-cli-'));
  roots.push(root);
  const studio = path.join(root, 'artifacts', folder);
  const entry = path.join(studio, 'scripts/readiness.ts');
  const output = path.join(studio, 'dist/public');
  await mkdir(path.dirname(entry), { recursive: true });
  await copyFile(source, entry); // Execute the exact repository CLI, not a reimplementation.
  await writeFile(path.join(studio, 'package.json'), '{"type":"module"}');
  await mkdir(path.join(output, '.vite'), { recursive: true });
  await mkdir(path.join(output, 'assets'), { recursive: true });
  await writeFile(path.join(output, 'index.html'), '<!doctype html><main>synthetic candidate</main>');
  await writeFile(path.join(output, '.vite/manifest.json'), JSON.stringify({
    'src/main.tsx': { file: 'assets/index.js', isEntry: true },
  }));
  await writeFile(path.join(output, 'assets/index.js'), 'export const synthetic = true;');
  return { root, studio, entry, output };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function run(f: Fixture, command = 'scan', args: string[] = []) {
  return spawnSync(process.execPath, [f.entry, command, ...args], {
    cwd: f.studio, env: isolatedEnvironment(process.env, {}), encoding: 'utf8',
    timeout: 5000, maxBuffer: 1024 * 1024,
  });
}
function check(result: ReturnType<typeof run>, status: number) {
  // Boolean assertions intentionally keep even failing test reports free of control values.
  expect(Boolean(result.error), 'CLI must terminate without a spawn error or timeout').toBe(false);
  expect(result.signal === null, 'CLI must exit normally').toBe(true);
  const text = result.stdout + result.stderr;
  const leaked = forbidden.some(value => text.includes(value) || text.includes(encodeURIComponent(value)));
  expect(leaked, 'CLI diagnostics must redact all synthetic configuration/token controls').toBe(false);
  expect(result.status).toBe(status);
  if (status === 0) {
    expect(text.startsWith('PASS: production candidate client asset exposure scan')).toBe(true);
    expect(result.stderr.length).toBe(0);
  } else {
    expect(result.stdout.length).toBe(0);
    expect(result.stderr.length > 0, 'Failure must have a safe actionable diagnostic').toBe(true);
  }
  return text;
}

describe('readiness CLI subprocess exit status and diagnostic redaction', () => {
  afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

  it('accepts a benign candidate containing public config without printing its values', async () => {
    const f = await fixture();
    await writeFile(path.join(f.output, 'assets/lazy.js.map'), JSON.stringify({ url, publicKey, roleVocabulary: 'service_role' }));
    check(run(f), 0);
  });

  const exposures = [
    { kind: 'private canary', value: privateCanary, category: 'private canary' },
    { kind: 'secret key', value: secret, category: 'Supabase secret key' },
    { kind: 'session JWT', value: session, category: 'privileged/session JWT' },
    { kind: 'service JWT', value: service, category: 'privileged/session JWT' },
    { kind: 'database credentials', value: database, category: 'database credential URL' },
    { kind: 'private key', value: pem, category: 'private key' },
  ].flatMap(item => ['index.html', 'assets/nested/lazy.js.map'].map(file => ({ ...item, file })));
  it.each(exposures)('rejects $kind in $file with categories, never contents', async ({ value, category, file }) => {
    const f = await fixture();
    await mkdir(path.dirname(path.join(f.output, file)), { recursive: true });
    await writeFile(path.join(f.output, file), JSON.stringify({ url, publicKey, value }));
    const diagnostic = check(run(f), 1);
    expect(diagnostic.includes(category)).toBe(true);
  });

  it.each(['dist/public', 'dist/public/index.html', 'dist/public/.vite/manifest.json'])('rejects a missing required artifact: %s', async file => {
    const f = await fixture();
    await rm(path.join(f.studio, file), { recursive: true, force: true });
    check(run(f), 1);
  });

  it.each(['index.html', '.vite/manifest.json'])('rejects a directory masquerading as required file: %s', async file => {
    const f = await fixture();
    await rm(path.join(f.output, file));
    await mkdir(path.join(f.output, file));
    check(run(f), 1);
  });

  it.each(['.env', '.env.production', '.npmrc'])('rejects emitted environment files without dumping their contents: %s', async file => {
    const f = await fixture();
    await writeFile(path.join(f.output, file), JSON.stringify({ url, publicKey, session }));
    check(run(f), 1);
  });

  it.each(['asset', 'directory', 'root'])('rejects a linked %s even if its target appears benign', async kind => {
    const f = await fixture();
    if (kind === 'root') {
      const outside = path.join(f.root, 'outside');
      await mkdir(path.join(outside, '.vite'), { recursive: true });
      await writeFile(path.join(outside, 'index.html'), 'safe');
      await writeFile(path.join(outside, '.vite/manifest.json'), '{}');
      await rm(f.output, { recursive: true });
      await symlink(outside, f.output);
    } else {
      const target = path.join(f.root, 'outside');
      if (kind === 'directory') await mkdir(target);
      else await writeFile(target, 'safe');
      await symlink(target, path.join(f.output, 'assets/link'));
    }
    check(run(f), 1);
  });

  it.each([
    { kind: 'Supabase host', value: 'synthetic-cli-project.supabase.co' },
    { kind: 'publishable key', value: publicKey },
    { kind: 'secret control', value: secret },
    { kind: 'session token', value: session },
  ])('does not echo $kind embedded in a failing filesystem path', async ({ value }) => {
    const f = await fixture(value);
    await rm(path.join(f.output, 'index.html'));
    check(run(f), 1);
  });

  it('redacts unexpected dependency errors instead of printing their messages or stacks', async () => {
    const f = await fixture();
    const dependency = path.join(f.studio, 'node_modules/vite');
    const marker = path.join(f.root, 'dependency-called');
    await mkdir(dependency, { recursive: true });
    await writeFile(path.join(dependency, 'package.json'), '{"type":"module","exports":"./index.js"}');
    await writeFile(path.join(dependency, 'index.js'),
      `import { writeFileSync } from 'node:fs'; export async function build() {
        writeFileSync(${JSON.stringify(marker)}, 'called');
        throw new Error(${JSON.stringify(forbidden.join(' '))});
      }`);
    check(run(f, 'build', ['valid']), 1);
    expect(await readFile(marker, 'utf8')).toBe('called');
  });

  it('does not echo an unsupported command or variant', async () => {
    const f = await fixture();
    check(run(f, publicKey), 1);
    check(run(f, 'build', [secret]), 1);
  });
});
