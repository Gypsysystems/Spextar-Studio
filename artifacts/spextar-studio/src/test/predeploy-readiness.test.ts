import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clientExposure, isolatedEnvironment, privateCanary, scanClient } from '../../scripts/readiness';
import { localFixtureOrigins } from '../../e2e/local-origins';

describe('pre-deploy build isolation and client exposure checks', () => {
  it('allows only explicitly selected fixed loopback servers', () => {
    expect([...localFixtureOrigins(['http://127.0.0.1:4182'])]).toEqual(['http://127.0.0.1:4182']);
  });
  it.each([
    [], ['https://luyyxblmtupmugtazgbr.supabase.co'], ['http://127.0.0.1:9999'],
    ['http://127.0.0.1:4182/'], ['https://127.0.0.1:4182'], ['http://localhost:4182'],
  ].map(origins => ({ origins })))('never widens local-server allowlists: $origins', ({ origins }) => {
    expect(() => localFixtureOrigins(origins)).toThrow('fixed loopback');
  });
  it('inherits only toolchain fields, never server secrets or unapproved VITE fields', () => {
    const env = isolatedEnvironment({
      PATH: '/safe/bin', HOME: '/safe/home', SESSION_SECRET: privateCanary,
      SUPABASE_SERVICE_ROLE_KEY: privateCanary, VITE_UNAPPROVED: privateCanary,
      VITE_SUPABASE_URL: 'https://wrong.invalid',
    }, { VITE_STUDIO_MODE: 'backend' });
    expect(env).toEqual({ PATH: '/safe/bin', HOME: '/safe/home', NODE_ENV: 'production', PORT: '4182', BASE_PATH: '/', VITE_STUDIO_MODE: 'backend' });
  });
  it('does not silently accept an unapproved public field', () => {
    expect(() => isolatedEnvironment({}, { VITE_SERVICE_ROLE_KEY: privateCanary })).toThrow('Unsupported public');
  });
  it('omits absent public fields rather than inheriting them', () => {
    expect(isolatedEnvironment({ VITE_STUDIO_MODE: 'demo' }, { VITE_STUDIO_MODE: undefined })).not.toHaveProperty('VITE_STUDIO_MODE');
  });
  it.each([
    [privateCanary, 'private canary'],
    ['sb_' + 'secret_synthetic_canary_not_a_real_key', 'Supabase secret key'],
    ['-----BEGIN ' + 'PRIVATE KEY-----', 'private key'],
    ['postgresql://synthetic:synthetic@invalid.example/db', 'database credential URL'],
  ])('detects exposure category without returning the value: %s', (text, category) => {
    expect(clientExposure(text)).toEqual([category]);
    expect(clientExposure(text).join()).not.toContain(text);
  });
  it.each(['service_role', 'authenticated'])('rejects embedded %s JWTs without logging their decoded contents', role => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'HS256' })}.${encode({ role, sub: 'synthetic' })}.synthetic`;
    expect(clientExposure(token)).toEqual(['privileged/session JWT']);
  });
  it.each(['sb_publishable_synthetic', 'service_role', 'password', 'eyJbad.notJSON.synthetic'])('does not flag a public key, library vocabulary or malformed token: %s', text => {
    expect(clientExposure(text)).toEqual([]);
  });
  const dirs: string[] = [];
  afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
  it('recursively scans lazy assets and sourcemaps, not only the initial entry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'spextar-exposure-')); dirs.push(root);
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'index.html'), '<div>safe</div>');
    await writeFile(path.join(root, 'assets/lazy.js.map'), JSON.stringify({ source: privateCanary }));
    expect(await scanClient(root)).toEqual([{ file: 'assets/lazy.js.map', categories: ['private canary'] }]);
  });
  it('rejects symlinks rather than reading outside the emitted build', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'spextar-exposure-')); dirs.push(root);
    await symlink(tmpdir(), path.join(root, 'escape'));
    await expect(scanClient(root)).rejects.toThrow('symlinks');
  });
  it.each(['.env.production', '.npmrc'])('rejects emitted credential file %s even without a recognizable token', async name => {
    const root = await mkdtemp(path.join(tmpdir(), 'spextar-exposure-')); dirs.push(root);
    await writeFile(path.join(root, name), 'unknown_private_value=synthetic');
    expect(await scanClient(root)).toEqual([{ file: name, categories: ['environment/credential file'] }]);
  });
});
