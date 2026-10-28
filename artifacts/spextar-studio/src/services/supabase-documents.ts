import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { DocumentRecord, DocumentStatus, DocumentType, ProjectSummary, Topic, TopicKind } from '@/domain/types';
import { orderTopics } from '@/domain/topic-tree';
import { ServiceError, type DocumentService } from './contracts';
import { backendError } from './supabase-errors';

const status = z.enum(['draft', 'in_review', 'approved', 'published']);
const settings = z.record(z.string(), z.unknown());
const common = { id: z.string(), title: z.string(), slug: z.string(), status, settings, created_by: z.string(), created_at: z.string(), updated_at: z.string() };
const documentRow = z.object({ ...common, project_id: z.string(), description: z.string().nullable() });
const topicRow = z.object({ ...common, document_id: z.string(), parent_topic_id: z.string().nullable(), sort_order: z.number().int() });
const documentColumns = 'id,project_id,title,slug,description,status,settings,created_by,created_at,updated_at';
const topicColumns = 'id,document_id,parent_topic_id,title,slug,status,sort_order,settings,created_by,created_at,updated_at';
const rpcParameters: Record<string, string[]> = {
  create_document: ['p_project_id', 'p_title', 'p_slug', 'p_description'],
  create_topic: ['p_document_id', 'p_parent_topic_id', 'p_title', 'p_slug'],
  move_topic: ['p_topic_id', 'p_new_parent_topic_id', 'p_new_sort_order'],
  promote_topic: ['p_topic_id'], demote_topic: ['p_topic_id'],
  duplicate_document: ['p_document_id', 'p_new_title', 'p_new_slug'],
  duplicate_topic_subtree: ['p_topic_id', 'p_new_title', 'p_new_slug'],
};
const toStatus = (value: z.infer<typeof status>): DocumentStatus => value === 'in_review' ? 'in-review' : value;
const toDatabaseStatus = (value: DocumentStatus) => value === 'in-review' ? 'in_review' : value;
const text = z.string().trim().min(1).max(500);
const slug = z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const metadata = z.object({ title: text.optional(), slug: slug.optional(), status: z.enum(['draft', 'in-review', 'approved', 'published']).optional(), settings: settings.optional() }).strict();
function validateSettings(value: Record<string, unknown> | undefined) {
  if (!value) return;
  const valid = (item: unknown): boolean => item === null || typeof item === 'string' || typeof item === 'boolean'
    || (typeof item === 'number' && Number.isFinite(item))
    || (Array.isArray(item) && item.every(valid))
    || (typeof item === 'object' && item !== null && Object.values(item).every(valid));
  if (!valid(value) || 'body' in value || 'content' in value) throw new ServiceError('Settings must contain JSON metadata only. Topic bodies are saved separately as topic drafts.', 'validation');
}

function validate<T>(schema: z.ZodType<T>, value: unknown, backend = false): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ServiceError(backend ? 'The F2 response does not match the live document/topic contract.' : 'Check the title, slug, status and settings.', backend ? 'unavailable' : 'validation');
  return parsed.data;
}
function checked(error: unknown) { if (error) throw backendError(error); }

export async function readAll(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await query(from, from + 999);
    checked(result.error);
    const page = validate(z.array(z.unknown()), result.data, true);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function contentCounts(client: SupabaseClient, projectIds: string[]) {
  const counts = new Map(projectIds.map((id) => [id, { documentCount: 0, topicCount: 0 }]));
  if (!projectIds.length) return counts;
  const docs = validate(z.array(z.object({ id: z.string(), project_id: z.string() })),
    await readAll((from, to) => client.from('documents').select('id,project_id').in('project_id', projectIds).order('id').range(from, to)), true);
  const byDocument = new Map(docs.map((d) => [d.id, d.project_id]));
  for (const doc of docs) {
    const count = counts.get(doc.project_id);
    if (!count) throw new ServiceError('A document count escaped the selected project scope.', 'unavailable');
    count.documentCount++;
  }
  for (let i = 0; i < docs.length; i += 200) {
    const topics = validate(z.array(z.object({ document_id: z.string() })),
      await readAll((from, to) => client.from('topics').select('document_id').in('document_id', docs.slice(i, i + 200).map((d) => d.id)).order('id').range(from, to)), true);
    for (const topic of topics) {
      const count = counts.get(byDocument.get(topic.document_id) ?? '');
      if (!count) throw new ServiceError('A topic count escaped the selected document scope.', 'unavailable');
      count.topicCount++;
    }
  }
  return counts;
}

/** No body/content column or settings key is ever used as authoring storage. */
export function mapDocument(raw: unknown, rawTopics: unknown[], canEdit: boolean): DocumentRecord {
  const row = validate(documentRow, raw, true);
  const topics: Topic[] = rawTopics.map((rawTopic) => {
    const t = validate(topicRow, rawTopic, true);
    if (t.document_id !== row.id) throw new ServiceError('Topic belongs to a different document.', 'unavailable');
    const kind = ['concept', 'task', 'reference'].includes(String(t.settings.kind)) ? t.settings.kind as TopicKind : 'concept';
    return { id: t.id, title: t.title, slug: t.slug, status: toStatus(t.status), kind, parentTopicId: t.parent_topic_id,
      sortOrder: t.sort_order, settings: t.settings, updatedAt: t.updated_at, level: 1, body: [] };
  });
  const type = ['guide', 'procedure', 'reference', 'release-notes'].includes(String(row.settings.type)) ? row.settings.type as DocumentType : 'guide';
  return { id: row.id, projectId: row.project_id, title: row.title, slug: row.slug, summary: row.description ?? '',
    status: toStatus(row.status), settings: row.settings, type, version: typeof row.settings.version === 'string' ? row.settings.version : '—',
    owner: row.created_by, updatedAt: row.updated_at, topics: orderTopics(topics), canEdit };
}

export function supabaseDocuments(client: SupabaseClient, requireProject: (id: string) => Promise<ProjectSummary>): DocumentService {
  async function writable(projectId: string) {
    const project = await requireProject(projectId);
    if (!project.canEditContent) throw new ServiceError('Only project admins and authors can change documents or topics.', 'forbidden');
  }
  async function records(projectId: string, id?: string) {
    const project = await requireProject(projectId);
    const documents = validate(z.array(documentRow), await readAll((from, to) => {
      let query = client.from('documents').select(documentColumns).eq('project_id', projectId);
      if (id) query = query.eq('id', id);
      return query.order('updated_at', { ascending: false }).order('id').range(from, to);
    }), true);
    if (documents.some((document) => document.project_id !== projectId)) throw new ServiceError('A document escaped the selected project scope.', 'unavailable');
    if (!documents.length) return [];
    const topics: z.infer<typeof topicRow>[] = [];
    for (let i = 0; i < documents.length; i += 200) {
      topics.push(...validate(z.array(topicRow), await readAll((from, to) => client.from('topics').select(topicColumns)
        .in('document_id', documents.slice(i, i + 200).map((d) => d.id)).order('id').range(from, to)), true));
    }
    return documents.map((d) => mapDocument(d, topics.filter((t) => t.document_id === d.id), project.canEditContent === true));
  }
  async function scoped(projectId: string, documentId: string, topicId?: string) {
    await writable(projectId);
    const doc = (await records(projectId, documentId))[0];
    if (!doc) throw new ServiceError('Document not found in this project.', 'not-found');
    if (!doc.canEdit) throw new ServiceError('Your project editing permissions have changed. Refresh before trying again.', 'forbidden');
    if (topicId && !doc.topics.some((t) => t.id === topicId)) throw new ServiceError('Topic not found in this document.', 'not-found');
    return doc;
  }
  /** Verified live contract: one authenticated POST, never discovery or fallback writes. */
  async function rpc(name: string, args: Record<string, unknown>, returnsId = false): Promise<string> {
    const parameters = rpcParameters[name];
    if (!parameters || Object.keys(args).length !== parameters.length || parameters.some(parameter => !Object.hasOwn(args, parameter))) {
      throw new ServiceError('This action could not be prepared. Refresh and try again.', 'unavailable');
    }
    const result = await client.rpc(name, args);
    checked(result.error);
    if (!returnsId) return '';
    if (typeof result.data !== 'string' || !result.data) throw new ServiceError('The new item could not be confirmed. Refresh before retrying.', 'unavailable');
    return result.data;
  }
  function unchanged(actual: string | undefined, expected: string) {
    if (!expected || actual !== expected) throw new ServiceError('This item changed after confirmation opened. Close the dialog, refresh, and confirm the current item again.', 'conflict');
  }
  function deleted(result: { data: unknown; error: unknown }, id: string) {
    if ((result.error as { code?: string } | null)?.code === '23503') throw new ServiceError('Related records prevent deletion. Move or delete dependent topics, refresh, and try again.', 'conflict');
    checked(result.error);
    if (!result.data || (result.data as { id?: string }).id !== id) throw new ServiceError('Deletion was not confirmed. The item may have changed or your permissions may have been revoked. Refresh and try again.', 'conflict');
  }
  return {
    listDocuments: (projectId) => records(projectId),
    async getDocument(projectId, documentId) { return documentId ? (await records(projectId, documentId))[0] ?? null : null; },
    async createDocument(projectId, input) {
      await writable(projectId);
      const data = validate(z.object({ title: text, slug, description: z.string().nullable() }).strict(), input);
      return rpc('create_document', { p_project_id: projectId, p_title: data.title, p_slug: data.slug, p_description: data.description }, true);
    },
    async updateDocument(projectId, documentId, patch) {
      await scoped(projectId, documentId);
      const data = validate(metadata.extend({ description: z.string().nullable().optional() }).strict(), patch);
      validateSettings(data.settings);
      const result = await client.from('documents').update({ ...data, ...(data.status ? { status: toDatabaseStatus(data.status) } : {}) })
        .eq('project_id', projectId).eq('id', documentId).select('id').maybeSingle();
      checked(result.error);
      if (!result.data) throw new ServiceError('Document update was not accepted. Refresh your permissions.', 'forbidden');
    },
    async createTopic(projectId, documentId, input) {
      const doc = await scoped(projectId, documentId);
      const data = validate(z.object({ title: text, slug, parentTopicId: z.string().nullable() }).strict(), input);
      if (data.parentTopicId && !doc.topics.some((t) => t.id === data.parentTopicId)) throw new ServiceError('Parent topic must belong to this document.', 'validation');
      return rpc('create_topic', { p_document_id: documentId, p_parent_topic_id: data.parentTopicId, p_title: data.title, p_slug: data.slug }, true);
    },
    async updateTopic(projectId, documentId, topicId, patch) {
      await scoped(projectId, documentId, topicId);
      const data = validate(metadata, patch);
      validateSettings(data.settings);
      const result = await client.from('topics').update({ ...data, ...(data.status ? { status: toDatabaseStatus(data.status) } : {}) })
        .eq('document_id', documentId).eq('id', topicId).select('id').maybeSingle();
      checked(result.error);
      if (!result.data) throw new ServiceError('Topic update was not accepted. Refresh your permissions.', 'forbidden');
    },
    async moveTopic(projectId, documentId, topicId, parentId, sortOrder) {
      const doc = await scoped(projectId, documentId, topicId);
      if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new ServiceError('Sibling position must be a non-negative integer.', 'validation');
      if (parentId && !doc.topics.some((t) => t.id === parentId)) throw new ServiceError('Parent topic must belong to this document.', 'validation');
      return void await rpc('move_topic', { p_topic_id: topicId, p_new_parent_topic_id: parentId, p_new_sort_order: sortOrder });
    },
    async promoteTopic(projectId, documentId, topicId) { await scoped(projectId, documentId, topicId); await rpc('promote_topic', { p_topic_id: topicId }); },
    async demoteTopic(projectId, documentId, topicId) { await scoped(projectId, documentId, topicId); await rpc('demote_topic', { p_topic_id: topicId }); },
    async duplicateDocument(projectId, documentId, input) {
      await scoped(projectId, documentId);
      const data = validate(z.object({ title: text, slug }).strict(), input);
      return rpc('duplicate_document', { p_document_id: documentId, p_new_title: data.title, p_new_slug: data.slug }, true);
    },
    async duplicateTopicSubtree(projectId, documentId, topicId, input) {
      await scoped(projectId, documentId, topicId);
      const data = validate(z.object({ title: text, slug }).strict(), input);
      return rpc('duplicate_topic_subtree', { p_topic_id: topicId, p_new_title: data.title, p_new_slug: data.slug }, true);
    },
    async deleteDocument(projectId, documentId, expectedUpdatedAt) {
      const doc = await scoped(projectId, documentId);
      unchanged(doc.updatedAt, expectedUpdatedAt);
      if (doc.topics.length) throw new ServiceError('Delete all topics in this document first, starting with leaf topics. No cascading document deletion was attempted.', 'conflict');
      deleted(await client.from('documents').delete().eq('project_id', projectId).eq('id', documentId)
        .eq('updated_at', expectedUpdatedAt).select('id').maybeSingle(), documentId);
    },
    async deleteTopic(projectId, documentId, topicId, expectedUpdatedAt) {
      const doc = await scoped(projectId, documentId, topicId);
      unchanged(doc.topics.find((topic) => topic.id === topicId)!.updatedAt, expectedUpdatedAt);
      if (doc.topics.some((topic) => topic.parentTopicId === topicId)) throw new ServiceError('Move or delete this topic’s children first. No cascading subtree deletion was attempted.', 'conflict');
      deleted(await client.from('topics').delete().eq('document_id', documentId).eq('id', topicId)
        .eq('updated_at', expectedUpdatedAt).select('id').maybeSingle(), topicId);
    },
  };
}
