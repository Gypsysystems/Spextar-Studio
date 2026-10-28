import { readFile } from 'node:fs/promises';
import type { Page, Route } from '@playwright/test';

export const managementPages = [
  { slug: 'reusable-content', chunk: 'reusable-content', title: 'Reusable Content', marker: 'reusable-page' },
  { slug: 'variables-conditions', chunk: 'variables-conditions', title: 'Variables & Conditions', marker: 'text-variable-default' },
  { slug: 'settings', chunk: 'project-settings', title: 'Project settings', marker: 'project-settings-page' },
  { slug: 'review', chunk: 'review', title: 'Review', marker: 'review-page' },
] as const;
export type ManagementPage = typeof managementPages[number];
const origin = 'http://127.0.0.1:4181';
const authoringSources = {
  author: 'src/pages/author.tsx',
  reviewViewer: 'src/features/review/review-draft-viewer.tsx',
} as const;
export type AuthoringDownload = keyof typeof authoringSources;

/** Resolve one emitted route asset, never a wildcard, remote URL or source module. */
export function managementChunkUrl(manifest: unknown, chunk: ManagementPage['chunk']) {
  if (!managementPages.some(page => page.chunk === chunk)) throw new Error('Unknown management route');
  return emittedChunkUrl(manifest, `src/pages/${chunk}.tsx`);
}

/** The two authoring boundaries are allowlisted independently of management routes. */
export function authoringChunkUrl(manifest: unknown, target: AuthoringDownload) {
  if (!Object.hasOwn(authoringSources, target)) throw new Error('Unknown authoring download');
  return emittedChunkUrl(manifest, authoringSources[target]);
}

function emittedChunkUrl(manifest: unknown, source: string) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid build manifest');
  const entry: unknown = (manifest as Record<string, unknown>)[source];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Missing dynamic entry');
  const asset = entry as Record<string, unknown>;
  if (asset.isDynamicEntry !== true || typeof asset.file !== 'string'
    || !/^assets\/[A-Za-z0-9_-]+\.js(?![\s\S])/.test(asset.file)) throw new Error('Invalid management asset');
  return `${origin}/${asset.file}`;
}

/** Test-only local download failure. All other traffic still uses the fail-closed wire fixture. */
export async function rejectManagementChunk(page: Page, item: ManagementPage, kind: 'missing' | 'network') {
  return rejectExactAsset(page, managementChunkUrl(await buildManifest(), item.chunk), kind);
}

export async function rejectAuthoringChunk(page: Page, target: AuthoringDownload, kind: 'missing' | 'network') {
  return rejectExactAsset(page, authoringChunkUrl(await buildManifest(), target), kind);
}

async function buildManifest(): Promise<unknown> {
  // Read at test runtime, after Playwright's production webServer build has completed.
  return JSON.parse(await readFile(new URL(
    '../../../generated-artifacts/browser-regression/app/.vite/manifest.json', import.meta.url,
  ), 'utf8'));
}

async function rejectExactAsset(page: Page, url: string, kind: 'missing' | 'network') {
  let attempts = 0;
  let restored = false;
  const handler = async (route: Route) => {
    const request = route.request();
    if (request.url() !== url || request.method() !== 'GET' || request.resourceType() !== 'script') {
      throw new Error('Chunk fault must target only the exact local script GET');
    }
    attempts++;
    if (kind === 'network') await route.abort('connectionfailed');
    else await route.fulfill({
      status: 404, contentType: 'text/javascript', headers: { 'cache-control': 'no-store' },
      body: '// Controlled missing lazy asset; no application code executes.',
    });
  };
  await page.route(url, handler);
  return {
    url,
    get attempts() { return attempts; },
    async restore() {
      if (restored) return;
      await page.unroute(url, handler);
      restored = true;
    },
  };
}
