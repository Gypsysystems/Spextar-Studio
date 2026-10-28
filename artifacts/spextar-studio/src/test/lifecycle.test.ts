import { beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { createDemoServices } from '@/services/demo-adapter';
import type { LifecycleScope } from '@/domain/lifecycle';
import { supabaseDouble } from './supabase-double';

const org: LifecycleScope = { kind: 'organization', id: 'org-a' };
const ws: LifecycleScope = { kind: 'workspace', id: 'ws-a', parentId: 'org-a' };
const project: LifecycleScope = { kind: 'project', id: 'project-a', parentId: 'ws-a' };
function setup() {
  const wire = supabaseDouble();
  const services = createSupabaseServices(wire.client);
  return { ...wire, services, lifecycle: services.lifecycle! };
}
const writes = (f: ReturnType<typeof setup>) => f.calls.filter((c) => c.patch || c.insert || c.deleted);
beforeEach(() => localStorage.clear());

describe('backend-only organization/workspace/project lifecycle', () => {
  it('keeps destructive management out of the demo adapter', () => {
    expect(createDemoServices().lifecycle).toBeUndefined();
  });
  it.each(['owner', 'admin', 'member'])('uses fresh organization %s authority', async (role) => {
    const f = setup(); f.db.organization_members[0].role = role;
    const state = await f.lifecycle.get(org);
    expect(state.canEdit).toBe(role !== 'member');
    expect(state.canDelete).toBe(role === 'owner');
    expect(state.status).toBeNull();
  });
  it('edits only user-editable organization fields without membership writes', async () => {
    const f = setup(); const state = await f.lifecycle.get(org);
    await f.lifecycle.update(org, { name: 'Renamed Organization', slug: 'renamed-org' }, state);
    expect(f.db.organizations[0]).toMatchObject({ name: 'Renamed Organization', slug: 'renamed-org' });
    expect(writes(f)).toHaveLength(1);
    expect(writes(f)[0]).toMatchObject({ table: 'organizations', patch: { name: 'Renamed Organization', slug: 'renamed-org' },
      filters: expect.arrayContaining([['id', 'org-a'], ['updated_at', state.updatedAt]]) });
  });
  it('edits workspace details and explicitly clears an empty description', async () => {
    const f = setup(); const state = await f.lifecycle.get(ws);
    await f.lifecycle.update(ws, { name: 'Renamed Workspace', description: '   ' }, state);
    expect(writes(f)[0]).toMatchObject({ table: 'workspaces', patch: { name: 'Renamed Workspace', description: null },
      filters: expect.arrayContaining([['organization_id', 'org-a'], ['id', 'ws-a'], ['status', 'active']]) });
  });
  it('archives and restores workspaces without deleting children', async () => {
    const f = setup();
    await f.lifecycle.setArchived(ws, true, await f.lifecycle.get(ws));
    expect(f.db.workspaces[0].status).toBe('archived');
    await f.lifecycle.setArchived(ws, false, await f.lifecycle.get(ws));
    expect(f.db.workspaces[0].status).toBe('active');
    expect(writes(f).map(c => c.patch)).toEqual([{ status: 'archived' }, { status: 'active' }]);
    expect(f.db.projects).toHaveLength(2);
  });
  it.each(['organization', 'project'] as const)('never adds another archive path for %s', async kind => {
    const f = setup();
    const s = kind === 'organization' ? org : project;
    await expect(f.lifecycle.setArchived(s, true, await f.lifecycle.get(s))).rejects.toMatchObject({ code: 'validation' });
    expect(writes(f)).toEqual([]);
  });
  it('keeps project edits in the existing settings service', async () => {
    const f = setup();
    await expect(f.lifecycle.update(project, { name: 'Another project' }, await f.lifecycle.get(project))).rejects.toMatchObject({ code: 'validation' });
    expect(writes(f)).toEqual([]);
  });
  it.each([org, ws, project])('deletes $kind with one scoped parent delete, never client-side cascades', async s => {
    const f = setup();
    if (s.kind !== 'organization') f.db[s.kind === 'workspace' ? 'workspaces' : 'projects'][0].status = 'archived';
    const state = await f.lifecycle.get(s);
    await f.lifecycle.remove(s, { name: state.name, acknowledged: true }, state);
    expect(writes(f)).toHaveLength(1);
    expect(writes(f)[0]).toMatchObject({ deleted: true, filters: expect.arrayContaining([['id', s.id], ['updated_at', state.updatedAt]]) });
    expect(writes(f).some(c => c.table.endsWith('_members'))).toBe(false);
    expect(f.raw.rpc).not.toHaveBeenCalled();
  });
  it.each([ws, project])('requires archiving $kind before deletion', async s => {
    const f = setup(); const state = await f.lifecycle.get(s);
    await expect(f.lifecycle.remove(s, { name: state.name, acknowledged: true }, state)).rejects.toMatchObject({ code: 'validation' });
    expect(writes(f)).toEqual([]);
  });
  it.each(['admin', 'member'])('rejects organization deletion by %s even with an old owner snapshot', async role => {
    const f = setup(); const state = await f.lifecycle.get(org);
    f.db.organization_members[0].role = role;
    await expect(f.lifecycle.remove(org, { name: state.name, acknowledged: true }, state)).rejects.toMatchObject({ code: 'forbidden' });
    expect(writes(f)).toEqual([]);
  });
  it.each(['author', 'reviewer', 'viewer', null])('blocks project deletion by explicit/inherited %s', async role => {
    const f = setup(); f.db.projects[0].status = 'archived';
    const state = await f.lifecycle.get(project);
    f.db.project_members = role ? [{ project_id: 'project-a', user_id: 'user-a', role }] : [];
    await expect(f.lifecycle.remove(project, { name: state.name, acknowledged: true }, state)).rejects.toMatchObject({ code: 'forbidden' });
    expect(writes(f)).toEqual([]);
  });
  it.each(['member', 'viewer'])('blocks workspace %s writes', async role => {
    const f = setup(); f.db.organization_members[0].role = 'member';
    f.db.workspace_members[0].role = role;
    const state = await f.lifecycle.get(ws); expect(state.canEdit).toBe(false);
    await expect(f.lifecycle.update(ws, { name: 'Blocked', description: '' }, state)).rejects.toMatchObject({ code: 'forbidden' });
    expect(writes(f)).toEqual([]);
  });
  it('allows explicit workspace admins without organization administration', async () => {
    const f = setup(); f.db.organization_members[0].role = 'member';
    expect((await f.lifecycle.get(ws)).canEdit).toBe(true);
  });
  it.each([{ name: 'wrong', acknowledged: true }, { name: 'Organization A', acknowledged: false }])('requires deliberate confirmation: %j', async confirmation => {
    const f = setup();
    await expect(f.lifecycle.remove(org, confirmation, await f.lifecycle.get(org))).rejects.toMatchObject({ code: 'validation' });
    expect(writes(f)).toEqual([]);
  });
  it('rejects stale snapshots instead of saving or deleting newer data', async () => {
    const f = setup(); const state = await f.lifecycle.get(org);
    f.db.organizations[0].updated_at = '2026-10-29T12:00:00Z';
    await expect(f.lifecycle.update(org, { name: 'Old edit', slug: state.slug }, state)).rejects.toMatchObject({ code: 'conflict' });
    await expect(f.lifecycle.remove(org, { name: state.name, acknowledged: true }, state)).rejects.toMatchObject({ code: 'conflict' });
    expect(writes(f)).toEqual([]);
  });
  it('checks expected timestamp again at the delete statement', async () => {
    const f = setup(); const state = await f.lifecycle.get(org);
    f.beforeDelete.mockImplementation(() => { f.db.organizations[0].updated_at = '2026-10-29T12:00:00Z'; });
    await expect(f.lifecycle.remove(org, { name: state.name, acknowledged: true }, state)).rejects.toMatchObject({ code: 'conflict' });
    expect(f.db.organizations.some(r => r.id === 'org-a')).toBe(true);
  });
  it.each([org, ws, project])('fails closed on cross-tenant $kind scopes', async s => {
    const f = setup();
    const foreign = s.kind === 'organization' ? { ...s, id: 'org-b' } : s.kind === 'workspace' ? { ...s, parentId: 'org-b' } : { ...s, parentId: 'ws-b' };
    await expect(f.lifecycle.get(foreign)).rejects.toMatchObject({ code: 'forbidden' });
    expect(writes(f)).toEqual([]);
  });
  it.each(['42501', '23503'])('keeps data and never falls back after database denial %s', async code => {
    const f = setup(); const state = await f.lifecycle.get(org);
    f.errors.set('delete:organizations', { code, message: 'Denied by the database' });
    await expect(f.lifecycle.remove(org, { name: state.name, acknowledged: true }, state)).rejects.toBeInstanceOf(Error);
    expect(f.db.organizations.some(r => r.id === state.id)).toBe(true);
    expect(writes(f)).toHaveLength(1);
    expect(f.raw.rpc).not.toHaveBeenCalled();
  });
  it('refreshes organization selection after deletion and preserves the signed-in identity', async () => {
    const f = setup();
    f.db.organization_members.push({ organization_id: 'org-b', user_id: 'user-a', role: 'member' });
    const state = await f.lifecycle.get(org);
    await f.lifecycle.remove(org, { name: state.name, acknowledged: true }, state);
    expect(await f.services.auth.getSession()).toMatchObject({ userId: 'user-a', organizationId: 'org-b' });
  });
  it.each([{}, { name: 'Valid', description: '' }, { name: 'Valid', slug: 'UPPER' }, { name: 'Valid', slug: 'valid', updated_at: 'spoof' }])('rejects malformed organization metadata %j', async value => {
    const f = setup();
    await expect(f.lifecycle.update(org, value as { name: string }, await f.lifecycle.get(org))).rejects.toMatchObject({ code: 'validation' });
    expect(writes(f)).toEqual([]);
  });
  it('does not assume an active archive state when backend state is absent or malformed', async () => {
    const f = setup(); delete f.db.workspaces[0].status;
    await expect(f.lifecycle.get(ws)).rejects.toMatchObject({ code: 'unavailable' });
    expect(writes(f)).toEqual([]);
  });
});
