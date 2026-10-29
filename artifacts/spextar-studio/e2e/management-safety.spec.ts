import type { Page } from '@playwright/test';
import { test, expect, login, activate, noOverflow, projectPath, bodyContent, recoveryPrefix } from './fixture';

test.beforeEach(({ backend }) => { backend.management.enabled = true; });

async function submit(page: Page) {
  await activate(page, page.getByRole('dialog').locator('button[type=submit]'));
}
async function save(page: Page) {
  await submit(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
function reusable() {
  return {
    id: 'reuse-a', workspace_id: 'ws-a', project_id: 'project-a', scope: 'project',
    name: 'QA reusable', slug: 'qa-reusable', description: null, settings: {},
    status: 'draft', update_policy: 'notify', tags: [], created_by: 'user-a',
    created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z',
  };
}

const managementCases = [
  { name: 'Variables', table: 'project_variables', path: '/variables-conditions', tab: null,
    opener: 'button-edit-variable', field: 'input-variable-value', error: 'text-variable-mutation-error',
    marker: 'text-variable-name', readonly: 'button-new-variable' },
  { name: 'Conditions', table: 'condition_categories', path: '/variables-conditions', tab: 'Conditional tags',
    opener: 'button-edit-category', field: 'input-category-description', error: 'text-condition-mutation-error',
    marker: 'text-category-name', readonly: 'button-new-category' },
  { name: 'Reusable Content', table: 'reusable_contents', path: '/reusable-content', tab: null,
    opener: 'reusable-edit', field: 'reusable-field-description', error: 'reusable-mutation-error',
    marker: 'reusable-name', readonly: 'reusable-new' },
] as const;

for (const scenario of managementCases) {
  test(`${scenario.name}: permission revoked after opening a form never persists its retained edit`, async ({ page, backend }) => {
    backend.db.reusable_contents = [reusable()];
    await login(page, projectPath + scenario.path);
    if (scenario.tab) await activate(page, page.getByRole('tab', { name: scenario.tab, exact: true }));
    await expect(page.getByTestId(scenario.marker)).toBeVisible();
    await activate(page, page.getByTestId(scenario.opener));
    await page.getByTestId(scenario.field).fill('Retained unauthorized edit');
    const original = structuredClone(backend.db[scenario.table]);
    // The UI legitimately holds the previously loaded authoring permission.
    // Fresh service authorization / the controlled denied response must win.
    backend.setRole('viewer');
    await submit(page);
    await expect(page.getByTestId(scenario.error)).toBeVisible();
    await expect(page.getByTestId(scenario.field)).toHaveValue('Retained unauthorized edit');
    expect(backend.db[scenario.table]).toEqual(original);
    expect(backend.writes.every(w => w.table === scenario.table && w.method === 'PATCH')).toBe(true);
    await activate(page, page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }));
    await page.reload();
    if (scenario.tab) await activate(page, page.getByRole('tab', { name: scenario.tab, exact: true }));
    await expect(page.getByTestId(scenario.marker)).toBeVisible();
    await expect(page.getByTestId(scenario.readonly)).toBeDisabled();
    expect(backend.db[scenario.table]).toEqual(original);
    await noOverflow(page);
  });

  test(`${scenario.name}: malformed backend data fails closed and explicit retry restores real data`, async ({ page, backend }) => {
    backend.db.reusable_contents = [reusable()];
    const original = structuredClone(backend.db[scenario.table][0]);
    const malformed = scenario.table === 'project_variables' ? { value: { unsupported: true } }
      : scenario.table === 'condition_categories' ? { unassigned_behavior: 'invented' } : { settings: [] };
    Object.assign(backend.db[scenario.table][0], malformed);
    await login(page, projectPath + scenario.path);
    if (scenario.tab) await activate(page, page.getByRole('tab', { name: scenario.tab, exact: true }));
    const retry = page.getByRole('button', { name: 'Retry', exact: true });
    await expect(retry).toBeVisible();
    await expect(page.getByTestId(scenario.marker)).toHaveCount(0);
    backend.db[scenario.table][0] = original;
    await activate(page, retry);
    await expect(page.getByTestId(scenario.marker)).toHaveText(String(original.name));
    expect(backend.writes).toHaveLength(0);
    expect(backend.scripts.some(url => /\/(?:author|structured-editor)-/.test(url))).toBe(false);
    await noOverflow(page);
  });
}

test('topic move failures preserve the existing tree; retry refreshes hierarchy and survives reload', async ({ page, backend }) => {
  await login(page, projectPath + '/author/doc-a');
  await activate(page, page.getByTestId('outline-topic-topic-b'));
  await activate(page, page.getByRole('button', { name: /^Move topic$/i }));
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Parent topic', { exact: true }).selectOption('');
  await dialog.getByLabel('Sibling sort order', { exact: true }).fill('0');
  const original = structuredClone(backend.db.topics);
  for (const denied of [false, true]) {
    backend.management.failNext = 'rpc/move_topic';
    backend.management.denyNext = denied;
    await submit(page);
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByLabel('Sibling sort order', { exact: true })).toHaveValue('0');
    expect(backend.db.topics).toEqual(original);
    await noOverflow(page);
  }
  await save(page);
  expect(backend.db.topics.find(t => t.id === 'topic-b')).toMatchObject({ parent_topic_id: null, sort_order: 0 });
  expect(backend.writes).toHaveLength(3);
  expect(backend.writes.map(w => ({ table: w.table, method: w.method, body: w.body }))).toEqual(
    Array.from({ length: 3 }, () => ({
      table: 'rpc/move_topic', method: 'POST',
      body: { p_topic_id: 'topic-b', p_new_parent_topic_id: null, p_new_sort_order: 0 },
    })),
  );
  expect(backend.management.probes).toEqual([]);
  const outline = page.locator('[data-testid^="outline-topic-"]');
  await expect(outline.first()).toContainText('Child topic');
  await page.reload();
  await expect(outline).toHaveCount(2);
  await expect(outline.first()).toContainText('Child topic');
  await expect(outline.last()).toContainText('QA topic');
  await noOverflow(page);
});

test('stale reusable metadata cannot overwrite another edit; explicit reload permits a fresh save', async ({ page, backend }) => {
  backend.db.reusable_contents = [reusable()];
  await login(page, projectPath + '/reusable-content');
  await activate(page, page.getByTestId('reusable-edit'));
  await page.getByTestId('reusable-field-description').fill('Retained stale description');
  Object.assign(backend.db.reusable_contents[0], {
    name: 'Remote reusable', description: 'Remote description', updated_at: '2026-10-27T10:00:01.000Z',
  });
  const remote = structuredClone(backend.db.reusable_contents[0]);
  await submit(page);
  await expect(page.getByTestId('reusable-mutation-error')).toBeVisible();
  await expect(page.getByTestId('reusable-field-description')).toHaveValue('Retained stale description');
  expect(backend.db.reusable_contents[0]).toEqual(remote);
  await activate(page, page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }));
  await page.reload();
  await expect(page.getByTestId('reusable-name')).toHaveText('Remote reusable');
  await activate(page, page.getByTestId('reusable-edit'));
  await expect(page.getByTestId('reusable-field-description')).toHaveValue('Remote description');
  await page.getByTestId('reusable-field-description').fill('Reviewed remote value');
  await save(page);
  await expect(page.getByText('Reviewed remote value', { exact: true })).toBeVisible();
  const write = backend.writes.at(-1)!;
  expect(write).toMatchObject({ table: 'reusable_contents', method: 'PATCH' });
  expect(new URLSearchParams(write.query).get('updated_at')).toBe(`eq.${remote.updated_at}`);
  expect(backend.db.reusable_contents[0].description).toBe('Reviewed remote value');
  await noOverflow(page);
});

test('Output Preview keeps required-default findings honest across override, fallback, search and retry', async ({ page, backend }) => {
  backend.setRole('admin'); // Even an administrator may not mutate in this preview.
  Object.assign(backend.db.project_variables[0], { required: true, value: '',
    output_values: { 'pdf-manual': 'PDF assigned', 'word-review': '' } });
  backend.db.project_variables.push({ ...structuredClone(backend.db.project_variables[0]),
    id: 'var-b', name: 'ReleaseChannel', key: 'release_channel', required: false, value: 'Beta', output_values: {} });
  await login(page, projectPath + '/variables-conditions');
  const openPreview = () => activate(page, page.getByRole('tab', { name: 'Output preview', exact: true }));
  await openPreview();
  await expect(page.getByTestId('text-preview-validation')).toContainText('1 issue');
  await expect(page.getByTestId('text-preview-missing-required-var-a')).toBeVisible();
  await page.getByTestId('select-output-preview').selectOption('pdf-manual');
  await expect(page.getByTestId('text-preview-resolved-var-a')).toHaveText('PDF assigned');
  await expect(page.getByTestId('status-preview-source-var-a')).toHaveText('Output override');
  await expect(page.getByTestId('text-preview-missing-required-var-a')).toBeVisible();
  await page.getByTestId('select-output-preview').selectOption('word-review');
  await expect(page.getByTestId('text-preview-resolved-var-a')).toHaveText('Empty');
  await expect(page.getByTestId('status-preview-source-var-a')).toHaveText('Default value');
  await expect(page.getByTestId('text-preview-resolved-var-b')).toHaveText('Beta');
  await page.getByTestId('input-search-output-preview').fill('release_channel');
  await expect(page.getByTestId('card-preview-variable-var-a')).toHaveCount(0);
  await expect(page.getByTestId('card-preview-variable-var-b')).toBeVisible();
  await page.getByTestId('input-search-output-preview').fill('not-a-variable');
  await activate(page, page.getByTestId('button-clear-output-preview-search'));
  await expect(page.getByTestId('card-preview-variable-var-a')).toBeVisible();
  await noOverflow(page);
  backend.failures.add('project_variables');
  await page.reload();
  await openPreview();
  const list = page.getByTestId('panel-output-preview-list');
  await expect(list.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByTestId('card-preview-variable-var-a')).toHaveCount(0);
  backend.failures.delete('project_variables');
  await activate(page, list.getByRole('button', { name: 'Retry', exact: true }));
  await expect(page.getByTestId('text-preview-validation')).toContainText('1 issue');
  await expect(page.getByTestId('text-preview-resolved-var-b')).toHaveText('Beta');
  expect(backend.writes).toHaveLength(0);
  await noOverflow(page);
});

test('Topic recovery is isolated across navigation and clears only the restored or discarded Topic', async ({ page, backend }) => {
  await login(page, projectPath + '/author/doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body', exact: true });
  await expect(body).toContainText('Current saved QA topic');
  backend.management.failNext = 'topic_drafts';
  await body.press('ControlOrMeta+End');
  await page.keyboard.type(' unsaved first marker');
  await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
  await activate(page, page.getByTestId('outline-topic-topic-b'));
  await expect(page.getByTestId('body-save-status')).toHaveText('No saved body yet');
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toHaveCount(0);
  await expect(body).not.toContainText('unsaved first marker');
  backend.management.failNext = 'topic_drafts';
  await body.fill('Child recovery only');
  await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
  const recoveryKeys = () => page.evaluate(prefix => Object.keys(localStorage).filter(k => k.startsWith(prefix)), recoveryPrefix);
  expect(await recoveryKeys()).toHaveLength(2);
  await page.reload();
  // Author intentionally defaults to the first Topic after document-route reload.
  await activate(page, page.getByTestId('outline-topic-topic-b'));
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toBeVisible();
  await activate(page, page.getByRole('button', { name: 'Restore recovery', exact: true }));
  await expect(body).toContainText('Child recovery only');
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 1');
  expect(await recoveryKeys()).toHaveLength(1);
  expect(backend.db.topic_drafts.find(d => d.topic_id === 'topic-a')).toMatchObject({ revision: 3, content: bodyContent() });
  await activate(page, page.getByTestId('outline-topic-topic-a'));
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toBeVisible();
  await expect(body).toContainText('Current saved QA topic');
  await expect(body).not.toContainText('Child recovery only');
  await activate(page, page.getByRole('button', { name: 'Discard recovery', exact: true }));
  expect(await recoveryKeys()).toHaveLength(0);
  expect(backend.db.topic_drafts.find(d => d.topic_id === 'topic-b')).toMatchObject({ revision: 1 });
  await noOverflow(page);
});

test('Review keeps submitted content and revisions after working content changes', async ({ page, backend }) => {
  backend.setRole('admin');
  await login(page, projectPath + '/author/doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body', exact: true });
  await expect(body).toContainText('Current saved QA topic');
  await body.press('ControlOrMeta+End');
  await page.keyboard.type(' persisted for inspection');
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 4');
  expect(backend.writes).toHaveLength(1);
  backend.captureReview();
  await page.goto(projectPath + '/review');
  await expect(body).toContainText('persisted for inspection');
  await expect(body).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByTestId('review-draft-revision')).toHaveText('4');
  await body.focus();
  await page.keyboard.type('FORBIDDEN');
  await expect(body).not.toContainText('FORBIDDEN');
  Object.assign(backend.db.topic_drafts[0], {
    content: bodyContent('Latest saved inspection body'), revision: 5, updated_at: '2026-10-28T00:00:00Z',
  });
  await activate(page, page.getByRole('button', { name: 'Refresh', exact: true }));
  await expect(body).toContainText('persisted for inspection');
  await expect(page.getByTestId('review-draft-revision')).toHaveText('4');
  await activate(page, page.getByTestId('review-topic-topic-b'));
  await expect(page.getByTestId('review-draft-missing')).toBeVisible();
  await expect(page.getByTestId('review-draft-revision')).toHaveCount(0);
  expect(backend.writes).toHaveLength(1); // Only the earlier Author autosave.
  await noOverflow(page);
});
