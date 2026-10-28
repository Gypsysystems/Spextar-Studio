import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

type Row = Record<string, unknown>;
const at = '2026-10-27T10:00:00Z';
export const testUser = { id: 'user-a', email: 'writer@example.test' };
export const testSession = { user: testUser, expires_at: 2_000_000_000, expires_in: 3600 } as Session;

/** Contract fake, not an RLS simulator or a substitute for live two-account testing. */
export function supabaseDouble(initialSession: Session | null = testSession) {
  let session = initialSession;
  const listeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();
  const db: Record<string, Row[]> = {
    profiles: [{ id: testUser.id, display_name: 'Technical Writer', avatar_url: null }],
    organizations: [{ id: 'org-a', name: 'Organization A', slug: 'organization-a' }, { id: 'org-b', name: 'Organization B', slug: 'organization-b' }],
    organization_members: [{ organization_id: 'org-a', user_id: testUser.id, role: 'owner' }],
    workspaces: [
      { id: 'ws-a', organization_id: 'org-a', name: 'Workspace A', slug: 'workspace-a', description: '', created_at: at, updated_at: at },
      { id: 'ws-b', organization_id: 'org-b', name: 'Workspace B', slug: 'workspace-b', description: '', created_at: at, updated_at: at },
    ],
    workspace_members: [{ workspace_id: 'ws-a', user_id: testUser.id, role: 'admin' }],
    projects: [
      { id: 'project-a', workspace_id: 'ws-a', name: 'Project A', slug: 'pa', description: '', status: 'active', created_at: at, updated_at: at, created_by: testUser.id },
      { id: 'project-b', workspace_id: 'ws-b', name: 'Project B', slug: 'pb', description: '', status: 'active', created_at: at, updated_at: at, created_by: 'another-user' },
    ],
    project_members: [{ project_id: 'project-a', user_id: testUser.id, role: 'admin' }],
    documents: [],
    topics: [],
    topic_drafts: [],
    project_variables: [],
    condition_categories: [],
    condition_values: [],
    reusable_contents: [],
    reusable_content_drafts: [],
  };
  const calls: { table: string; filters: [string, unknown][]; columns: string; patch?: Row; insert?: Row; deleted?: boolean }[] = [];
  const beforeDelete = vi.fn((_table: string) => {});
  const beforeWrite = vi.fn((_table: string) => {});
  const errors = new Map<string, { code: string; message?: string }>();
  class Query {
    filters: [string, unknown][] = [];
    columns = '';
    single = false;
    patch?: Row;
    inserting?: Row;
    insertedId?: string;
    deleting = false;
    bounds?: [number, number];
    constructor(readonly table: string) {}
    select(columns: string) { this.columns = columns; return this; }
    eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
    in(column: string, values: unknown[]) { this.filters.push([column, values]); return this; }
    order() { return this; }
    range(from: number, to: number) { this.bounds = [from, to]; return this; }
    update(patch: Row) { this.patch = patch; return this; }
    insert(row: Row) { this.inserting = row; return this; }
    delete() { this.deleting = true; return this; }
    maybeSingle() { this.single = true; return this; }
    then(resolve: (value: { data: Row | Row[] | null; error: unknown }) => unknown) {
      calls.push({ table: this.table, filters: this.filters, columns: this.columns, ...(this.patch ? { patch: this.patch } : {}), ...(this.inserting ? { insert: this.inserting } : {}), ...(this.deleting ? { deleted: true } : {}) });
      if (this.deleting) beforeDelete(this.table);
      if (this.patch || this.inserting) beforeWrite(this.table);
      let error = (this.deleting ? errors.get(`delete:${this.table}`) : null)
        ?? ((this.patch || this.inserting) ? errors.get(`write:${this.table}`) : null) ?? errors.get(this.table) ?? null;
      if (this.inserting && !error && this.table === 'project_members') {
        if (db.project_members.some(r => r.project_id === this.inserting!.project_id && r.user_id === this.inserting!.user_id))
          error = { code: '23505' };
        else db.project_members.push({ ...this.inserting });
      }
      if (this.patch && !error && this.table === 'projects' && this.patch.slug &&
        db.projects.some(r => r.slug === this.patch!.slug && !this.filters.every(([c, v]) => r[c] === v))) error = { code: '23505' };
      if (this.inserting && !error && this.table === 'topic_drafts') {
        if (db.topic_drafts.some((row) => row.topic_id === this.inserting!.topic_id)) error = { code: '23505' };
        else db.topic_drafts.push({ ...this.inserting, revision: 1, updated_at: new Date().toISOString() });
      }
      if (this.inserting && !error && this.table === 'reusable_content_drafts') {
        if (db.reusable_content_drafts.some(row => row.reusable_content_id === this.inserting!.reusable_content_id)) error = { code: '23505' };
        else db.reusable_content_drafts.push({ ...this.inserting, revision: 1, updated_at: at, updated_by: testUser.id });
      }
      if (this.inserting && !error && this.table === 'reusable_contents') {
        if (db.reusable_contents.some(row => row.workspace_id === this.inserting!.workspace_id && row.project_id === this.inserting!.project_id && row.slug === this.inserting!.slug))
          error = { code: '23505' };
        else {
          this.insertedId = crypto.randomUUID();
          db.reusable_contents.push({ ...this.inserting, id: this.insertedId, created_by: testUser.id, created_at: at, updated_at: at });
        }
      }
      if (this.inserting && !error && this.table === 'project_variables') {
        if (db.project_variables.some((row) => row.project_id === this.inserting!.project_id && row.key === this.inserting!.key)) error = { code: '23505' };
        else {
          this.insertedId = crypto.randomUUID();
          db.project_variables.push({ ...this.inserting, id: this.insertedId, created_at: at, updated_at: at });
        }
      }
      if (this.inserting && !error && ['condition_categories', 'condition_values'].includes(this.table)) {
        const scope = this.table === 'condition_categories' ? 'project_id' : 'category_id';
        if (db[this.table].some((row) => row[scope] === this.inserting![scope] && row.key === this.inserting!.key))
          error = { code: '23505' };
        else {
          this.insertedId = crypto.randomUUID();
          db[this.table].push({ ...(this.table === 'condition_categories' ? { settings: {} } : {}),
            ...this.inserting, id: this.insertedId, created_at: at, updated_at: at });
        }
      }
      let rows = (db[this.table] ?? []).filter((row) => this.filters.every(([column, value]) =>
        Array.isArray(value) ? value.includes(row[column]) : row[column] === value));
      if (this.inserting) rows = rows.filter((row) => ['project_variables', 'condition_categories', 'condition_values', 'reusable_contents'].includes(this.table)
        ? row.id === this.insertedId : this.table === 'project_members'
          ? row.project_id === this.inserting!.project_id && row.user_id === this.inserting!.user_id : this.table === 'reusable_content_drafts'
          ? row.reusable_content_id === this.inserting!.reusable_content_id : row.topic_id === this.inserting!.topic_id);
      if (this.patch && !error) rows.forEach((row) => Object.assign(row, this.patch));
      if (this.patch && !error && this.table === 'topic_drafts') rows.forEach((row) => {
        row.revision = Number(row.revision) + 1; row.updated_at = new Date().toISOString();
      });
      if (this.patch && !error && this.table === 'reusable_content_drafts') rows.forEach(row => {
        row.revision = Number(row.revision) + 1; row.updated_at = new Date().toISOString(); row.updated_by = testUser.id;
      });
      if (this.patch && !error && this.table === 'reusable_contents') rows.forEach(row => {
        row.updated_at = new Date().toISOString();
      });
      if (this.patch && !error && this.table === 'projects') rows.forEach(row => {
        row.updated_at = new Date(Math.max(Date.now(), Date.parse(String(row.updated_at)) + 1)).toISOString();
      });
      if (this.deleting && !error) db[this.table] = (db[this.table] ?? []).filter((row) => !rows.includes(row));
      if (this.bounds) rows = rows.slice(this.bounds[0], this.bounds[1] + 1);
      return Promise.resolve({ data: error ? null : this.single ? rows[0] ?? null : rows, error }).then(resolve);
    }
  }
  const emit = (event: AuthChangeEvent, next: Session | null) => {
    session = next;
    listeners.forEach((listener) => listener(event, next));
  };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: session?.user ?? null }, error: null })),
    signInWithPassword: vi.fn(async (_credentials: { email: string; password: string }) => {
      emit('SIGNED_IN', testSession);
      return { data: { session: testSession, user: testUser }, error: null };
    }),
    signOut: vi.fn(async () => {
      emit('SIGNED_OUT', null);
      return { error: null };
    }),
    onAuthStateChange: vi.fn((listener: (event: AuthChangeEvent, session: Session | null) => void) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>, options?: { get?: boolean }): Promise<{ data: unknown; error: { code: string; hint?: string; message?: string } | null }> => {
    const names: Record<string, string> = { create_organization: 'organization', create_workspace: 'workspace', create_project: 'project' };
    const entity = names[name];
    const expected = entity === 'organization' ? ['p_name', 'p_slug']
      : entity === 'workspace' ? ['p_organization_id', 'p_name', 'p_slug', 'p_description']
        : ['p_workspace_id', 'p_name', 'p_slug', 'p_description'];
    if (!entity || options || Object.keys(args).sort().join() !== expected.sort().join()) {
      return { data: null, error: { code: 'PGRST202', hint: 'No signature hint is available.' } };
    }
    const id = `${entity}-created-${db[`${entity}s`].length}`;
    db[`${entity}s`].push({
      id, name: args.p_name, slug: args.p_slug, description: args.p_description ?? '',
      organization_id: args.p_organization_id, workspace_id: args.p_workspace_id,
      status: 'active', created_at: at, updated_at: at, created_by: testUser.id,
    });
    db[`${entity}_members`].push({ [`${entity}_id`]: id, user_id: testUser.id, role: entity === 'organization' ? 'owner' : 'admin' });
    return { data: id, error: null };
  });
  const raw = { auth, from: vi.fn((table: string) => new Query(table)), rpc };
  return { client: raw as unknown as SupabaseClient, raw, db, calls, errors, emit, beforeDelete, beforeWrite };
}
