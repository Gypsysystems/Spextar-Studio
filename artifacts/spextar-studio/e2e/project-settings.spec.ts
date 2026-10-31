import { test, expect, activate, login, navigate, noOverflow, projectPath, type Role } from './fixture';

const settingsPath = projectPath + '/settings';
const candidate = '22222222-2222-4222-8222-222222222222';
test.beforeEach(({ backend }) => {
  backend.setRole('admin');
  backend.settings.enabled = true;
  backend.db.workspace_members.push({ workspace_id: 'ws-a', user_id: candidate, role: 'member' });
});

async function confirm(page: Parameters<typeof activate>[0]) {
  await activate(page, page.getByTestId('button-confirm'));
  await expect(page.getByTestId('dialog-confirm')).toHaveCount(0);
}

test('admin metadata validation, explicit save, cache refresh and reload preserve server audit fields', async ({ page, backend }) => {
  await login(page, settingsPath);
  await expect(page.getByTestId('input-name')).toBeEnabled();
  await page.getByTestId('input-name').fill(' ');
  await activate(page, page.getByTestId('button-save-details'));
  await expect(page.getByTestId('error-name')).toBeVisible();
  expect(backend.writes).toHaveLength(0);
  const longName = 'P'.repeat(160);
  await page.getByTestId('input-name').fill(`  ${longName}  `);
  await page.getByTestId('input-description').fill('  Confirmed settings  ');
  expect(backend.writes).toHaveLength(0); // No metadata autosave on this explicit-save screen.
  await activate(page, page.getByTestId('button-save-details'));
  await expect(page.getByTestId('status-success')).toHaveText('Project details saved.');
  expect(backend.writes).toHaveLength(1);
  expect(backend.writes[0]).toMatchObject({ table: 'projects', method: 'PATCH',
    body: { name: longName, slug: 'pa', description: 'Confirmed settings', status: 'active' } });
  const query = new URLSearchParams(backend.writes[0].query);
  expect(Object.fromEntries(['id', 'workspace_id', 'updated_at'].map(key => [key, query.get(key)])))
    .toEqual({ id: 'eq.project-a', workspace_id: 'eq.ws-a', updated_at: 'eq.2026-10-27T10:00:00Z' });
  expect(backend.db.projects[0]).toMatchObject({ id: 'project-a', workspace_id: 'ws-a',
    created_by: 'user-a', created_at: '2026-10-27T10:00:00Z' });
  await noOverflow(page);
  await navigate(page, 'nav-home');
  await expect(page.getByRole('heading', { name: longName, exact: true })).toBeVisible();
  await page.goto(settingsPath);
  await expect(page.getByTestId('input-name')).toHaveValue(longName);
  await page.reload();
  await page.getByTestId('input-description').fill(' ');
  await activate(page, page.getByTestId('button-save-details'));
  await expect(page.getByTestId('status-success')).toBeVisible();
  expect(backend.writes[1].body.description).toBeNull();
  expect(new URLSearchParams(backend.writes[1].query).get('updated_at')).toBe('eq.2026-10-27T10:00:01.000Z');
});

test('network and backend permission failures keep edits, permit explicit retry and never fall back to demo', async ({ page, backend }) => {
  await login(page, settingsPath);
  await page.getByTestId('input-name').fill('Retained local details');
  for (const failure of ['unavailable', 'denied'] as const) {
    backend.settings.failNextWrite = failure;
    await activate(page, page.getByTestId('button-save-details'));
    await expect(page.getByTestId('alert-error')).toBeVisible();
    await expect(page.getByTestId('status-success')).toHaveCount(0);
    await expect(page.getByTestId('input-name')).toHaveValue('Retained local details');
    await expect(page.getByTestId('button-save-details')).toBeEnabled();
    expect(backend.db.projects[0].name).toBe('Project A');
  }
  await activate(page, page.getByTestId('button-save-details'));
  await expect(page.getByTestId('status-success')).toHaveText('Project details saved.');
  expect(backend.writes).toHaveLength(3);
  expect(backend.db.projects[0].name).toBe('Retained local details');
  await noOverflow(page);
});

test('stale details and a read/write race cannot overwrite newer metadata; reload requires explicit discard', async ({ page, backend }) => {
  await login(page, settingsPath);
  await page.getByTestId('input-name').fill('Unsaved local name');
  Object.assign(backend.db.projects[0], { name: 'Already changed remotely', updated_at: '2026-10-27T10:00:01Z' });
  await activate(page, page.getByTestId('button-save-details'));
  await expect(page.getByTestId('alert-error')).toContainText('changed');
  expect(backend.writes).toHaveLength(0);
  await activate(page, page.getByTestId('button-conflict-reload'));
  await expect(page.getByTestId('dialog-confirm')).toContainText('Discard unsaved edits?');
  await noOverflow(page);
  await activate(page, page.getByTestId('button-confirm-cancel'));
  await expect(page.getByTestId('input-name')).toHaveValue('Unsaved local name');
  await activate(page, page.getByTestId('button-conflict-reload'));
  await confirm(page);
  await expect(page.getByTestId('input-name')).toHaveValue('Already changed remotely');
  await page.getByTestId('input-name').fill('Second local attempt');
  backend.settings.raceProjectWrite = true;
  await activate(page, page.getByTestId('button-save-details'));
  await expect(page.getByTestId('alert-error')).toContainText('Nothing was changed');
  await expect(page.getByTestId('input-name')).toHaveValue('Second local attempt');
  expect(backend.writes).toHaveLength(1);
  expect(backend.db.projects[0].name).toBe('Other admin saved this');
  await activate(page, page.getByTestId('button-conflict-reload'));
  await confirm(page);
  await expect(page.getByTestId('input-name')).toHaveValue('Other admin saved this');
});

test('archive and restore require confirmation, block dirty details and do not touch document content', async ({ page, backend }) => {
  const contentBefore = JSON.stringify({ documents: backend.db.documents, topics: backend.db.topics, drafts: backend.db.topic_drafts });
  await login(page, settingsPath);
  await page.getByTestId('input-name').fill('Unsaved edit');
  await expect(page.getByTestId('button-archive')).toBeDisabled();
  await activate(page, page.getByTestId('button-reset-details'));
  await activate(page, page.getByTestId('button-archive'));
  await expect(page.getByTestId('dialog-confirm')).toContainText('No content is deleted');
  await noOverflow(page);
  expect(backend.writes).toHaveLength(0);
  await activate(page, page.getByTestId('button-confirm-cancel'));
  expect(backend.writes).toHaveLength(0);
  await activate(page, page.getByTestId('button-archive'));
  await confirm(page);
  await expect(page.getByTestId('status-success')).toHaveText('Project archived.');
  await page.reload();
  await expect(page.getByTestId('text-status-value')).toHaveText('archived');
  await activate(page, page.getByTestId('button-restore'));
  await expect(page.getByTestId('dialog-confirm')).toContainText('Nothing else changes');
  await confirm(page);
  await expect(page.getByTestId('status-success')).toHaveText('Project restored to active.');
  expect(backend.writes.map(w => w.body.status)).toEqual(['archived', 'active']);
  expect(JSON.stringify({ documents: backend.db.documents, topics: backend.db.topics, drafts: backend.db.topic_drafts })).toBe(contentBefore);
});

test('existing workspace member add, confirmed role change and conservative removal refresh candidates', async ({ page, backend }) => {
  await login(page, settingsPath);
  await expect(page.getByTestId('button-remove-user-a')).toBeDisabled();
  await expect(page.getByTestId('select-role-user-a').locator('option[value=author]')).toBeDisabled();
  await expect(page.getByTestId('button-save-role-user-a')).toBeDisabled();
  await page.getByTestId('select-add-user').selectOption(candidate);
  await page.getByTestId('select-add-role').selectOption('reviewer');
  await activate(page, page.getByTestId('button-add-member'));
  const member = page.getByTestId(`row-member-${candidate}`);
  await expect(member).toContainText('Reviewer');
  await expect(page.getByTestId('text-no-candidates')).toBeVisible();
  expect(backend.writes[0]).toMatchObject({ table: 'project_members', method: 'POST',
    body: { project_id: 'project-a', user_id: candidate, role: 'reviewer' } });
  await page.getByTestId(`select-role-${candidate}`).selectOption('author');
  await activate(page, page.getByTestId(`button-save-role-${candidate}`));
  await expect(page.getByTestId('dialog-confirm')).toContainText('from Reviewer to Author');
  await noOverflow(page);
  expect(backend.writes).toHaveLength(1);
  await activate(page, page.getByTestId('button-confirm-cancel'));
  expect(backend.writes).toHaveLength(1);
  await activate(page, page.getByTestId(`button-save-role-${candidate}`));
  await confirm(page);
  await expect(member.getByRole('paragraph').filter({ hasText: /^Author$/ })).toBeVisible();
  expect(new URLSearchParams(backend.writes[1].query).get('role')).toBe('eq.reviewer');
  await activate(page, page.getByTestId(`button-remove-${candidate}`));
  await activate(page, page.getByTestId('button-confirm-cancel'));
  await expect(member).toBeVisible();
  expect(backend.writes).toHaveLength(2);
  await activate(page, page.getByTestId(`button-remove-${candidate}`));
  await confirm(page);
  await expect(member).toHaveCount(0);
  expect(backend.writes[2]).toMatchObject({ method: 'DELETE', body: {} });
  expect(new URLSearchParams(backend.writes[2].query).get('role')).toBe('eq.author');
  expect(backend.db.workspace_members.some(m => m.user_id === candidate)).toBe(true);
  await page.reload();
  await expect(page.getByTestId('select-add-user').locator(`option[value="${candidate}"]`)).toHaveCount(1);
  expect(backend.db.project_members).toEqual([{ project_id: 'project-a', user_id: 'user-a', role: 'admin' }]);
  await noOverflow(page);
});

test('membership changes between read, confirmation and write surface conflicts instead of success', async ({ page, backend }) => {
  backend.db.project_members.push({ project_id: 'project-a', user_id: candidate, role: 'viewer' });
  await login(page, settingsPath);
  await page.getByTestId(`select-role-${candidate}`).selectOption('author');
  await activate(page, page.getByTestId(`button-save-role-${candidate}`));
  backend.db.project_members[1].role = 'reviewer';
  await confirm(page);
  await expect(page.getByTestId('alert-error')).toContainText('Membership changed');
  expect(backend.writes).toHaveLength(0);
  await activate(page, page.getByTestId('button-reload'));
  await expect(page.getByTestId(`select-role-${candidate}`)).toHaveValue('reviewer');
  await page.getByTestId(`select-role-${candidate}`).selectOption('author');
  backend.settings.raceMemberWrite = true;
  await activate(page, page.getByTestId(`button-save-role-${candidate}`));
  await confirm(page);
  await expect(page.getByTestId('alert-error')).toContainText('Nothing was changed');
  expect(backend.db.project_members[1].role).toBe('viewer');
  await activate(page, page.getByTestId('button-reload'));
  await expect(page.getByTestId(`select-role-${candidate}`)).toHaveValue('viewer');
  backend.settings.raceMemberWrite = true;
  await activate(page, page.getByTestId(`button-remove-${candidate}`));
  await confirm(page);
  await expect(page.getByTestId('alert-error')).toContainText('Nothing was changed');
  expect(backend.db.project_members[1].role).toBe('reviewer');
  expect(backend.writes.map(w => w.method)).toEqual(['PATCH', 'DELETE']);
  await noOverflow(page);
});

test('revoked administration fails before writing even while the form still looks editable', async ({ page, backend }) => {
  await login(page, settingsPath);
  await page.getByTestId('input-name').fill('Must not be saved after revocation');
  backend.db.project_members[0].role = 'author';
  await activate(page, page.getByTestId('button-save-details'));
  await expect(page.getByTestId('alert-error')).toContainText('Only an explicit Project Admin');
  expect(backend.writes).toHaveLength(0);
  expect(backend.db.projects[0].name).toBe('Project A');
  await activate(page, page.getByTestId('button-reload'));
  await confirm(page);
  await expect(page.getByTestId('text-readonly')).toBeVisible();
  await expect(page.getByTestId('input-name')).toBeDisabled();
  await expect(page.getByTestId('panel-add-member')).toHaveCount(0);
  await noOverflow(page);
});

for (const role of ['author', 'reviewer', 'viewer', null] satisfies Role[]) {
  test(`${role ?? 'inherited admin'} cannot administer despite organization ownership and workspace administration`, async ({ page, backend }) => {
    backend.setRole(role);
    backend.db.organization_members[0].role = 'owner';
    backend.db.workspace_members[0].role = 'admin';
    await login(page, settingsPath);
    await expect(page.getByTestId('text-readonly')).toBeVisible();
    await expect(page.getByTestId('input-slug')).toHaveCount(0);
    for (const field of ['name', 'description']) await expect(page.getByTestId(`input-${field}`)).toBeDisabled();
    for (const action of ['save-details', 'archive', 'add-member', 'remove-user-a', 'save-role-user-a'])
      await expect(page.getByTestId(`button-${action}`)).toHaveCount(0);
    await expect(page.getByTestId('panel-add-member')).toHaveCount(0);
    expect(backend.writes).toHaveLength(0);
    await page.reload();
    await expect(page.getByTestId('text-readonly')).toBeVisible();
    await noOverflow(page);
  });
}

test('Settings read failure retries and foreign workspace records fail closed without demo data', async ({ page, backend }) => {
  backend.settings.failReads = true;
  await login(page, settingsPath);
  await expect(page.getByText('Project settings did not load', { exact: true })).toBeVisible();
  await expect(page.getByTestId('input-name')).toHaveCount(0);
  backend.settings.failReads = false;
  await activate(page, page.getByRole('button', { name: /try again|retry/i }));
  await expect(page.getByTestId('input-name')).toHaveValue('Project A');
  backend.settings.foreignRead = true;
  await page.reload();
  await expect(page.getByText('Project settings did not load', { exact: true })).toBeVisible();
  await expect(page.getByTestId('input-name')).toHaveCount(0);
  backend.settings.foreignRead = false;
  await activate(page, page.getByRole('button', { name: /try again|retry/i }));
  await expect(page.getByTestId('input-name')).toHaveValue('Project A');
  expect(backend.writes).toHaveLength(0);
  await noOverflow(page);
});
