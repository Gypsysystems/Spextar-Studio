import { test as base, expect, type Page, type Locator, type BrowserContext, type Route } from '@playwright/test';
import { SettingsWire } from './settings-wire';
import { ManagementWire, managedTables } from './management-wire';
import { localFixtureOrigins } from './local-origins';

export const projectPath = '/workspaces/ws-a/projects/project-a';
export const authKey = 'spextar.backend.luyyxblmtupmugtazgbr.auth';
export const recoveryPrefix = 'spextar.backend.luyyxblmtupmugtazgbr.topic-recovery.v1.';
const backendOrigin = 'https://luyyxblmtupmugtazgbr.supabase.co';
const at = '2026-10-27T10:00:00Z';
export type Role = 'admin' | 'author' | 'reviewer' | 'viewer' | null;
type Row = Record<string, unknown>;
export function bodyContent(text = 'Current saved QA topic') {
  return { type: 'doc', version: 1, ownerMetadata: { preserved: true }, content: [
    { type: 'paragraph', attrs: { id: 'stable-paragraph' }, content: [{ type: 'text', text }] },
  ] };
}

/** A deliberately narrow wire double, NOT an RLS emulator or live certification. */
export class Backend {
  role: Role = 'author';
  identity = 'user-a';
  invalidLogin = false;
  sessionExpired = false;
  refreshAttempts = 0;
  offlineLogout = false;
  failDraftWrites = false;
  conflictNextSave = false;
  readonly settings = new SettingsWire();
  readonly management = new ManagementWire();
  readonly failures = new Set<string>();
  readonly unexpected: string[] = [];
  readonly writes: { table: string; method: string; query: string; body: Row }[] = [];
  readonly reads: { table: string; query: string }[] = [];
  readonly scripts: string[] = [];
  private gates = new Map<string, Promise<void>>();
  private releases: (() => void)[] = [];
  db: Record<string, Row[]> = {
    profiles: [{ id: 'user-a', display_name: 'QA Writer A', avatar_url: null }],
    organizations: [{ id: 'org-a', name: 'Organization A', slug: 'organization-a' }],
    organization_members: [{ organization_id: 'org-a', user_id: 'user-a', role: 'member' }],
    workspaces: [{ id: 'ws-a', organization_id: 'org-a', name: 'Workspace A', slug: 'workspace-a', description: '', created_at: at, updated_at: at }],
    workspace_members: [{ workspace_id: 'ws-a', user_id: 'user-a', role: 'member' }],
    projects: [{ id: 'project-a', workspace_id: 'ws-a', name: 'Project A', slug: 'pa', description: '', status: 'active', created_by: 'user-a', created_at: at, updated_at: at }],
    project_members: [{ project_id: 'project-a', user_id: 'user-a', role: 'author' }],
    documents: [{ id: 'doc-a', project_id: 'project-a', title: 'QA document', slug: 'qa-document', description: 'Controlled test only', status: 'in_review', settings: {}, created_by: 'user-a', created_at: at, updated_at: at }],
    topics: [
      { id: 'topic-a', document_id: 'doc-a', parent_topic_id: null, title: 'QA topic', slug: 'qa-topic', status: 'draft', sort_order: 0, settings: { kind: 'task' }, created_by: 'user-a', created_at: at, updated_at: at },
      { id: 'topic-b', document_id: 'doc-a', parent_topic_id: 'topic-a', title: 'Child topic', slug: 'child-topic', status: 'draft', sort_order: 0, settings: {}, created_by: 'user-a', created_at: at, updated_at: at },
    ],
    topic_drafts: [{ topic_id: 'topic-a', content: bodyContent(), revision: 3, updated_at: at, updated_by: 'user-a' }],
    project_variables: [{ id: 'var-a', project_id: 'project-a', name: 'ProductName', key: 'product_name', value_type: 'text', value: 'QA Product', description: null, required: false, output_values: { 'pdf-manual': 'QA PDF' }, created_at: at, updated_at: at }],
    condition_categories: [{ id: 'cat-a', project_id: 'project-a', name: 'Audience', key: 'audience', description: null, settings: {}, unassigned_behavior: 'include', value_match_mode: 'any', created_at: at, updated_at: at }],
    condition_values: [{ id: 'val-a', category_id: 'cat-a', name: 'Developer', key: 'developer', sort_order: 0, created_at: at, updated_at: at }],
    reusable_contents: [], reusable_content_drafts: [],
  };
  setRole(role: Role) {
    this.role = role;
    this.db.project_members = role ? [{ project_id: 'project-a', user_id: this.identity, role }] : [];
    this.db.workspace_members[0].role = role === null ? 'admin' : 'member';
  }
  setIdentity(id: string) {
    this.identity = id;
    this.db.profiles = [{ id, display_name: 'QA Writer B', avatar_url: null }];
    for (const table of ['organization_members', 'workspace_members', 'project_members']) {
      this.db[table].forEach(row => { row.user_id = id; });
    }
  }
  hold(table: string) {
    let release!: () => void;
    this.gates.set(table, new Promise<void>(resolve => { release = resolve; }));
    this.releases.push(release);
    return () => { this.gates.delete(table); release(); };
  }
  dispose() { this.releases.forEach(release => release()); }
  async install(context: BrowserContext, appOrigins = ['http://127.0.0.1:4181']) {
    const local = localFixtureOrigins(appOrigins);
    await context.route('**/*', route => this.handle(route, local));
  }
  private async handle(route: Route, local: ReadonlySet<string>) {
    const request = route.request(), url = new URL(request.url());
    // Only the fixed loopback server may escape interception. No fallthrough for API traffic.
    if (local.has(url.origin)) return route.continue();
    if (url.origin !== backendOrigin) {
      this.unexpected.push(`Blocked external request: ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    if (request.headers().apikey && request.headers().apikey !== 'sb_publishable_controlled_browser_test_only') {
      this.unexpected.push('Browser build used a non-synthetic API key');
      return route.abort('blockedbyclient');
    }
    const send = (status: number, data: unknown, headers: Record<string, string> = {}) => route.fulfill({
      status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(data),
    });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const user = { id: this.identity, email: `${this.identity}@example.test`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: at };
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        this.refreshAttempts++;
        if (this.sessionExpired) return send(400, { code: 'refresh_token_not_found', msg: 'Controlled expired refresh token' });
      }
      if (this.invalidLogin) return send(400, { code: 'invalid_credentials', msg: 'Invalid login credentials' });
      const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: this.identity, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.controlled`;
      return send(200, { access_token: token, refresh_token: 'controlled-only', token_type: 'bearer', expires_in: 3600, user });
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
      return this.sessionExpired ? send(401, { code: 'bad_jwt', msg: 'Controlled invalid session' }) : send(200, user);
    }
    if (url.pathname === '/auth/v1/logout' && request.method() === 'POST') return send(this.offlineLogout ? 503 : 200, this.offlineLogout ? { message: 'Controlled offline logout' } : {});
    const table = url.pathname.startsWith('/rest/v1/rpc/') ? 'rpc/' + url.pathname.split('/').pop()! : url.pathname.split('/').pop()!;
    if (this.sessionExpired) return send(401, { code: 'PGRST301', message: 'Controlled expired session' });
    if (table.startsWith('rpc/') || !['GET', 'HEAD'].includes(request.method()) && managedTables.includes(table)
      && (table !== 'topic_drafts' || this.management.enabled)) {
      const body = request.postData() ? request.postDataJSON() as Row : {};
      if (request.method() !== 'GET') this.writes.push({ table, method: request.method(), query: url.search, body });
      const result = this.management.handle({ table, method: request.method(), url, body, db: this.db, identity: this.identity });
      if (result.violation) this.unexpected.push(result.violation);
      const single = request.headers().accept?.includes('application/vnd.pgrst.object+json');
      return send(result.status, single && Array.isArray(result.data) ? result.data[0] ?? null : result.data);
    }
    if (url.pathname !== `/rest/v1/${table}` || !(table in this.db)) {
      this.unexpected.push(`Unsupported intercepted endpoint: ${url.pathname}`);
      return send(500, { message: 'Unmodelled browser fixture endpoint' });
    }
    if (['GET', 'HEAD'].includes(request.method())) {
      const scopedField: Record<string, string> = {
        documents: 'project_id', topics: 'document_id', topic_drafts: 'topic_id',
        project_variables: 'project_id', condition_categories: 'project_id', condition_values: 'category_id',
        reusable_contents: 'workspace_id', reusable_content_drafts: 'reusable_content_id',
      };
      const field = scopedField[table];
      if (field && !/^(eq\.|in\.\()/.test(url.searchParams.get(field) ?? '')) {
        this.unexpected.push(`Unscoped ${table} read`);
        return send(403, { code: '42501', message: 'Missing scope filter' });
      }
      this.reads.push({ table, query: url.search });
      await this.gates.get(table);
      if (this.failures.has(table)) return send(403, { code: '42501', message: 'Controlled permission error' });
      if (this.settings.enabled && table === 'projects'
        && url.searchParams.get('select') === 'id,workspace_id,name,slug,description,status,updated_at') {
        if (url.searchParams.get('id') !== 'eq.project-a' || url.searchParams.get('workspace_id') !== 'eq.ws-a') {
          this.unexpected.push('Unscoped Settings read');
          return send(403, { code: '42501', message: 'Missing Settings scope' });
        }
        if (this.settings.failReads) return send(503, { message: 'Controlled Settings read failure' });
        if (this.settings.foreignRead) return send(200, [{ ...this.db.projects[0], workspace_id: 'ws-foreign' }]);
      }
    } else {
      const patch = request.postData() ? request.postDataJSON() as Row : {};
      this.writes.push({ table, method: request.method(), query: url.search, body: patch });
      if (table === 'projects' || table === 'project_members') {
        const result = this.settings.handle({ table, method: request.method(), url, body: patch, identity: this.identity, db: this.db });
        if (result.violation) this.unexpected.push(result.violation);
        const single = request.headers().accept?.includes('application/vnd.pgrst.object+json');
        return send(result.status, single && Array.isArray(result.data) ? result.data[0] ?? null : result.data);
      }
      const editable = this.role === 'admin' || this.role === 'author';
      // Settings writes are opt-in above; all other writes must match the Topic draft contract.
      if (!editable || table !== 'topic_drafts' || !['POST', 'PATCH'].includes(request.method())
        || Object.keys(patch).some(key => !['topic_id', 'content', 'updated_by'].includes(key))
        || patch.updated_by !== this.identity || !patch.content) {
        this.unexpected.push(`Unexpected/unauthorized ${request.method()} ${table}`);
        return send(403, { code: '42501', message: 'Controlled write denied' });
      }
      if (this.failDraftWrites) return send(503, { message: 'Controlled draft network failure' });
      if (request.method() === 'PATCH') {
        if (url.searchParams.get('topic_id') !== 'eq.topic-a' || !/^eq\.\d+$/.test(url.searchParams.get('revision') ?? '')) {
          this.unexpected.push('Draft update lacks exact Topic and expected revision filters');
          return send(400, { message: 'Unscoped draft write' });
        }
        if (this.conflictNextSave) {
          this.conflictNextSave = false;
          this.db.topic_drafts[0] = { ...this.db.topic_drafts[0], content: bodyContent('Newer server body'), revision: Number(this.db.topic_drafts[0].revision) + 1 };
        }
      } else {
        if (patch.topic_id !== 'topic-a') {
          this.unexpected.push('Unexpected draft insert Topic'); return send(400, {});
        }
        if (this.db.topic_drafts.some(row => row.topic_id === patch.topic_id)) return send(409, { code: '23505', message: 'Existing draft' });
        const row = { ...patch, revision: 1, updated_at: new Date().toISOString() };
        this.db.topic_drafts.push(row);
        return send(201, row);
      }
    }
    let rows = [...this.db[table]];
    for (const [key, filter] of url.searchParams) {
      if (filter.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === filter.slice(3));
      if (filter.startsWith('in.(')) rows = rows.filter(row => filter.slice(4, -1).split(',').includes(String(row[key])));
    }
    if (request.method() === 'PATCH') {
      const patch = request.postDataJSON() as Row;
      rows.forEach(row => Object.assign(row, patch, { revision: Number(row.revision) + 1, updated_at: new Date().toISOString() }));
    }
    const single = request.headers().accept?.includes('application/vnd.pgrst.object+json');
    return send(200, single ? rows[0] ?? null : rows, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
  }
}

type Fixtures = { backend: Backend; theme: 'dark' | 'light'; appOrigins: string[] };
export const test = base.extend<Fixtures>({
  appOrigins: [['http://127.0.0.1:4181'], { option: true }],
  theme: async ({}, use, info) => { await use(info.project.metadata.theme as 'dark' | 'light'); },
  backend: [async ({ context, page, theme, appOrigins }, use) => {
    const backend = new Backend();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.resourceType() === 'script') backend.scripts.push(request.url()); });
    await context.addInitScript(theme => {
      document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark'));
    }, theme);
    await backend.install(context, appOrigins);
    try { await use(backend); }
    finally {
      backend.dispose();
      expect(backend.unexpected, 'No traffic/writes may escape the controlled contract').toEqual([]);
      expect(errors, 'No uncaught product errors').toEqual([]);
    }
  }, { auto: true }],
});
export { expect };
export const visible = (locator: Locator) => locator.filter({ visible: true });
export async function activate(page: Page, locator: Locator) {
  if (page.context().browser()?.browserType().name() && await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await visible(locator).tap();
  else await visible(locator).click();
}
export async function login(page: Page, path = '/workspaces') {
  await page.goto(path);
  await page.getByTestId('button-sign-in').waitFor();
  await page.getByTestId('input-email').fill('user-a@example.test');
  await page.getByTestId('input-password').fill('synthetic-password-not-a-real-credential');
  await activate(page, page.getByTestId('button-sign-in'));
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
}
export async function navigate(page: Page, id: string) {
  const drawer = page.getByTestId('button-open-mobile-nav');
  if (await drawer.isVisible()) await activate(page, drawer);
  await activate(page, page.getByTestId(id));
}
export async function signOut(page: Page) {
  const drawer = page.getByTestId('button-open-mobile-nav');
  if (await drawer.isVisible()) await activate(page, drawer);
  await activate(page, page.getByTestId('button-account'));
  await activate(page, page.getByTestId('button-sign-out'));
  await expect(page.getByTestId('button-sign-in')).toBeEnabled();
}
export async function noOverflow(page: Page) {
  const width = page.viewportSize()!.width;
  await expect.poll(() => page.evaluate(width => document.documentElement.scrollWidth <= width + 1, width)).toBe(true);
  // Page width alone misses content spilling inside a clipped card/editor panel.
  await expect.poll(() => page.locator('main section, main article, main .rounded-lg, [role="dialog"]').evaluateAll((panels, width) =>
    panels.filter(panel => {
      const box = panel.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(panel).visibility === 'hidden') return false;
      return box.left < -1 || box.right > width + 1 || panel.scrollWidth > panel.clientWidth + 1;
    }).map(panel => panel.getAttribute('aria-label') || panel.getAttribute('data-testid') || panel.tagName), width),
  'Content panels stay inside the configured viewport without hidden horizontal overflow').toEqual([]);
}
