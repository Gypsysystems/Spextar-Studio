import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../dist/public/', import.meta.url);
const budget = JSON.parse(await readFile(new URL('./bundle-budget.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', root), 'utf8'));
const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
const author = 'src/pages/author.tsx';
const reviewViewer = 'src/features/review/review-draft-viewer.tsx';
const management = ['reusable-content', 'variables-conditions', 'project-settings', 'review'].map(name => `src/pages/${name}.tsx`);
assert.ok(entry, 'Missing application entry');
assert.ok(manifest[author]?.isDynamicEntry, 'Author must remain a dynamic route entry');
function staticGraph(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const imported of manifest[key].imports ?? []) staticGraph(imported, seen);
  return seen;
}
const initial = staticGraph(entry);
const initialBytes = (await Promise.all([...initial].map(key => stat(new URL(manifest[key].file, root)))))
  .reduce((total, file) => total + file.size, 0);
assert.ok(Number.isSafeInteger(budget.maxInitialBytes) && budget.maxInitialBytes > 0, 'Invalid initial JavaScript budget');
assert.ok(initialBytes <= budget.maxInitialBytes,
  `Initial JavaScript graph is ${initialBytes} bytes, exceeding the ${budget.maxInitialBytes}-byte budget`);
console.log(`Initial graph budget: ${initialBytes}/${budget.maxInitialBytes} bytes (previous baseline ${budget.previousInitialBytes})`);
assert.ok(!initial.has(author), 'Author must not be statically reachable from the application entry');
assert.ok(manifest[reviewViewer]?.isDynamicEntry, 'Review viewer must remain a dynamic entry');
assert.ok(!initial.has(reviewViewer), 'Review viewer must not be statically reachable from the application entry');
assert.ok(manifest['src/pages/review.tsx']?.dynamicImports?.includes(reviewViewer), 'Missing lazy Review viewer import from the Review shell');
assert.ok([...initial].some((key) => manifest[key].dynamicImports?.includes(author)), 'Missing lazy Author import');
for (const page of management) {
  assert.ok(manifest[page]?.isDynamicEntry, `${page} must remain a dynamic route entry`);
  assert.ok(!initial.has(page), `${page} leaked into the initial graph`);
  assert.ok([...initial].some(key => manifest[key].dynamicImports?.includes(page)), `Missing lazy import: ${page}`);
  assert.ok(!staticGraph(page).has(author), `${page} must not statically import Author`);
  assert.ok(!staticGraph(page).has(reviewViewer), `${page} must not statically import the Review viewer`);
}
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
console.log('PASS: Management routes, Author/editor and Review viewer are deferred and absent from the initial JavaScript graph.');
