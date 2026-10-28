import {
  test, expect, login, activate, navigate, signOut, noOverflow,
  projectPath, authKey, recoveryPrefix,
} from './fixture';
import { managementPages, rejectManagementChunk } from './management-chunk-fixture';

for (const item of managementPages) {
  test(`${item.title}: missing chunk requires explicit reload, then restores the same read-only session`, async ({ page, backend, theme }) => {
    backend.setRole(item.slug === 'variables-conditions' ? null : 'viewer');
    backend.db.topic_drafts = [];
    const fault = await rejectManagementChunk(page, item, 'missing');
    try {
      await login(page, projectPath);
      await expect(page.getByRole('heading', { name: 'Project A', exact: true })).toBeVisible();
      const origin = await page.evaluate(() => performance.timeOrigin);
      await navigate(page, `nav-${item.slug}`);
      await expect(page.getByRole('heading', { name: `${item.title} could not be loaded` })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(item.title);
      await expect(page.getByRole('button', { name: `Reload ${item.title}`, exact: true })).toBeEnabled();
      expect(fault.attempts).toBe(1);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
      await noOverflow(page);
      // Restoring the network does not reset React.lazy's cached rejected promise.
      await fault.restore();
      await expect(page.getByRole('heading', { name: `${item.title} could not be loaded` })).toBeVisible();
      await activate(page, page.getByRole('button', { name: `Reload ${item.title}`, exact: true }));
      await expect(page.getByTestId(item.marker)).toBeVisible();
      expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(origin);
      await expect(page).toHaveURL(new RegExp(`/${item.slug}$`));
      await expect(page.getByTestId('button-sign-in')).toHaveCount(0);
      if (item.slug === 'variables-conditions') await expect(page.getByTestId('button-new-variable')).toBeDisabled();
      if (item.slug === 'reusable-content') {
        await expect(page.getByTestId('reusable-readonly-note')).toBeVisible();
        await expect(page.getByTestId('reusable-new')).toBeDisabled();
      }
      if (item.slug === 'settings') await expect(page.getByTestId('input-name')).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
      expect(backend.scripts.some(url => /\/(?:author|structured-editor|review-draft-viewer)-/.test(url))).toBe(false);
      expect(backend.writes).toHaveLength(0);
      await noOverflow(page);
    } finally { await fault.restore(); }
  });

  test(`${item.title}: rejected network download allows safe navigation; returning stays explicit and never loops`, async ({ page, backend, theme }) => {
    backend.db.topic_drafts = [];
    const fault = await rejectManagementChunk(page, item, 'network');
    try {
      await login(page, projectPath);
      await expect(page.getByRole('heading', { name: 'Project A', exact: true })).toBeVisible();
      const origin = await page.evaluate(() => performance.timeOrigin);
      await navigate(page, `nav-${item.slug}`);
      await expect(page.getByRole('heading', { name: `${item.title} could not be loaded` })).toBeVisible();
      expect(fault.attempts).toBe(1);
      await activate(page, page.getByRole('link', { name: 'Back to Documents', exact: true }));
      await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: `${item.title} could not be loaded` })).toHaveCount(0);
      await fault.restore();
      // Leaving and returning must not masquerade as a working retry or auto-refresh.
      await navigate(page, `nav-${item.slug}`);
      await expect(page.getByRole('heading', { name: `${item.title} could not be loaded` })).toBeVisible();
      expect(fault.attempts).toBe(1);
      const other = managementPages.find(other => other.slug !== item.slug)!;
      await navigate(page, `nav-${other.slug}`);
      await expect(page.getByTestId(other.marker)).toBeVisible();
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
      expect(backend.writes).toHaveLength(0);
      await noOverflow(page);
    } finally { await fault.restore(); }
  });

  test(`${item.title}: sign-out from a failed chunk clears recovery and caches before a second identity`, async ({ page, backend }) => {
    const fault = await rejectManagementChunk(page, item, 'missing');
    try {
      // Build actual identity-scoped recovery using the real editor/controller, not storage injection.
      await login(page, `${projectPath}/author/doc-a`);
      const body = page.getByRole('textbox', { name: 'Topic body', exact: true });
      await expect(body).toContainText('Current saved QA topic');
      const origin = await page.evaluate(() => performance.timeOrigin);
      backend.failDraftWrites = true;
      await body.press('ControlOrMeta+End');
      await page.keyboard.type(' unsaved first identity recovery');
      await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
      await expect.poll(() => page.evaluate(prefix =>
        Object.keys(localStorage).filter(key => key.startsWith(prefix)).length, recoveryPrefix)).toBeGreaterThan(0);
      await navigate(page, `nav-${item.slug}`);
      await expect(page.getByRole('heading', { name: `${item.title} could not be loaded` })).toBeVisible();
      expect(fault.attempts).toBe(1);
      backend.offlineLogout = true;
      await signOut(page);
      expect(new URL(page.url()).search).toBe('');
      expect(await page.evaluate(key => localStorage.getItem(key), authKey)).toBeNull();
      expect(await page.evaluate(prefix =>
        Object.keys(localStorage).filter(key => key.startsWith(prefix)), recoveryPrefix)).toEqual([]);
      await expect(page.getByRole('heading', { name: `${item.title} could not be loaded` })).toHaveCount(0);
      backend.failDraftWrites = false;
      backend.setIdentity('user-b');
      backend.setRole('viewer');
      backend.db.projects[0].name = 'Second identity project';
      backend.db.documents = [];
      backend.db.topics = [];
      backend.db.topic_drafts = [];
      // Same document login is essential: a page.goto would accidentally clear the query cache.
      await page.getByTestId('input-email').fill('user-b@example.test');
      await page.getByTestId('input-password').fill('synthetic-password-not-a-real-credential');
      await activate(page, page.getByTestId('button-sign-in'));
      await expect(page).toHaveURL(/\/workspaces$/);
      await activate(page, page.getByTestId('card-workspace-ws-a'));
      await activate(page, page.getByRole('link', { name: /Second identity project/ }).first());
      await expect(page.getByRole('heading', { name: 'Second identity project', exact: true })).toBeVisible();
      await expect(page.getByTestId('text-doc-count')).toHaveText('0');
      await navigate(page, 'nav-documents');
      await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
      await expect(page.getByText('A project admin or author can create documents.', { exact: true })).toBeVisible();
      await expect(page.getByText('QA document', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
      expect(await page.evaluate(prefix =>
        Object.keys(localStorage).filter(key => key.startsWith(prefix)), recoveryPrefix)).toEqual([]);
      expect(backend.db.documents).toEqual([]);
      expect(backend.writes.every(write => write.table === 'topic_drafts')).toBe(true);
      expect(backend.writes.some(write => JSON.stringify(write.body).includes('unsaved first identity recovery'))).toBe(true);
      await noOverflow(page);
      // A full reload after sign-out still must not restore the first identity.
      await signOut(page);
      await page.reload();
      await expect(page.getByTestId('button-sign-in')).toBeVisible();
      expect(await page.evaluate(key => localStorage.getItem(key), authKey)).toBeNull();
    } finally { await fault.restore(); }
  });
}
