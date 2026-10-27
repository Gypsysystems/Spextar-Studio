import { describe, expect, it } from 'vitest';
import { supabaseDouble, testUser, testSession } from './supabase-double';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { createDemoServices } from '@/services/demo-adapter';
import { contentKey, contentText, emptyContent, supportsTextEditing, withText } from '@/domain/topic-content';

export function draftFixture(role = 'author') {
  const fake = supabaseDouble();
  const at = '2026-10-27T10:00:00Z';
  fake.db.documents.push({ id: 'doc-a', project_id: 'project-a', title: 'Manual', slug: 'manual', description: null,
    status: 'draft', settings: {}, created_by: testUser.id, created_at: at, updated_at: at });
  fake.db.topics.push({ id: 'topic-a', document_id: 'doc-a', title: 'Install', slug: 'install',
    status: 'draft', settings: {}, parent_topic_id: null, sort_order: 0, created_by: testUser.id, created_at: at, updated_at: at });
  fake.db.project_members[0].role = role;
  const services = createSupabaseServices(fake.client);
  const scope = { userId: testUser.id, projectId: 'project-a', documentId: 'doc-a', topicId: 'topic-a' };
  return { ...fake, services, scope };
}
const body = (text: string) => withText(emptyContent(), text);

describe('F3 structured content', () => {
  it('round-trips whitespace, blank lines, empty content and root extensions', () => {
    const value = ' first\nline\n\n\n\nlast \n';
    const content = withText({ ...emptyContent(), extension: { future: true } }, value);
    expect(contentText(content)).toBe(value);
    expect(content.extension).toEqual({ future: true });
    expect(contentText(withText(content, ''))).toBe('');
  });
  it('preserves unknown nodes and marks without allowing destructive plain-text edits', () => {
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rich', marks: [{ type: 'bold' }] }] }] };
    expect(contentText(content)).toBe('Rich');
    expect(supportsTextEditing(content)).toBe(false);
    expect(() => withText(content, 'changed')).toThrow(/later editor/);
    expect(content.content[0].content[0].marks).toEqual([{ type: 'bold' }]);
  });
  it('compares JSONB content independently of object-key order', () => {
    expect(contentKey({ type: 'doc', version: 1, content: [] })).toBe(contentKey({ content: [], version: 1, type: 'doc' }));
  });
});

describe('F3 authenticated table adapter', () => {
  it('restores a session when SDK initialization emits SIGNED_IN before hydration completes', async () => {
    const fake = supabaseDouble();
    fake.raw.auth.getSession.mockImplementationOnce(async () => {
      fake.emit('SIGNED_IN', testSession);
      return { data: { session: testSession }, error: null };
    });
    const services = createSupabaseServices(fake.client);
    const unsubscribe = services.auth.onSessionChange!(() => {});
    expect(await services.auth.getSession()).toMatchObject({ userId: testUser.id, mode: 'backend' });
    unsubscribe();
  });
  it('returns no persisted body for a new topic without inserting on read', async () => {
    const { services, scope, calls } = draftFixture();
    expect(await services.topicDrafts.get(scope)).toBeNull();
    expect(calls.some((call) => call.insert || call.patch)).toBe(false);
  });
  it('invalidates the old identity immediately when Auth changes to a different user', async () => {
    const { services, scope, emit, calls } = draftFixture();
    await services.auth.getSession();
    const events: unknown[] = [];
    const unsubscribe = services.auth.onSessionChange!((session) => events.push(session));
    emit('SIGNED_IN', { ...testSession, user: { ...testSession.user, id: 'another-user', email: 'another@example.test' } });
    expect(events[0]).toBeNull();
    await expect(services.topicDrafts.save(scope, body('Old identity'), null)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(calls.some((call) => call.insert || call.patch)).toBe(false);
    unsubscribe();
  });
  it('inserts once, consumes revision 1, and updates with the exact last-read revision', async () => {
    const { services, scope, calls, raw } = draftFixture();
    const first = await services.topicDrafts.save(scope, body('First'), null);
    expect(first).toMatchObject({ topicId: scope.topicId, revision: 1, updatedBy: testUser.id });
    const second = await services.topicDrafts.save(scope, body('Second'), first.revision);
    expect(second.revision).toBe(2);
    expect(contentText((await services.topicDrafts.get(scope))!.content)).toBe('Second');
    const insert = calls.find((call) => call.insert)!.insert!;
    expect(insert).not.toHaveProperty('revision');
    expect(insert).not.toHaveProperty('updated_at');
    const update = calls.find((call) => call.table === 'topic_drafts' && call.patch)!;
    expect(update.filters).toEqual([['topic_id', scope.topicId], ['revision', 1]]);
    expect(update.patch).not.toHaveProperty('revision');
    expect(raw.rpc).not.toHaveBeenCalled();
  });
  it('rejects a stale writer without overwriting the current content', async () => {
    const { services, scope, db } = draftFixture();
    await services.topicDrafts.save(scope, body('Original'), null);
    await services.topicDrafts.save(scope, body('Other browser'), 1);
    await expect(services.topicDrafts.save(scope, body('Stale'), 1)).rejects.toMatchObject({ code: 'conflict' });
    expect(contentText(db.topic_drafts[0].content as ReturnType<typeof body>)).toBe('Other browser');
    expect(db.topic_drafts[0].revision).toBe(2);
  });
  it('handles a competing first insert as conflict, never upsert', async () => {
    const { services, scope } = draftFixture();
    await services.topicDrafts.save(scope, body('Other browser'), null);
    await expect(services.topicDrafts.save(scope, body('This browser'), null)).rejects.toMatchObject({ code: 'conflict' });
  });
  it.each(['reviewer', 'viewer', 'missing'])('blocks %s writes before any draft mutation', async (role) => {
    const { services, scope, calls, db } = draftFixture(role);
    if (role === 'missing') db.project_members = [];
    expect(await services.topicDrafts.get(scope)).toBeNull();
    await expect(services.topicDrafts.save(scope, body('Blocked'), null)).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls.some((call) => call.insert || call.patch)).toBe(false);
  });
  it.each(['admin', 'author'])('permits explicit project %s membership', async (role) => {
    const { services, scope } = draftFixture(role);
    expect((await services.topicDrafts.save(scope, body(role), null)).revision).toBe(1);
  });
  it.each(['projectId', 'documentId', 'topicId', 'userId'] as const)('fails closed on incorrect %s scope', async (field) => {
    const { services, scope, calls } = draftFixture();
    const invalid = { ...scope, [field]: 'wrong-scope' };
    await expect(services.topicDrafts.save(invalid, body('Never saved'), null)).rejects.toBeInstanceOf(Error);
    expect(calls.some((call) => call.insert || call.patch)).toBe(false);
  });
  it('surfaces backend authorization errors without fallback', async () => {
    const { services, scope, errors } = draftFixture();
    errors.set('topic_drafts', { code: '42501' });
    await expect(services.topicDrafts.get(scope)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(services.topicDrafts.save(scope, body('No fallback'), null)).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('reads copied persisted content using the duplicated topic identity', async () => {
    const { services, scope, db } = draftFixture();
    const saved = await services.topicDrafts.save(scope, body('Copied body'), null);
    db.topics.push({ ...db.topics[0], id: 'duplicate-topic' });
    db.topic_drafts.push({ ...db.topic_drafts[0], topic_id: 'duplicate-topic' });
    const copy = await services.topicDrafts.get({ ...scope, topicId: 'duplicate-topic' });
    expect(contentKey(copy!.content)).toBe(contentKey(saved.content));
    expect(copy!.topicId).toBe('duplicate-topic');
  });
  it('does not offer draft persistence in isolated demo mode', async () => {
    const demo = createDemoServices();
    const { scope } = draftFixture();
    await expect(demo.topicDrafts.save(scope, body('Never backend'), null)).rejects.toBeInstanceOf(Error);
    await expect(demo.topicDrafts.get(scope)).rejects.toBeInstanceOf(Error);
  });
});
