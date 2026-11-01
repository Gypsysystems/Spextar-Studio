import AxeBuilder from '@axe-core/playwright';
import { test, expect, login, activate, noOverflow, projectPath } from './fixture';
async function accessible(page: Parameters<typeof login>[0]) {
  await noOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test('project title and primary action open the complete document hub by click and keyboard', async ({ page, backend }) => {
  const first = backend.db.documents[0];
  for (let i = 1; i <= 12; i++) backend.db.documents.push({
    ...first, id: `hub-doc-${i}`, title: `Hub document ${i}`, slug: `hub-${i}`,
    status: ['draft', 'in_review', 'approved', 'published'][i % 4],
  });
  await login(page, '/workspaces/ws-a/projects');
  await expect(page.getByText('Projects in this workspace.', { exact: true })).toBeVisible();
  const row = page.getByTestId('row-project-project-a');
  for (const target of ['title-click', 'title-keyboard', 'action-click', 'action-keyboard']) {
    const link = target.startsWith('title')
      ? row.getByRole('link', { name: 'Project A', exact: true })
      : row.getByRole('link', { name: 'Open project Project A', exact: true });
    await expect(link).toHaveAttribute('href', projectPath);
    if (target.startsWith('action')) await expect(link.locator('svg[aria-hidden="true"]')).toBeVisible();
    if (target.endsWith('keyboard')) { await link.focus(); await link.press('Enter'); }
    else await link.click();
    await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
    await expect(page.getByRole('heading', { name: 'Project Stats' })).toBeVisible();
    await expect(page.getByText('Documents in this project.', { exact: true })).toBeVisible();
    await expect(page.getByTestId(/^row-document-/)).toHaveCount(13);
    await expect(page.getByTestId('text-doc-count')).toHaveText('13');
    await noOverflow(page);
    await page.goto('/workspaces/ws-a/projects');
  }
  await row.getByRole('link', { name: 'Open project Project A', exact: true }).click();
  await activate(page, page.getByRole('link', { name: 'QA document', exact: true }));
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true');
});

test('compact document icons expose hover and focus tooltips and preserve keyboard navigation', async ({ page }) => {
  await login(page, projectPath);
  const documentRow = page.getByTestId('row-document-doc-a');
  const details = documentRow.getByRole('button', { name: 'Details', exact: true });
  await expect(details).toBeVisible();
  await details.focus();
  await expect(page.getByRole('tooltip', { name: 'Details', exact: true })).toBeVisible();
  await details.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Document metadata' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(details).toBeFocused();
  await expect(documentRow.getByRole('button', { name: 'Document metadata', exact: true, includeHidden: true })).toHaveCount(0);
  for (const label of ['Duplicate document', 'Delete document']) {
    const action = documentRow.getByRole('button', { name: label, exact: true });
    await expect(action).toBeVisible();
    await expect(action).toHaveText('');
    await expect(action.locator('svg[aria-hidden="true"]')).toBeVisible();
    await action.hover();
    await expect(page.getByRole('tooltip', { name: label, exact: true })).toBeVisible();
  }
  await expect(details).toHaveText('');
  await expect(documentRow.getByRole('link', { name: 'Open', exact: true })).toHaveText('');
  await expect(page.getByRole('button', { name: 'Create document', exact: true })).toHaveText('Create document');
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('document-icon-actions.png'), fullPage: true });
  await expect(documentRow.getByRole('link', { name: 'Open', exact: true }).locator('svg[aria-hidden="true"]')).toBeVisible();
  const open = documentRow.getByRole('link', { name: 'Open', exact: true });
  await open.focus();
  await expect(page.getByRole('tooltip', { name: 'Open', exact: true })).toBeVisible();
  await open.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true');
});

test('tablet project rows retain readable titles and reachable admin actions with expanded navigation', async ({ page, backend }) => {
  backend.setRole('admin'); backend.settings.enabled = true;
  backend.db.projects[0].name = 'SPEXTAR UAT';
  await page.setViewportSize({ width: 768, height: 1024 });
  await login(page, '/workspaces/ws-a/projects');
  const row = page.getByTestId('row-project-project-a');
  const title = row.getByRole('link', { name: 'SPEXTAR UAT', exact: true });
  await expect(page.getByRole('button', { name: 'Collapse navigation', exact: true })).toBeVisible();
  const bounds = await title.boundingBox();
  expect(bounds?.width).toBeGreaterThan(100);
  expect(bounds?.height).toBeLessThan(60);
  await expect(row.getByRole('button', { name: 'Edit project name' })).toBeVisible();
  await expect(row.getByRole('link', { name: 'Settings for SPEXTAR UAT' })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: test.info().outputPath('tablet-project-actions.png'), fullPage: true });
  await title.click();
  await expect(page.getByRole('heading', { name: 'Project Stats' })).toBeVisible();
});
test('project hub filters documents in place and legacy links retain direct authoring', async ({ page, backend }) => {
  const first = backend.db.documents[0];
  for (const [i, status] of ['in_review', 'approved', 'published'].entries()) backend.db.documents.push({ ...first, id: `doc-${i}`, title: `Status document ${i}`, slug: `status-${i}`, status });
  await login(page, projectPath);
  await expect(page.getByRole('heading', { name: 'Project Stats' })).toBeVisible();
  await expect(page.getByTestId('text-doc-count')).toHaveText('4');
  for (const label of ['In Progress', 'In Review', 'Reviewed', 'Published', 'All']) {
    await activate(page, page.getByRole('combobox', { name: 'Filter by status' }));
    await activate(page, page.getByRole('option', { name: label, exact: true }));
    await expect(page.getByTestId(/^row-document-/)).toHaveCount(label === 'All' ? 4 : 1);
    expect(new URL(page.url()).pathname).toBe(projectPath);
  }
  await accessible(page);
  await page.screenshot({ path: test.info().outputPath('project-hub.png'), fullPage: true });
  await activate(page, page.getByRole('link', { name: 'QA document', exact: true }));
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true');
  for (const path of ['documents', 'author', 'review', 'publish']) {
    await page.goto(projectPath + '/' + path);
    await expect(page.getByRole('heading', { name: 'Project Stats' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(projectPath);
  }
});
test('admin renames inline from hub and workspace project rows with keyboard and stable identifiers', async ({ page, backend }) => {
  backend.setRole('admin'); backend.settings.enabled = true;
  await login(page, projectPath);
  await activate(page, page.getByRole('button', { name: 'Edit project name' }));
  const input = page.getByRole('textbox', { name: 'Project name', exact: true });
  await input.fill('Renamed project'); await input.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Project name saved.');
  expect(backend.db.projects[0].slug).toBe('pa');
  await page.goto('/workspaces/ws-a/projects');
  await expect(page.getByRole('link', { name: 'Renamed project', exact: true })).toBeVisible();
  await expect(page.getByTestId('button-manage-workspace')).toHaveCount(0);
  await expect(page.getByTestId('button-import-project')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Settings for Renamed project' })).toBeVisible();
  await activate(page, page.getByRole('button', { name: 'Edit project name' }));
  await input.fill('Canceled name'); await input.press('Escape');
  await expect(input).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await accessible(page);
  await page.screenshot({ path: test.info().outputPath('workspace-project-actions.png'), fullPage: true });
  await activate(page, page.getByTestId('button-create-project'));
  await expect(page.getByTestId('input-project-name')).toBeVisible();
  await expect(page.getByTestId('input-project-key')).toHaveCount(0);
  await accessible(page);
});
test('reviewer and viewer retain read-only direct editor and no rename action', async ({ page, backend }) => {
  for (const role of ['reviewer', 'viewer'] as const) {
    backend.setRole(role);
    if (role === 'reviewer') await login(page, projectPath); else await page.goto(projectPath);
    await expect(page.getByRole('heading', { name: 'Project Stats' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit project name' })).toHaveCount(0);
    await activate(page, page.getByRole('link', { name: 'QA document', exact: true }));
    await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'false');
    await accessible(page);
  }
});
