import { test, expect, login, activate, noOverflow, projectPath } from './fixture';
import { accessible, tabTo, trapped, visibleFocus, inputBoundaryContrast } from './accessibility-helpers';

const screens = [
  ['Workspaces', '/workspaces', 'card-workspace-ws-a'],
  ['Projects', '/workspaces/ws-a/projects', 'input-search-projects'],
  ['Project Home', projectPath, 'nav-home'],
  ['Documents', projectPath + '/documents', 'input-search-documents'],
  ['Author', projectPath + '/author/doc-a', 'input-topic-body'],
  ['Review', projectPath + '/review', 'review-draft-revision'],
  ['Variables', projectPath + '/variables-conditions', 'text-variable-default'],
  ['Conditions', projectPath + '/variables-conditions', 'text-category-name', 'Conditional tags'],
  ['Output Preview', projectPath + '/variables-conditions', 'text-preview-resolved-var-a', 'Output preview'],
  ['Reusable Content', projectPath + '/reusable-content', 'reusable-name'],
  ['Project Settings', projectPath + '/settings', 'input-name'],
] as const;

test.beforeEach(({ backend }) => {
  backend.management.enabled = true;
  backend.setRole('admin');
  backend.db.workspace_members[0].role = 'admin';
  backend.db.reusable_contents = [{
    id: 'reuse-a', workspace_id: 'ws-a', project_id: 'project-a', scope: 'project',
    name: 'QA reusable', slug: 'qa-reusable', description: null, settings: {},
    status: 'draft', update_policy: 'notify', tags: [], created_by: 'user-a',
    created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z',
  }];
});

test('Sign in exposes associated fields, usable keyboard focus and accessible semantics', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to SPEXTAR' })).toBeVisible();
  await inputBoundaryContrast(page.getByLabel('Work email', { exact: true }));
  await inputBoundaryContrast(page.getByLabel('Password', { exact: true }));
  await tabTo(page, page.getByLabel('Work email', { exact: true }));
  await visibleFocus(page.getByLabel('Work email', { exact: true }));
  await page.keyboard.type('user-a@example.test');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.type('synthetic-password-not-a-real-credential');
  await accessible(page);
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('button-sign-in')).toBeFocused();
  await visibleFocus(page.getByTestId('button-sign-in'));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('card-workspace-ws-a')).toBeVisible();
  await noOverflow(page);
});

for (const [name, path, marker, tab] of screens) {
  test(`${name}: named landmarks, controls and contrast`, async ({ page, backend }) => {
    await login(page, path);
    if (tab) await activate(page, page.getByRole('tab', { name: tab, exact: true }));
    if (name === 'Project Home') {
      await expect(page.getByRole('heading', { level: 1, name: 'Project A', exact: true })).toBeVisible();
    } else {
      await expect(page.getByTestId(marker)).toBeVisible();
    }
    if (name === 'Author' || name === 'Review') {
      await expect(page.getByRole('textbox', { name: 'Topic body', exact: true })).toBeVisible();
    }
    if (name === 'Reusable Content') {
      await activate(page, page.getByTestId('reusable-body-open'));
      await expect(page.getByRole('textbox', { name: 'Topic body', exact: true })).toBeVisible();
    }
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb', exact: true })).toBeVisible();
    await accessible(page);
    await noOverflow(page);
    expect(backend.writes).toHaveLength(0);
  });
}

for (const [name, route, trigger] of [
  ['Document', '/documents', 'button-create-document'],
  ['Variable', '/variables-conditions', 'button-new-variable'],
  ['Category', '/variables-conditions', 'button-new-category'],
  ['Condition value', '/variables-conditions', 'button-add-value'],
  ['Reusable', '/reusable-content', 'reusable-new'],
] as const) {
  test(`${name} dialog: labels, accessible name, bidirectional focus trap and keyboard restoration`, async ({ page, backend }) => {
    await login(page, projectPath + route);
    if (name === 'Category' || name === 'Condition value') {
      await activate(page, page.getByRole('tab', { name: 'Conditional tags', exact: true }));
      await expect(page.getByTestId('text-category-name')).toBeVisible();
    }
    const opener = name === 'Document'
      ? page.getByRole('button', { name: /^Create document$/i })
      : page.getByTestId(trigger);
    await expect(opener).toBeEnabled();
    await tabTo(page, opener);
    await visibleFocus(opener);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(/.+/);
    await expect(dialog).toHaveAccessibleDescription(/.+/);
    await accessible(page);
    await trapped(page, dialog);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await visibleFocus(opener);
    expect(backend.writes).toHaveLength(0);
    await noOverflow(page);
  });
}

test('skip link and responsive navigation support keyboard-only access and modal escape', async ({ page, backend }) => {
  await login(page, projectPath + '/documents');
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  await tabTo(page, skip);
  await visibleFocus(skip);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const mobile = page.getByTestId('button-open-mobile-nav');
  if (await mobile.isVisible()) {
    await tabTo(page, mobile);
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Navigation', exact: true });
    await expect(drawer).toBeVisible();
    await accessible(page);
    await trapped(page, drawer);
    await page.keyboard.press('Escape');
    await expect(mobile).toBeFocused();
  } else {
    const collapse = page.getByTestId('button-toggle-nav');
    await tabTo(page, collapse);
    await visibleFocus(collapse);
    await page.keyboard.press('Enter');
    await expect(collapse).toHaveAccessibleName('Expand navigation');
    await accessible(page);
  }
  expect(backend.writes).toHaveLength(0);
});

test('administration confirmation has an accessible alertdialog and returns keyboard focus without executing it', async ({ page, backend }) => {
  await login(page, projectPath + '/settings');
  const archive = page.getByTestId('button-archive');
  await expect(archive).toBeEnabled();
  await tabTo(page, archive);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toHaveAccessibleName(/archive/i);
  await expect(dialog).toHaveAccessibleDescription(/.+/);
  await accessible(page);
  await trapped(page, dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(archive).toBeFocused();
  await visibleFocus(archive);
  expect(backend.writes).toHaveLength(0);
});

test('enabled destructive confirmation meets contrast and keyboard semantics without deleting data', async ({ page, backend }) => {
  backend.db.topics = [];
  backend.db.topic_drafts = [];
  // Document actions live in Author's properties panel on mobile as well.
  await login(page, projectPath + '/author/doc-a');
  const opener = page.getByRole('button', { name: /^Delete document$/i });
  await expect(opener).toBeEnabled();
  await tabTo(page, opener);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName(/delete/i);
  await expect(dialog).toHaveAccessibleDescription(/.+/);
  await dialog.getByRole('textbox').fill(String(backend.db.documents[0].title));
  await expect(dialog.getByRole('button', { name: /^Delete document$/i })).toBeEnabled();
  await accessible(page);
  await trapped(page, dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(backend.writes).toHaveLength(0);
});

test('loading, error/retry, empty and missing-resource states retain accessible semantics', async ({ page, backend }) => {
  const workspaces = backend.db.workspaces;
  const release = backend.hold('workspaces');
  await login(page);
  await expect(page.getByRole('status', { name: 'Loading', exact: true }).first()).toBeVisible();
  await accessible(page);
  release();
  await expect(page.getByTestId('card-workspace-ws-a')).toBeVisible();
  backend.failures.add('workspaces');
  await page.reload();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await accessible(page);
  backend.failures.delete('workspaces');
  const retry = page.getByRole('button', { name: 'Retry', exact: true }).first();
  await tabTo(page, retry);
  await visibleFocus(retry);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('card-workspace-ws-a')).toBeVisible();
  backend.db.workspaces = [];
  await page.reload();
  await expect(page.getByTestId('state-empty')).toBeVisible();
  await accessible(page);
  backend.db.workspaces = workspaces;
  await page.goto('/workspaces/ws-a/projects/missing/documents');
  await expect(page.getByTestId('state-not-found')).toBeVisible();
  await accessible(page);
  expect(backend.writes).toHaveLength(0);
});
