import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { BackendSession, Organization, Project, ProjectSummary, StudioSession, WorkspaceSummary } from '@/domain/types';
import { slugify } from '@/domain/project-identifiers';
import { ServiceError, type Services } from './contracts';
import { backendError } from './supabase-errors';
import { atomicOperations } from './supabase-atomic';
import { contentCounts, supabaseDocuments } from './supabase-documents';
import { projectInputSchema, workspaceInputSchema } from './validation';
import { SUPABASE_STORAGE_KEY } from './supabase-client';
import { supabaseTopicDrafts } from './supabase-topic-drafts';

const orgRole = z.enum(['owner', 'admin', 'member']);
const workspaceRole = z.enum(['admin', 'member', 'viewer']);
const projectRole = z.enum(['admin', 'author', 'reviewer', 'viewer']);
const orgRow = z.object({ id: z.string(), name: z.string(), slug: z.string() });
const workspaceRow = z.object({
  id: z.string(), organization_id: z.string(), name: z.string(), slug: z.string(),
  description: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
const projectRow = z.object({
  id: z.string(), workspace_id: z.string(), name: z.string(), slug: z.string(),
  description: z.string().nullable(), status: z.enum(['active', 'in-review', 'in_review', 'archived']), created_at: z.string(),
  updated_at: z.string(), created_by: z.string().nullable(),
});
const workspaceColumns = 'id,organization_id,name,slug,description,created_at,updated_at';
const projectColumns = 'id,workspace_id,name,slug,description,status,created_at,updated_at,created_by';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ServiceError('Supabase returned data that does not match the F0/F1 contract.', 'unavailable');
  return result.data;
}
function check(error: unknown) { if (error) throw backendError(error); }
const activeOrgKey = (userId: string) => `spextar.backend.organization.${userId}`;
function readSelection(userId: string) {
  try { return localStorage.getItem(activeOrgKey(userId)); } catch { return null; }
}
function saveSelection(userId: string, orgId: string | null) {
  try {
    if (orgId) localStorage.setItem(activeOrgKey(userId), orgId);
    else localStorage.removeItem(activeOrgKey(userId));
  } catch { /* Non-security-critical preference; RLS and membership are authoritative. */ }
}

/** All authorization is enforced by Supabase RLS. UI checks are additional scope guards.
 * No fixture, demo adapter, or demo storage is imported here.
 */
export function createSupabaseServices(client: SupabaseClient): Services {
  let identity: BackendSession | null = null;
  let organizations: Organization[] = [];
  let ownSignIn = false;
  let generation = 0;
  let signedOut = false;
  const listeners = new Set<(session: StudioSession | null) => void>();
  const createAtomic = atomicOperations(client);
  const emit = () => listeners.forEach((listener) => listener(identity));

  async function hydrate(session: Session): Promise<{ session: BackendSession; organizations: Organization[] }> {
    const { data: verified, error: userError } = await client.auth.getUser();
    check(userError);
    if (!verified.user || verified.user.id !== session.user.id) throw new ServiceError('Sign in again to restore your session.', 'unauthorized');
    const user = verified.user;
    const [profileResult, membershipsResult] = await Promise.all([
      client.from('profiles').select('id,display_name,avatar_url').eq('id', user.id).maybeSingle(),
      client.from('organization_members').select('organization_id,role').eq('user_id', user.id),
    ]);
    check(profileResult.error); check(membershipsResult.error);
    const profile = parse(z.object({ id: z.string(), display_name: z.string().nullable(), avatar_url: z.string().nullable() }).nullable(), profileResult.data);
    const memberships = parse(z.array(z.object({ organization_id: z.string(), role: orgRole })), membershipsResult.data);
    const rows = memberships.length
      ? await client.from('organizations').select('id,name,slug').in('id', memberships.map((m) => m.organization_id)).order('name')
      : { data: [], error: null };
    check(rows.error);
    const nextOrganizations = parse(z.array(orgRow), rows.data).map((org) => ({
      ...org, plan: '', region: '', role: memberships.find((m) => m.organization_id === org.id)!.role,
    }));
    const selected = nextOrganizations.find((org) => org.id === readSelection(user.id)) ?? nextOrganizations[0];
    const name = profile?.display_name?.trim() || user.email || 'Account';
    return { organizations: nextOrganizations, session: {
      mode: 'backend', userId: user.id, email: user.email ?? '', name,
      initials: name.split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase(),
      organizationId: selected?.id ?? '', role: selected?.role ?? 'No organization',
      startedAt: new Date((session.expires_at ? session.expires_at - (session.expires_in ?? 3600) : Date.now() / 1000) * 1000).toISOString(),
    } };
  }
  async function restore(attempt = 0): Promise<BackendSession | null> {
    if (signedOut) return null;
    const version = generation;
    const { data, error } = await client.auth.getSession();
    check(error);
    const next = data.session ? await hydrate(data.session) : null;
    // SDK initialization can emit SIGNED_IN while a persisted session is being
    // restored, before its deferred hydration finishes. Never turn that
    // superseded read into a transient unauthenticated route redirect.
    if (version !== generation) {
      if (identity || signedOut) return identity;
      if (attempt >= 2) throw new ServiceError('The session kept changing during restoration. Please retry sign-in.', 'unauthorized');
      return restore(attempt + 1);
    }
    identity = next?.session ?? null;
    organizations = next?.organizations ?? [];
    return identity;
  }
  async function context(requireOrganization = true): Promise<BackendSession> {
    const session = identity ?? await restore();
    if (!session) throw new ServiceError('Please sign in to continue.', 'unauthorized');
    if (requireOrganization && !session.organizationId) throw new ServiceError('Create or select an organization first.', 'validation');
    return session;
  }
  async function getWorkspace(id: string): Promise<WorkspaceSummary | null> {
    const ctx = await context();
    const result = await client.from('workspaces').select(workspaceColumns)
      .eq('organization_id', ctx.organizationId).eq('id', id).maybeSingle();
    check(result.error);
    if (!result.data) return null;
    const row = parse(workspaceRow, result.data);
    const [membersResult, projectsResult] = await Promise.all([
      client.from('workspace_members').select('user_id,role').eq('workspace_id', row.id),
      client.from('projects').select('id').eq('workspace_id', row.id),
    ]);
    check(membersResult.error); check(projectsResult.error);
    const members = parse(z.array(z.object({ user_id: z.string(), role: workspaceRole })), membersResult.data);
    const projects = parse(z.array(z.object({ id: z.string() })), projectsResult.data);
    const own = members.find((member) => member.user_id === ctx.userId);
    const inheritedAdmin = ctx.role === 'owner' || ctx.role === 'admin';
    return {
      id: row.id, organizationId: row.organization_id, name: row.name, description: row.description ?? '',
      memberCount: members.length, projectCount: projects.length, createdAt: row.created_at, updatedAt: row.updated_at, source: 'backend',
      role: inheritedAdmin ? 'admin' : own?.role,
    };
  }
  async function requireWorkspace(id: string) {
    const ws = await getWorkspace(id);
    if (!ws) throw new ServiceError('Workspace not found or not accessible in this organization.', 'not-found');
    return ws;
  }
  function mapProject(row: z.infer<typeof projectRow>, role?: z.infer<typeof projectRole>, contentRole?: z.infer<typeof projectRole>): ProjectSummary {
    return {
      id: row.id, workspaceId: row.workspace_id, name: row.name, key: row.slug.toUpperCase(),
      description: row.description ?? '', product: '', owner: row.created_by === identity?.userId ? identity.name : row.created_by ?? '',
      status: row.status === 'in_review' ? 'in-review' : row.status,
      createdAt: row.created_at, updatedAt: row.updated_at, source: 'backend', role,
      documentCount: 0, topicCount: 0, canEditContent: contentRole === 'admin' || contentRole === 'author',
    };
  }
  async function getProject(workspaceId: string, projectId: string, includeContentCounts = true): Promise<ProjectSummary | null> {
    const ws = await getWorkspace(workspaceId);
    if (!ws) return null;
    const result = await client.from('projects').select(projectColumns).eq('workspace_id', workspaceId).eq('id', projectId).maybeSingle();
    check(result.error);
    if (!result.data) return null;
    const ctx = await context();
    const own = await client.from('project_members').select('role').eq('project_id', projectId).eq('user_id', ctx.userId).maybeSingle();
    check(own.error);
    const ownRole = own.data ? parse(z.object({ role: projectRole }), own.data).role : undefined;
    const counts = includeContentCounts ? await contentCounts(client, [projectId]) : null;
    return { ...mapProject(parse(projectRow, result.data), ws.role === 'admin' ? 'admin' : ownRole, ownRole), ...(counts?.get(projectId) ?? {}) };
  }
  async function requireProject(projectId: string) {
    await context();
    const row = await client.from('projects').select('workspace_id').eq('id', projectId).maybeSingle();
    check(row.error);
    if (!row.data) throw new ServiceError('Project not found or not accessible.', 'not-found');
    const project = await getProject(parse(z.object({ workspace_id: z.string() }), row.data).workspace_id, projectId, false);
    if (!project) throw new ServiceError('Project not found in this organization.', 'not-found');
    return project;
  }

  return {
    mode: 'backend',
    topicDrafts: supabaseTopicDrafts(client, () => context(false), requireProject),
    auth: {
      getSession: restore,
      async signInWithPassword(email, password) {
        ownSignIn = true;
        const version = ++generation;
        try {
          const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
          check(error);
          if (!data.session) throw new ServiceError('Sign-in returned no session.', 'unauthorized');
          const next = await hydrate(data.session);
          if (version !== generation) throw new ServiceError('Sign-in was superseded.', 'unauthorized');
          signedOut = false;
          identity = next.session;
          organizations = next.organizations;
          return next.session;
        } finally { ownSignIn = false; }
      },
      async enterDemo() { throw new ServiceError('Demo access is disabled in backend mode.', 'unauthorized'); },
      async signOut() {
        ++generation;
        signedOut = true;
        if (identity) saveSelection(identity.userId, null);
        identity = null; organizations = []; emit();
        // Local scope removes this browser's persisted session even when offline.
        try {
          const { error } = await client.auth.signOut({ scope: 'local' });
          check(error);
        } finally {
          // Remove only this app's backend credentials, including offline failures.
          try {
            [SUPABASE_STORAGE_KEY, `${SUPABASE_STORAGE_KEY}-user`, `${SUPABASE_STORAGE_KEY}-code-verifier`]
              .forEach((key) => localStorage.removeItem(key));
          } catch { /* SDK cleanup is still attempted above. */ }
        }
      },
      onSessionChange(listener) {
        listeners.add(listener);
        const { data } = client.auth.onAuthStateChange((event, session) => {
          if (event === 'INITIAL_SESSION' || ownSignIn || (signedOut && session)) return;
          const version = ++generation;
          if (!session) {
            identity = null; organizations = []; emit(); return;
          }
          if (identity && identity.userId !== session.user.id) {
            // Stop old-identity draft work immediately, not after profile hydration.
            identity = null; organizations = []; emit();
          }
          // Never await Supabase operations inside its auth-lock callback.
          setTimeout(() => {
            void hydrate(session).then((next) => {
              if (version === generation) { identity = next.session; organizations = next.organizations; emit(); }
            }).catch(() => {
              if (version === generation) { identity = null; organizations = []; emit(); }
            });
          }, 0);
        });
        return () => { listeners.delete(listener); data.subscription.unsubscribe(); };
      },
    },
    organizations: {
      async getOrganization() {
        const ctx = await context(false);
        return organizations.find((org) => org.id === ctx.organizationId) ?? null;
      },
      async listOrganizations() {
        const previous = identity;
        await restore();
        await context(false);
        if (previous?.organizationId !== identity?.organizationId || previous?.role !== identity?.role) emit();
        return organizations;
      },
      async selectOrganization(id) {
        const ctx = await context(false);
        const org = organizations.find((item) => item.id === id);
        if (!org) throw new ServiceError('This organization is not accessible to your account.', 'forbidden');
        saveSelection(ctx.userId, id);
        identity = { ...ctx, organizationId: id, role: org.role! };
        ++generation; emit();
      },
      async createOrganization(input) {
        const ctx = await context(false);
        const data = parse(z.object({ name: z.string().trim().min(3).max(80), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80) }), input);
        const id = await createAtomic('organization', data);
        saveSelection(ctx.userId, id);
        await restore();
        const org = organizations.find((item) => item.id === id && item.role === 'owner');
        if (!org) throw new ServiceError('The created organization and owner membership could not be confirmed. Refresh before retrying.', 'unavailable');
        emit();
        return org;
      },
    },
    workspaces: {
      async listWorkspaces() {
        const ctx = await context(false);
        if (!ctx.organizationId) return [];
        const result = await client.from('workspaces').select(workspaceColumns).eq('organization_id', ctx.organizationId).order('name');
        check(result.error);
        const rows = parse(z.array(workspaceRow), result.data);
        if (!rows.length) return [];
        const [projects, members] = await Promise.all([
          client.from('projects').select('id,workspace_id').in('workspace_id', rows.map((w) => w.id)),
          client.from('workspace_members').select('workspace_id,user_id,role').in('workspace_id', rows.map((w) => w.id)),
        ]);
        check(projects.error); check(members.error);
        const projectRows = parse(z.array(z.object({ id: z.string(), workspace_id: z.string() })), projects.data);
        const memberRows = parse(z.array(z.object({ workspace_id: z.string(), user_id: z.string(), role: workspaceRole })), members.data);
        return rows.map((row): WorkspaceSummary => ({
          id: row.id, organizationId: row.organization_id, name: row.name, description: row.description ?? '',
          createdAt: row.created_at, updatedAt: row.updated_at, source: 'backend',
          memberCount: memberRows.filter((m) => m.workspace_id === row.id).length,
          projectCount: projectRows.filter((p) => p.workspace_id === row.id).length,
          role: ctx.role === 'owner' || ctx.role === 'admin' ? 'admin' : memberRows.find((m) => m.workspace_id === row.id && m.user_id === ctx.userId)?.role,
        }));
      },
      getWorkspace,
      async createWorkspace(input) {
        const ctx = await context();
        const data = parse(workspaceInputSchema, input);
        const id = await createAtomic('workspace', { ...data, slug: slugify(data.name), organizationId: ctx.organizationId });
        const ws = await requireWorkspace(id);
        const membership = await client.from('workspace_members').select('role').eq('workspace_id', id).eq('user_id', ctx.userId).maybeSingle();
        check(membership.error);
        if (!membership.data || membership.data.role !== 'admin') throw new ServiceError('Workspace admin membership could not be confirmed. Refresh before retrying.', 'unavailable');
        return ws;
      },
    },
    projects: {
      async listProjects(workspaceId) {
        const ws = await requireWorkspace(workspaceId);
        const ctx = await context();
        const result = await client.from('projects').select(projectColumns).eq('workspace_id', workspaceId).order('updated_at', { ascending: false });
        check(result.error);
        const rows = parse(z.array(projectRow), result.data);
        if (!rows.length) return [];
        const memberships = await client.from('project_members').select('project_id,role').eq('user_id', ctx.userId).in('project_id', rows.map((p) => p.id));
        check(memberships.error);
        const roles = parse(z.array(z.object({ project_id: z.string(), role: projectRole })), memberships.data);
        const counts = await contentCounts(client, rows.map((row) => row.id));
        return rows.map((row) => {
          const ownRole = roles.find((m) => m.project_id === row.id)?.role;
          return { ...mapProject(row, ws.role === 'admin' ? 'admin' : ownRole, ownRole), ...counts.get(row.id)! };
        });
      },
      getProject,
      async createProject(workspaceId, input): Promise<Project> {
        const ctx = await context();
        await requireWorkspace(workspaceId);
        const data = parse(projectInputSchema, input);
        if (data.product) throw new ServiceError('Product metadata is not supported by the F0/F1 database.', 'validation');
        const id = await createAtomic('project', { name: data.name, description: data.description, slug: slugify(data.key), workspaceId });
        const project = await getProject(workspaceId, id);
        const member = await client.from('project_members').select('role').eq('project_id', id).eq('user_id', ctx.userId).maybeSingle();
        check(member.error);
        if (!project || member.data?.role !== 'admin') throw new ServiceError('Project and admin membership could not be confirmed. Refresh before retrying.', 'unavailable');
        return project;
      },
      async importProject() { throw new ServiceError('Document import is not part of the connected F0/F1 database foundation.', 'unavailable'); },
      async listActivity(projectId) { await requireProject(projectId); return []; },
    },
    documents: supabaseDocuments(client, requireProject),
  };
}
