import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackendSession } from '@/domain/types';
import type { LifecycleDetails, LifecycleMetadata, LifecycleScope, LifecycleService } from '@/domain/lifecycle';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';

const tables = { organization: 'organizations', workspace: 'workspaces', project: 'projects' } as const;
const base = z.object({ id: z.string().min(1), name: z.string().min(1), slug: z.string().min(1), updated_at: z.string().min(1) });
const child = base.extend({ description: z.string().nullable(), status: z.enum(['active', 'archived']) });
const name = z.string().trim().min(3, 'Use at least 3 characters.').max(80, 'Use no more than 80 characters.');
const metadata = z.object({ name, slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and single hyphens.').max(80).optional(), description: z.string().trim().max(400).optional() }).strict();
const confirmation = z.object({ name: z.string(), acknowledged: z.literal(true) }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ServiceError('The saved details are unavailable or invalid. Reload and try again.', 'unavailable');
  return r.data;
}
function check(error: unknown) { if (error) throw backendError(error); }
function validScope(s: LifecycleScope) {
  if (!Object.hasOwn(tables, s.kind) || !s.id || (s.kind !== 'organization' && !s.parentId)) {
    throw new ServiceError('Choose an accessible organization, workspace or project.', 'validation');
  }
}

/** Fresh identity/membership guards supplement (never replace) table RLS.
 * Deletes target the parent row once; dependent cleanup belongs exclusively to the database.
 */
export function supabaseLifecycle(
  client: SupabaseClient,
  context: (requireOrganization?: boolean) => Promise<BackendSession>,
  refreshOrganizations: () => Promise<void>,
): LifecycleService {
  function entity(s: LifecycleScope) {
    if (s.kind === 'organization') return client.from('organizations');
    if (s.kind === 'workspace') return client.from('workspaces');
    return client.from('projects');
  }
  async function actor() {
    const ctx = await context();
    const result = await client.auth.getUser();
    check(result.error);
    if (!result.data.user || result.data.user.id !== ctx.userId) throw new ServiceError('Sign in again before making changes.', 'unauthorized');
    return ctx;
  }
  async function organizationRole(ctx: BackendSession) {
    const r = await client.from('organization_members').select('organization_id,user_id,role')
      .eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId).maybeSingle();
    check(r.error);
    const m = parse(z.object({ organization_id: z.string(), user_id: z.string(), role: z.enum(['owner', 'admin', 'member']) }).nullable(), r.data);
    if (!m || m.organization_id !== ctx.organizationId || m.user_id !== ctx.userId) throw new ServiceError('You no longer have access to this organization.', 'forbidden');
    return m.role;
  }
  async function get(s: LifecycleScope): Promise<LifecycleDetails> {
    validScope(s);
    const ctx = await actor();
    const orgRole = await organizationRole(ctx);
    const orgAdmin = orgRole === 'owner' || orgRole === 'admin';
    if (s.kind === 'organization' && s.id !== ctx.organizationId) throw new ServiceError('Switch to this organization before managing it.', 'forbidden');
    if (s.kind === 'workspace' && s.parentId !== ctx.organizationId) throw new ServiceError('This workspace belongs to another organization.', 'forbidden');
    if (s.kind === 'project') {
      const w = await client.from('workspaces').select('id,organization_id').eq('id', s.parentId!).eq('organization_id', ctx.organizationId).maybeSingle();
      check(w.error);
      const row = parse(z.object({ id: z.string(), organization_id: z.string() }).nullable(), w.data);
      if (!row || row.id !== s.parentId || row.organization_id !== ctx.organizationId) throw new ServiceError('This workspace is unavailable.', 'forbidden');
    }
    let q = entity(s).select(s.kind === 'organization'
      ? 'id,name,slug,updated_at' : `id,name,slug,description,status,updated_at,${s.kind === 'workspace' ? 'organization_id' : 'workspace_id'}`).eq('id', s.id);
    if (s.kind !== 'organization') q = q.eq(s.kind === 'workspace' ? 'organization_id' : 'workspace_id', s.parentId!);
    const result = await q.maybeSingle();
    check(result.error);
    if (!result.data) throw new ServiceError('These details no longer exist or are not accessible.', 'not-found');
    const raw = parse(z.record(z.string(), z.unknown()), result.data);
    const row = s.kind === 'organization' ? parse(base, raw) : parse(child, raw);
    if (row.id !== s.id || (s.kind !== 'organization' && raw[s.kind === 'workspace' ? 'organization_id' : 'workspace_id'] !== s.parentId)) {
      throw new ServiceError('These details do not belong to the selected location.', 'forbidden');
    }
    let admin = orgAdmin;
    if (s.kind !== 'organization') {
      const isProject = s.kind === 'project';
      const m = await client.from(isProject ? 'project_members' : 'workspace_members').select(`${isProject ? 'project_id' : 'workspace_id'},user_id,role`)
        .eq(isProject ? 'project_id' : 'workspace_id', s.id).eq('user_id', ctx.userId).maybeSingle();
      check(m.error);
      const member = parse(z.object({ user_id: z.string(), role: isProject ? z.enum(['admin', 'author', 'reviewer', 'viewer']) : z.enum(['admin', 'member', 'viewer']) }).passthrough().nullable(), m.data);
      const own = !!member && member.user_id === ctx.userId && member[isProject ? 'project_id' : 'workspace_id'] === s.id;
      admin = isProject ? own && member!.role === 'admin' : orgAdmin || (own && member!.role === 'admin');
    }
    return {
      id: row.id, name: row.name, slug: row.slug, updatedAt: row.updated_at,
      description: 'description' in row ? row.description as string | null : null,
      status: 'status' in row ? row.status as 'active' | 'archived' : null,
      canEdit: admin, canDelete: s.kind === 'organization' ? orgRole === 'owner' : admin,
      userId: ctx.userId, organizationId: ctx.organizationId,
    };
  }
  async function guard(s: LifecycleScope, expected: LifecycleDetails, deleting = false) {
    const current = await get(s);
    if (!(deleting ? current.canDelete : current.canEdit)) throw new ServiceError(deleting && s.kind === 'organization'
      ? 'Only the organization owner can permanently delete it.' : 'An administrator must make this change.', 'forbidden');
    if (expected.id !== current.id || expected.updatedAt !== current.updatedAt || expected.name !== current.name || expected.status !== current.status
      || expected.userId !== current.userId || expected.organizationId !== current.organizationId) {
      throw new ServiceError('These details changed. Reload and confirm the latest version before continuing.', 'conflict');
    }
    const verified = await actor();
    if (verified.userId !== current.userId || verified.organizationId !== current.organizationId) {
      throw new ServiceError('Your account or organization changed. Reload before continuing.', 'unauthorized');
    }
    return current;
  }
  async function write(s: LifecycleScope, expected: LifecycleDetails, patch?: Record<string, unknown>) {
    const ctx = await actor();
    if (ctx.userId !== expected.userId || ctx.organizationId !== expected.organizationId) {
      throw new ServiceError('Your account or organization changed. Reload before continuing.', 'unauthorized');
    }
    let q = (patch ? entity(s).update(patch) : entity(s).delete())
      .eq('id', s.id).eq('updated_at', expected.updatedAt);
    if (s.kind !== 'organization') q = q.eq(s.kind === 'workspace' ? 'organization_id' : 'workspace_id', s.parentId!).eq('status', expected.status!);
    const r = await q.select('id').maybeSingle();
    check(r.error);
    if (!r.data) throw new ServiceError('The change was not confirmed. Your access or the saved details may have changed. Reload before retrying.', 'conflict');
    if (parse(z.object({ id: z.string() }), r.data).id !== s.id) throw new ServiceError('The change could not be confirmed. Reload before continuing.', 'unavailable');
    if (s.kind === 'organization') await refreshOrganizations();
  }
  return {
    get,
    async update(s, value: LifecycleMetadata, expected) {
      if (s.kind === 'project') throw new ServiceError('Edit project details in Project Settings.', 'validation');
      const r = metadata.safeParse(value);
      if (!r.success || (s.kind === 'organization' ? !r.data.slug || r.data.description !== undefined : r.data.slug !== undefined || r.data.description === undefined)) {
        throw new ServiceError('Check the name, address and description before saving.', 'validation');
      }
      await guard(s, expected);
      await write(s, expected, s.kind === 'organization' ? { name: r.data.name, slug: r.data.slug } : { name: r.data.name, description: r.data.description?.trim() || null });
    },
    async setArchived(s, archived, expected) {
      if (typeof archived !== 'boolean') throw new ServiceError('Choose archive or restore.', 'validation');
      if (s.kind !== 'workspace') throw new ServiceError('Use Project Settings for project status. Organizations cannot be archived.', 'validation');
      await guard(s, expected);
      await write(s, expected, { status: archived ? 'archived' : 'active' });
    },
    async remove(s, value, expected) {
      const c = confirmation.safeParse(value);
      if (!c.success || c.data.name !== expected.name) throw new ServiceError('Type the exact name and acknowledge permanent data loss.', 'validation');
      const current = await guard(s, expected, true);
      if (s.kind !== 'organization' && current.status !== 'archived') throw new ServiceError('Archive this item before permanently deleting it.', 'validation');
      const projectIds = s.kind === 'project' ? [s.id] : [];
      if (s.kind === 'workspace') {
        for (let offset = 0; ; offset += 500) {
          const rows = await client.from('projects').select('id').eq('workspace_id', s.id).order('id').range(offset, offset + 499);
          check(rows.error);
          const page = parse(z.array(z.object({ id: z.string() })), rows.data);
          projectIds.push(...page.map(p => p.id));
          if (page.length < 500) break;
        }
      }
      await write(s, expected);
      return { projectIds };
    },
  };
}
