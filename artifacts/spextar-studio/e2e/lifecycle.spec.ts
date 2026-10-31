import { test, expect, login, activate, noOverflow, projectPath } from './fixture';
import type { Page } from '@playwright/test';

async function confirmDelete(page: Page, kind: string, name: string) {
  const d = page.getByTestId('dialog-lifecycle');
  await expect(d.getByRole('button', { name: `Delete ${kind} permanently`, exact: true })).toBeDisabled();
  await d.getByLabel(`Type the exact name: ${name}`).fill('wrong');
  await d.getByLabel('I understand this permanently deletes data and cannot be undone.').check();
  await expect(d.getByRole('button', { name: `Delete ${kind} permanently`, exact: true })).toBeDisabled();
  await d.getByLabel(`Type the exact name: ${name}`).fill(name);
  await activate(page, d.getByRole('button', { name: `Delete ${kind} permanently`, exact: true }));
}

test('organization editing, discard confirmation and owner-only permanent deletion', async ({ page, backend }) => {
  backend.lifecycle.enabled = true;
  backend.db.organization_members[0].role = 'owner';
  await login(page, '/workspaces');
  await activate(page, page.getByTestId('button-manage-organization'));
  let d = page.getByTestId('dialog-lifecycle');
  await d.getByLabel('Name', { exact: true }).fill('UAT Organization');
  await activate(page, d.getByRole('button', { name: 'Save details', exact: true }));
  await expect(d.getByRole('status')).toHaveText('Details saved.');
  await expect(page.getByTestId('text-org-name')).toHaveText('UAT Organization');
  await d.getByLabel('Name', { exact: true }).fill('Unsaved name');
  await activate(page, d.getByRole('button', { name: 'Done', exact: true }));
  await expect(d.getByRole('heading', { name: 'Discard unsaved changes?' })).toBeVisible();
  await activate(page, d.getByRole('button', { name: 'Cancel', exact: true }));
  await expect(d.getByLabel('Name', { exact: true })).toHaveValue('Unsaved name');
  await activate(page, d.getByRole('button', { name: 'Done', exact: true }));
  await activate(page, d.getByRole('button', { name: 'Discard and close', exact: true }));
  await activate(page, page.getByTestId('button-manage-organization'));
  d = page.getByTestId('dialog-lifecycle');
  await activate(page, d.getByRole('button', { name: 'Delete organization permanently', exact: true }));
  await expect(d.getByText(/Related workspaces, projects/)).toBeVisible();
  await activate(page, d.getByRole('button', { name: 'Cancel', exact: true }));
  expect(backend.writes.filter(w => w.method === 'DELETE')).toHaveLength(0);
  await activate(page, d.getByRole('button', { name: 'Delete organization permanently', exact: true }));
  await confirmDelete(page, 'organization', 'UAT Organization');
  await expect(page).toHaveURL('/workspaces');
  await expect(page.getByTestId('select-organization')).toHaveValue('');
  expect(backend.db.organizations).toHaveLength(0);
  expect(backend.writes.map(w => [w.table, w.method])).toEqual([['organizations', 'PATCH'], ['organizations', 'DELETE']]);
  await noOverflow(page);
});

test('workspace details, archive filter, restore and permanent delete refresh navigation', async ({ page, backend }) => {
  backend.lifecycle.enabled = true; backend.setRole(null);
  await login(page, '/workspaces');
  await activate(page, page.getByTestId('button-manage-workspace'));
  const d = page.getByTestId('dialog-lifecycle');
  await d.getByLabel('Name', { exact: true }).fill('UAT Workspace');
  await d.getByLabel('Description', { exact: true }).fill('Team documentation');
  await activate(page, d.getByRole('button', { name: 'Save details', exact: true }));
  await expect(d.getByRole('status')).toHaveText('Details saved.');
  await expect(d.getByRole('button', { name: 'Delete workspace permanently' })).toBeDisabled();
  await activate(page, d.getByRole('button', { name: 'Archive workspace', exact: true }));
  await activate(page, d.getByRole('button', { name: 'Archive workspace', exact: true }));
  await expect(d.getByRole('status')).toContainText('Workspace archived');
  await activate(page, d.getByRole('button', { name: 'Done', exact: true }));
  await expect(page.getByTestId('card-workspace-ws-a')).toHaveCount(0);
  await page.getByLabel('Workspace status', { exact: true }).selectOption('archived');
  await expect(page.getByTestId('card-workspace-ws-a')).toContainText('UAT Workspace');
  await activate(page, page.getByTestId('button-manage-workspace'));
  await activate(page, d.getByRole('button', { name: 'Restore workspace', exact: true }));
  await activate(page, d.getByRole('button', { name: 'Restore workspace', exact: true }));
  await expect(d.getByRole('status')).toHaveText('Workspace restored.');
  await activate(page, d.getByRole('button', { name: 'Done', exact: true }));
  await page.getByLabel('Workspace status', { exact: true }).selectOption('active');
  await expect(page.getByTestId('card-workspace-ws-a')).toContainText('UAT Workspace');
  await activate(page, page.getByTestId('button-manage-workspace'));
  await activate(page, d.getByRole('button', { name: 'Archive workspace', exact: true }));
  await activate(page, d.getByRole('button', { name: 'Archive workspace', exact: true }));
  await expect(d.getByRole('status')).toContainText('Workspace archived');
  await activate(page, d.getByRole('button', { name: 'Delete workspace permanently', exact: true }));
  await confirmDelete(page, 'workspace', 'UAT Workspace');
  // A trusted click does not await the async scope checks and parent-row delete.
  await expect(page.getByTestId('dialog-lifecycle')).toHaveCount(0);
  await expect(page).toHaveURL('/workspaces');
  expect(backend.db.workspaces).toHaveLength(0);
  expect(backend.writes.filter(w => w.method === 'DELETE').map(w => w.table)).toEqual(['workspaces']);
  await noOverflow(page);
});

test('project deletion reuses settings archive, confirms descendants and returns to workspace', async ({ page, backend }) => {
  backend.lifecycle.enabled = true; backend.settings.enabled = true; backend.setRole('admin');
  await login(page, `${projectPath}/settings`);
  await expect(page.getByTestId('button-manage-project')).toBeDisabled();
  await activate(page, page.getByTestId('button-archive'));
  await activate(page, page.getByTestId('button-confirm'));
  await expect(page.getByTestId('button-manage-project')).toBeEnabled();
  await activate(page, page.getByTestId('button-manage-project'));
  await expect(page.getByTestId('dialog-lifecycle').getByText(/Related documents, topics, drafts/)).toBeVisible();
  await confirmDelete(page, 'project', 'Project A');
  await expect(page).toHaveURL('/workspaces/ws-a/projects');
  await expect(page.getByText('No projects in this workspace')).toBeVisible();
  expect(backend.writes.filter(w => w.method === 'DELETE').map(w => w.table)).toEqual(['projects']);
  await page.goto(`${projectPath}/settings`);
  await expect(page.getByText('Project not found', { exact: true })).toBeVisible();
  await noOverflow(page);
});

test('permission failures and stale writes retain state and require reload/reconfirmation', async ({ page, backend }) => {
  backend.lifecycle.enabled = true; backend.db.organization_members[0].role = 'owner';
  await login(page, '/workspaces');
  await activate(page, page.getByTestId('button-manage-organization'));
  const d = page.getByTestId('dialog-lifecycle');
  await d.getByLabel('Name', { exact: true }).fill('Retained name');
  backend.lifecycle.failNext = 'denied';
  await activate(page, d.getByRole('button', { name: 'Save details', exact: true }));
  await expect(d.getByRole('alert')).toBeVisible();
  await expect(d.getByLabel('Name', { exact: true })).toHaveValue('Retained name');
  backend.lifecycle.conflictNext = true;
  await activate(page, d.getByRole('button', { name: 'Save details', exact: true }));
  await expect(d.getByRole('alert')).toContainText('not confirmed');
  await activate(page, d.getByRole('button', { name: 'Reload details', exact: true }));
  await expect(d.getByLabel('Name', { exact: true })).toHaveValue('Organization A');
  await activate(page, d.getByRole('button', { name: 'Delete organization permanently', exact: true }));
  backend.lifecycle.failNext = 'unavailable';
  await confirmDelete(page, 'organization', 'Organization A');
  await expect(d.getByRole('alert')).toBeVisible();
  expect(backend.db.organizations).toHaveLength(1);
  await activate(page, d.getByRole('button', { name: 'Reload details', exact: true }));
  await expect(d.getByLabel('Type the exact name: Organization A')).toHaveValue('');
  await expect(d.getByRole('checkbox')).not.toBeChecked();
  await noOverflow(page);
});

for (const role of ['author', 'reviewer', 'viewer', null] as const) {
  test(`non-project-admin ${role ?? 'inherited admin'} cannot delete a project`, async ({ page, backend }) => {
    backend.lifecycle.enabled = true; backend.settings.enabled = true; backend.setRole(role);
    backend.db.projects[0].status = 'archived';
    await login(page, `${projectPath}/settings`);
    await expect(page.getByTestId('button-manage-project')).toBeDisabled();
    expect(backend.writes).toHaveLength(0);
  });
}
test('organization admin edits but cannot delete; member cannot enter administration', async ({ page, backend }) => {
  backend.lifecycle.enabled = true; backend.db.organization_members[0].role = 'admin';
  await login(page, '/workspaces');
  await activate(page, page.getByTestId('button-manage-organization'));
  const d = page.getByTestId('dialog-lifecycle');
  await expect(d.getByRole('button', { name: 'Delete organization permanently', exact: true })).toBeDisabled();
  await expect(d.getByLabel('Name', { exact: true })).toBeEnabled();
  await activate(page, d.getByRole('button', { name: 'Done', exact: true }));
  backend.db.organization_members[0].role = 'member';
  await page.reload();
  await expect(page.getByTestId('button-manage-organization')).toBeDisabled();
  await expect(page.getByTestId('button-manage-workspace')).toBeDisabled();
  expect(backend.writes).toHaveLength(0);
});
