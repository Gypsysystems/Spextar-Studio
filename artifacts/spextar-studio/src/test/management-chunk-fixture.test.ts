import { describe, expect, it } from 'vitest';
import { managementChunkUrl, managementPages } from '../../e2e/management-chunk-fixture';

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
