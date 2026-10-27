import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { DocumentRecord } from '@/domain/types';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { createDemoServices } from '@/services/demo-adapter';
import { mapDocument } from '@/services/supabase-documents';
import { metadataDeletionState, pruneDeletedContent } from '@/hooks/use-content-deletion';
import { supabaseDouble, testUser } from './supabase-double';

const at = '2026-10-27T10:00:00Z';
function setup(role: string | null = 'author') {
  const fake = supabaseDouble();
  const common = { status: 'draft', settings: {}, created_by: testUser.id, created_at: at, updated_at: at };
  fake.db.documents.push(...['doc-a', 'doc-b'].map((id) => ({ ...common, id, project_id: 'project-a', title: id, slug: id, description: null })));
  fake.db.topics.push(
    { ...common, id: 'parent', document_id: 'doc-a', parent_topic_id: null, title: 'Parent', slug: 'parent', sort_order: 0 },
    { ...common, id: 'leaf', document_id: 'doc-a', parent_topic_id: 'parent', title: 'Leaf', slug: 'leaf', sort_order: 0 },
    { ...common, id: 'unrelated', document_id: 'doc-b', parent_topic_id: null, title: 'Unrelated', slug: 'unrelated', sort_order: 0 },
  );
  if (role) fake.db.project_members[0].role = role;
  else fake.db.project_members = [];
  return { ...fake, services: createSupabaseServices(fake.client) };
}

describe('F2 scoped deletion', () => {
  it.each(['admin', 'author'])('lets an explicit project %s remove leaves and then their empty document', async (role) => {
    const { services, db, calls, raw } = setup(role);
    await services.documents.deleteTopic('project-a', 'doc-a', 'leaf', at);
    await services.documents.deleteTopic('project-a', 'doc-a', 'parent', at);
    await services.documents.deleteDocument('project-a', 'doc-a', at);
    expect(db.documents.map((doc) => doc.id)).toEqual(['doc-b']);
    expect(db.topics.map((topic) => topic.id)).toEqual(['unrelated']);
    expect(calls.filter((call) => call.deleted).map(({ table, filters }) => [table, filters])).toEqual([
      ['topics', [['document_id', 'doc-a'], ['id', 'leaf'], ['updated_at', at]]],
      ['topics', [['document_id', 'doc-a'], ['id', 'parent'], ['updated_at', at]]],
      ['documents', [['project_id', 'project-a'], ['id', 'doc-a'], ['updated_at', at]]],
    ]);
    expect(raw.rpc).not.toHaveBeenCalled();
    const projects = await services.projects.listProjects('ws-a');
    expect(projects.find((project) => project.id === 'project-a')).toMatchObject({ documentCount: 1, topicCount: 1 });
  });
  it.each(['reviewer', 'viewer', null])('rejects %s without issuing a delete, even with inherited workspace administration', async (role) => {
    const { services, calls } = setup(role);
    await expect(services.documents.deleteTopic('project-a', 'doc-a', 'leaf', at)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(services.documents.deleteDocument('project-a', 'doc-a', at)).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls.filter((call) => call.deleted)).toHaveLength(0);
  });
  it('blocks parents and nonempty documents without deleting dependencies piecemeal', async () => {
    const { services, calls, db } = setup();
    await expect(services.documents.deleteTopic('project-a', 'doc-a', 'parent', at)).rejects.toThrow(/children first/);
    await expect(services.documents.deleteDocument('project-a', 'doc-a', at)).rejects.toThrow(/all topics/);
    expect(calls.filter((call) => call.deleted)).toHaveLength(0);
    expect(db.topics).toHaveLength(3);
  });
  it('rejects foreign document/topic/project identifiers before issuing a delete', async () => {
    const { services, calls } = setup();
    await expect(services.documents.deleteTopic('project-a', 'doc-b', 'leaf', at)).rejects.toMatchObject({ code: 'not-found' });
    await expect(services.documents.deleteDocument('project-a', 'missing', at)).rejects.toMatchObject({ code: 'not-found' });
    await expect(services.documents.deleteTopic('project-b', 'doc-a', 'leaf', at)).rejects.toBeInstanceOf(Error);
    expect(calls.filter((call) => call.deleted)).toHaveLength(0);
  });
  it('rejects missing/stale confirmation versions and concurrent metadata changes', async () => {
    const { services, calls, beforeDelete, db } = setup();
    await expect(services.documents.deleteTopic('project-a', 'doc-a', 'leaf', '')).rejects.toMatchObject({ code: 'conflict' });
    await expect(services.documents.deleteTopic('project-a', 'doc-a', 'leaf', 'stale')).rejects.toMatchObject({ code: 'conflict' });
    expect(calls.filter((call) => call.deleted)).toHaveLength(0);
    beforeDelete.mockImplementation(() => { db.topics.find((topic) => topic.id === 'leaf')!.updated_at = '2026-10-28T10:00:00Z'; });
    await expect(services.documents.deleteTopic('project-a', 'doc-a', 'leaf', at)).rejects.toThrow(/not confirmed/);
    expect(db.topics.some((topic) => topic.id === 'leaf')).toBe(true);
  });
  it.each([
    ['23503', 'conflict', /Related records/],
    ['42501', 'forbidden', /permission/],
    ['PGRST301', 'unauthorized', /session has expired/],
    ['network', 'network', /connection/],
  ])('propagates backend %s errors with no retry or partial cleanup', async (code, expectedCode, message) => {
    const { services, errors, db, calls } = setup();
    errors.set('delete:topics', { code: code as string });
    const request = services.documents.deleteTopic('project-a', 'doc-a', 'leaf', at);
    await expect(request).rejects.toMatchObject({ code: expectedCode });
    await expect(request).rejects.toThrow(message as RegExp);
    expect(calls.filter((call) => call.deleted)).toHaveLength(1);
    expect(db.topics).toHaveLength(3);
  });
  it('does not delete document contents if the database rejects an empty-document delete', async () => {
    const { services, db, errors } = setup();
    db.topics = db.topics.filter((topic) => topic.document_id !== 'doc-a');
    errors.set('delete:documents', { code: '23503' });
    await expect(services.documents.deleteDocument('project-a', 'doc-a', at)).rejects.toMatchObject({ code: 'conflict' });
    expect(db.documents).toHaveLength(2);
    expect(db.topics.map((topic) => topic.id)).toEqual(['unrelated']);
  });
  it('never deletes local demo records as a fallback', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    const storage = JSON.stringify(localStorage);
    await expect(services.documents.deleteTopic('project-a', 'doc-a', 'leaf', at)).rejects.toMatchObject({ code: 'unavailable' });
    await expect(services.documents.deleteDocument('project-a', 'doc-a', at)).rejects.toMatchObject({ code: 'unavailable' });
    expect(JSON.stringify(localStorage)).toBe(storage);
  });
  it('prunes list/detail topic and document caches without touching another project', () => {
    const { db } = setup();
    const client = new QueryClient();
    const doc = mapDocument(db.documents[0], db.topics.filter((topic) => topic.document_id === 'doc-a'), true);
    client.setQueryData(['documents', 'project-a'], [doc]);
    client.setQueryData(['document', 'project-a', 'doc-a'], doc);
    client.setQueryData(['documents', 'other-project'], [doc]);
    pruneDeletedContent(client, 'project-a', { documentId: 'doc-a', topicId: 'leaf', expectedUpdatedAt: at });
    expect(client.getQueryData<DocumentRecord>(['document', 'project-a', 'doc-a'])?.topics.map((topic) => topic.id)).toEqual(['parent']);
    pruneDeletedContent(client, 'project-a', { documentId: 'doc-a', expectedUpdatedAt: at });
    expect(client.getQueryData(['documents', 'project-a'])).toEqual([]);
    expect(client.getQueryData(['document', 'project-a', 'doc-a'])).toBeNull();
    expect(client.getQueryData(['documents', 'other-project'])).toEqual([doc]);
    client.getMutationCache().clear();
    expect(metadataDeletionState(client, 'project-a', { documentId: 'doc-a', topicId: 'parent' })).toBe('deleted');
    expect(metadataDeletionState(new QueryClient(), 'project-a', { documentId: 'doc-a', topicId: 'parent' })).toBeNull();
  });
});
