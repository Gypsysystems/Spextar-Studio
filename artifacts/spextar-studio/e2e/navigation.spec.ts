import { test, expect, login, navigate, activate, signOut, noOverflow, projectPath, authKey, recoveryPrefix } from './fixture';

test('protected deep link, invalid credentials, restoration, offline sign-out and identity teardown', async ({ page, backend }) => {
  await page.goto(projectPath + '/author/doc-a');
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(projectPath + '/author/doc-a');
  backend.invalidLogin = true;
  await page.getByTestId('input-email').fill('user-a@example.test');
  await page.getByTestId('input-password').fill('synthetic-not-real');
  await activate(page, page.getByTestId('button-sign-in'));
  await expect(page.getByTestId('auth-error')).toBeVisible();
  await expect(page.getByTestId('input-password')).toHaveValue('');
  backend.invalidLogin = false;
  await page.getByTestId('input-password').fill('synthetic-not-real');
  await activate(page, page.getByTestId('button-sign-in'));
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(body).toContainText('Current saved QA topic');
  await page.reload();
  await expect(body).toContainText('Current saved QA topic');
  await expect(page.getByTestId('button-sign-in')).toHaveCount(0);
  backend.failDraftWrites = true;
  await body.press('ControlOrMeta+End');
  await page.keyboard.type(' local unsaved writer A');
  await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
  await expect.poll(() => page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length, recoveryPrefix)).toBeGreaterThan(0);
  backend.offlineLogout = true;
  await signOut(page);
  expect(new URL(page.url()).search).toBe('');
  expect(await page.evaluate(key => localStorage.getItem(key), authKey)).toBeNull();
  expect(await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)), recoveryPrefix)).toEqual([]);
  await page.reload();
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  backend.failDraftWrites = false;
  backend.setIdentity('user-b');
  backend.db.topic_drafts[0].content = { type: 'doc', version: 1, content: [
    { type: 'paragraph', attrs: { id: 'b' }, content: [{ type: 'text', text: 'Writer B saved body' }] },
  ] };
  await login(page);
  await page.goto(projectPath + '/author/doc-a');
  await expect(body).toContainText('Writer B saved body');
  await expect(body).not.toContainText('writer A');
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toHaveCount(0);
});

test('workspace/project navigation, mobile drawer, collapse preference, theme and responsive routes', async ({ page, theme }) => {
  await login(page);
  await expect(page.getByTestId('card-workspace-ws-a')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
  const mobile = await page.getByTestId('button-open-mobile-nav').isVisible();
  if (!mobile) {
    await activate(page, page.getByTestId('button-toggle-nav'));
    await expect(page.getByTestId('button-toggle-nav')).toHaveAttribute('aria-label', 'Expand navigation');
    await page.reload();
    await expect(page.getByTestId('button-toggle-nav')).toHaveAttribute('aria-label', 'Expand navigation');
    await activate(page, page.getByTestId('button-toggle-nav'));
  }
  await activate(page, page.getByTestId('card-workspace-ws-a'));
  await activate(page, page.getByRole('link', { name: /Project A/ }).first());
  await expect(page.getByRole('heading', { name: 'Project A', exact: true })).toBeVisible();
  await navigate(page, 'nav-documents');
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Workspace A');
  await noOverflow(page);
  for (const [path, marker] of [
    ['variables-conditions', 'text-variable-default'], ['reusable-content', 'reusable-page'], ['settings', 'project-settings-page'],
  ]) {
    await page.goto(projectPath + '/' + path);
    await expect(page.getByTestId(marker)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId(marker)).toBeVisible();
    await noOverflow(page);
  }
  await signOut(page);
  await page.reload();
  await expect(page.getByTestId('button-sign-in')).toBeEnabled();
});

test('loading, scoped error/retry, honest empty and missing states, unavailable routes', async ({ page, backend }) => {
  await login(page);
  await expect(page.getByTestId('card-workspace-ws-a')).toBeVisible();
  const release = backend.hold('workspaces');
  await page.reload();
  await expect(page.getByLabel('Loading', { exact: true }).first()).toBeVisible();
  release();
  await expect(page.getByTestId('card-workspace-ws-a')).toBeVisible();
  backend.failures.add('project_variables');
  await page.goto(projectPath + '/variables-conditions');
  await expect(page.getByText('Variables did not load', { exact: true })).toBeVisible();
  await expect(page.getByTestId('text-variable-default')).toHaveCount(0);
  backend.failures.delete('project_variables');
  await activate(page, page.getByRole('button', { name: 'Retry', exact: true }));
  await expect(page.getByTestId('text-variable-default')).toBeVisible();
  backend.db.projects = [];
  await page.goto('/workspaces/ws-a/projects');
  await expect(page.getByText('No projects in this workspace', { exact: true })).toBeVisible();
  const imports = page.getByRole('button', { name: 'Import project', exact: true });
  await expect(imports).toHaveCount(2);
  for (const button of await imports.all()) await expect(button).toBeDisabled();
  await noOverflow(page);
  await page.goto('/workspaces/missing/projects');
  await expect(page.getByTestId('state-not-found')).toBeVisible();
  await page.goto('/not-a-real-route');
  await expect(page.getByTestId('state-not-found')).toBeVisible();
  expect(backend.writes).toHaveLength(0);
});

test('unfinished features remain honest placeholders without executable workflows', async ({ page, backend }) => {
  await login(page);
  for (const section of ['publish', 'style-guide', 'history', 'brand-outputs']) {
    await page.goto(projectPath + '/' + section);
    await expect(page.getByText('Route-ready placeholder', { exact: true })).toBeVisible();
    await expect(page.locator('main')).toContainText('not implemented');
    await page.reload();
    await expect(page.getByText('Route-ready placeholder', { exact: true })).toBeVisible();
    await noOverflow(page);
  }
  expect(backend.writes).toHaveLength(0);
});

test('sign-in contrast and approved vectors in both themes, safe return URLs', async ({ page, theme }) => {
  await page.goto('/sign-in?returnTo=' + encodeURIComponent('//untrusted.invalid'));
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  const colors = await page.locator('section').first().evaluate(el => ({
    bg: getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number),
    color: getComputedStyle(el).color,
  }));
  expect(colors.bg.every(n => n < 100)).toBe(true);
  expect(colors.color).toBe('rgb(255, 255, 255)');
  await expect(page.getByTestId('spextar-vector-wordmark').filter({ visible: true }).last())
    .toHaveAttribute('src', theme === 'dark' ? /reversed/ : /primary/);
  await expect(page.getByRole('button', { name: 'Microsoft', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeDisabled();
  await noOverflow(page);
  await page.getByTestId('input-email').fill('user-a@example.test');
  await page.getByTestId('input-password').fill('synthetic-not-real');
  await activate(page, page.getByTestId('button-sign-in'));
  await expect(page.getByTestId('card-workspace-ws-a')).toBeVisible();
  await expect(page).toHaveURL(/\/workspaces$/);
});
