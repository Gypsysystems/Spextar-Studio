import AxeBuilder from '@axe-core/playwright';
import { test, expect, login, activate, noOverflow, projectPath } from './fixture';
async function accessible(page: Parameters<typeof login>[0]) {
  await noOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}
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
