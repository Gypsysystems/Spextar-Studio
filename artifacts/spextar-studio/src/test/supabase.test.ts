import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { atomicOperations } from '@/services/supabase-atomic';
import { backendError } from '@/services/supabase-errors';
import { createStudioSupabaseClient, SUPABASE_STORAGE_KEY, SUPABASE_PROJECT_URL } from '@/services/supabase-client';
import { createRuntimeServices } from '@/services/runtime';
import { createDemoServices } from '@/services/demo-adapter';
import { STORAGE_KEYS } from '@/services/storage';
import { supabaseDouble, testSession, testUser } from './supabase-double';

afterEach(() => vi.unstubAllEnvs());
const projectInput = { name: 'New project', key: 'NP', description: 'A deliverable', product: '' };
const setup = () => {
  const fake = supabaseDouble();
  return { ...fake, services: createSupabaseServices(fake.client) };
};

describe('Supabase authentication and restoration', () => {
  it('uses the actual SDK to persist, restore and remove a browser session in its own namespace', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', SUPABASE_PROJECT_URL);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test-only');
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: testUser.id, exp: now + 3600, iat: now, role: 'authenticated' })}.dGVzdA`;
    const user = { ...testUser, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
      const response = url.pathname.endsWith('/token')
        ? { access_token: token, refresh_token: 'test-refresh-only', token_type: 'bearer', expires_in: 3600, user } : user;
      return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const client = createStudioSupabaseClient();
    try {
      const result = await client.auth.signInWithPassword({ email: testUser.email, password: 'test-password-only' });
      expect(result.error).toBeNull();
      expect(localStorage.getItem(SUPABASE_STORAGE_KEY)).toContain('test-refresh-only');
      expect(localStorage.getItem(SUPABASE_STORAGE_KEY)).not.toContain('test-password-only');
      const restored = await client.auth.getSession();
      expect(restored.data.session?.access_token).toBe(token);
      expect((await client.auth.getUser()).data.user?.id).toBe(testUser.id);
      expect((await client.auth.signOut({ scope: 'local' })).error).toBeNull();
      expect(localStorage.getItem(SUPABASE_STORAGE_KEY)).toBeNull();
      expect((await client.auth.getSession()).data.session).toBeNull();
      expect(fetchSpy.mock.calls.every(([input]) => String(input).startsWith(SUPABASE_PROJECT_URL))).toBe(true);
    } finally {
      await client.auth.stopAutoRefresh();
      fetchSpy.mockRestore();
    }
  });
  it('restores and verifies the real auth identity, profile and organization role', async () => {
    const { services, raw, calls } = setup();
    expect(await services.auth.getSession()).toMatchObject({
      mode: 'backend', userId: testUser.id, name: 'Technical Writer', role: 'owner', organizationId: 'org-a',
    });
    expect(raw.auth.getUser).toHaveBeenCalled();
    expect(calls.find((c) => c.table === 'profiles')?.filters).toEqual([['id', testUser.id]]);
    expect(calls.find((c) => c.table === 'organization_members')?.filters).toContainEqual(['user_id', testUser.id]);
  });
  it('signs in using email/password without copying credentials to application storage', async () => {
    const fake = supabaseDouble(null);
    const services = createSupabaseServices(fake.client);
    expect(await services.auth.getSession()).toBeNull();
    await services.auth.signInWithPassword!(' writer@example.test ', 'test-password-only');
    expect(fake.raw.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'writer@example.test', password: 'test-password-only' });
    expect(JSON.stringify(localStorage)).not.toContain('test-password-only');
    expect(await services.auth.getSession()).toMatchObject({ mode: 'backend', userId: testUser.id });
  });
  it('maps invalid credentials to a clear authentication error', async () => {
    const { services, raw } = setup();
    raw.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null }, error: { code: 'invalid_credentials', status: 400 },
    } as never);
    await expect(services.auth.signInWithPassword!('writer@example.test', 'incorrect')).rejects.toMatchObject({
      code: 'unauthorized', message: 'Email or password is incorrect.',
    });
  });
  it('rejects a restored session whose authenticated user does not match', async () => {
    const { services, raw } = setup();
    raw.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'different-user' } }, error: null } as never);
    await expect(services.auth.getSession()).rejects.toMatchObject({ code: 'unauthorized' });
  });
  it('notifies on sign-out and unsubscribes auth listeners', async () => {
    const { services, emit } = setup();
    await services.auth.getSession();
    const listener = vi.fn();
    const unsubscribe = services.auth.onSessionChange!(listener);
    emit('SIGNED_OUT', null);
    expect(listener).toHaveBeenCalledWith(null);
    expect(await services.auth.getSession()).toBeNull();
    unsubscribe();
    listener.mockClear();
    emit('SIGNED_OUT', null);
    expect(listener).not.toHaveBeenCalled();
  });
  it('refreshes profile/session state outside the SDK auth lock', async () => {
    const { services, db, emit } = setup();
    await services.auth.getSession();
    const listener = vi.fn();
    const unsubscribe = services.auth.onSessionChange!(listener);
    db.profiles[0].display_name = 'Updated Writer';
    emit('TOKEN_REFRESHED', testSession);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated Writer' })));
    unsubscribe();
  });
  it('clears backend-only state and stays signed out even if remote logout fails', async () => {
    const { services, raw, emit } = setup();
    await services.auth.getSession();
    localStorage.setItem(SUPABASE_STORAGE_KEY, 'backend-session');
    localStorage.setItem(STORAGE_KEYS.navCollapsed, 'true');
    localStorage.setItem(STORAGE_KEYS.session, 'demo-value');
    localStorage.setItem(`spextar.backend.organization.${testUser.id}`, 'org-a');
    raw.auth.signOut.mockResolvedValueOnce({ error: { status: 503 } } as never);
    await expect(services.auth.signOut()).rejects.toMatchObject({ code: 'network' });
    emit('TOKEN_REFRESHED', testSession);
    expect(await services.auth.getSession()).toBeNull();
    expect(localStorage.getItem(SUPABASE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(`spextar.backend.organization.${testUser.id}`)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.navCollapsed)).toBe('true');
    expect(localStorage.getItem(STORAGE_KEYS.session)).toBe('demo-value');
    expect(raw.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('supports a new account with no organizations without inventing demo context', async () => {
    const { services, db } = setup();
    db.organization_members = [];
    expect(await services.auth.getSession()).toMatchObject({ organizationId: '', mode: 'backend' });
    expect(await services.organizations.getOrganization()).toBeNull();
    expect(await services.workspaces.listWorkspaces()).toEqual([]);
  });
});

describe('tenant-scoped persistence boundaries', () => {
  it('lists only workspaces in the selected organization', async () => {
    const { services, calls } = setup();
    expect(await services.workspaces.listWorkspaces()).toEqual([
      expect.objectContaining({ id: 'ws-a', source: 'backend', projectCount: 1, role: 'admin' }),
    ]);
    expect(calls.find((c) => c.table === 'workspaces')?.filters).toContainEqual(['organization_id', 'org-a']);
  });
  it('rejects cross-organization workspace and project deep links before reading their projects', async () => {
    const { services, calls } = setup();
    expect(await services.workspaces.getWorkspace('ws-b')).toBeNull();
    expect(await services.projects.getProject('ws-b', 'project-b')).toBeNull();
    await expect(services.projects.listProjects('ws-b')).rejects.toMatchObject({ code: 'not-found' });
    expect(calls.some((c) => c.table === 'projects')).toBe(false);
  });
  it('scopes project reads to their workspace and rejects mismatched identifiers', async () => {
    const { services, calls } = setup();
    expect(await services.projects.getProject('ws-a', 'project-b')).toBeNull();
    expect(await services.projects.listProjects('ws-a')).toEqual([expect.objectContaining({ id: 'project-a', source: 'backend' })]);
    const projectReads = calls.filter((c) => c.table === 'projects');
    expect(projectReads.every((c) => c.filters.some(([column, value]) => column === 'workspace_id' && value === 'ws-a'))).toBe(true);
  });
  it('refuses organization switching outside the user memberships', async () => {
    const { services } = setup();
    await expect(services.organizations.selectOrganization!('org-b')).rejects.toMatchObject({ code: 'forbidden' });
    expect((await services.organizations.getOrganization())?.id).toBe('org-a');
  });
  it('switches between member organizations and emits a new tenant context', async () => {
    const { services, db } = setup();
    db.organization_members.push({ organization_id: 'org-b', user_id: testUser.id, role: 'member' });
    await services.auth.getSession();
    const listener = vi.fn();
    const unsubscribe = services.auth.onSessionChange!(listener);
    await services.organizations.selectOrganization!('org-b');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-b', role: 'member' }));
    expect((await services.workspaces.listWorkspaces()).map((ws) => ws.id)).toEqual(['ws-b']);
    unsubscribe();
  });
  it('reads workspace and project membership roles without promoting a member', async () => {
    const { services, db } = setup();
    db.organization_members[0].role = 'member';
    db.workspace_members[0].role = 'viewer';
    db.project_members[0].role = 'reviewer';
    expect((await services.workspaces.getWorkspace('ws-a'))?.role).toBe('viewer');
    expect((await services.projects.getProject('ws-a', 'project-a'))?.role).toBe('reviewer');
  });
  it('propagates RLS failures rather than substituting empty lists or fixtures', async () => {
    const { services, errors } = setup();
    errors.set('workspaces', { code: '42501' });
    await expect(services.workspaces.listWorkspaces()).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('rejects malformed backend data explicitly', async () => {
    const { services, db } = setup();
    delete db.workspaces[0].organization_id;
    // Missing scope column causes no match; a malformed visible row fails validation.
    db.workspaces[0].organization_id = 'org-a';
    delete db.workspaces[0].created_at;
    await expect(services.workspaces.listWorkspaces()).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('existing atomic creation operations', () => {
  it('creates an organization with a verified owner membership using one write RPC', async () => {
    const { services, raw } = setup();
    const org = await services.organizations.createOrganization!({ name: 'New Organization', slug: 'new-organization' });
    expect(org).toMatchObject({ name: 'New Organization', role: 'owner' });
    const writes = raw.rpc.mock.calls.filter((call) => !call[2]?.get);
    expect(writes).toEqual([['create_organization_with_owner', { p_name: 'New Organization', p_slug: 'new-organization' }]]);
  });
  it('creates a workspace with its admin membership using the active tenant', async () => {
    const { services, raw } = setup();
    const ws = await services.workspaces.createWorkspace({ name: 'New Workspace', description: 'Team scope' });
    expect(ws).toMatchObject({ organizationId: 'org-a', role: 'admin', source: 'backend' });
    expect(raw.rpc).toHaveBeenCalledWith('create_workspace_with_admin', {
      p_organization_id: 'org-a', p_name: 'New Workspace', p_slug: 'new-workspace', p_description: 'Team scope',
    });
  });
  it('creates a project with its admin membership and persists its key as a slug', async () => {
    const { services, raw } = setup();
    const project = await services.projects.createProject('ws-a', projectInput);
    expect(project).toMatchObject({ key: 'NP', workspaceId: 'ws-a', role: 'admin', source: 'backend' });
    expect(raw.rpc).toHaveBeenCalledWith('create_project_with_admin', {
      p_workspace_id: 'ws-a', p_name: 'New project', p_slug: 'np', p_description: 'A deliverable',
    });
  });
  it('uses GET/read-only probes and never direct table inserts when operations are undiscoverable', async () => {
    const { services, raw, db } = setup();
    raw.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', hint: null } } as never);
    await expect(services.workspaces.createWorkspace({ name: 'Workspace Test', description: '' })).rejects.toMatchObject({ code: 'unavailable' });
    expect(raw.rpc.mock.calls.every((call) => call[2]?.get === true)).toBe(true);
    expect(db.workspaces).toHaveLength(2);
  });
  it('does not attempt a create for an unsupported signature parameter', async () => {
    const { services, raw } = setup();
    raw.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', hint: 'public.create_workspace_with_admin(p_name, p_unrecognized)' } } as never);
    await expect(services.workspaces.createWorkspace({ name: 'Workspace Test', description: '' })).rejects.toMatchObject({ code: 'unavailable' });
    expect(raw.rpc).toHaveBeenCalledTimes(1);
  });
  it('propagates an atomic write error without a second write or partial client-side membership insertion', async () => {
    const { client, raw } = setup();
    raw.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', hint: 'public.create_organization_with_owner(p_name, p_slug)' } } as never)
      .mockResolvedValueOnce({ data: null, error: { code: '42501' } } as never);
    await expect(atomicOperations(client)('organization', { name: 'Test Org', slug: 'test-org' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(raw.rpc).toHaveBeenCalledTimes(2);
    expect(raw.from).not.toHaveBeenCalled();
  });
  it('rejects product metadata rather than pretending it was saved', async () => {
    const { services, raw } = setup();
    await expect(services.projects.createProject('ws-a', { ...projectInput, product: 'Unsupported' })).rejects.toMatchObject({ code: 'validation' });
    expect(raw.rpc).not.toHaveBeenCalled();
  });
});

describe('strict backend/demo separation and configuration', () => {
  it('ignores demo sessions/data and never permits backend demo entry', async () => {
    await createDemoServices({ latencyMs: 0 }).auth.enterDemo();
    const fake = supabaseDouble(null);
    const services = createSupabaseServices(fake.client);
    expect(await services.auth.getSession()).toBeNull();
    await expect(services.auth.enterDemo()).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(services.workspaces.listWorkspaces()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fake.raw.from).not.toHaveBeenCalled();
  });
  it('requires the configured approved project and a publishable client key', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    expect(() => createRuntimeServices('backend')).toThrow('approved Supabase project');
    expect(createRuntimeServices('demo').mode).toBe('demo');
    vi.stubEnv('VITE_SUPABASE_URL', SUPABASE_PROJECT_URL);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test-only');
    const client = createStudioSupabaseClient();
    expect(client.auth).toBeDefined();
    client.auth.stopAutoRefresh();
  });
  it.each(['sb_publishable_', 'sb_publishable_with space', 'sb_publishable_bad\n', 'sb_publishable_bad\r\n'])('rejects malformed public configuration without creating services: %j', key => {
    vi.stubEnv('VITE_SUPABASE_URL', SUPABASE_PROJECT_URL);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key);
    expect(() => createRuntimeServices('backend')).toThrow('approved Supabase project');
  });
  it.each([
    [{ code: '23505' }, 'conflict'],
    [{ code: 'email_not_confirmed' }, 'unauthorized'],
    [{ status: 401 }, 'unauthorized'],
    [{ status: 429 }, 'unauthorized'],
    [{ code: 'PGRST205' }, 'unavailable'],
    [new TypeError('Failed to fetch'), 'network'],
  ])('maps backend failure %j to %s', (error, code) => expect(backendError(error).code).toBe(code));
});
