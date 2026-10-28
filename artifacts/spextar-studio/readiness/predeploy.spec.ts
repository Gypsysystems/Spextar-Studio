import {
  test, expect, login, signOut, noOverflow, projectPath, authKey, recoveryPrefix,
} from '../e2e/fixture';
import { variants } from '../scripts/readiness';

test('fresh production candidate starts in backend mode and protects direct links without network credentials', async ({ page, backend }) => {
  await page.goto(`http://127.0.0.1:4183${projectPath}/author/doc-a`);
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to SPEXTAR' })).toBeVisible();
  await expect(page.getByText('Secure workspace · Supabase', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Microsoft' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Google' })).toHaveCount(0);
  expect(backend.scripts.some(url => /\/(?:author|structured-editor|review-draft-viewer)-/.test(url))).toBe(false);
  await page.reload();
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveCount(0);
  expect(backend.writes).toHaveLength(0);
  await noOverflow(page);
});

for (const name of Object.keys(variants).filter(name => name !== 'valid')) {
  test(`${name}: production configuration fails closed on direct protected links and refresh`, async ({ page, backend }) => {
    const path = `/${name}${projectPath}/author/doc-a`;
    await page.goto(path);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('button-sign-in')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveCount(0);
    expect(backend.scripts.some(url => /\/(?:author|structured-editor|review-draft-viewer)-/.test(url))).toBe(false);
    await page.reload();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('button-sign-in')).toHaveCount(0);
    expect(backend.writes).toHaveLength(0);
    await noOverflow(page);
  });
}

for (const { route, marker } of [
  { route: 'documents', marker: 'input-search-documents' },
  { route: 'author/doc-a', marker: 'body-save-status' },
  { route: 'review', marker: 'review-page' },
  { route: 'variables-conditions', marker: 'text-variable-default' },
  { route: 'reusable-content', marker: 'reusable-page' },
  { route: 'settings', marker: 'project-settings-page' },
]) {
  test(`public-only build: protected ${route} deep link, sign-in, restored session and refresh`, async ({ page, backend, theme }) => {
    const path = `/valid${projectPath}/${route}`;
    await page.goto(path);
    await expect(page.getByTestId('button-sign-in')).toBeVisible();
    expect(backend.scripts.some(url => /\/(?:author|structured-editor|review-draft-viewer)-/.test(url))).toBe(false);
    await login(page, path);
    await expect(page.getByTestId(marker)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(path + '$'));
    await expect(page.getByTestId('button-sign-in')).toHaveCount(0);
    await expect(page.getByTestId(marker)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
    expect(backend.writes).toHaveLength(0);
    await noOverflow(page);
  });
}

test('public-only build: offline sign-out clears real recovery/session and protects refreshed deep link', async ({ page, backend }) => {
  await login(page, `/valid${projectPath}/author/doc-a`);
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(body).toContainText('Current saved QA topic');
  backend.failDraftWrites = true;
  await body.press('ControlOrMeta+End');
  await page.keyboard.type(' public-only staging recovery');
  await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
  await expect.poll(() => page.evaluate(prefix => Object.keys(localStorage).filter(k => k.startsWith(prefix)).length, recoveryPrefix)).toBe(1);
  backend.offlineLogout = true;
  await signOut(page);
  expect(await page.evaluate(key => localStorage.getItem(key), authKey)).toBeNull();
  expect(await page.evaluate(prefix => Object.keys(localStorage).filter(k => k.startsWith(prefix)), recoveryPrefix)).toEqual([]);
  await page.goto(`/valid${projectPath}/author/doc-a`);
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  await expect(body).toHaveCount(0);
  expect(backend.writes.every(write => write.table === 'topic_drafts')).toBe(true);
  await noOverflow(page);
});
