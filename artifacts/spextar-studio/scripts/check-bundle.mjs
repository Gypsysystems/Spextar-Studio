import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../dist/public/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', root), 'utf8'));
const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
const author = 'src/pages/author.tsx';
const reviewViewer = 'src/features/review/review-draft-viewer.tsx';
assert.ok(entry, 'Missing application entry');
assert.ok(manifest[author]?.isDynamicEntry, 'Author must remain a dynamic route entry');
function staticGraph(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const imported of manifest[key].imports ?? []) staticGraph(imported, seen);
  return seen;
}
const initial = staticGraph(entry);
assert.ok(!initial.has(author), 'Author must not be statically reachable from the application entry');
assert.ok(manifest[reviewViewer]?.isDynamicEntry, 'Review viewer must remain a dynamic entry');
assert.ok(!initial.has(reviewViewer), 'Review viewer must not be statically reachable from the application entry');
assert.ok([...initial].some((key) => manifest[key].dynamicImports?.includes(reviewViewer)), 'Missing lazy Review viewer import');
assert.ok([...initial].some((key) => manifest[key].dynamicImports?.includes(author)), 'Missing lazy Author import');
for (const key of initial) {
  const source = await readFile(new URL(manifest[key].file, root), 'utf8');
  assert.ok(!source.includes('ProseMirror'), `Editor engine leaked into initial JavaScript: ${key}`);
}
const deferred = [...staticGraph(author)].filter((key) => !initial.has(key));
const deferredReview = [...staticGraph(reviewViewer)].filter((key) => !initial.has(key));
assert.ok((await Promise.all(deferredReview.map((key) => readFile(new URL(manifest[key].file, root), 'utf8'))))
  .some((source) => source.includes('ProseMirror')), 'Expected editor engine behind the deferred Review viewer');
assert.ok((await Promise.all(deferred.map((key) => readFile(new URL(manifest[key].file, root), 'utf8'))))
  .some((source) => source.includes('ProseMirror')), 'Expected editor engine in the deferred Author graph');
for (const [label, keys] of [['initial', [...initial]], ['deferred Author', deferred], ['deferred Review viewer', deferredReview]]) {
  const sizes = await Promise.all(keys.map(async (key) => ({ file: manifest[key].file, bytes: (await stat(new URL(manifest[key].file, root))).size })));
  console.log(`${label}: ${sizes.reduce((sum, item) => sum + item.bytes, 0)} JavaScript bytes`, sizes);
}
console.log('PASS: Author/editor and Review viewer are deferred and absent from the initial JavaScript graph.');
