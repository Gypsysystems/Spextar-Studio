import type { Page, Locator } from '@playwright/test';
import { test, expect, login, activate, noOverflow, projectPath, bodyContent, type Role, type Backend } from './fixture';

test.beforeEach(({ backend }) => { backend.management.enabled = true; });
async function submit(page: Page) { await activate(page, page.getByRole('dialog').locator('button[type=submit]')); }
async function save(page: Page) {
  await submit(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function disabledOrAbsent(locator: Locator) {
  for (const control of await locator.all()) await expect(control).toBeDisabled();
}
const reusable = (scope = 'project') => ({
  id: scope === 'project' ? 'reuse-a' : 'shared-a', workspace_id: 'ws-a', project_id: scope === 'project' ? 'project-a' : null,
  scope, name: scope === 'project' ? 'QA reusable' : 'Shared reusable', slug: scope === 'project' ? 'qa-reusable' : 'shared-reusable',
  description: null, settings: {}, status: 'draft', update_policy: 'notify', tags: [],
  created_by: 'user-a', created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z',
});

function seedSavedDocument(backend: Backend) {
  const doc = backend.db.documents[0];
  doc.title = 'Acceptance document';
  const first = backend.db.topics[0];
  first.title = 'First topic';
  backend.db.topics = [first];
  backend.db.topic_drafts[0].content = bodyContent('Saved topic body');
  return { doc, first };
}

for (const role of ['admin', 'author'] as const) {
  test(`${role}: Variables create, edit, rename and duplicate survive failures and refresh`, async ({ page, backend }) => {
    backend.setRole(role);
    await login(page, projectPath + '/variables-conditions');
    await activate(page, page.getByTestId('button-new-variable'));
    await page.getByTestId('input-variable-name').fill('ProductChannel');
    await page.getByTestId('input-variable-key').fill('BAD_KEY');
    await submit(page);
    await expect(page.getByTestId('text-variable-form-error')).toBeVisible();
    expect(backend.writes).toHaveLength(0);
    await page.getByTestId('input-variable-key').fill('product_channel');
    await page.getByTestId('input-variable-value').fill('Beta');
    backend.management.failNext = 'project_variables';
    await submit(page);
    await expect(page.getByTestId('text-variable-mutation-error')).toBeVisible();
    await expect(page.getByTestId('input-variable-value')).toHaveValue('Beta');
    await save(page);
    await expect(page.getByTestId('text-variable-name')).toHaveText('ProductChannel');
    const original = backend.db.project_variables.find(v => v.key === 'product_channel')!;
    await activate(page, page.getByTestId('button-edit-variable'));
    await page.getByTestId('input-variable-value').fill('Stable');
    await page.getByTestId('input-variable-output-pdf-manual').fill('PDF Stable');
    await save(page);
    await expect(page.getByTestId('text-output-value-pdf-manual')).toHaveText('PDF Stable');
    await activate(page, page.getByTestId('button-rename-variable'));
    await page.getByTestId('input-identity-name').fill('ReleaseChannel');
    await save(page);
    await expect(page.getByTestId('text-variable-name')).toHaveText('ReleaseChannel');
    expect(original.id).toBe(backend.db.project_variables.find(v => v.name === 'ReleaseChannel')!.id);
    await activate(page, page.getByTestId('button-duplicate-variable'));
    await page.getByTestId('input-identity-name').fill('Channel copy');
    await save(page);
    await expect(page.getByTestId('text-variable-name')).toHaveText('Channel copy');
    const copy = backend.db.project_variables.find(v => v.name === 'Channel copy')!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.value).toBe('Stable');
    expect(copy.output_values).toEqual({ 'pdf-manual': 'PDF Stable' });
    await page.reload();
    await page.getByTestId('input-search-variables').fill('Channel copy');
    await activate(page, page.getByTestId(`card-variable-${copy.id}`));
    await expect(page.getByTestId('text-variable-name')).toHaveText('Channel copy');
    await noOverflow(page);
  });

  test(`${role}: Conditional categories and values keep stable keys, edits and ordering after retry`, async ({ page, backend }) => {
    backend.setRole(role);
    await login(page, projectPath + '/variables-conditions');
    await activate(page, page.getByRole('tab', { name: 'Conditional tags', exact: true }));
    await activate(page, page.getByTestId('button-new-category'));
    await page.getByTestId('input-category-name').fill('Release channel');
    backend.management.failNext = 'condition_categories';
    await submit(page);
    await expect(page.getByTestId('text-condition-mutation-error')).toBeVisible();
    await expect(page.getByTestId('input-category-name')).toHaveValue('Release channel');
    await save(page);
    await expect(page.getByTestId('text-category-name')).toHaveText('Release channel');
    const category = backend.db.condition_categories.find(c => c.name === 'Release channel')!;
    await activate(page, page.getByTestId('button-edit-category'));
    await page.getByTestId('input-category-description').fill('Delivery channel');
    await save(page);
    await expect(page.getByTestId('text-category-description')).toHaveText('Delivery channel');
    await activate(page, page.getByTestId('button-add-value'));
    await page.getByTestId('input-value-name').fill('Beta');
    await save(page);
    const value = backend.db.condition_values.find(v => v.category_id === category.id)!;
    await expect(page.getByTestId(`text-value-name-${value.id}`)).toHaveText('Beta');
    await activate(page, page.getByTestId(`button-edit-value-${value.id}`));
    await page.getByTestId('input-value-name').fill('Preview');
    await page.getByTestId('input-value-order').fill('20');
    await save(page);
    await expect(page.getByTestId(`text-value-order-${value.id}`)).toContainText('20');
    expect(value.key).toBe('beta');
    await activate(page, page.getByTestId(`button-rename-value-${value.id}`));
    await page.getByTestId('input-rename-value-name').fill('Early access');
    await save(page);
    await expect(page.getByTestId(`text-value-name-${value.id}`)).toHaveText('Early access');
    expect(value.key).toBe('beta');
    await activate(page, page.getByTestId('button-rename-category'));
    await page.getByTestId('input-rename-category-name').fill('Channels');
    await save(page);
    await expect(page.getByTestId('text-category-name')).toHaveText('Channels');
    expect(category.key).toBe('release_channel');
    await page.reload();
    await activate(page, page.getByRole('tab', { name: 'Conditional tags', exact: true }));
    await page.getByTestId('input-search-categories').fill('Channels');
    await activate(page, page.getByTestId(`card-category-${category.id}`));
    await expect(page.getByTestId(`text-value-name-${value.id}`)).toHaveText('Early access');
    await expect(page.getByTestId('text-condition-assignment')).toHaveText('Apply or remove values on supported blocks in Author. Inspect saved category references below.');
    await expect(page.getByTestId('saved-reference-usage').getByRole('button', { name: 'Find saved references', exact: true })).toBeVisible();
    await noOverflow(page);
  });

  test(`${role}: Reusable create, metadata, draft autosave, rename and body duplication`, async ({ page, backend }) => {
    backend.setRole(role);
    let releaseEditor!: () => void;
    const editorGate = new Promise<void>(resolve => { releaseEditor = resolve; });
    await page.route('**/assets/structured-editor-*.js', async route => { await editorGate; await route.fallback(); });
    await login(page, projectPath + '/reusable-content');
    await activate(page, page.getByTestId('reusable-new'));
    await page.getByTestId('reusable-field-name').fill('Safety text');
    await page.getByTestId('reusable-field-description').fill('Original description');
    backend.management.failNext = 'reusable_contents';
    await submit(page);
    await expect(page.getByTestId('reusable-mutation-error')).toBeVisible();
    await expect(page.getByTestId('reusable-field-name')).toHaveValue('Safety text');
    await save(page);
    await expect(page.getByTestId('reusable-name')).toHaveText('Safety text');
    const item = backend.db.reusable_contents[0];
    await activate(page, page.getByTestId('reusable-edit'));
    await page.getByTestId('reusable-field-tags').fill('safety, beta');
    await save(page);
    await expect(page.getByTestId('reusable-tags')).toContainText('safety');
    await activate(page, page.getByTestId('reusable-body-open'));
    await expect(page.getByTestId('reusable-body')).toBeVisible();
    await expect(page.getByTestId('reusable-body-status')).toHaveText('Saved');
    releaseEditor();
    const body = page.getByRole('textbox', { name: 'Topic body' });
    await expect(body).toHaveAttribute('contenteditable', 'true');
    await body.fill('Saved reusable safety text');
    await expect(page.getByTestId('reusable-body-status')).toHaveText('Saved');
    await expect(page.getByTestId('reusable-body-revision')).toHaveText('Revision 1');
    expect(backend.db.reusable_content_drafts[0]).toMatchObject({ reusable_content_id: item.id, revision: 1 });
    await activate(page, page.getByTestId('reusable-rename'));
    await page.getByTestId('reusable-field-name').fill('Safety guidance');
    await save(page);
    await expect(page.getByTestId('reusable-name')).toHaveText('Safety guidance');
    expect(item.slug).toBe('safety-text');
    await activate(page, page.getByTestId('reusable-duplicate'));
    await page.getByTestId('reusable-field-name').fill('Safety copy');
    await save(page);
    await expect(page.getByTestId('reusable-name')).toHaveText('Safety copy');
    const copy = backend.db.reusable_contents.find(r => r.name === 'Safety copy')!;
    expect(backend.db.reusable_content_drafts.find(d => d.reusable_content_id === copy.id)?.content)
      .toEqual(backend.db.reusable_content_drafts.find(d => d.reusable_content_id === item.id)?.content);
    await page.reload();
    await activate(page, page.getByTestId(`reusable-card-${copy.id}`));
    await activate(page, page.getByTestId('reusable-body-open'));
    await expect(body).toContainText('Saved reusable safety text');
    await expect(page.getByTestId('reusable-where-used')).toContainText('Only saved drafts in projects you can access are checked. This does not authorize deletion.');
    await expect(page.getByTestId('reusable-where-used').getByRole('button', { name: 'Find saved references', exact: true })).toBeVisible();
    await noOverflow(page);
  });

  test(`${role}: Documents and Topics create with metadata/body autosave and creation retry`, async ({ page, backend }) => {
    backend.setRole(role);
    await login(page, projectPath + '/documents');
    await activate(page, page.getByRole('button', { name: /^Create document$/i }).first());
    await page.getByLabel(/create document title/i).fill('Acceptance document');
    backend.management.failNext = 'rpc/create_document';
    await submit(page);
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await save(page);
    await expect(page).toHaveURL(/author\/controlled-/);
    const doc = backend.db.documents.find(d => d.title === 'Acceptance document')!;
    await activate(page, page.getByRole('button', { name: 'Document metadata', exact: true }));
    const metadata = page.getByRole('dialog');
    await expect(metadata).toContainText('Topic bodies autosave separately in Author');
    await metadata.getByLabel('Document description', { exact: true }).fill('Saved acceptance metadata');
    await expect.poll(() => doc.description).toBe('Saved acceptance metadata');
    await activate(page, metadata.getByRole('button', { name: 'Close', exact: true }));
    await expect(metadata).toHaveCount(0);
    await activate(page, page.getByRole('button', { name: /^Create topic$/i }).first());
    await page.getByLabel(/create topic title/i).fill('First topic');
    await save(page);
    const first = backend.db.topics.find(t => t.document_id === doc.id)!;
    await expect(page.getByTestId(`outline-topic-${first.id}`)).toBeVisible();
    const body = page.getByRole('textbox', { name: 'Topic body' });
    await expect(body).toHaveAttribute('contenteditable', 'true');
    await body.fill('Saved topic body');
    await expect(page.getByTestId('body-save-status')).toContainText('Saved · revision 1');
    await noOverflow(page);
    expect(backend.management.probes).toEqual([]);
  });

  test(`${role}: Documents and Topics hierarchy, reorder, Promote/Demote and metadata autosave`, async ({ page, backend }) => {
    backend.setRole(role);
    const { doc, first } = seedSavedDocument(backend);
    await login(page, projectPath + '/author/' + doc.id);
    await activate(page, page.getByRole('button', { name: /^Create topic$/i }).first());
    await page.getByLabel(/create topic title/i).fill('Second topic');
    // Author deliberately defaults new Topics beneath the selected Topic.
    await page.getByLabel('Parent topic', { exact: true }).selectOption('');
    await save(page);
    const second = backend.db.topics.find(t => t.document_id === doc.id && t.id !== first.id)!;
    await activate(page, page.getByTestId(`outline-topic-${second.id}`));
    await activate(page, page.getByTestId('button-demote'));
    await expect.poll(() => second.parent_topic_id).toBe(first.id);
    await activate(page, page.getByTestId('button-promote'));
    await expect.poll(() => second.parent_topic_id).toBeNull();
    await activate(page, page.getByRole('button', { name: /^Move topic$/i }));
    await page.getByLabel('Sibling sort order', { exact: true }).fill('0');
    await save(page);
    await expect.poll(() => second.sort_order).toBe(0);
    await page.getByTestId('input-topic-title').fill('Renamed second');
    await expect.poll(() => second.title).toBe('Renamed second');
    await noOverflow(page);
    expect(backend.management.probes).toEqual([]);
  });

  // Keep independent user journeys within the unchanged per-test deadline.
  // Seed only the starting saved state; every duplication/deletion still uses the UI.
  test(`${role}: Documents and Topics duplication, copied drafts and confirmed safe deletion`, async ({ page, backend }) => {
    backend.setRole(role);
    const { doc, first } = seedSavedDocument(backend);
    first.sort_order = 1;
    const second = { ...first, id: 'topic-b', title: 'Renamed second', slug: 'renamed-second', sort_order: 0 };
    backend.db.topics = [first, second];
    await login(page, projectPath + '/author/' + doc.id);
    await activate(page, page.getByTestId(`outline-topic-${second.id}`));
    await activate(page, page.getByRole('button', { name: /^Duplicate topic subtree$/i }));
    await page.getByLabel(/duplicate topic subtree title/i).fill('Topic copy');
    await save(page);
    await expect.poll(() => backend.db.topics.some(t => t.title === 'Topic copy')).toBe(true);
    await activate(page, page.getByRole('button', { name: /^Duplicate document$/i }));
    await page.getByLabel(/duplicate document title/i).fill('Document copy');
    await save(page);
    const copy = backend.db.documents.find(d => d.title === 'Document copy')!;
    await expect(page).toHaveURL(new RegExp('/author/' + copy.id + '$'));
    expect(backend.db.topics.filter(t => t.document_id === copy.id)).toHaveLength(3);
    expect(backend.db.topic_drafts.some(d => d.topic_id !== first.id && JSON.stringify(d.content).includes('Saved topic body'))).toBe(true);
    await activate(page, page.getByRole('button', { name: /^Delete document$/i }));
    let deletion = page.getByRole('dialog');
    await expect(deletion).toContainText('Only empty documents can be deleted');
    await expect(deletion.getByRole('button', { name: /^Delete document$/i })).toBeDisabled();
    await activate(page, deletion.getByRole('button', { name: 'Cancel', exact: true }));
    await expect(deletion).toHaveCount(0);
    const leaf = backend.db.topics.find(t => t.document_id === copy.id && t.title === 'Topic copy')!;
    await activate(page, page.getByTestId(`outline-topic-${leaf.id}`));
    await activate(page, page.getByRole('button', { name: /^Delete topic$/i }));
    deletion = page.getByRole('dialog');
    await deletion.getByRole('textbox').fill(String(leaf.title));
    backend.management.failNext = 'topics'; backend.management.denyNext = true;
    await activate(page, deletion.getByRole('button', { name: /^Delete topic$/i }));
    await expect(deletion.getByRole('alert')).toBeVisible();
    expect(backend.db.topics.some(t => t.id === leaf.id)).toBe(true);
    await activate(page, deletion.getByRole('button', { name: /^Delete topic$/i }));
    await expect(deletion).toHaveCount(0);
    expect(backend.db.topics.some(t => t.id === leaf.id)).toBe(false);
    expect(backend.db.topics.some(t => t.id === first.id)).toBe(true);
    await noOverflow(page);
    expect(backend.management.probes).toEqual([]);
  });

  test(`${role}: Documents and Topics empty-document deletion requires explicit confirmation`, async ({ page, backend }) => {
    backend.setRole(role);
    // Empty-document deletion only: no test grants a cascading-delete contract.
    await login(page, projectPath + '/documents');
    await activate(page, page.getByRole('button', { name: /^Create document$/i }).first());
    await page.getByLabel(/create document title/i).fill('Disposable empty document');
    await save(page);
    await activate(page, page.getByRole('button', { name: /^Delete document$/i }));
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: /^Delete document$/i })).toBeDisabled();
    await dialog.getByRole('textbox').fill('Disposable empty document');
    await activate(page, dialog.getByRole('button', { name: /^Delete document$/i }));
    await expect(page).toHaveURL(projectPath + '/documents');
    expect(backend.db.documents.some(d => d.title === 'Disposable empty document')).toBe(false);
    expect(backend.management.probes).toEqual([]);
  });
}

for (const role of ['reviewer', 'viewer', null] satisfies Role[]) {
  test(`${role ?? 'inherited workspace admin'}: content management is read-only without explicit project authoring`, async ({ page, backend }) => {
    backend.setRole(role);
    backend.db.reusable_contents = [reusable()];
    await login(page, projectPath + '/documents');
    await expect(page.getByText('QA document', { exact: true }).first()).toBeVisible();
    await disabledOrAbsent(page.getByRole('button', { name: /^Create document$/i }));
    await page.goto(projectPath + '/author/doc-a');
    for (const id of ['button-promote', 'button-demote']) await expect(page.getByTestId(id)).toBeDisabled();
    await disabledOrAbsent(page.getByRole('button', { name: /^(Create topic|Duplicate document|Delete topic)$/i }));
    await page.goto(projectPath + '/variables-conditions');
    for (const id of ['button-new-variable', 'button-edit-variable', 'button-rename-variable', 'button-duplicate-variable'])
      await expect(page.getByTestId(id)).toBeDisabled();
    await activate(page, page.getByRole('tab', { name: 'Conditional tags', exact: true }));
    for (const id of ['button-new-category', 'button-add-value', 'button-edit-category', 'button-rename-category'])
      await expect(page.getByTestId(id)).toBeDisabled();
    await page.goto(projectPath + '/reusable-content');
    await expect(page.getByTestId('reusable-name')).toHaveText('QA reusable');
    for (const id of ['reusable-edit', 'reusable-rename', 'reusable-duplicate']) await expect(page.getByTestId(id)).toBeDisabled();
    expect(backend.writes).toHaveLength(0);
    expect(backend.management.probes).toEqual([]);
    await noOverflow(page);
  });
}

test('reusable body errors recover after refresh, reject stale revisions and preserve the local copy', async ({ page, backend }) => {
  backend.db.reusable_contents = [reusable()];
  backend.db.reusable_content_drafts = [{ reusable_content_id: 'reuse-a', content: bodyContent('Original reusable body'), revision: 2, updated_at: '2026-10-27T10:00:00Z', updated_by: 'user-a' }];
  await login(page, projectPath + '/reusable-content');
  await activate(page, page.getByTestId('reusable-body-open'));
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(body).toContainText('Original reusable body');
  backend.management.failNext = 'reusable_content_drafts';
  await body.fill('Local reusable recovery');
  await expect(page.getByTestId('reusable-body-status')).toHaveText('Save failed');
  await page.reload();
  await activate(page, page.getByTestId('reusable-body-open'));
  await expect(page.getByTestId('reusable-body-recovery')).toBeVisible();
  await expect(body).toContainText('Original reusable body');
  backend.management.raceDraft = true;
  await activate(page, page.getByTestId('reusable-body-recovery-restore'));
  await expect(page.getByTestId('reusable-body-status')).toContainText(/conflict/i);
  expect(backend.db.reusable_content_drafts[0].revision).toBe(3);
  expect(JSON.stringify(backend.db.reusable_content_drafts[0].content)).toContain('Original reusable body');
  await activate(page, page.getByTestId('reusable-body-reload'));
  await expect(page.getByTestId('reusable-body-recovery')).toBeVisible();
  await activate(page, page.getByTestId('reusable-body-recovery-discard'));
  await expect(body).toContainText('Original reusable body');
  await noOverflow(page);
});

test('workspace administration can edit shared reusable items but not project-scoped items', async ({ page, backend }) => {
  backend.setRole(null);
  backend.db.reusable_contents = [reusable(), reusable('workspace')];
  await login(page, projectPath + '/reusable-content');
  await activate(page, page.getByTestId('reusable-card-reuse-a'));
  await expect(page.getByTestId('reusable-edit')).toBeDisabled();
  await activate(page, page.getByTestId('reusable-card-shared-a'));
  await expect(page.getByTestId('reusable-edit')).toBeEnabled();
  await activate(page, page.getByTestId('reusable-rename'));
  await page.getByTestId('reusable-field-name').fill('Updated shared title');
  await save(page);
  await expect(page.getByTestId('reusable-name')).toHaveText('Updated shared title');
  expect(backend.writes).toHaveLength(1);
  await page.reload();
  await activate(page, page.getByTestId('reusable-card-shared-a'));
  await expect(page.getByTestId('reusable-name')).toHaveText('Updated shared title');
  await noOverflow(page);
});
