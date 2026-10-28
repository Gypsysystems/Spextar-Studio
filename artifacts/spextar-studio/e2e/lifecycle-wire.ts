type Row = Record<string, unknown>;
/** Opt-in, synthetic lifecycle wire expectations; not a live RLS/FK emulator. */
export class LifecycleWire {
  enabled = false;
  failNext: 'denied' | 'unavailable' | null = null;
  conflictNext = false;
  private tick = 0;
  handle({ table, method, url, body, db, identity }: {
    table: string; method: string; url: URL; body: Row; db: Record<string, Row[]>; identity: string;
  }): { status: number; data: unknown; violation?: string } {
    const fail = (message: string) => ({ status: 403, data: { code: '42501', message } });
    if (!this.enabled) return fail('Lifecycle fixture is not enabled');
    const id = url.searchParams.get('id')?.slice(3);
    if (!id || !url.searchParams.get('updated_at')?.startsWith('eq.')) return { ...fail('Missing exact scope and version'), violation: 'Unscoped lifecycle mutation' };
    const row = db[table].find(r => r.id === id);
    if (!row) return { status: 200, data: [] };
    const orgId = table === 'organizations' ? id : table === 'workspaces' ? row.organization_id
      : db.workspaces.find(w => w.id === row.workspace_id)?.organization_id;
    const orgRole = db.organization_members.find(m => m.organization_id === orgId && m.user_id === identity)?.role;
    const workspaceRole = db.workspace_members.find(m => m.workspace_id === id && m.user_id === identity)?.role;
    const projectRole = db.project_members.find(m => m.project_id === id && m.user_id === identity)?.role;
    const admin = table === 'organizations' ? method === 'DELETE' ? orgRole === 'owner' : ['owner', 'admin'].includes(String(orgRole))
      : table === 'workspaces' ? ['owner', 'admin'].includes(String(orgRole)) || workspaceRole === 'admin' : projectRole === 'admin';
    if (!admin) return fail('Controlled permission denial');
    const parent = table === 'workspaces' ? 'organization_id' : 'workspace_id';
    if (table !== 'organizations' && (url.searchParams.get(parent) !== `eq.${row[parent]}` || !url.searchParams.get('status')?.startsWith('eq.'))) {
      return { ...fail('Missing parent scope'), violation: 'Lifecycle mutation missing parent/status scope' };
    }
    if (method === 'DELETE' && table !== 'organizations' && row.status !== 'archived') return fail('Archive first');
    const allowed = table === 'organizations' ? ['name', 'slug'] : ['name', 'description', 'status'];
    if (!['PATCH', 'DELETE'].includes(method) || Object.keys(body).some(k => !allowed.includes(k)) || (table === 'projects' && method !== 'DELETE')) {
      return { ...fail('Unexpected lifecycle write'), violation: 'Lifecycle wrote unsupported fields or method' };
    }
    if (this.failNext) {
      const failure = this.failNext; this.failNext = null;
      return failure === 'denied' ? fail('Your access has changed. Reload before trying again.')
        : { status: 503, data: { message: 'The change could not be completed. Try again.' } };
    }
    if (this.conflictNext) { this.conflictNext = false; row.updated_at = '2030-01-01T00:00:00Z'; }
    if ([...url.searchParams].some(([field, value]) => value.startsWith('eq.') && String(row[field]) !== value.slice(3))) return { status: 200, data: [] };
    if (method === 'PATCH') {
      Object.assign(row, body, { updated_at: new Date(Date.parse('2026-10-29T10:00:00Z') + ++this.tick * 1000).toISOString() });
    } else {
      // Expected fixture cascade only. The application must send no descendant deletes.
      const workspaces = new Set(table === 'organizations' ? db.workspaces.filter(w => w.organization_id === id).map(w => w.id) : table === 'workspaces' ? [id] : []);
      const projects = new Set(table === 'projects' ? [id] : db.projects.filter(p => workspaces.has(p.workspace_id)).map(p => p.id));
      const documents = new Set(db.documents.filter(d => projects.has(d.project_id)).map(d => d.id));
      const topics = new Set(db.topics.filter(t => documents.has(t.document_id)).map(t => t.id));
      const reusable = new Set(db.reusable_contents.filter(r => workspaces.has(r.workspace_id) || projects.has(r.project_id)).map(r => r.id));
      const categories = new Set(db.condition_categories.filter(c => projects.has(c.project_id)).map(c => c.id));
      for (const [name, field, ids] of [
        ['topic_drafts', 'topic_id', topics], ['topics', 'id', topics], ['documents', 'id', documents],
        ['project_variables', 'project_id', projects], ['condition_categories', 'project_id', projects], ['condition_values', 'category_id', categories],
        ['reusable_contents', 'id', reusable], ['reusable_content_drafts', 'reusable_content_id', reusable],
        ['project_members', 'project_id', projects], ['projects', 'id', projects],
        ['workspace_members', 'workspace_id', workspaces], ['workspaces', 'id', workspaces],
      ] as [string, string, Set<unknown>][]) db[name] = db[name].filter(r => !ids.has(r[field]));
      db[table] = db[table].filter(r => r.id !== id);
      if (table === 'organizations') db.organization_members = db.organization_members.filter(m => m.organization_id !== id);
    }
    return { status: 200, data: [{ id }] };
  }
}
