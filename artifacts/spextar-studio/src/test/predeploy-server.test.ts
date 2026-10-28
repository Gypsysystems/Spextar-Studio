import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createReadinessServer } from '../../scripts/readiness';

const html = '<!doctype html><main>Synthetic readiness shell</main>';
const marker = 'PRIVATE_FIXTURE_MUST_NOT_BE_SERVED';
const server = createReadinessServer;
let running: ReturnType<typeof server>;
let root: string;
let port: number;

function send(target: string, method = 'GET', headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: target, method, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Local readiness response did not finish')));
    req.end();
  });
}

describe('isolated local readiness HTTP server', () => {
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'spextar-readiness-http-'));
    const output = path.join(root, 'valid');
    await mkdir(path.join(output, 'assets'), { recursive: true });
    await mkdir(path.join(output, 'directory'));
    await mkdir(path.join(output, '.vite'));
    await mkdir(path.join(root, 'bad-mode'), { recursive: true });
    await writeFile(path.join(output, 'index.html'), html);
    const assets = {
      'app.js': 'export const synthetic = true;',
      'app.css': ':root { color: white; }',
      'data.json': '{"synthetic":true}',
      'logo.svg': '<svg/>',
      'font.woff2': 'synthetic font',
      'pixel.png': 'synthetic png',
      'favicon.ico': 'synthetic icon',
      'opaque.bin': 'synthetic binary',
      'extensionless': 'synthetic asset',
    };
    await Promise.all(Object.entries(assets).map(([file, body]) => writeFile(path.join(output, 'assets', file), body)));
    await writeFile(path.join(root, 'outside.txt'), marker);
    await writeFile(path.join(output, '.env'), marker);
    await writeFile(path.join(output, '.vite/manifest.json'), marker);
    await writeFile(path.join(root, 'bad-mode/index.html'), 'Other isolated variant');
    await symlink(path.join(root, 'outside.txt'), path.join(output, 'assets/linked.txt'));
    await symlink(path.join(root, 'bad-mode'), path.join(output, 'linked-directory'));
    await symlink(path.join(root, 'bad-mode'), path.join(root, 'missing-mode'));
    await mkdir(path.join(root, 'missing-key'));
    await symlink(path.join(root, 'outside.txt'), path.join(root, 'missing-key/index.html'));
    running = server(root);
    await new Promise<void>(resolve => running.listen(0, '127.0.0.1', resolve));
    port = (running.address() as AddressInfo).port;
  });
  afterAll(async () => {
    running?.closeAllConnections();
    if (running) await new Promise<void>((resolve, reject) => running.close(error => error ? reject(error) : resolve()));
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('listens only on the explicitly selected loopback socket', () => {
    expect((running.address() as AddressInfo).address).toBe('127.0.0.1');
  });

  it.each([
    ['app.js', 'text/javascript'], ['app.css', 'text/css'], ['data.json', 'application/json'],
    ['logo.svg', 'image/svg+xml'], ['font.woff2', 'font/woff2'], ['pixel.png', 'image/png'],
    ['favicon.ico', 'image/x-icon'], ['opaque.bin', 'application/octet-stream'],
    ['extensionless', 'application/octet-stream'],
  ])('serves %s with its existing MIME type and no-store policy', async (file, mime) => {
    const res = await send(`/valid/assets/${file}?cache=ignored`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(mime);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it.each(['/valid/', '/valid/sign-in', '/valid/workspaces/workspace/projects/project/author?topic=synthetic',
    '/valid/workspaces/workspace/projects/project/variables-conditions', '/valid/directory/'])(
    'uses the shell only for safe extensionless deep links: %s', async target => {
      const res = await send(target);
      expect(res.status).toBe(200);
      expect(res.body).toBe(html);
      expect(res.headers['content-type']).toBe('text/html');
      expect(res.headers['cache-control']).toBe('no-store');
    });

  it.each(['/valid/assets/missing.js', '/valid/assets/missing.css', '/valid/missing.svg',
    '/valid/assets/missing', '/valid/assets/', '/unknown/sign-in', '/', '/validity/index.html'])(
    'does not serve SPA HTML for missing resources or unknown variants: %s', async target => {
      const res = await send(target);
      expect(res.status).toBe(404);
      expect(res.body).toBe('');
    });

  it.each(['/valid/.env', '/valid/%2eenv', '/valid/.vite/manifest.json',
    '/valid/../bad-mode/index.html', '/valid/%2e%2e/bad-mode/index.html',
    '/valid/./index.html', '/valid/assets/../../outside.txt', '/valid/%2e%2e%2fbad-mode/index.html',
    '/valid/assets/linked.txt', '/valid/linked-directory/index.html',
    '/missing-mode/index.html', '/missing-key/author', '/valid/assets%5clinked.txt',
    '/valid/%00', '//valid/index.html', '/valid/%2e%2e%5cbad-mode/index.html'])(
    'rejects traversal, hidden paths and linked resources: %s', async target => {
      const res = await send(target);
      expect(res.status).toBe(404);
      expect(res.body).toBe('');
      expect(res.body.includes(marker)).toBe(false);
    });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE'])('rejects unsupported %s without serving content', async method => {
    const res = await send('/valid/index.html', method);
    expect(res.status).toBe(405);
    expect(res.body).toBe('');
  });

  it.each(['/valid/%', '/valid/%E0%A4%A', '/valid/%FF'])('fails safely on malformed encodings: %s', async target => {
    const res = await send(target);
    expect(res.status).toBe(400);
    expect(res.body).toBe('');
  });

  it.each(['/valid/index.html', '/valid/assets/app.js', '/valid/workspaces/project/author'])(
    'HEAD preserves GET status/type/cache policy without a response body: %s', async target => {
      const get = await send(target);
      const head = await send(target, 'HEAD');
      expect(head.status).toBe(get.status);
      expect(head.headers['content-type']).toBe(get.headers['content-type']);
      expect(head.headers['cache-control']).toBe(get.headers['cache-control']);
      expect(head.body).toBe('');
    });

  it('does not use conditional or range requests to bypass full no-store fixture responses', async () => {
    const res = await send('/valid/index.html', 'GET', {
      'if-none-match': '*', 'if-modified-since': new Date().toUTCString(), range: 'bytes=0-4',
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe(html);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers.etag).toBeUndefined();
    expect(res.headers['last-modified']).toBeUndefined();
    expect(res.headers['content-range']).toBeUndefined();
  });

  it('keeps HEAD failure status and empty body aligned with GET', async () => {
    for (const target of ['/valid/assets/missing.js', '/valid/.env', '/valid/%FF', '/wrong-url/author']) {
      const get = await send(target);
      const head = await send(target, 'HEAD');
      expect(head.status).toBe(get.status);
      expect(head.body).toBe('');
      expect(head.headers['content-type']).toBeUndefined();
    }
  });

  it('returns safe failure for a known variant without its built index', async () => {
    const res = await send('/wrong-url/author');
    expect(res.status).toBe(400);
    expect(res.body).toBe('');
    expect((await send('/valid/index.html')).status).toBe(200);
  });
});
