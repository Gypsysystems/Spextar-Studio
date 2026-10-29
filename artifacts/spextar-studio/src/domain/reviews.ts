import { z } from 'zod';
import { checkedContent, type TopicContent } from './topic-content';
import { ServiceError } from '@/services/contracts';
import { orderTopics } from './topic-tree';

const topic = z.object({
  id: z.string(), parent_topic_id: z.string().nullable(), title: z.string(), slug: z.string(),
  sort_order: z.number().int().nonnegative(), settings: z.record(z.string(), z.unknown()),
  revision: z.number().int().positive().safe().nullable(), content: z.unknown(),
});
export const reviewSchema = z.object({
  id: z.string(), project_id: z.string(), document_id: z.string(), sequence: z.number().int().positive(),
  status: z.enum(['in_review', 'approved', 'changes_requested']), submitted_by: z.string(), submitted_at: z.string().refine(v => Number.isFinite(Date.parse(v))),
  decided_by: z.string().nullable(), decided_at: z.string().refine(v => Number.isFinite(Date.parse(v))).nullable(), decision_note: z.string().nullable(),
  document_snapshot: z.object({ title: z.string(), slug: z.string(), description: z.string().nullable(), settings: z.record(z.string(), z.unknown()) }),
  topics_snapshot: z.array(topic),
});
export type Review = Omit<z.infer<typeof reviewSchema>, 'topics_snapshot'> & {
  topics_snapshot: Array<Omit<z.infer<typeof topic>, 'content'> & { content: TopicContent | null }>;
};
export function checkedReview(value: unknown, projectId: string, documentId: string): Review {
  const parsed = reviewSchema.safeParse(value);
  if (!parsed.success || parsed.data.project_id !== projectId || parsed.data.document_id !== documentId) {
    throw new ServiceError('The submitted review could not be loaded. Refresh and try again.', 'unavailable');
  }
  const row = parsed.data;
  if ((row.status === 'in_review' && (row.decided_by !== null || row.decided_at !== null || row.decision_note !== null))
    || (row.status !== 'in_review' && (!row.decided_by || !row.decided_at))
    || (row.status === 'changes_requested' && !row.decision_note?.trim())) {
    throw new ServiceError('The saved review decision could not be confirmed. Refresh and try again.', 'unavailable');
  }
  orderTopics(row.topics_snapshot.map(t => ({ id: t.id, title: t.title, kind: 'concept', level: 1, body: [], parentTopicId: t.parent_topic_id, sortOrder: t.sort_order })));
  return { ...row, topics_snapshot: row.topics_snapshot.map(t => {
    if ((t.revision === null) !== (t.content === null)) throw new ServiceError('The submitted topic could not be loaded.', 'unavailable');
    return { ...t, content: t.content === null ? null : checkedContent(t.content) };
  }) };
}
export interface ReviewService {
  latest(projectId: string, documentId: string): Promise<Review | null>;
  submit(projectId: string, documentId: string, expectedUpdatedAt: string): Promise<string>;
  decide(projectId: string, documentId: string, reviewId: string, decision: 'approved' | 'changes_requested', note: string): Promise<void>;
  startDraft(projectId: string, documentId: string, reviewId: string, expectedUpdatedAt: string): Promise<void>;
}
