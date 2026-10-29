import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { mapDocument, readAll } from '@/services/supabase-documents';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { createDemoServices } from '@/services/demo-adapter';
import { invalidateContent } from '@/hooks/use-content-mutation';
import type { DocumentService } from '@/services/contracts';
import { supabaseDouble, testUser } from './supabase-double';

export const f2Document = {
  id: 'doc-a', project_id: 'project-a', title: 'Installation', slug: 'installation', description: 'Install safely',
  status: 'in_review', settings: { type: 'procedure' }, created_by: testUser.id,
  created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z',
};
export const f2Topic = (id: string, parent: string | null, order: number) => ({
  id, document_id: 'doc-a', parent_topic_id: parent, sort_order: order, title: id, slug: id,
  status: 'draft', settings: { kind: 'task', custom: true }, created_by: testUser.id,
  created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z',
});
const rpcParameters: Record<string, string[]> = {
  create_document: ['p_project_id', 'p_title', 'p_slug', 'p_description'],
  create_topic: ['p_document_id', 'p_parent_topic_id', 'p_title', 'p_slug'],
  move_topic: ['p_topic_id', 'p_new_parent_topic_id', 'p_new_sort_order'],
  promote_topic: ['p_topic_id'], demote_topic: ['p_topic_id'],
  duplicate_document: ['p_document_id', 'p_new_title', 'p_new_slug'],
  duplicate_topic_subtree: ['p_topic_id', 'p_new_title', 'p_new_slug'],
};

export function f2Setup(role = 'admin') {
  const fake = supabaseDouble();
  fake.db.documents.push({ ...f2Document, status: 'draft' });
  fake.db.topics.push(f2Topic('root-b', null, 10), f2Topic('child', 'root-a', 0), f2Topic('root-a', null, 0));
  fake.db.project_members[0].role = role;
  fake.raw.rpc.mockImplementation(async (name, args, options) => {
    if (options || !rpcParameters[name] || Object.keys(args).sort().join() !== [...rpcParameters[name]].sort().join()) {
      return { data: null, error: { code: 'PGRST202' } };
    }
    if (name === 'create_document') fake.db.documents.push({ ...f2Document, id: 'new-document', title: args.p_title, slug: args.p_slug, status: 'draft' });
    if (name === 'create_topic') fake.db.topics.push({ ...f2Topic('new-topic', args.p_parent_topic_id as string | null, 20), title: args.p_title, slug: args.p_slug });
    return { data: name === 'create_document' ? 'new-document' : name === 'create_topic' ? 'new-topic' : name.includes('duplicate') ? 'new-record' : null, error: null };
  });
  return { ...fake, services: createSupabaseServices(fake.client) };
}

describe('F2 live row mapping and ordering', () => {
  it('derives preorder and depth from the parent graph, converts statuses and never loads body storage', () => {
    const doc = mapDocument(f2Document, [f2Topic('second', null, 5), f2Topic('leaf', 'child', 0), f2Topic('child', 'first', 2), f2Topic('first', null, 1)], true);
    expect(doc.status).toBe('in-review');
    expect(doc.type).toBe('procedure');
    expect(doc.topics.map((t) => [t.id, t.level])).toEqual([['first', 1], ['child', 2], ['leaf', 3], ['second', 1]]);
    expect(doc.topics.every((t) => t.body.length === 0)).toBe(true);
    expect(doc.topics[0].settings).toEqual({ kind: 'task', custom: true });
  });
  it.each([
    [f2Topic('a', 'a', 0)],
    [f2Topic('a', 'b', 0), f2Topic('b', 'a', 0)],
    [f2Topic('a', 'missing', 0)],
    [f2Topic('a', null, 0), f2Topic('a', null, 1)],
    [{ ...f2Topic('a', null, 0), document_id: 'other-document' }],
  ])('rejects corrupt/missing/cross-document hierarchy rather than flattening it', (...topics) => {
    expect(() => mapDocument(f2Document, topics, true)).toThrow();
  });
  it('paginates rather than silently truncating a default PostgREST page', async () => {
    const rows = Array.from({ length: 1003 }, (_, id) => ({ id }));
    expect(await readAll(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }))).toHaveLength(1003);
  });
  it('reads only project-scoped documents and document-scoped topics, with real totals', async () => {
    const { services, db, calls } = f2Setup();
    db.documents.push({ ...f2Document, id: 'foreign', project_id: 'project-b' });
    db.topics.push({ ...f2Topic('foreign-topic', null, 0), document_id: 'foreign' });
    const docs = await services.documents.listDocuments('project-a');
    expect(docs).toHaveLength(1);
    expect(docs[0].topics.map((t) => t.id)).toEqual(['root-a', 'child', 'root-b']);
    expect(await services.projects.getProject('ws-a', 'project-a')).toMatchObject({ documentCount: 1, topicCount: 3, canEditContent: true });
    expect(calls.some((c) => c.table === 'documents' && c.filters.some(([key, value]) => key === 'project_id' && value === 'project-a'))).toBe(true);
    expect(await services.documents.getDocument('project-a', 'foreign')).toBeNull();
  });
  it('reports malformed rows and RLS errors without demo fallback', async () => {
    const { services, db, errors } = f2Setup();
    db.topics[0].settings = [];
    await expect(services.documents.listDocuments('project-a')).rejects.toMatchObject({ code: 'unavailable' });
    errors.set('documents', { code: '42501' });
    await expect(services.documents.listDocuments('project-a')).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('F2 permission and mutation boundaries', () => {
  it.each(['admin', 'author'])('permits an explicit project %s and maps creation parameters once', async (role) => {
    const { services, raw } = f2Setup(role);
    await services.documents.createDocument('project-a', { title: 'New document', slug: 'new-document', description: null });
    expect(raw.rpc).toHaveBeenLastCalledWith('create_document', { p_project_id: 'project-a', p_title: 'New document', p_slug: 'new-document', p_description: null });
    await services.documents.createTopic('project-a', 'doc-a', { title: 'New topic', slug: 'new-topic', parentTopicId: 'root-a' });
    expect(raw.rpc).toHaveBeenLastCalledWith('create_topic', { p_document_id: 'doc-a', p_parent_topic_id: 'root-a', p_title: 'New topic', p_slug: 'new-topic' });
    expect(raw.rpc).toHaveBeenCalledTimes(2);
    expect(raw.rpc.mock.calls.every(call => call.length === 2)).toBe(true);
  });
  it.each(['reviewer', 'viewer', undefined])('does not elevate %s through organization/workspace admin access', async (role) => {
    const fake = f2Setup();
    fake.db.project_members = role ? [{ project_id: 'project-a', user_id: testUser.id, role }] : [];
    expect((await fake.services.documents.listDocuments('project-a'))[0].canEdit).toBe(false);
    await expect(fake.services.documents.createDocument('project-a', { title: 'No', slug: 'no', description: null })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(fake.services.documents.updateTopic('project-a', 'doc-a', 'root-a', { title: 'No' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(fake.raw.rpc).not.toHaveBeenCalled();
  });
  it('persists only whitelisted metadata, including JSON settings, and blocks lifecycle bypass', async () => {
    const { services, calls } = f2Setup();
    await services.documents.updateDocument('project-a', 'doc-a', { description: null, status: 'draft' });
    await services.documents.updateTopic('project-a', 'doc-a', 'root-a', { title: 'Changed', settings: { kind: 'reference', custom: true }, status: 'draft' });
    const writes = calls.filter((c) => c.patch);
    expect(writes[0].patch).toEqual({ description: null, status: 'draft' });
    expect(writes[1].patch).toEqual({ title: 'Changed', settings: { kind: 'reference', custom: true }, status: 'draft' });
    await expect(services.documents.updateTopic('project-a', 'doc-a', 'root-a', { body: ['never persist'] } as never)).rejects.toMatchObject({ code: 'validation' });
    await expect(services.documents.updateTopic('project-a', 'doc-a', 'root-a', { settings: { content: 'never persist' } })).rejects.toMatchObject({ code: 'validation' });
    await expect(services.documents.updateDocument('project-a', 'doc-a', { status: 'approved' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls.filter((c) => c.patch)).toHaveLength(2);
  });
  it('maps all tree and duplication operations to the existing RPCs, without direct hierarchy updates', async () => {
    const { services: { documents: d }, raw, calls } = f2Setup();
    await d.moveTopic('project-a', 'doc-a', 'root-b', 'root-a', 1);
    expect(raw.rpc).toHaveBeenLastCalledWith('move_topic', { p_topic_id: 'root-b', p_new_parent_topic_id: 'root-a', p_new_sort_order: 1 });
    await d.promoteTopic('project-a', 'doc-a', 'child');
    expect(raw.rpc).toHaveBeenLastCalledWith('promote_topic', { p_topic_id: 'child' });
    await d.demoteTopic('project-a', 'doc-a', 'root-b');
    expect(raw.rpc).toHaveBeenLastCalledWith('demote_topic', { p_topic_id: 'root-b' });
    await d.duplicateDocument('project-a', 'doc-a', { title: 'Copy', slug: 'copy' });
    expect(raw.rpc).toHaveBeenLastCalledWith('duplicate_document', { p_document_id: 'doc-a', p_new_title: 'Copy', p_new_slug: 'copy' });
    await d.duplicateTopicSubtree('project-a', 'doc-a', 'root-a', { title: 'Copy', slug: 'copy' });
    expect(raw.rpc).toHaveBeenLastCalledWith('duplicate_topic_subtree', { p_topic_id: 'root-a', p_new_title: 'Copy', p_new_slug: 'copy' });
    expect(raw.rpc).toHaveBeenCalledTimes(5);
    expect(raw.rpc.mock.calls.every(call => call.length === 2)).toBe(true);
    expect(calls.filter((c) => c.patch)).toHaveLength(0);
  });
  it('rejects wrong-document targets before invoking any write', async () => {
    const { services: { documents: d }, raw } = f2Setup();
    await expect(d.createTopic('project-a', 'doc-a', { title: 'A', slug: 'a', parentTopicId: 'foreign' })).rejects.toMatchObject({ code: 'validation' });
    await expect(d.moveTopic('project-a', 'doc-a', 'foreign', null, 0)).rejects.toMatchObject({ code: 'not-found' });
    expect(raw.rpc).not.toHaveBeenCalled();
  });
  const mutations: [string, (service: DocumentService) => Promise<unknown>][] = [
    ['create_document', d => d.createDocument('project-a', { title: 'A', slug: 'a', description: null })],
    ['create_topic', d => d.createTopic('project-a', 'doc-a', { title: 'A', slug: 'a', parentTopicId: null })],
    ['move_topic', d => d.moveTopic('project-a', 'doc-a', 'root-b', null, 0)],
    ['promote_topic', d => d.promoteTopic('project-a', 'doc-a', 'child')],
    ['demote_topic', d => d.demoteTopic('project-a', 'doc-a', 'root-b')],
    ['duplicate_document', d => d.duplicateDocument('project-a', 'doc-a', { title: 'Copy', slug: 'copy' })],
    ['duplicate_topic_subtree', d => d.duplicateTopicSubtree('project-a', 'doc-a', 'root-a', { title: 'Copy', slug: 'copy' })],
  ];
  it.each(mutations)('%s fails closed without discovery, aliases, retries or direct inserts', async (name, mutate) => {
    for (const [error, code] of [
      [{ code: 'PGRST202' }, 'unavailable'],
      [{ code: 'PGRST202', hint: 'public.unrelated_function(p_name)' }, 'unavailable'],
      [{ code: '42501' }, 'forbidden'],
      [{ code: '23505' }, 'conflict'],
      [{ code: '23514' }, 'validation'],
      [{ code: 'FETCH_ERROR', message: 'Controlled network failure' }, 'network'],
    ] as const) {
      const { services, raw, calls } = f2Setup();
      raw.rpc.mockResolvedValue({ data: null, error });
      await expect(mutate(services.documents)).rejects.toMatchObject({ code });
      expect(raw.rpc).toHaveBeenCalledTimes(1);
      expect(raw.rpc.mock.calls[0]).toHaveLength(2);
      expect(raw.rpc.mock.calls[0][0]).toBe(name);
      expect(Object.keys(raw.rpc.mock.calls[0][1]).sort()).toEqual([...rpcParameters[name]].sort());
      expect(calls.filter(call => call.insert || call.patch || call.deleted)).toEqual([]);
    }
  });
  it.each(mutations.filter(([name]) => name.startsWith('create_') || name.startsWith('duplicate_')))(
    '%s requires a confirmed new ID without retrying or falling back', async (_name, mutate) => {
      const { services, raw, calls } = f2Setup();
      raw.rpc.mockResolvedValue({ data: null, error: null });
      await expect(mutate(services.documents)).rejects.toMatchObject({ code: 'unavailable' });
      expect(raw.rpc).toHaveBeenCalledTimes(1);
      expect(raw.rpc.mock.calls[0]).toHaveLength(2);
      expect(calls.filter(call => call.insert || call.patch || call.deleted)).toEqual([]);
    },
  );
  it('keeps demo writes isolated and invalidates every affected read cache', async () => {
    const demo = createDemoServices({ latencyMs: 0 });
    await expect(demo.documents.createDocument('project-a', { title: 'A', slug: 'a', description: null })).rejects.toMatchObject({ code: 'unavailable' });
    const client = new QueryClient();
    for (const key of [['documents', 'project-a'], ['document', 'project-a', 'doc-a'], ['project', 'ws-a', 'project-a'], ['projects', 'ws-a']]) client.setQueryData(key, []);
    client.setQueryData(['document', 'other-project', 'other-document'], []);
    await invalidateContent(client, 'project-a');
    expect(client.getQueryState(['document', 'project-a', 'doc-a'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['documents', 'project-a'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['project', 'ws-a', 'project-a'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['projects', 'ws-a'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['document', 'other-project', 'other-document'])?.isInvalidated).toBe(false);
  });
});
