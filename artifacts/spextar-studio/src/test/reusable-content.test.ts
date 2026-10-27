import { describe, expect, it, vi } from 'vitest';
import { demoReusable } from '@/services/demo-reusable';
import { createDemoServices } from '@/services/demo-adapter';
import { parseReusable, parseReusableDraft, reusableInputSchema, reusableContent, type ReusableInput } from '@/domain/reusable-content';
import { contentKey, emptyContent } from '@/domain/topic-content';
import { testUser } from './supabase-double';
import { reusableAt as at, reusableContext, reusableRow, reusableBody, reusableDraftRow, reusableDouble as backend } from './reusable-fixtures';

const input: ReusableInput = { scope: 'project', name: 'New reusable content', slug: 'new-reusable-content', description: null, settings: {}, status: 'draft', updatePolicy: 'manual', tags: ['technical'] };
const context = { ...reusableContext, userId: testUser.id };

describe('Reusable content model and strict boundaries', () => {
  it.each([
    { name: '' }, { name: 'x'.repeat(121) }, { slug: 'Upper Slug' }, { scope: 'organization' },
    { status: 'released' }, { updatePolicy: 'immediate' }, { settings: [] }, { settings: 'json' },
    { tags: ['same', 'same'] }, { tags: [1] },
  ])('rejects malformed write fields %j', patch => {
    expect(reusableInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it('maps status/policy/settings/tags without fake references or coercion', () => {
    const r = parseReusable(reusableRow({ status: 'in_review', update_policy: 'auto' }), context, { workspace: false, project: true });
    expect(r).toMatchObject({ canEdit: true, scope: 'project', status: 'in_review', updatePolicy: 'auto', settings: { future: { keep: ['all'] } } });
    expect(r).not.toHaveProperty('usageCount');
  });
  it.each([
    { workspace_id: 'foreign' }, { project_id: 'foreign' }, { scope: 'workspace' },
  ])('rejects foreign scope %j', patch => {
    expect(() => parseReusable(reusableRow(patch), context, { workspace: true, project: true })).toThrow();
  });
  it.each([{ tags: 'one,two' }, { settings: null }, { status: 'queued' }, { update_policy: 'unexpected' }])('fails closed on unsupported backend row %j', patch => {
    expect(() => parseReusable(reusableRow(patch), context, { workspace: true, project: true })).toThrow();
  });
  it('validates drafts and preserves unknown structured nodes and root metadata for lossless read-only display', () => {
    const body = { ...reusableBody, content: [{ type: 'futureNode', attrs: { id: 'future-id', opaque: { a: [1, 2] } } }] };
    expect(parseReusableDraft(reusableDraftRow({ content: body }), 'reuse-a').content).toEqual(body);
    expect(() => parseReusableDraft(reusableDraftRow({ reusable_content_id: 'foreign' }), 'reuse-a')).toThrow();
    expect(() => reusableContent({ type: 'doc', content: 'flattened' })).toThrow();
    expect(() => parseReusableDraft(reusableDraftRow({ revision: '2' }), 'reuse-a')).toThrow();
  });
});

describe('Authenticated reusable Supabase adapter', () => {
  it('lists only current project and workspace-shared rows with per-scope edit permissions', async () => {
    const { reusable, calls, db } = backend();
    db.reusable_contents.push(reusableRow({ id: 'other-project', project_id: 'project-b' }), reusableRow({ id: 'other-workspace', workspace_id: 'ws-b' }));
    const rows = await reusable.list(context);
    expect(rows.map(r => [r.id, r.canEdit])).toEqual([['reuse-a', true], ['reuse-shared', false]]);
    const reads = calls.filter(c => c.table === 'reusable_contents');
    expect(reads).toHaveLength(2);
    expect(reads.every(c => c.filters.some(([k, v]) => k === 'workspace_id' && v === context.workspaceId))).toBe(true);
    expect(reads.find(c => c.filters.some(([k, v]) => k === 'scope' && v === 'project'))?.filters).toContainEqual(['project_id', context.projectId]);
  });
  it.each(['reviewer', 'viewer', null])('keeps project %s read-only even with inherited workspace administration', async role => {
    const { reusable, calls } = backend(role, true);
    expect(await reusable.permissions(context)).toEqual({ workspace: true, project: false });
    const project = (await reusable.list(context)).find(r => r.scope === 'project')!;
    expect(project.canEdit).toBe(false);
    await expect(reusable.create(context, input)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(reusable.rename(context, 'reuse-a', 'Renamed', at)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(reusable.saveDraft(context, 'reuse-a', reusableBody, 2)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(reusable.duplicate(context, 'reuse-a', { name: 'Copy', slug: 'copy' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls.filter(c => c.insert || c.patch)).toHaveLength(0);
    expect((await reusable.rename(context, 'reuse-shared', 'Shared renamed', at)).name).toBe('Shared renamed');
  });
  it.each(['admin', 'author'])('allows explicit project %s but not workspace mutations without workspace administration', async role => {
    const { reusable } = backend(role);
    expect(await reusable.permissions(context)).toEqual({ project: true, workspace: false });
    await expect(reusable.create(context, { ...input, scope: 'workspace' })).rejects.toMatchObject({ code: 'forbidden' });
    expect((await reusable.create(context, input)).canEdit).toBe(true);
  });
  it('preserves identity/slug/audits/settings on rename and rejects stale metadata writes', async () => {
    const { reusable, calls } = backend();
    const saved = await reusable.rename(context, 'reuse-a', 'Renamed introduction', at);
    expect(saved).toMatchObject({ id: 'reuse-a', slug: 'product-introduction', createdBy: 'original-creator', createdAt: at, settings: { future: { keep: ['all'] } } });
    const write = calls.find(c => c.patch)!;
    expect(write.patch).toEqual({ name: 'Renamed introduction' });
    expect(write.filters).toContainEqual(['updated_at', at]);
    expect(write.filters).toContainEqual(['project_id', context.projectId]);
    await expect(reusable.rename(context, 'reuse-a', 'Stale edit', at)).rejects.toMatchObject({ code: 'conflict' });
  });
  it('updates only validated metadata, keeping server-controlled identities and audit fields out of writes', async () => {
    const { reusable, calls } = backend();
    const saved = await reusable.update(context, 'reuse-a', { ...input, status: 'in_review', updatePolicy: 'auto', settings: { preserved: true } }, at);
    expect(saved).toMatchObject({ status: 'in_review', updatePolicy: 'auto', settings: { preserved: true } });
    expect(calls.find(c => c.patch)?.patch).toEqual({ name: input.name, description: null, status: 'in_review', update_policy: 'auto', tags: input.tags, settings: { preserved: true } });
  });
  it('inserts the first draft without an upsert, client revision, updater or creation-audit assignment', async () => {
    const { reusable, db, calls } = backend(); db.reusable_content_drafts = [];
    const saved = await reusable.saveDraft(context, 'reuse-a', reusableBody, null);
    expect(saved.revision).toBe(1);
    expect(calls.find(c => c.table === 'reusable_content_drafts' && c.insert)?.insert).toEqual({ reusable_content_id: 'reuse-a', content: reusableBody });
  });
  it('updates with last-read revision, returns the advanced row and preserves JSON/root metadata/node IDs', async () => {
    const { reusable, calls } = backend();
    const saved = await reusable.saveDraft(context, 'reuse-a', reusableBody, 2);
    expect(saved.revision).toBe(3);
    expect(saved.content).toEqual(reusableBody);
    const write = calls.find(c => c.table === 'reusable_content_drafts' && c.patch)!;
    expect(write.filters).toEqual([['reusable_content_id', 'reuse-a'], ['revision', 2]]);
    expect(write.patch).toEqual({ content: reusableBody });
    await expect(reusable.saveDraft(context, 'reuse-a', { ...reusableBody, content: [] }, 2)).rejects.toMatchObject({ code: 'conflict' });
  });
  it('detects first-insert races without overwriting a body', async () => {
    const { reusable } = backend();
    await expect(reusable.saveDraft(context, 'reuse-a', reusableBody, null)).rejects.toMatchObject({ code: 'conflict' });
  });
  it('rejects foreign item scope and stale identity before draft or metadata writes', async () => {
    const { reusable, db, calls } = backend();
    await expect(reusable.saveDraft({ ...context, userId: 'different-user' }, 'reuse-a', reusableBody, 2)).rejects.toMatchObject({ code: 'unauthorized' });
    db.reusable_contents[0].project_id = 'other-project';
    await expect(reusable.getDraft(context, 'reuse-a')).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls.filter(c => c.insert || c.patch)).toHaveLength(0);
  });
  it('reports RLS/network/schema errors without demo fallback', async () => {
    const { reusable, errors } = backend();
    for (const [code, expected] of [['42501', 'forbidden'], ['PGRST205', 'unavailable'], ['network', 'network']]) {
      errors.set('reusable_contents', { code });
      await expect(reusable.list(context)).rejects.toMatchObject({ code: expected });
    }
  });
  it('duplicates the persisted snapshot as draft with copied settings/tags/body and unchanged original', async () => {
    const { reusable, db } = backend();
    const original = structuredClone(db.reusable_contents[0]);
    const { item, warning } = await reusable.duplicate(context, 'reuse-a', { name: 'Copied introduction', slug: 'copied-introduction' });
    expect(warning).toBeUndefined();
    expect(item).toMatchObject({ status: 'draft', tags: ['intro'], settings: original.settings, createdBy: testUser.id });
    expect(contentKey((await reusable.getDraft(context, item.id))!.content)).toBe(contentKey(reusableBody));
    expect(db.reusable_contents[0]).toEqual(original);
  });
  it('reports an identifiable partial copy if its draft fails, without pretending success, deleting or altering the original', async () => {
    const { reusable, errors, db, calls } = backend();
    errors.set('write:reusable_content_drafts', { code: '42501' });
    const result = await reusable.duplicate(context, 'reuse-a', { name: 'Partial copy', slug: 'partial-copy' });
    expect(result.warning).toMatch(/body could not be copied/);
    expect(db.reusable_contents.some(r => r.id === result.item.id)).toBe(true);
    expect(db.reusable_content_drafts[0].content).toEqual(reusableBody);
    expect(calls.some(c => c.deleted)).toBe(false);
  });
  it('does not overwrite an already edited new copy', async () => {
    const { reusable, calls } = backend();
    const read = reusable.getDraft.bind(reusable);
    vi.spyOn(reusable, 'getDraft').mockImplementation((c, id) => id === 'reuse-a' ? read(c, id)
      : Promise.resolve({ reusableContentId: id, content: reusableBody, revision: 2, updatedAt: at, updatedBy: 'another-editor' }));
    const result = await reusable.duplicate(context, 'reuse-a', { name: 'Concurrent copy', slug: 'concurrent-copy' });
    expect(result.warning).toMatch(/body could not be copied/);
    expect(calls.filter(c => c.table === 'reusable_content_drafts' && (c.patch || c.insert))).toHaveLength(0);
  });
  it('does not duplicate unsupported bodies', async () => {
    const { reusable, db } = backend();
    db.reusable_content_drafts[0].content = { type: 'doc', version: 1, content: [{ type: 'futureNode' }] };
    await expect(reusable.duplicate(context, 'reuse-a', { name: 'Unsafe copy', slug: 'unsafe-copy' })).rejects.toMatchObject({ code: 'validation' });
    expect(db.reusable_contents).toHaveLength(2);
  });
  it('rejects malformed rows/drafts rather than silently changing shapes', async () => {
    const { reusable, db } = backend();
    db.reusable_content_drafts[0].revision = '2';
    await expect(reusable.getDraft(context, 'reuse-a')).rejects.toMatchObject({ code: 'unavailable' });
    db.reusable_contents[0].tags = 'fake,tags';
    await expect(reusable.list(context)).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('Reusable demo isolation', () => {
  it('uses per-adapter memory, supports both scopes and never calls backend or storage', async () => {
    const authorize = vi.fn(async () => ({ userId: 'demo-user', project: true, workspace: true }));
    const a = demoReusable(authorize), b = demoReusable(authorize);
    const fetch = vi.spyOn(globalThis, 'fetch');
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const c = { workspaceId: 'demo-ws', projectId: 'demo-project' };
    const created = await a.service.create(c, input);
    expect((await b.service.list(c)).some(r => r.id === created.id)).toBe(false);
    const rows = await a.service.list(c);
    rows[0].settings.changed = true;
    expect((await a.service.list(c))[0].settings).not.toHaveProperty('changed');
    expect((await a.service.list({ ...c, projectId: 'other' })).every(r => r.scope === 'workspace')).toBe(true);
    await a.service.saveDraft(c, created.id, reusableBody, null);
    await expect(a.service.saveDraft(c, created.id, reusableBody, null)).rejects.toMatchObject({ code: 'conflict' });
    const copy = await a.service.duplicate(c, created.id, { name: 'Demo copy', slug: 'demo-copy' });
    expect((await a.service.getDraft(c, copy.item.id))?.content).toEqual(reusableBody);
    expect(fetch).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
    a.clear(); expect((await a.service.list(c)).some(r => r.id === created.id)).toBe(false);
  });
  it('clears reusable session memory on demo sign-out', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    await services.auth.enterDemo();
    const ws = (await services.workspaces.listWorkspaces())[0], project = (await services.projects.listProjects(ws.id))[0];
    const c = { workspaceId: ws.id, projectId: project.id };
    const saved = await services.reusable.create(c, input);
    await services.auth.signOut(); await services.auth.enterDemo();
    expect((await services.reusable.list(c)).some(r => r.id === saved.id)).toBe(false);
  });
});
