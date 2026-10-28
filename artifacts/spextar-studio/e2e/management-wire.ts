import type { Row } from './settings-wire';

type Input = { table: string; method: string; url: URL; body: Row; db: Record<string, Row[]>; identity: string };
type Result = { status: number; data: unknown; violation?: string };
const signatures: Record<string, string[]> = {
  create_document: ['project_id', 'title', 'slug', 'description'],
  create_topic: ['document_id', 'parent_topic_id', 'title', 'slug'],
  move_topic: ['topic_id', 'new_parent_topic_id', 'new_sort_order'],
  promote_topic: ['topic_id'], demote_topic: ['topic_id'],
  duplicate_document: ['document_id', 'new_title', 'new_slug'],
  duplicate_topic_subtree: ['topic_id', 'new_title', 'new_slug'],
};
const fields: Record<string, string[]> = {
  documents: ['title', 'slug', 'description', 'status', 'settings'],
  topics: ['title', 'slug', 'status', 'settings'],
  project_variables: ['project_id', 'name', 'key', 'value_type', 'value', 'description', 'required', 'output_values'],
  condition_categories: ['project_id', 'name', 'key', 'description', 'unassigned_behavior', 'value_match_mode'],
  condition_values: ['category_id', 'name', 'key', 'sort_order'],
  reusable_contents: ['workspace_id', 'project_id', 'scope', 'name', 'slug', 'description', 'settings', 'status', 'update_policy', 'tags'],
  reusable_content_drafts: ['reusable_content_id', 'content'],
  topic_drafts: ['topic_id', 'content', 'updated_by'],
};
export const managedTables = Object.keys(fields);
const failure = (status: number, message: string, code?: string): Result => ({ status, data: { message, code } });

/** Opt-in responses for existing service contracts only. Never an RLS simulator. */
export class ManagementWire {
  enabled = false;
  failNext: string | null = null;
  denyNext = false;
  raceDraft = false;
  probes: string[] = [];
  private sequence = 0;
  private id() { return `controlled-${++this.sequence}`; }
  handle(input: Input): Result {
    const { table, method, url, body, db, identity } = input;
    const invalid = (message: string): Result => ({ ...failure(400, message), violation: message });
    if (!this.enabled) return invalid('Management writes require explicit scenario opt-in');
    const rpc = table.startsWith('rpc/') ? table.slice(4) : null;
    if (rpc && method === 'GET') {
      if (!(rpc in signatures) || url.searchParams.get('__spextar_signature_probe__') !== 'true')
        return invalid('Unknown RPC/probe');
      this.probes.push(rpc);
      return { status: 404, data: { code: 'PGRST202', message: 'Controlled signature probe',
        hint: `public.${rpc}(${signatures[rpc].join(', ')})` } };
    }
    const author = db.project_members.some(m => m.project_id === 'project-a' && m.user_id === identity && ['admin', 'author'].includes(String(m.role)));
    let target = db[table]?.find(row => url.searchParams.get('id') === `eq.${row.id}`);
    const reusableId = String(body.reusable_content_id ?? url.searchParams.get('reusable_content_id')?.slice(3) ?? '');
    if (table === 'reusable_content_drafts') target = db.reusable_contents.find(row => row.id === reusableId);
    const topicId = String(body.topic_id ?? url.searchParams.get('topic_id')?.slice(3) ?? '');
    if (table === 'topic_drafts') target = db.topics.find(row => row.id === topicId);
    const scope = method === 'POST' && table === 'reusable_contents' ? body.scope : target?.scope;
    const editable = table.startsWith('reusable_') && scope === 'workspace'
      ? db.workspace_members.some(m => m.workspace_id === 'ws-a' && m.user_id === identity && m.role === 'admin') : author;
    if (!editable) return invalid('Unexpected mutation by a read-only role');
    if (rpc) {
      if (method !== 'POST' || !(rpc in signatures)
        || Object.keys(body).sort().join() !== [...signatures[rpc]].sort().join()) return invalid('Unexpected RPC arguments');
      const topic = db.topics.find(t => t.id === body.topic_id);
      const docId = body.document_id ?? topic?.document_id;
      if (rpc === 'create_document' ? body.project_id !== 'project-a'
        : !db.documents.some(d => d.id === docId && d.project_id === 'project-a')) return invalid('Foreign RPC scope');
    } else {
      if (!(table in fields) || !['POST', 'PATCH', 'DELETE'].includes(method)
        || Object.keys(body).some(key => !fields[table].includes(key))) return invalid('Unexpected management payload/table');
      if (method === 'DELETE' && !['documents', 'topics'].includes(table)) return invalid('Unsupported destructive operation');
      if (method === 'POST' && ['documents', 'topics'].includes(table)) return invalid('Content creation must use its existing RPC');
      const field = table === 'topic_drafts' ? 'topic_id' : table === 'topics' ? 'document_id' : table === 'condition_values' ? 'category_id'
        : table.startsWith('reusable_') ? table === 'reusable_contents' ? 'workspace_id' : 'reusable_content_id' : 'project_id';
      const owner = method === 'POST' ? body[field] : url.searchParams.get(field)?.slice(3);
      const scoped = field === 'project_id' ? owner === 'project-a'
        : field === 'document_id' ? db.documents.some(d => d.id === owner && d.project_id === 'project-a')
          : field === 'category_id' ? db.condition_categories.some(c => c.id === owner && c.project_id === 'project-a')
            : field === 'topic_id' ? !!target && db.documents.some(d => d.id === target.document_id && d.project_id === 'project-a')
              : field === 'workspace_id' ? owner === 'ws-a' : !!target && target.workspace_id === 'ws-a';
      if (!scoped || (method !== 'POST' && !url.searchParams.get(table === 'topic_drafts' ? 'topic_id' : table === 'reusable_content_drafts' ? 'reusable_content_id' : 'id')?.startsWith('eq.')))
        return invalid('Unscoped management mutation');
      if ((table === 'reusable_contents' && method === 'PATCH' || method === 'DELETE') && !url.searchParams.get('updated_at')?.startsWith('eq.'))
        return invalid('Missing expected metadata timestamp');
      if (table.startsWith('reusable_') && scope === 'project' && (method === 'POST' && table === 'reusable_contents'
        ? body.project_id !== 'project-a'
        : target?.project_id !== 'project-a' || table === 'reusable_contents' && url.searchParams.get('project_id') !== 'eq.project-a'))
        return invalid('Foreign or missing reusable project scope');
      if (method === 'PATCH' && Object.keys(body).some(key =>
        ['project_id', 'workspace_id', 'category_id', 'topic_id', 'reusable_content_id', 'scope'].includes(key)
        || ['condition_categories', 'condition_values'].includes(table) && key === 'key'
        || table === 'reusable_contents' && key === 'slug')) return invalid('Immutable management identity changed');
      if (table === 'topic_drafts' && body.updated_by !== identity) return invalid('Foreign draft updater');
      if (table.endsWith('_drafts') && method === 'PATCH' && !/^eq\.\d+$/.test(url.searchParams.get('revision') ?? ''))
        return invalid('Missing reusable draft revision');
    }
    if (this.failNext === table) {
      this.failNext = null;
      const denied = this.denyNext; this.denyNext = false;
      return failure(denied ? 403 : 503, 'Controlled management failure', denied ? '42501' : undefined);
    }
    const at = new Date().toISOString();
    if (rpc) return this.rpc(rpc, body, db, identity, at, invalid);
    if (table === 'reusable_content_drafts' && this.raceDraft) {
      this.raceDraft = false;
      const row = db[table].find(r => r.reusable_content_id === reusableId);
      if (row) { row.revision = Number(row.revision) + 1; row.updated_at = at; }
    }
    if (method === 'POST') {
      const identityField = table === 'topic_drafts' ? 'topic_id' : table === 'reusable_content_drafts' ? 'reusable_content_id' : 'id';
      if (identityField !== 'id' && db[table].some(row => row[identityField] === body[identityField]))
        return failure(409, 'Controlled existing draft', '23505');
      const defaults: Row = table.endsWith('_drafts') ? { revision: 1, updated_by: identity }
        : { id: this.id(), created_at: at, ...(table === 'condition_categories' ? { settings: {} } : {}),
          ...(table === 'reusable_contents' ? { created_by: identity } : {}) };
      const row = { ...defaults, ...body, updated_at: at };
      db[table].push(row);
      return { status: 201, data: [row] };
    }
    const rows = db[table].filter(row => [...url.searchParams].every(([k, v]) => !v.startsWith('eq.') || String(row[k]) === v.slice(3)));
    if (method === 'DELETE') {
      if (table === 'documents' && rows.some(d => db.topics.some(t => t.document_id === d.id))
        || table === 'topics' && rows.some(t => db.topics.some(child => child.parent_topic_id === t.id)))
        return failure(409, 'Controlled dependent content', '23503');
      db[table] = db[table].filter(row => !rows.includes(row));
      if (table === 'topics') db.topic_drafts = db.topic_drafts.filter(row => !rows.some(t => t.id === row.topic_id));
    } else rows.forEach(row => {
      Object.assign(row, body, { updated_at: at });
      if (table.endsWith('_drafts')) { row.revision = Number(row.revision) + 1; row.updated_by = identity; }
    });
    return { status: 200, data: rows };
  }
  private rpc(name: string, b: Row, db: Record<string, Row[]>, identity: string, at: string, invalid: (s: string) => Result): Result {
    const topic = db.topics.find(t => t.id === b.topic_id);
    const source = db.documents.find(d => d.id === (b.document_id ?? topic?.document_id));
    const create = (table: string, values: Row) => {
      const row = { id: this.id(), created_by: identity, created_at: at, updated_at: at, status: 'draft', settings: {}, ...values };
      db[table].push(row); return row;
    };
    if (name === 'create_document') {
      const row = create('documents', { project_id: b.project_id, title: b.title, slug: b.slug, description: b.description });
      return { status: 200, data: row.id };
    }
    if (name === 'create_topic') {
      if (b.parent_topic_id !== null && !db.topics.some(t => t.id === b.parent_topic_id && t.document_id === b.document_id))
        return invalid('Foreign parent topic');
      const siblings = db.topics.filter(t => t.document_id === b.document_id && t.parent_topic_id === b.parent_topic_id);
      const row = create('topics', { document_id: b.document_id, parent_topic_id: b.parent_topic_id,
        title: b.title, slug: b.slug, sort_order: siblings.length ? Math.max(...siblings.map(t => Number(t.sort_order))) + 1 : 0 });
      return { status: 200, data: row.id };
    }
    if (name === 'duplicate_document' || name === 'duplicate_topic_subtree') {
      const document = name === 'duplicate_document' ? create('documents', { ...source, id: this.id(), title: b.new_title, slug: b.new_slug, status: 'draft' }) : source!;
      const originals = [...db.topics].filter(t => t.document_id === source!.id);
      const copied = new Map<unknown, unknown>();
      const copy = (original: Row, parent: unknown) => {
        const fresh = create('topics', { ...original, id: this.id(), status: 'draft', document_id: document.id,
          parent_topic_id: parent, ...(original.id === topic?.id ? { title: b.new_title, slug: b.new_slug } : {}) });
        copied.set(original.id, fresh.id);
        const body = db.topic_drafts.find(d => d.topic_id === original.id);
        if (body) db.topic_drafts.push({ ...structuredClone(body), topic_id: fresh.id, revision: 1, updated_at: at });
        originals.filter(t => t.parent_topic_id === original.id).forEach(t => copy(t, fresh.id));
        return fresh;
      };
      if (name === 'duplicate_document') originals.filter(t => t.parent_topic_id === null).forEach(t => copy(t, null));
      else copy(topic!, topic!.parent_topic_id);
      return { status: 200, data: name === 'duplicate_document' ? document.id : copied.get(topic!.id) };
    }
    if (!topic) return invalid('Missing target topic');
    if (name === 'move_topic') {
      if (!Number.isInteger(b.new_sort_order) || Number(b.new_sort_order) < 0) return invalid('Invalid sibling order');
      if (b.new_parent_topic_id !== null && !db.topics.some(t => t.id === b.new_parent_topic_id && t.document_id === topic.document_id))
        return invalid('Foreign move parent');
      const ancestors = new Set<unknown>([topic.id]);
      let parent = db.topics.find(t => t.id === b.new_parent_topic_id);
      while (parent) {
        if (ancestors.has(parent.id)) return invalid('Cyclic topic move');
        ancestors.add(parent.id); parent = db.topics.find(t => t.id === parent!.parent_topic_id);
      }
      db.topics.filter(t => t.id !== topic.id && t.document_id === topic.document_id && t.parent_topic_id === b.new_parent_topic_id && Number(t.sort_order) >= Number(b.new_sort_order))
        .forEach(t => { t.sort_order = Number(t.sort_order) + 1; });
      topic.parent_topic_id = b.new_parent_topic_id; topic.sort_order = b.new_sort_order;
    } else if (name === 'promote_topic') {
      const parent = db.topics.find(t => t.id === topic.parent_topic_id);
      topic.parent_topic_id = parent?.parent_topic_id ?? null;
    } else {
      const previous = db.topics.filter(t => t.document_id === topic.document_id && t.parent_topic_id === topic.parent_topic_id && Number(t.sort_order) < Number(topic.sort_order))
        .sort((a, b) => Number(b.sort_order) - Number(a.sort_order))[0];
      if (!previous) return failure(400, 'No prior sibling');
      topic.parent_topic_id = previous.id;
    }
    topic.updated_at = at;
    return { status: 200, data: null };
  }
}
