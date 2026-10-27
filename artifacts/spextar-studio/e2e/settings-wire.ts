/** Narrow opt-in wire responses for the EXISTING Settings contract, not an RLS emulator. */
export type Row = Record<string, unknown>;
type Input = { table: string; method: string; url: URL; body: Row; identity: string; db: Record<string, Row[]> };
type Result = { status: number; data: unknown; violation?: string };
const roles = ['admin', 'author', 'reviewer', 'viewer'];
const sameKeys = (body: Row, keys: string[]) => Object.keys(body).sort().join(',') === keys.sort().join(',');
const error = (status: number, message: string, code?: string): Result => ({ status, data: { message, code } });
const advance = (row: Row) => { row.updated_at = new Date(Date.parse(String(row.updated_at)) + 1000).toISOString(); };

export class SettingsWire {
  enabled = false;
  failReads = false;
  foreignRead = false;
  failNextWrite: 'denied' | 'unavailable' | null = null;
  raceProjectWrite = false;
  raceMemberWrite = false;

  handle({ table, method, url, body, identity, db }: Input): Result {
    const invalid = (message: string): Result => ({ ...error(400, message), violation: message });
    if (!this.enabled) return invalid('Settings writes must be explicitly enabled by the scenario');
    const eq = (key: string, value: string) => url.searchParams.get(key) === `eq.${value}`;
    const project = db.projects.find(p => p.id === 'project-a' && p.workspace_id === 'ws-a')!;
    if (!project || !body || typeof body !== 'object' || Array.isArray(body)) return invalid('Invalid Settings request');
    if (table === 'projects') {
      if (method !== 'PATCH' || !eq('id', 'project-a') || !eq('workspace_id', 'ws-a')
        || !/^eq\.\d{4}-\d{2}-\d{2}T/.test(url.searchParams.get('updated_at') ?? '')
        || !sameKeys(body, ['name', 'slug', 'description', 'status'])
        || typeof body.name !== 'string' || body.name !== body.name.trim() || body.name.length < 2 || body.name.length > 160
        || typeof body.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)
        || !(body.description === null || typeof body.description === 'string')
        || !['active', 'archived'].includes(String(body.status))) return invalid('Unsafe/unscoped project write');
    } else if (table === 'project_members') {
      if (method === 'POST') {
        if (!sameKeys(body, ['project_id', 'user_id', 'role']) || body.project_id !== 'project-a'
          || !db.workspace_members.some(m => m.workspace_id === 'ws-a' && m.user_id === body.user_id)
          || !roles.includes(String(body.role))) return invalid('Unsafe membership insert');
      } else if (method === 'PATCH' || method === 'DELETE') {
        if (!eq('project_id', 'project-a') || !url.searchParams.get('user_id')?.startsWith('eq.')
          || !roles.some(role => eq('role', role))
          || (method === 'PATCH' && (!sameKeys(body, ['role']) || !roles.includes(String(body.role))))
          || (method === 'DELETE' && Object.keys(body).length)) return invalid('Unsafe/unscoped membership change');
      } else return invalid('Unsupported membership method');
    } else return invalid('Unsupported Settings table');

    // Explicit permission-denied responses are test cases, not permission certification.
    if (!db.project_members.some(m => m.project_id === 'project-a' && m.user_id === identity && m.role === 'admin'))
      return error(403, 'Controlled explicit-admin permission denied', '42501');
    const failure = this.failNextWrite;
    this.failNextWrite = null;
    if (failure) return error(failure === 'denied' ? 403 : 503, 'Controlled Settings write failure', failure === 'denied' ? '42501' : undefined);

    if (table === 'projects' && this.raceProjectWrite) {
      this.raceProjectWrite = false;
      Object.assign(project, { name: 'Other admin saved this', description: 'Concurrent server details' });
      advance(project);
    }
    if (table === 'project_members' && this.raceMemberWrite) {
      this.raceMemberWrite = false;
      const member = db.project_members.find(m => eq('user_id', String(m.user_id)));
      if (member) member.role = member.role === 'viewer' ? 'reviewer' : 'viewer';
    }
    if (method === 'POST') {
      if (db.project_members.some(m => m.project_id === body.project_id && m.user_id === body.user_id))
        return error(409, 'Controlled duplicate membership', '23505');
      const saved = { ...body };
      db.project_members.push(saved);
      return { status: 201, data: [saved] };
    }
    const rows = db[table].filter(row => [...url.searchParams].every(([key, value]) =>
      !value.startsWith('eq.') || String(row[key]) === value.slice(3)));
    if (method === 'DELETE') db[table] = db[table].filter(row => !rows.includes(row));
    else rows.forEach(row => {
      Object.assign(row, body);
      if (table === 'projects') advance(row);
    });
    return { status: 200, data: rows };
  }
}
