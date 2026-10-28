import { describe, expect, it } from 'vitest';
import { authoringChunkUrl, managementChunkUrl, managementPages } from '../../e2e/management-chunk-fixture';

describe('isolated management download fault scope', () => {
  it.each(managementPages)('resolves only the emitted $chunk route on the loopback fixture origin', item => {
    expect(managementChunkUrl({
      [`src/pages/${item.chunk}.tsx`]: { isDynamicEntry: true, file: `assets/${item.chunk}-testHash.js` },
    }, item.chunk)).toBe(`http://127.0.0.1:4181/assets/${item.chunk}-testHash.js`);
  });
  it.each([null, [], {}, { 'src/pages/review.tsx': null }])('rejects an absent or malformed manifest entry: %j', manifest => {
    expect(() => managementChunkUrl(manifest, 'review')).toThrow();
  });
  it.each([
    'https://example.test/assets/review.js', '//example.test/assets/review.js',
    '../assets/review.js', 'assets/../index.js', '/assets/review.js',
    'assets/review.js?redirect=1', 'assets/review.js#fragment', 'assets/review.css',
    'assets/review.js\n', 'assets/review.js\r\n',
  ])('rejects an unsafe or unsupported emitted path: %s', file => {
    expect(() => managementChunkUrl({ 'src/pages/review.tsx': { isDynamicEntry: true, file } }, 'review')).toThrow();
  });
  it('rejects a non-dynamic entry rather than widening interception', () => {
    expect(() => managementChunkUrl({
      'src/pages/review.tsx': { isDynamicEntry: false, file: 'assets/review.js' },
    }, 'review')).toThrow();
  });
  it('rejects an unknown route rather than intercepting arbitrary assets', () => {
    expect(() => managementChunkUrl({}, 'author' as 'review')).toThrow('Unknown management route');
  });
});

describe('isolated Author and nested Review viewer download scope', () => {
  const sources = [
    ['author', 'src/pages/author.tsx'],
    ['reviewViewer', 'src/features/review/review-draft-viewer.tsx'],
  ] as const;
  it.each(sources)('resolves only the exact emitted %s boundary', (target, source) => {
    expect(authoringChunkUrl({
      [source]: { isDynamicEntry: true, file: `assets/${target}-hash.js` },
    }, target)).toBe(`http://127.0.0.1:4181/assets/${target}-hash.js`);
  });
  it.each(sources)('rejects a missing %s boundary without targeting the main graph', (target) => {
    expect(() => authoringChunkUrl({ 'src/main.tsx': { isEntry: true, file: 'assets/index.js' } }, target)).toThrow();
  });
  it.each(sources)('rejects a static or unsafe %s entry', (target, source) => {
    expect(() => authoringChunkUrl({ [source]: { file: 'assets/index.js' } }, target)).toThrow();
    expect(() => authoringChunkUrl({ [source]: { isDynamicEntry: true, file: 'https://example.test/viewer.js' } }, target)).toThrow();
  });
  it.each(['toString', '__proto__', 'structuredEditor', 'src/main.tsx'])('rejects non-allowlisted target %s', target => {
    expect(() => authoringChunkUrl({}, target as 'author')).toThrow('Unknown authoring download');
  });
});
