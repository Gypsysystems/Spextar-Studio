import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { mapDocument, readAll } from '@/services/supabase-documents';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { createDemoServices } from '@/services/demo-adapter';
import { invalidateContent } from '@/hooks/use-content-mutation';
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
const signatures: Record<string, string> = {
  create_document: 'p_project_id, p_title, p_slug, p_description',
  create_topic: 'p_document_id, p_parent_topic_id, p_title, p_slug',
  move_topic: 'p_topic_id, p_new_parent_topic_id, p_new_sort_order',
  promote_topic: 'p_topic_id', demote_topic: 'p_topic_id',
  duplicate_document: 'p_document_id, p_new_title, p_new_slug',
  duplicate_topic_subtree: 'p_topic_id, p_new_title, p_new_slug',
};

export function f2Setup(role = 'admin') {
  const fake = supabaseDouble();
  fake.db.documents.push({ ...f2Document });
  fake.db.topics.push(f2Topic('root-b', null, 10), f2Topic('child', 'root-a', 0), f2Topic('root-a', null, 0));
  fake.db.project_members[0].role = role;
  fake.raw.rpc.mockImplementation(async (name, args, options) => {
    if (options?.get) return { data: null, error: { code: 'PGRST202', hint: `Perhaps you meant to call the function public.${name}(${signatures[name]})` } };
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
    expect(raw.rpc.mock.calls.filter(([, , options]) => !options?.get)).toHaveLength(2);
  });
  it.each(['reviewer', 'viewer', undefined])('does not elevate %s through organization/workspace admin access', async (role) => {
    const fake = f2Setup();
    fake.db.project_members = role ? [{ project_id: 'project-a', user_id: testUser.id, role }] : [];
    expect((await fake.services.documents.listDocuments('project-a'))[0].canEdit).toBe(false);
    await expect(fake.services.documents.createDocument('project-a', { title: 'No', slug: 'no', description: null })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(fake.services.documents.updateTopic('project-a', 'doc-a', 'root-a', { title: 'No' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(fake.raw.rpc).not.toHaveBeenCalled();
  });
  it('persists only whitelisted metadata, including underscore statuses and JSON settings', async () => {
    const { services, calls } = f2Setup();
    await services.documents.updateDocument('project-a', 'doc-a', { description: null, status: 'in-review' });
    await services.documents.updateTopic('project-a', 'doc-a', 'root-a', { title: 'Changed', settings: { kind: 'reference', custom: true }, status: 'published' });
    const writes = calls.filter((c) => c.patch);
    expect(writes[0].patch).toEqual({ description: null, status: 'in_review' });
    expect(writes[1].patch).toEqual({ title: 'Changed', settings: { kind: 'reference', custom: true }, status: 'published' });
    await expect(services.documents.updateTopic('project-a', 'doc-a', 'root-a', { body: ['never persist'] } as never)).rejects.toMatchObject({ code: 'validation' });
    await expect(services.documents.updateTopic('project-a', 'doc-a', 'root-a', { settings: { content: 'never persist' } })).rejects.toMatchObject({ code: 'validation' });
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
    expect(calls.filter((c) => c.patch)).toHaveLength(0);
  });
  it('rejects wrong-document targets before invoking any write', async () => {
    const { services: { documents: d }, raw } = f2Setup();
    await expect(d.createTopic('project-a', 'doc-a', { title: 'A', slug: 'a', parentTopicId: 'foreign' })).rejects.toMatchObject({ code: 'validation' });
    await expect(d.moveTopic('project-a', 'doc-a', 'foreign', null, 0)).rejects.toMatchObject({ code: 'not-found' });
    expect(raw.rpc).not.toHaveBeenCalled();
  });
  it('fails closed on missing signature metadata and does not retry a failed write', async () => {
    const { services, raw } = f2Setup();
    raw.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(services.documents.promoteTopic('project-a', 'doc-a', 'child')).rejects.toMatchObject({ code: 'unavailable' });
    expect(raw.rpc.mock.calls.every(([, , options]) => options?.get)).toBe(true);
    raw.rpc.mockClear();
    raw.rpc.mockImplementation(async (name, _args, options) => options?.get
      ? { data: null, error: { code: 'PGRST202', hint: `public.${name}(p_topic_id)` } }
      : { data: null, error: { code: '42501' } });
    await expect(services.documents.demoteTopic('project-a', 'doc-a', 'root-b')).rejects.toMatchObject({ code: 'forbidden' });
    expect(raw.rpc.mock.calls.filter(([, , options]) => !options?.get)).toHaveLength(1);
  });
  it('does not execute a signature that omits the selected project context', async () => {
    const { services, raw } = f2Setup();
    raw.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', hint: 'public.create_document(p_title, p_slug, p_description)' } });
    await expect(services.documents.createDocument('project-a', { title: 'A', slug: 'a', description: null })).rejects.toMatchObject({ code: 'unavailable' });
    expect(raw.rpc.mock.calls.every(([, , options]) => options?.get)).toBe(true);
  });
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
