import {
  test, expect, login, activate, navigate, signOut, noOverflow,
  projectPath, authKey, recoveryPrefix, type Role,
} from './fixture';
import type { Page } from '@playwright/test';

const authorPath = projectPath + '/author/doc-a';
const bodyOf = (page: Page) => page.getByRole('textbox', { name: 'Topic body', exact: true });
const recoveryOf = (page: Page) => page.evaluate(prefix => Object.fromEntries(
  Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => [key, localStorage.getItem(key)]),
), recoveryPrefix);

// Exercise the SDK's actual expired-session refresh path, without waiting an hour
// or replacing application auth methods. All responses remain intercepted.
async function refreshExpiredSession(page: Page) {
  await page.evaluate(key => {
    const session = JSON.parse(localStorage.getItem(key)!);
    session.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(key, JSON.stringify(session));
    window.dispatchEvent(new Event('visibilitychange'));
  }, authKey);
}

test('Author rejected refresh retains scoped unsaved recovery through re-authentication', async ({ page, backend, theme }) => {
  await login(page, authorPath);
  const body = bodyOf(page);
  await expect(body).toContainText('Current saved QA topic');
  backend.sessionExpired = true;
  await body.press('ControlOrMeta+End');
  await page.keyboard.type(' recover after session expiry');
  await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
  await expect(page.getByRole('alert')).toContainText('Your session has expired. Please sign in again.');
  expect(backend.writes).toHaveLength(0);
  const copies = await recoveryOf(page);
  expect(Object.keys(copies)).toHaveLength(1);
  const saved = structuredClone(backend.db.topic_drafts[0]);
  await refreshExpiredSession(page);
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  expect(backend.refreshAttempts).toBeGreaterThan(0);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(authorPath);
  await expect(body).toHaveCount(0);
  expect(await recoveryOf(page)).toEqual(copies);
  expect(backend.db.topic_drafts[0]).toEqual(saved);
  expect(await page.evaluate(key => localStorage.getItem(key), authKey)).toBeNull();
  await noOverflow(page);
  backend.sessionExpired = false;
  await page.getByTestId('input-email').fill('user-a@example.test');
  await page.getByTestId('input-password').fill('synthetic-not-real');
  await activate(page, page.getByTestId('button-sign-in'));
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toBeVisible();
  await expect(body).not.toContainText('recover after session expiry');
  await activate(page, page.getByRole('button', { name: 'Restore recovery', exact: true }));
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 4');
  await expect(body).toContainText('recover after session expiry');
  expect(await recoveryOf(page)).toEqual({});
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
  await noOverflow(page);
  await signOut(page);
  await expect(body).toHaveCount(0);
});

for (const role of ['reviewer', 'viewer', null] satisfies Role[]) {
  test(`Author active downgrade to ${role ?? 'inherited admin'} blocks stale saves and retains recovery`, async ({ page, backend }) => {
    await login(page, authorPath);
    const body = bodyOf(page);
    await expect(body).toHaveAttribute('contenteditable', 'true');
    await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 3');
    const saved = structuredClone(backend.db.topic_drafts[0]);
    backend.setRole(role);
    await body.press('ControlOrMeta+End');
    await page.keyboard.type(' edit after role changed');
    await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
    await expect(page.getByRole('alert')).toContainText('Only Project Admin and Author');
    const copies = await recoveryOf(page);
    expect(Object.keys(copies)).toHaveLength(1);
    expect(backend.writes).toHaveLength(0);
    await activate(page, page.getByRole('button', { name: 'Retry body save', exact: true }));
    await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
    expect(backend.writes).toHaveLength(0);
    await page.reload();
    await expect(body).toHaveAttribute('contenteditable', 'false');
    await expect(body).not.toContainText('edit after role changed');
    await expect(page.getByRole('button', { name: 'Restore recovery', exact: true })).toHaveCount(0);
    await body.focus(); await page.keyboard.type('BLOCKED');
    await expect(body).not.toContainText('BLOCKED');
    expect(await recoveryOf(page)).toEqual(copies);
    expect(backend.db.topic_drafts[0]).toEqual(saved);
    await noOverflow(page);
    backend.setRole('author');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Recover topic body' })).toBeVisible();
    await activate(page, page.getByRole('button', { name: 'Restore recovery', exact: true }));
    await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 4');
    await expect(body).toContainText('edit after role changed');
    expect(backend.writes).toHaveLength(1);
    expect(backend.writes[0].query).toContain('revision=eq.3');
  });
}

test('RLS denial after Author preflight leaves the saved revision unchanged and retry rechecks roles', async ({ page, backend }) => {
  await login(page, authorPath);
  const body = bodyOf(page);
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 3');
  const saved = structuredClone(backend.db.topic_drafts[0]);
  let denied = 0;
  await page.route('https://luyyxblmtupmugtazgbr.supabase.co/rest/v1/topic_drafts?**', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const url = new URL(route.request().url());
    expect(url.searchParams.get('topic_id')).toBe('eq.topic-a');
    expect(url.searchParams.get('revision')).toBe('eq.3');
    expect(route.request().postDataJSON()).toMatchObject({ updated_by: 'user-a' });
    // The service has already passed its fresh role check. The backend remains
    // authoritative if access changes before the actual write reaches it.
    denied++;
    backend.setRole('reviewer');
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({
      code: '42501', message: 'Controlled RLS denial after preflight',
    }) });
  });
  await body.press('ControlOrMeta+End'); await page.keyboard.type(' denied by RLS');
  await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
  await expect(page.getByRole('alert')).toContainText('You do not have permission');
  expect(denied).toBe(1);
  const copies = await recoveryOf(page);
  expect(Object.keys(copies)).toHaveLength(1);
  await activate(page, page.getByRole('button', { name: 'Retry body save', exact: true }));
  await expect(page.getByRole('alert')).toContainText('Only Project Admin and Author');
  expect(denied).toBe(1);
  expect(backend.db.topic_drafts[0]).toEqual(saved);
  await page.reload();
  await expect(body).toHaveAttribute('contenteditable', 'false');
  expect(await recoveryOf(page)).toEqual(copies);
  expect(backend.writes).toHaveLength(0);
  await noOverflow(page);
});

test('expired Author recovery is not exposed to a different signed-in identity', async ({ page, backend }) => {
  await login(page, authorPath);
  const body = bodyOf(page);
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 3');
  backend.failDraftWrites = true;
  await body.press('ControlOrMeta+End'); await page.keyboard.type(' private writer A recovery');
  await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
  backend.sessionExpired = true;
  await refreshExpiredSession(page);
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  backend.sessionExpired = false;
  backend.failDraftWrites = false;
  backend.setIdentity('user-b');
  await page.getByTestId('input-email').fill('user-b@example.test');
  await page.getByTestId('input-password').fill('synthetic-not-real');
  await activate(page, page.getByTestId('button-sign-in'));
  await expect(body).toContainText('Current saved QA topic');
  await expect(body).not.toContainText('private writer A recovery');
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toHaveCount(0);
  expect(await recoveryOf(page)).toEqual({});
  await signOut(page);
  expect(await recoveryOf(page)).toEqual({});
});

test('Review permission denial retries safely; role upgrades never enable mutation in the nested viewer', async ({ page, backend }) => {
  backend.setRole('viewer');
  await login(page, projectPath + '/review');
  const body = bodyOf(page);
  await expect(body).toHaveAttribute('contenteditable', 'false');
  backend.failures.add('topic_drafts');
  await activate(page, page.getByRole('button', { name: 'Refresh', exact: true }));
  await expect(page.getByText('Current draft did not load', { exact: true })).toBeVisible();
  await expect(body).toHaveCount(0);
  backend.setRole('admin');
  backend.failures.delete('topic_drafts');
  await activate(page, page.getByRole('button', { name: 'Retry', exact: true }));
  await expect(body).toHaveAttribute('contenteditable', 'false');
  await body.focus(); await page.keyboard.type('BLOCKED');
  await expect(body).not.toContainText('BLOCKED');
  await activate(page, page.getByTestId('review-topic-topic-b'));
  await expect(page.getByTestId('review-draft-missing')).toBeVisible();
  await activate(page, page.getByTestId('review-topic-topic-a'));
  await expect(body).toHaveAttribute('contenteditable', 'false');
  await noOverflow(page);
  await navigate(page, 'nav-documents');
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await navigate(page, 'nav-review');
  await expect(body).toHaveAttribute('contenteditable', 'false');
  expect(backend.writes).toHaveLength(0);
  expect(await recoveryOf(page)).toEqual({});
});

test('Review rejected refresh removes viewer and restores only read-only access after sign-in', async ({ page, backend }) => {
  await login(page, projectPath + '/review');
  const body = bodyOf(page);
  await expect(body).toHaveAttribute('contenteditable', 'false');
  backend.sessionExpired = true;
  await activate(page, page.getByRole('button', { name: 'Refresh', exact: true }));
  // Refresh also re-reads document eligibility. Global session denial is
  // surfaced there before the nested draft request, unlike draft-only denial.
  await expect(page.getByText('Documents did not load', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your session has expired. Please sign in again.');
  await expect(body).toHaveCount(0);
  await refreshExpiredSession(page);
  await expect(page.getByTestId('button-sign-in')).toBeVisible();
  await expect(body).toHaveCount(0);
  expect(backend.refreshAttempts).toBeGreaterThan(0);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(projectPath + '/review');
  backend.sessionExpired = false;
  backend.setRole('admin');
  await page.getByTestId('input-email').fill('user-a@example.test');
  await page.getByTestId('input-password').fill('synthetic-not-real');
  await activate(page, page.getByTestId('button-sign-in'));
  await expect(body).toHaveAttribute('contenteditable', 'false');
  await body.focus(); await page.keyboard.type('BLOCKED');
  await expect(body).not.toContainText('BLOCKED');
  await noOverflow(page);
  await signOut(page);
  expect(backend.writes).toHaveLength(0);
  expect(await recoveryOf(page)).toEqual({});
});
