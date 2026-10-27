import { describe, it, expect, vi } from 'vitest';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { createDemoServices } from '@/services/demo-adapter';
import { checkMemberChange, projectMetadataSchema, type ProjectSettings } from '@/domain/project-settings';
import { supabaseDouble, testUser } from './supabase-double';
import { DEMO_PROJECTS } from '@/fixtures/demo-data';

export const settingsScope = { workspaceId: 'ws-a', projectId: 'project-a' };
export const metadata = { name: 'Renamed project', slug: 'renamed-project', description: 'New details', status: 'active' as const };
export function settingsDouble(role: string | null = 'admin') {
  const f = supabaseDouble();
  f.db.project_members = role ? [{ project_id: 'project-a', user_id: testUser.id, role }] : [];
  f.db.workspace_members.push({ workspace_id: 'ws-a', user_id: 'existing-workspace-user', role: 'member' });
  return { ...f, services: createSupabaseServices(f.client) };
}
const writes = (f: ReturnType<typeof settingsDouble>) => f.calls.filter(c => c.patch || c.insert || c.deleted);
describe('Project settings validation and authenticated boundaries', () => {
  it.each(['A', ' '.repeat(4), 'a'.repeat(161)])('rejects invalid name %s', name => {
    expect(projectMetadataSchema.safeParse({ ...metadata, name }).success).toBe(false);
  });
  it.each(['Upper', '-start', 'end-', 'two--hyphens', 'with_space', 'a b', ''])('rejects invalid slug %s', slug => {
    expect(projectMetadataSchema.safeParse({ ...metadata, slug }).success).toBe(false);
  });
  it('trims names/descriptions, supports exact bounds and only active/archived', () => {
    expect(projectMetadataSchema.parse({ ...metadata, name: '  AB  ', description: ' details ' })).toMatchObject({ name: 'AB', description: 'details' });
    expect(projectMetadataSchema.parse({ ...metadata, name: 'x'.repeat(160), status: 'archived' }).status).toBe('archived');
    expect(projectMetadataSchema.safeParse({ ...metadata, status: 'in_review' }).success).toBe(false);
    expect(projectMetadataSchema.safeParse({ ...metadata, updated_at: 'client' }).success).toBe(false);
  });
  it('reads scoped project and member data and existing workspace candidates without profiles/email lookup', async () => {
    const f = settingsDouble(); const s = await f.services.projectSettings.get(settingsScope);
    expect(s).toMatchObject({ id: 'project-a', slug: 'pa', canAdminister: true, currentUserId: testUser.id,
      candidates: ['existing-workspace-user'] });
    expect(s.members).toEqual([{ userId: testUser.id, role: 'admin' }]);
    expect(writes(f)).toHaveLength(0);
    expect(f.calls.filter(c => c.table === 'profiles').every(c => c.filters.some(([k, v]) => k === 'id' && v === testUser.id))).toBe(true);
  });
  it.each(['author', 'reviewer', 'viewer', null])('keeps %s and inherited workspace administration read-only', async role => {
    const f = settingsDouble(role); const svc = f.services.projectSettings;
    const state = await svc.get(settingsScope);
    expect(state.canAdminister).toBe(false); expect(state.candidates).toEqual([]);
    await expect(svc.update(settingsScope, metadata, state.updatedAt)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.addMember(settingsScope, 'existing-workspace-user', 'author')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.changeRole(settingsScope, testUser.id, 'admin', 'author')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.removeMember(settingsScope, testUser.id, 'author')).rejects.toMatchObject({ code: 'forbidden' });
    expect(writes(f)).toHaveLength(0);
  });
  it('updates only metadata with workspace/id/revision guard and server timestamps', async () => {
    const f = settingsDouble(); const before = await f.services.projectSettings.get(settingsScope);
    await f.services.projectSettings.update(settingsScope, metadata, before.updatedAt);
    const call = writes(f)[0];
    expect(call.patch).toEqual(metadata);
    expect(call.filters).toEqual([['workspace_id', 'ws-a'], ['id', 'project-a'], ['updated_at', before.updatedAt]]);
    expect(f.db.projects[0]).toMatchObject({ ...metadata, created_by: testUser.id, id: 'project-a' });
    expect(f.db.projects[0].updated_at).not.toBe(before.updatedAt);
    expect(f.db.projects[1].name).toBe('Project B');
  });
  it('archives/restores by metadata status alone; does not delete or call publishing RPCs', async () => {
    const f = settingsDouble(); const svc = f.services.projectSettings;
    let state = await svc.get(settingsScope);
    await svc.update(settingsScope, { ...metadata, status: 'archived' }, state.updatedAt);
    state = await svc.get(settingsScope); expect(state.status).toBe('archived');
    await svc.update(settingsScope, metadata, state.updatedAt);
    expect((await svc.get(settingsScope)).status).toBe('active');
    expect(f.raw.rpc).not.toHaveBeenCalled();
    expect(writes(f).every(c => c.table === 'projects' && !c.deleted)).toBe(true);
  });
  it('rejects stale metadata and stale revision races without overwriting', async () => {
    const f = settingsDouble(); const state = await f.services.projectSettings.get(settingsScope);
    await expect(f.services.projectSettings.update(settingsScope, metadata, 'old')).rejects.toMatchObject({ code: 'conflict' });
    f.beforeWrite.mockImplementation(table => { if (table === 'projects') f.db.projects[0].updated_at = 'newer'; });
    await expect(f.services.projectSettings.update(settingsScope, metadata, state.updatedAt)).rejects.toMatchObject({ code: 'conflict' });
    expect(f.db.projects[0].name).toBe('Project A');
  });
  it('fails closed on foreign project/workspace, malformed roles and backend rows', async () => {
    const f = settingsDouble();
    await expect(f.services.projectSettings.get({ ...settingsScope, workspaceId: 'ws-b' })).rejects.toMatchObject({ code: 'forbidden' });
    f.db.project_members.push({ project_id: 'project-a', user_id: 'bad', role: 'owner' });
    await expect(f.services.projectSettings.get(settingsScope)).rejects.toMatchObject({ code: 'unavailable' });
    f.db.project_members.pop(); f.db.projects[0].status = 'in_review';
    await expect(f.services.projectSettings.get(settingsScope)).rejects.toMatchObject({ code: 'unavailable' });
    expect(writes(f)).toHaveLength(0);
  });
  it('adds only a known workspace user and changes roles with expected-role checks', async () => {
    const f = settingsDouble(); const svc = f.services.projectSettings;
    await expect(svc.addMember(settingsScope, 'unknown-user', 'author')).rejects.toMatchObject({ code: 'validation' });
    await svc.addMember(settingsScope, 'existing-workspace-user', 'reviewer');
    expect(writes(f)[0].insert).toEqual({ project_id: 'project-a', user_id: 'existing-workspace-user', role: 'reviewer' });
    await expect(svc.addMember(settingsScope, 'existing-workspace-user', 'admin')).rejects.toMatchObject({ code: 'validation' });
    await svc.changeRole(settingsScope, 'existing-workspace-user', 'author', 'reviewer');
    expect(writes(f).at(-1)?.filters).toContainEqual(['role', 'reviewer']);
    await expect(svc.changeRole(settingsScope, 'existing-workspace-user', 'admin', 'reviewer')).rejects.toMatchObject({ code: 'conflict' });
    await svc.removeMember(settingsScope, 'existing-workspace-user', 'author');
    expect(f.db.project_members).toHaveLength(1);
    expect((await svc.get(settingsScope)).candidates).toContain('existing-workspace-user');
  });
  it.each(['owner', '', 'ADMIN'])('rejects unsupported member role %s before writes', async role => {
    const f = settingsDouble();
    await expect(f.services.projectSettings.addMember(settingsScope, 'existing-workspace-user', role as 'admin')).rejects.toMatchObject({ code: 'validation' });
    expect(writes(f)).toHaveLength(0);
  });
  it('prevents self-removal and self-demotion even when another admin exists', async () => {
    const f = settingsDouble();
    f.db.project_members.push({ project_id: 'project-a', user_id: 'other-admin', role: 'admin' });
    await expect(f.services.projectSettings.changeRole(settingsScope, testUser.id, 'author', 'admin')).rejects.toMatchObject({ code: 'validation' });
    await expect(f.services.projectSettings.removeMember(settingsScope, testUser.id, 'admin')).rejects.toMatchObject({ code: 'validation' });
    expect(writes(f)).toHaveLength(0);
  });
  it('defensively rejects removing the final admin', async () => {
    const f = settingsDouble(); const state = await f.services.projectSettings.get(settingsScope);
    expect(() => checkMemberChange({ ...state, currentUserId: 'different-actor' } as ProjectSettings, testUser.id, null)).toThrow(/at least one/i);
  });
  it('rejects role races on update/delete and respects database permission errors', async () => {
    const f = settingsDouble(); const svc = f.services.projectSettings;
    await svc.addMember(settingsScope, 'existing-workspace-user', 'viewer');
    f.beforeWrite.mockImplementation(t => { if (t === 'project_members') f.db.project_members[1].role = 'reviewer'; });
    await expect(svc.changeRole(settingsScope, 'existing-workspace-user', 'author', 'viewer')).rejects.toMatchObject({ code: 'conflict' });
    f.beforeDelete.mockImplementation(t => { if (t === 'project_members') f.db.project_members[1].role = 'author'; });
    await expect(svc.removeMember(settingsScope, 'existing-workspace-user', 'reviewer')).rejects.toMatchObject({ code: 'conflict' });
    f.errors.set('write:projects', { code: '42501' });
    const state = await svc.get(settingsScope);
    await expect(svc.update(settingsScope, metadata, state.updatedAt)).rejects.toMatchObject({ code: 'forbidden' });
    expect(f.db.projects[0].name).toBe('Project A');
  });
  it('surfaces network/read failures without demo fallback and rechecks sign-out', async () => {
    const f = settingsDouble();
    f.errors.set('project_members', { code: 'NETWORK' });
    await expect(f.services.projectSettings.get(settingsScope)).rejects.toMatchObject({ code: 'network' });
    f.errors.clear(); await f.services.auth.signOut();
    await expect(f.services.projectSettings.get(settingsScope)).rejects.toMatchObject({ code: 'unauthorized' });
  });
  it('isolates demo changes in adapter memory, exposes them in project lists and clears on sign-out', async () => {
    const services = createDemoServices({ latencyMs: 0 }); await services.auth.enterDemo();
    const p = DEMO_PROJECTS[0]; const scope = { workspaceId: p.workspaceId, projectId: p.id };
    const state = await services.projectSettings.get(scope);
    const storage = vi.spyOn(Storage.prototype, 'setItem'); const fetch = vi.spyOn(globalThis, 'fetch');
    await services.projectSettings.update(scope, metadata, state.updatedAt);
    await services.projectSettings.addMember(scope, 'demo-workspace-member', 'author');
    expect((await services.projects.getProject(p.workspaceId, p.id))?.name).toBe(metadata.name);
    // Existing demo readJSON checks storage availability with a disposable probe.
    expect(storage.mock.calls.every(([key]) => key === '__spextar_probe__')).toBe(true); expect(fetch).not.toHaveBeenCalled();
    const separate = createDemoServices({ latencyMs: 0 });
    expect((await separate.projectSettings.get(scope)).name).toBe(p.name);
    await services.auth.signOut(); await services.auth.enterDemo();
    expect((await services.projectSettings.get(scope)).name).toBe(p.name);
    storage.mockRestore(); fetch.mockRestore();
  });
});
