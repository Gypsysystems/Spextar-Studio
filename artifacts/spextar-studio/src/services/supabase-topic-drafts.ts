import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { BackendSession, ProjectSummary } from '@/domain/types';
import { checkedContent, type DraftScope, type TopicDraft } from '@/domain/topic-content';
import { ServiceError, type TopicDraftService } from './contracts';
import { backendError } from './supabase-errors';

const columns = 'topic_id,content,revision,updated_at,updated_by';
const rowSchema = z.object({
  topic_id: z.string(), content: z.unknown(), revision: z.number().int().min(1).safe(),
  updated_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  updated_by: z.string().nullable(),
});
function mapRow(value: unknown, scope: DraftScope): TopicDraft {
  const result = rowSchema.safeParse(value);
  if (!result.success || result.data.topic_id !== scope.topicId) {
    throw new ServiceError('The saved draft could not be loaded for this topic. Reload and try again.', 'unavailable');
  }
  const row = result.data;
  return { topicId: row.topic_id, content: checkedContent(row.content), revision: row.revision, updatedAt: row.updated_at, updatedBy: row.updated_by };
}

export function supabaseTopicDrafts(
  client: SupabaseClient,
  identity: () => Promise<BackendSession>,
  requireProject: (id: string) => Promise<ProjectSummary>,
): TopicDraftService {
  async function assertIdentity(scope: DraftScope) {
    if ((await identity()).userId !== scope.userId) throw new ServiceError('The signed-in identity changed. Reopen the topic.', 'unauthorized');
  }
  async function scoped(scope: DraftScope, write = false) {
    await assertIdentity(scope);
    const project = await requireProject(scope.projectId);
    if (write && project.canEditContent !== true) throw new ServiceError('Only Project Admin and Author may edit topic bodies.', 'forbidden');
    const doc = await client.from('documents').select('id,project_id,status').eq('id', scope.documentId).eq('project_id', scope.projectId).maybeSingle();
    if (doc.error) throw backendError(doc.error);
    if (!doc.data || doc.data.project_id !== scope.projectId) throw new ServiceError('Document is not accessible in this project.', 'not-found');
    if (write && doc.data.status !== 'draft') throw new ServiceError('This document is read-only. Return to a new draft before editing.', 'forbidden');
    const topic = await client.from('topics').select('id,document_id').eq('id', scope.topicId).eq('document_id', scope.documentId).maybeSingle();
    if (topic.error) throw backendError(topic.error);
    if (!topic.data || topic.data.document_id !== scope.documentId) throw new ServiceError('Topic is not accessible in this document.', 'not-found');
    await assertIdentity(scope);
  }
  return {
    async get(scope) {
      await scoped(scope);
      const result = await client.from('topic_drafts').select(columns).eq('topic_id', scope.topicId).maybeSingle();
      if (result.error) throw backendError(result.error);
      return result.data ? mapRow(result.data, scope) : null;
    },
    async save(scope, content, expectedRevision) {
      const checked = checkedContent(content);
      if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
        throw new ServiceError('A valid last-read revision is required.', 'validation');
      }
      await scoped(scope, true);
      // No revision/timestamp is assigned by the client. RETURNING reads the trigger's
      // resulting row atomically; a separate follow-up read could see a later writer.
      const query = expectedRevision === null
        ? client.from('topic_drafts').insert({ topic_id: scope.topicId, content: checked, updated_by: scope.userId })
        : client.from('topic_drafts').update({ content: checked, updated_by: scope.userId })
          .eq('topic_id', scope.topicId).eq('revision', expectedRevision);
      const result = await query.select(columns).maybeSingle();
      if (result.error?.code === '23505') throw new ServiceError('Another browser created this draft first. Reload the saved draft; your local copy is retained.', 'conflict');
      if (result.error) throw backendError(result.error);
      if (!result.data) throw new ServiceError('The saved revision changed or access was revoked. Nothing was overwritten. Reload the saved draft to continue.', 'conflict');
      const saved = mapRow(result.data, scope);
      if (saved.revision <= (expectedRevision ?? 0)) throw new ServiceError('A new saved revision could not be confirmed. Reload before retrying.', 'unavailable');
      return saved;
    },
  };
}
