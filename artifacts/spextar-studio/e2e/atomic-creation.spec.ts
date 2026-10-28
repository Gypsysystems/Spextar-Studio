import { test, expect, login, activate, noOverflow } from './fixture';

test('new identity creates its first organization, workspace and project using only authoritative atomic RPCs', async ({ page, backend }) => {
  for (const table of ['organizations', 'organization_members', 'workspaces', 'workspace_members', 'projects', 'project_members', 'documents', 'topics'])
    backend.db[table] = [];
  backend.management.atomicEnabled = true;
  await login(page);
  await activate(page, page.getByTestId('button-create-organization'));
  await page.getByLabel('Name', { exact: true }).fill('First Organization');
  await activate(page, page.getByRole('dialog').getByRole('button', { name: 'Create organization', exact: true }));
  await expect(page.getByTestId('text-org-name')).toHaveText('First Organization');
  await activate(page, page.getByTestId('button-create-workspace'));
  await page.getByTestId('input-workspace-name').fill('First Workspace');
  await activate(page, page.getByTestId('button-submit-workspace'));
  await expect(page.getByRole('heading', { name: 'First Workspace', exact: true })).toBeVisible();
  const workspaceId = backend.db.workspaces[0].id;
  await page.goto(`/workspaces/${workspaceId}/projects`);
  await activate(page, page.getByTestId('button-create-project'));
  await page.getByTestId('input-project-name').fill('First Project');
  await page.getByTestId('input-project-key').fill('FP');
  await activate(page, page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }));
  await expect(page.getByRole('heading', { name: 'First Project', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'First Project', exact: true })).toBeVisible();
  expect(backend.writes.map(write => [write.table, write.method])).toEqual([
    ['rpc/create_organization', 'POST'], ['rpc/create_workspace', 'POST'], ['rpc/create_project', 'POST'],
  ]);
  expect(backend.writes[0].body).toEqual({ p_name: 'First Organization', p_slug: 'first-organization' });
  expect(backend.writes[1].body).toMatchObject({ p_organization_id: backend.db.organizations[0].id, p_name: 'First Workspace', p_slug: 'first-workspace' });
  expect(backend.writes[2].body).toMatchObject({ p_workspace_id: workspaceId, p_name: 'First Project', p_slug: 'fp' });
  await noOverflow(page);
});

for (const entity of ['organization', 'workspace', 'project'] as const) {
  test(`${entity}: unavailable RPC without hints fails closed and explicit retry uses the same operation`, async ({ page, backend }) => {
    backend.management.atomicEnabled = true;
    backend.management.atomicFailure = true;
    await login(page, entity === 'project' ? '/workspaces/ws-a/projects' : '/workspaces');
    await activate(page, page.getByTestId(`button-create-${entity}`));
    if (entity === 'organization') await page.getByLabel('Name', { exact: true }).fill('Retry Organization');
    else await page.getByTestId(`input-${entity}-name`).fill(`Retry ${entity}`);
    if (entity === 'project') await page.getByTestId('input-project-key').fill('RP');
    const submit = page.getByRole('dialog').getByRole('button', { name: `Create ${entity}`, exact: true });
    await activate(page, submit);
    await expect(page.getByText(/The required atomic database operation is unavailable/)).toBeVisible();
    expect(backend.writes.map(write => write.table)).toEqual([`rpc/create_${entity}`]);
    await noOverflow(page);
    backend.management.atomicFailure = false;
    await activate(page, submit);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(backend.writes.map(write => [write.table, write.method])).toEqual([
      [`rpc/create_${entity}`, 'POST'], [`rpc/create_${entity}`, 'POST'],
    ]);
  });
}
