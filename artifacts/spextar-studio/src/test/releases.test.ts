import { describe, expect, it } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { canonicalReviewJson } from '@/domain/review-package';
import { publishCandidate, checkedRelease, sha256Canonical } from '@/domain/releases';
import { renderReleaseV1 } from '@/domain/release-renderer';
import { reviewFixture, reviewAt } from './review-fixtures';
import { packageFixture, semanticBody, reusableNode } from './review-package-fixtures';
import { reusableRow, reusableDraftRow } from './reusable-fixtures';
import { supabaseReleases } from '@/services/supabase-releases';
import { supabaseDouble } from './supabase-double';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
export function approved() {
  return reviewFixture({
    status: 'approved',
    decided_by: 'user-a',
    decided_at: reviewAt,
    dependency_package: packageFixture(),
    topics_snapshot: [{ ...reviewFixture().topics_snapshot[0], content: semanticBody() }],
  });
}
export async function releaseFixture(sequence = 1) {
  const r = approved();
  r.sequence = sequence;
  const source = {
    schemaVersion: 1,
    rendererVersion: 1,
    reviewId: r.id,
    projectId: r.project_id,
    documentId: r.document_id,
    submittedBy: r.submitted_by,
    submittedAt: r.submitted_at,
    approvedBy: r.decided_by,
    approvedAt: r.decided_at,
    document: r.document_snapshot,
    topics: r.topics_snapshot,
    dependencies: r.dependency_package,
  };
  const row = {
    id: '00000000-0000-4000-8000-000000000001',
    project_id: r.project_id,
    document_id: r.document_id,
    review_id: r.id,
    sequence: 1,
    state: 'published',
    package_schema_version: 1,
    resolver_version: 1,
    renderer_version: 1,
    canonicalization: 'spextar-json-v1',
    frozen_source: source,
    package_digest: await sha256Canonical(source),
    manifest_digest: '',
    published_by: 'user-a',
    published_at: reviewAt,
    request_key: '00000000-0000-4000-8000-000000000002',
    audit: { action: 'publish', publishedAt: reviewAt, reviewSequence: r.sequence },
  };
  row.manifest_digest = await sha256Canonical({
    schemaVersion: 1,
    releaseId: row.id,
    projectId: row.project_id,
    documentId: row.document_id,
    reviewId: row.review_id,
    sequence: 1,
    packageDigest: row.package_digest,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    requestKey: row.request_key,
    audit: row.audit,
  });
  return row;
}
describe('pinned immutable releases', () => {
  it.each([
    [{}, '{}', '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'],
    [null, 'null', '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b'],
  ])('pins canonical bytes and independent SHA-256 vectors', async (value, canonical, digest) => {
    expect(canonicalReviewJson(value)).toBe(canonical);
    expect(await sha256Canonical(value)).toBe(digest);
  });
  it('pins Unicode UTF-16 ordering, arrays, escape bytes and safe signed integers', async () => {
    const value = { '\uffff': 2, '😀': 1, a: [-9007199254740991, 9007199254740991, 0, 'é', 'e\u0301', '\n"\\'] };
    const text = '{"a":[-9007199254740991,9007199254740991,0,"é","é","\\n\\"\\\\"],"😀":1,"￿":2}';
    expect(canonicalReviewJson(value)).toBe(text);
    expect(await sha256Canonical(value)).toBe(createHash('sha256').update(text).digest('hex'));
    expect(() => canonicalReviewJson({ bad: 0.5 })).toThrow();
  });
  it('blocks null, nonapproved, legacy and missing topic packages', () => {
    for (const r of [
      null,
      reviewFixture(),
      reviewFixture({ status: 'approved', decided_by: 'user-a', decided_at: reviewAt }),
      { ...approved(), topics_snapshot: reviewFixture().topics_snapshot },
    ])
      expect(() => publishCandidate(r)).toThrow();
  });
  it('renders frozen defaults and nested reusable bodies, includes neutral conditions, preserves source', () => {
    const r = approved(),
      before = structuredClone(r);
    const result = renderReleaseV1(r),
      text = JSON.stringify(result.topics);
    expect(text.match(/Frozen product value/g)).toHaveLength(2);
    expect(text).not.toContain('Frozen web value');
    expect(text).toContain('category-a');
    expect(text).not.toContain('variableReference');
    expect(text).not.toContain('reusableReference');
    expect(r).toEqual(before);
  });
  it('optional empty values render empty with a visible warning; required empty blocks', () => {
    const r = approved();
    r.dependency_package!.variables[0].value = '';
    expect(() => renderReleaseV1(r)).toThrow();
    r.dependency_package!.variables[0].required = false;
    const result = renderReleaseV1(r);
    expect(result.warnings).toEqual(['The optional variable “Product” is empty.']);
    expect(JSON.stringify(result.topics)).not.toContain('Empty variable');
  });
  it('blocks future nodes, missing closure and reusable cycles', () => {
    const r = approved();
    r.dependency_package!.reusable[0].draft.content = { type: 'doc', version: 1, content: [reusableNode()] };
    expect(() => renderReleaseV1(r)).toThrow();
    const unknown = approved();
    unknown.topics_snapshot[0].content = { type: 'doc', version: 1, content: [{ type: 'future' }] };
    expect(() => renderReleaseV1(unknown)).toThrow();
    const missing = approved();
    missing.dependency_package!.variables = [];
    expect(() => renderReleaseV1(missing)).toThrow();
  });
  it('blocks excessive resolved variable expansion before rendering', () => {
    const r = approved(),
      p = r.dependency_package!;
    p.variables[0].value = 'x'.repeat(50000);
    p.categories = [];
    p.values = [];
    p.reusable = [];
    r.topics_snapshot[0].content = {
      type: 'doc',
      version: 1,
      content: Array.from({ length: 700 }, () => ({
        type: 'paragraph',
        content: [{ type: 'variableReference', attrs: { referenceVersion: 1, variableId: 'variable-a' } }],
      })),
    };
    expect(() => renderReleaseV1(r)).toThrow('limit');
  });
  it('permits eight reusable levels and blocks nine', () => {
    const r = approved(),
      p = r.dependency_package!;
    p.reusable = [];
    for (let i = 0; i < 9; i++)
      p.reusable.push({
        item: reusableRow({ id: `reuse-${i}` }),
        draft: reusableDraftRow({
          reusable_content_id: `reuse-${i}`,
          content: { type: 'doc', version: 1, content: i === 8 ? [] : [reusableNode(`reuse-${i + 1}`)] },
        }),
      });
    r.topics_snapshot[0].content = { type: 'doc', version: 1, content: [reusableNode('reuse-0')] };
    p.variables = [];
    p.categories = [];
    p.values = [];
    expect(() => renderReleaseV1(r)).toThrow();
    p.reusable.shift();
    r.topics_snapshot[0].content = { type: 'doc', version: 1, content: [reusableNode('reuse-1')] };
    expect(renderReleaseV1(r).topics).toHaveLength(1);
  });
  it('verifies both digests and rejects source, manifest, tenant and unsupported version drift', async () => {
    const row = await releaseFixture();
    expect((await checkedRelease(row, 'project-a', 'doc-a')).sequence).toBe(1);
    await expect(checkedRelease({ ...row, sequence: 2 }, 'project-a', 'doc-a')).rejects.toThrow();
    await expect(checkedRelease({ ...row, renderer_version: 2 }, 'project-a', 'doc-a')).rejects.toThrow();
    await expect(checkedRelease(row, 'foreign', 'doc-a')).rejects.toThrow();
    row.frozen_source.document.title = 'Changed';
    await expect(checkedRelease(row, 'project-a', 'doc-a')).rejects.toThrow();
  });
  it('retains the actual approved review sequence from immutable audit evidence', async () => {
    const row = await releaseFixture(5);
    expect((await checkedRelease(row, 'project-a', 'doc-a')).review.sequence).toBe(5);
    await expect(
      checkedRelease({ ...row, audit: { ...row.audit, reviewSequence: 0 } }, 'project-a', 'doc-a'),
    ).rejects.toThrow();
  });
  it('recovers only the exact scoped review/request identity', async () => {
    const f = supabaseDouble(),
      row = await releaseFixture();
    f.db.document_releases = [row];
    const r = {
      projectId: 'project-a',
      documentId: 'doc-a',
      reviewId: 'review-a',
      expectedUpdatedAt: reviewAt,
      requestKey: row.request_key,
    };
    expect((await supabaseReleases(f.client).findRequest(r))?.id).toBe(row.id);
    expect(await supabaseReleases(f.client).findRequest({ ...r, reviewId: 'other-review' })).toBeNull();
    expect(f.calls[0].filters).toContainEqual(['review_id', 'review-a']);
  });
  it('sends only exact scoped identifiers, expected timestamp and stable request key in one authenticated call', async () => {
    const f = supabaseDouble();
    f.raw.rpc.mockResolvedValueOnce({ data: 'release-id', error: null });
    const r = {
      projectId: 'project-a',
      documentId: 'doc-a',
      reviewId: 'review-a',
      expectedUpdatedAt: reviewAt,
      requestKey: 'request',
    };
    expect(await supabaseReleases(f.client).publish(r)).toBe('release-id');
    expect(f.raw.rpc).toHaveBeenCalledExactlyOnceWith('publish_document_release', {
      p_project_id: 'project-a',
      p_document_id: 'doc-a',
      p_review_id: 'review-a',
      p_expected_updated_at: reviewAt,
      p_request_key: 'request',
    });
    expect(f.calls).toEqual([]);
  });
});
