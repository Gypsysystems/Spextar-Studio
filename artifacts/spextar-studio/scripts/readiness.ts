import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, rm, stat, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const studio = path.resolve(path.dirname(here), '..');
export const readinessRoot = path.resolve(studio, '../../generated-artifacts/predeploy-readiness');
export const privateCanary = 'SPEXTAR_SYNTHETIC_PRIVATE_CANARY_NOT_A_CREDENTIAL';
const publicConfig = {
  VITE_STUDIO_MODE: 'backend',
  VITE_SUPABASE_URL: 'https://luyyxblmtupmugtazgbr.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_controlled_browser_test_only',
};
export const variants = {
  valid: {},
  'missing-mode': { VITE_STUDIO_MODE: undefined },
  'bad-mode': { VITE_STUDIO_MODE: 'unsupported' },
  'missing-url': { VITE_SUPABASE_URL: undefined },
  'wrong-url': { VITE_SUPABASE_URL: 'https://unapproved-project.invalid' },
  'missing-key': { VITE_SUPABASE_PUBLISHABLE_KEY: undefined },
  'malformed-key': { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' },
  'secret-key': { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_' + 'secret_synthetic_canary_not_a_real_key' },
} satisfies Record<string, Record<string, string | undefined>>;
export type Variant = keyof typeof variants;

/** Only deliberately authored diagnostics may reach CLI stderr. Never echo arbitrary errors. */
class ReadinessFailure extends Error {}

/** Never spread the parent environment, read real credentials, or load .env files. */
export function isolatedEnvironment(source: NodeJS.ProcessEnv, config: Record<string, string | undefined>) {
  const env: Record<string, string> = { NODE_ENV: 'production', PORT: '4182', BASE_PATH: '/' };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'SYSTEMROOT']) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  for (const [key, value] of Object.entries(config)) {
    if (!Object.hasOwn(publicConfig, key)) throw new ReadinessFailure('Unsupported public configuration field');
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/** Return categories only: never include a matched token, key, or decoded payload. */
export function clientExposure(text: string): string[] {
  const found = new Set<string>();
  if (text.includes(privateCanary)) found.add('private canary');
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) found.add('Supabase secret key');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) found.add('private key');
  if (/postgres(?:ql)?:\/\/[^\s"'<>:]+:[^\s"'<>@]+@/.test(text)) found.add('database credential URL');
  for (const token of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role' || payload.role === 'authenticated') found.add('privileged/session JWT');
    } catch { /* Non-token library strings are not credentials. */ }
  }
  return [...found];
}

export async function scanClient(root: string): Promise<{ file: string; categories: string[] }[]> {
  const findings: { file: string; categories: string[] }[] = [];
  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new ReadinessFailure('Client output must not contain symlinks');
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        const categories = clientExposure((await readFile(file)).toString('utf8'));
        if (entry.name === '.env' || entry.name.startsWith('.env.') || entry.name === '.npmrc') categories.push('environment/credential file');
        if (categories.length) findings.push({ file: path.relative(root, file), categories });
      }
    }
  }
  await visit(root);
  return findings;
}

async function scanCandidate() {
  const root = path.join(studio, 'dist/public');
  if (!(await lstat(root).catch(() => null))?.isDirectory()) {
    throw new ReadinessFailure('Production candidate output is missing or not a real directory. Rebuild the candidate.');
  }
  for (const file of ['index.html', '.vite/manifest.json']) {
    if (!(await lstat(path.join(root, file)).catch(() => null))?.isFile()) {
      throw new ReadinessFailure('Production candidate requires regular index and manifest files. Rebuild the candidate.');
    }
  }
  const findings = await scanClient(root);
  if (findings.length) {
    const categories = [...new Set(findings.flatMap(f => f.categories))].join(', ');
    throw new ReadinessFailure(`Candidate client assets contain prohibited credential patterns (${categories}). Remove server credentials from public configuration and rebuild.`);
  }
  console.log('PASS: production candidate client asset exposure scan (including lazy assets and maps)');
}

async function buildVariant(name: string) {
  if (!Object.hasOwn(variants, name)) throw new ReadinessFailure('Unknown readiness variant');
  // These are intentionally fake server-side markers, not inherited environment secrets.
  process.env.SPEXTAR_PRIVATE_CANARY = privateCanary;
  process.env.SESSION_SECRET = privateCanary;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_' + 'secret_synthetic_server_canary_not_a_real_key';
  const { build } = await import('vite');
  await build({
    configFile: path.join(studio, 'vite.config.ts'), envDir: false,
    base: `/${name}/`, mode: 'production', logLevel: 'silent',
    build: { outDir: path.join(readinessRoot, name), emptyOutDir: true },
  });
}

async function prepare() {
  await rm(readinessRoot, { recursive: true, force: true });
  await mkdir(readinessRoot, { recursive: true });
  for (const name of Object.keys(variants) as Variant[]) {
    const config = { ...publicConfig, ...variants[name] };
    const child = spawnSync(process.execPath, [here, 'build', name], {
      cwd: studio, env: isolatedEnvironment(process.env, config), encoding: 'utf8',
    });
    await writeFile(path.join(readinessRoot, `${name}.log`), (child.stdout ?? '') + (child.stderr ?? ''));
    if (child.status !== 0) throw new ReadinessFailure(`Readiness build failed: ${name}`);
    const findings = await scanClient(path.join(readinessRoot, name));
    if (name === 'secret-key') {
      if (!findings.some(f => f.categories.includes('Supabase secret key'))) throw new ReadinessFailure('Secret-key negative control did not trip the scanner');
    } else if (findings.length) throw new ReadinessFailure(`Unexpected client exposure: ${name}`);
    console.log(`PASS: isolated production build and exposure control: ${name}`);
  }
}

const mime: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon',
};
/** Local fixture server only; the caller owns listening and teardown. */
export function createReadinessServer(outputRoot = readinessRoot) {
  return createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      // Inspect the original target: URL parsing normalizes dot segments before validation.
      const pathname = decodeURIComponent((req.url ?? '/').split(/[?#]/, 1)[0]);
      if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\0]/.test(pathname)) {
        res.writeHead(404).end(); return;
      }
      const [name, ...parts] = pathname.slice(1).split('/');
      if (!Object.hasOwn(variants, name) || parts.some(p => p.startsWith('.'))) { res.writeHead(404).end(); return; }
      const root = path.join(outputRoot, name);
      let file = path.resolve(root, ...parts);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
      // The scanner rejects links too. Never follow a variant root, parent or file link.
      let current = root;
      for (const part of ['', ...parts]) {
        current = path.join(current, part);
        if ((await lstat(current).catch(() => null))?.isSymbolicLink()) { res.writeHead(404).end(); return; }
      }
      if (!(await stat(file).catch(() => null))?.isFile()) {
        if (path.extname(file) || parts[0] === 'assets') { res.writeHead(404).end(); return; }
        file = path.join(root, 'index.html'); // Deep links only; missing assets must never receive HTML.
      }
      if ((await lstat(file)).isSymbolicLink()) { res.writeHead(404).end(); return; }
      // Read before committing headers so a missing/unreadable fallback terminates safely.
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(400).end(); }
  });
}

async function serve() {
  const server = createReadinessServer();
  server.listen(4182, '127.0.0.1', () => console.log('Isolated readiness server listening on loopback:4182'));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => server.close(() => process.exit(0)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === here) {
  const command = process.argv[2];
  const action = command === 'scan' ? scanCandidate()
    : command === 'prepare' ? prepare()
    : command === 'serve' ? serve()
    : command === 'build' ? buildVariant(process.argv[3])
    : Promise.reject(new ReadinessFailure('Use scan, prepare or serve'));
  action.catch(error => {
    console.error(error instanceof ReadinessFailure ? error.message
      : 'Readiness failed. Check candidate files and build configuration. Diagnostic details were redacted.');
    process.exitCode = 1;
  });
}
