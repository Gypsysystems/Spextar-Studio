import { describe, expect, it } from 'vitest';
import { canonicalReviewJson, checkedReviewPackage } from '@/domain/review-package';
import { checkedReview } from '@/domain/reviews';
import { reviewFixture } from './review-fixtures';
import { packageFixture, reusableNode, semanticBody } from './review-package-fixtures';
import { reusableRow, reusableDraftRow } from './reusable-fixtures';

describe('immutable review dependency package reader', () => {
  it('retains variable defaults/overrides, condition policy/values and exact linked structured JSON', () => {
    const p = packageFixture(); const body = semanticBody();
    const r = checkedReview(reviewFixture({ dependency_package: p, topics_snapshot: [{ ...reviewFixture().topics_snapshot[0], content: body }] }), 'project-a', 'doc-a');
    expect(r.dependency_package).toEqual(p);
    expect(r.topics_snapshot[0].content).toEqual(body);
    expect(JSON.stringify(r)).toContain('variableReference');
    expect(JSON.stringify(r)).toContain('reusableReference');
    expect(p.outputContext).toEqual({ variableValues: 'default', conditions: 'neutral', outputId: null });
  });
  it('accepts a nested reusable closure and rejects a missing transitive dependency', () => {
    const p = packageFixture();
    p.reusable[0].draft.content = { type: 'doc', version: 1, content: [reusableNode('reuse-b')] };
    p.reusable.push({ item: reusableRow({ id: 'reuse-b' }), draft: reusableDraftRow({ reusable_content_id: 'reuse-b' }) });
    expect(checkedReviewPackage(p, 'project-a', [semanticBody()])).toEqual(p);
    p.reusable.pop(); expect(() => checkedReviewPackage(p, 'project-a', [semanticBody()])).toThrow();
  });
  it.each(['variables','categories','values','reusable'] as const)('fails closed on missing %s', key => {
    const p = packageFixture(); p[key] = [];
    expect(() => checkedReviewPackage(p, 'project-a', [semanticBody()])).toThrow();
  });
  it('rejects cross-project and cross-workspace rows even if readable elsewhere', () => {
    const p = packageFixture(); p.variables[0].project_id = 'foreign';
    expect(() => checkedReviewPackage(p, 'project-a', [semanticBody()])).toThrow();
    const r = packageFixture(); r.reusable[0].item.workspace_id = 'foreign';
    expect(() => checkedReviewPackage(r, 'project-a', [semanticBody()])).toThrow();
    const c = packageFixture(); c.values[0].category_id = 'foreign';
    expect(() => checkedReviewPackage(c, 'project-a', [semanticBody()])).toThrow();
  });
  it('rejects cycles and the ninth reusable, permits repeated acyclic references', () => {
    const p = packageFixture(); p.reusable[0].draft.content = { type: 'doc', content: [reusableNode()] };
    expect(() => checkedReviewPackage(p, 'project-a', [semanticBody()])).toThrow();
    const q = packageFixture();
    for (let i = 1; i < 9; i++) {
      const id = `reuse-${i}`;
      q.reusable[i - 1].draft.content = { type: 'doc', content: [reusableNode(id)] };
      q.reusable.push({ item: reusableRow({ id }), draft: reusableDraftRow({ reusable_content_id: id }) });
    }
    q.reusable.sort((a,b) => String(a.item.id) < String(b.item.id) ? -1 : 1);
    expect(() => checkedReviewPackage(q, 'project-a', [semanticBody()])).toThrow();
    const repeated = semanticBody(); (repeated.content as unknown[]).push(reusableNode());
    expect(checkedReviewPackage(packageFixture(), 'project-a', [repeated])).toBeTruthy();
  });
  it('rejects unsupported bodies, extra catalog rows, duplicate IDs and schema versions', () => {
    const p = packageFixture(); p.variables.push({ ...p.variables[0] });
    expect(() => checkedReviewPackage(p, 'project-a', [semanticBody()])).toThrow();
    const q = packageFixture(); q.variables.push({ ...q.variables[0], id: 'variable-z' });
    expect(() => checkedReviewPackage(q, 'project-a', [semanticBody()])).toThrow();
    expect(() => checkedReviewPackage({ ...packageFixture(), resolverVersion: 2 }, 'project-a', [semanticBody()])).toThrow();
    expect(() => checkedReviewPackage(packageFixture(), 'project-a', [{ type: 'doc', content: [{ type: 'future' }] }])).toThrow();
  });
  it('keeps legacy missing-body evidence explicit and does not fabricate a package', () => {
    const r = checkedReview(reviewFixture(), 'project-a', 'doc-a');
    expect(r.dependency_package).toBeUndefined(); expect(r.topics_snapshot[1].content).toBeNull();
  });
});

describe('spextar-json-v1 canonicalization vectors (no release digest)', () => {
  it('sorts object keys recursively, preserves array order, Unicode and exact strings', () => {
    expect(canonicalReviewJson({ z: 1, a: [{ b: true, a: 'é' }, null] })).toBe('{"a":[{"a":"é","b":true},null],"z":1}');
    expect(canonicalReviewJson({ '\ue000': 1, '😀': 2, A: -0 })).toBe('{"A":0,"😀":2,"":1}');
    expect(canonicalReviewJson(['é', 'e\u0301'])).toBe('["é","é"]');
    expect(canonicalReviewJson({ b: 2, a: 1 })).toBe(canonicalReviewJson({ a: 1, b: 2 }));
    expect(canonicalReviewJson([1, 2])).not.toBe(canonicalReviewJson([2, 1]));
  });
  it.each([NaN, Infinity, undefined, 1.1, 9007199254740992, new Date()])('rejects values outside the canonical domain: %s', value => {
    expect(() => canonicalReviewJson(value)).toThrow();
  });
});
