import type { Review } from '@/domain/reviews';
export const reviewAt = '2026-10-27T10:00:00Z';
export const reviewBody = { type: 'doc', version: 1, metadata: { preserved: true }, content: [
  { type: 'paragraph', attrs: { id: 'stable-block' }, content: [{ type: 'text', text: 'Submitted technical content' }] },
] };
export function reviewFixture(patch: Partial<Review> = {}): Review {
  return { id: 'review-a', project_id: 'project-a', document_id: 'doc-a', sequence: 1, status: 'in_review',
    submitted_by: 'user-a', submitted_at: reviewAt, decided_by: null, decided_at: null, decision_note: null,
    document_snapshot: { title: 'Submitted document', slug: 'submitted-document', description: null, settings: {} },
    topics_snapshot: [
      { id: 'topic-a', title: 'Submitted topic', slug: 'submitted-topic', parent_topic_id: null, sort_order: 0, settings: { kind: 'task' }, revision: 7, content: structuredClone(reviewBody) },
      { id: 'missing-topic', title: 'Missing body', slug: 'missing-body', parent_topic_id: 'topic-a', sort_order: 0, settings: {}, revision: null, content: null },
    ], ...patch };
}
