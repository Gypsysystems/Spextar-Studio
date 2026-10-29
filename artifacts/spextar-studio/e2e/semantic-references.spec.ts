import { test, expect, login, activate, noOverflow, projectPath, bodyContent, type Backend } from './fixture';
const author = projectPath + '/author/doc-a?topic=topic-a';
function seed(backend: Backend) {
  backend.management.enabled = true;
  backend.db.reusable_contents.push({ id: 'reuse-a', workspace_id: 'ws-a', project_id: 'project-a', scope: 'project',
    name: 'Linked instructions', slug: 'linked-instructions', description: null, settings: {}, status: 'draft', update_policy: 'notify', tags: [],
    created_by: 'user-a', created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z' });
  backend.db.reusable_content_drafts.push({ reusable_content_id: 'reuse-a', content: bodyContent('Linked technical instructions'),
    revision: 2, updated_by: 'user-a', updated_at: '2026-10-27T10:00:00Z' });
}
test.beforeEach(({ backend }) => seed(backend));

for (const role of ['admin', 'author'] as const) {
  test(`${role}: semantic insertion, conditional apply/remove, reopen, rename and read-only Review`, async ({ page, backend }) => {
    backend.setRole(role);
    await login(page, author);
    const body = page.getByTestId('input-topic-body');
    await expect(body).toHaveAttribute('contenteditable', 'true');
    await body.click();
    await page.getByLabel('Variable reference', { exact: true }).selectOption('var-a');
    await activate(page, page.getByRole('button', { name: 'Insert variable', exact: true }));
    await expect(body).toContainText('ProductName: QA Product');
    await page.getByLabel('Condition value reference', { exact: true }).selectOption('val-a');
    await activate(page, page.getByRole('button', { name: 'Apply condition', exact: true }));
    await expect(body.locator('.se-conditioned')).toHaveAttribute('data-condition-label', 'Audience: Developer');
    const paint = await body.locator('.se-semantic-reference').first().evaluate(el => {
      const style = getComputedStyle(el);
      return { border: style.borderTopColor, width: style.borderTopWidth, background: style.backgroundColor };
    });
    expect(paint.border).toBe('rgb(98, 54, 255)');
    expect(paint.width).toBe('1px');
    expect(paint.background).not.toBe('rgba(0, 0, 0, 0)');
    await activate(page, page.getByRole('button', { name: 'Remove condition', exact: true }));
    await expect(body.locator('.se-conditioned')).toHaveCount(0);
    await activate(page, page.getByRole('button', { name: 'Apply condition', exact: true }));
    await page.getByLabel('Reusable content reference', { exact: true }).selectOption('reuse-a');
    await activate(page, page.getByRole('button', { name: 'Insert linked content', exact: true }));
    await expect(body).toContainText('Linked technical instructions');
    await expect.poll(() => JSON.stringify(backend.db.topic_drafts[0].content)).toContain('reusableReference');
    await expect(page.getByTestId('body-save-status')).toContainText('Saved · revision');
    const saved = JSON.stringify(backend.db.topic_drafts[0].content);
    expect(saved).toContain('variableReference'); expect(saved).toContain('conditions');
    expect(saved).not.toContain('Linked technical instructions'); expect(saved).not.toContain('ProductName');
    await noOverflow(page);
    backend.db.project_variables[0].name = 'Renamed product';
    const writes = backend.writes.length;
    await page.reload();
    await expect(body).toHaveAttribute('contenteditable', 'true');
    await expect(body).toContainText('Renamed product: QA Product');
    await expect(body).toContainText('Linked technical instructions');
    expect(backend.writes).toHaveLength(writes);
    await page.goto(projectPath + '/review');
    await expect(page.getByTestId('review-draft-viewer')).toBeVisible();
    await expect(page.getByTestId('input-topic-body')).toContainText('Renamed product: QA Product');
    await expect(page.getByRole('button', { name: 'Insert variable', exact: true })).toHaveCount(0);
    expect(backend.writes).toHaveLength(writes);
    await noOverflow(page);
  });
}
test('where-used derives all three definition locations from saved semantic Topic JSON', async ({ page, backend }) => {
  backend.db.topic_drafts[0].content = { type: 'doc', version: 1, content: [
    { type: 'paragraph', attrs: { id: 'p-a', conditions: [{ version: 1, categoryId: 'cat-a', valueIds: ['val-a'] }] },
      content: [{ type: 'variableReference', attrs: { id: 'var-node', refVersion: 1, targetId: 'var-a' } }] },
    { type: 'reusableReference', attrs: { id: 'reuse-node', refVersion: 1, targetId: 'reuse-a' } },
  ] };
  await login(page, projectPath + '/variables-conditions');
  await activate(page, page.getByRole('button', { name: 'Find saved references', exact: true }));
  await expect(page.getByTestId('saved-reference-usage')).toContainText('1 saved reference occurrence(s)');
  await expect(page.getByTestId('saved-reference-usage').getByRole('link')).toContainText('QA document / QA topic');
  await page.getByRole('tab', { name: 'Conditional tags', exact: true }).click();
  await page.getByLabel('Reference usage condition value').selectOption('val-a');
  await activate(page, page.getByRole('button', { name: 'Find saved references', exact: true }));
  await expect(page.getByTestId('saved-reference-usage')).toContainText('1 saved reference occurrence(s)');
  await page.goto(projectPath + '/reusable-content');
  await activate(page, page.getByRole('button', { name: 'Find saved references', exact: true }));
  await expect(page.getByTestId('saved-reference-usage')).toContainText('1 saved reference occurrence(s)');
  expect(backend.writes).toEqual([]);
  await noOverflow(page);
});
for (const role of ['reviewer', 'viewer', null] as const) {
  test(`${role ?? 'inherited-admin'}: references remain readable but cannot be inserted or assigned`, async ({ page, backend }) => {
    backend.setRole(role);
    backend.db.topic_drafts[0].content = { type: 'doc', version: 1, content: [{ type: 'paragraph', attrs: { id: 'p-a' }, content: [
      { type: 'variableReference', attrs: { id: 'r-a', refVersion: 1, targetId: 'var-a' } },
      { type: 'variableReference', attrs: { id: 'r-missing', refVersion: 1, targetId: 'not-visible-private-id' } },
    ] }] };
    await login(page, author);
    const body = page.getByTestId('input-topic-body');
    await expect(body).toHaveAttribute('contenteditable', 'false');
    await expect(body).toContainText('ProductName: QA Product');
    await expect(body).toContainText('Variable unavailable');
    await expect(body).not.toContainText('not-visible-private-id');
    for (const name of ['Insert variable', 'Apply condition', 'Remove condition', 'Insert linked content'])
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    expect(backend.writes).toEqual([]);
    await noOverflow(page);
  });
}
test('reference download retry and a stale body save retain semantic recovery without overwriting', async ({ page, backend }) => {
  backend.failures.add('project_variables');
  await login(page, author);
  await expect(page.getByText('Reference definitions are unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Insert variable', exact: true })).toBeDisabled();
  backend.failures.delete('project_variables');
  await activate(page, page.getByRole('button', { name: 'Retry references', exact: true }));
  await page.getByLabel('Variable reference', { exact: true }).selectOption('var-a');
  await page.getByTestId('input-topic-body').click();
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 3');
  // Management interception owns draft PATCH when enabled. Use the existing
  // precise Topic-draft conflict fixture for this isolated concurrency case.
  backend.management.enabled = false;
  backend.conflictNextSave = true;
  await activate(page, page.getByRole('button', { name: 'Insert variable', exact: true }));
  await expect(page.getByTestId('body-save-status')).toContainText('Concurrent-edit conflict');
  await activate(page, page.getByRole('button', { name: 'Reload saved draft', exact: true }));
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toBeVisible();
  await activate(page, page.getByRole('button', { name: 'Restore recovery', exact: true }));
  await expect.poll(() => JSON.stringify(backend.db.topic_drafts[0].content)).toContain('variableReference');
  await expect(page.getByTestId('body-save-status')).toContainText('Saved · revision');
  await noOverflow(page);
});
