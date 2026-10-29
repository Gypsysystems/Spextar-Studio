import {
  test, expect, login, activate, navigate, noOverflow, projectPath, recoveryPrefix, type Role,
} from './fixture';
import { rejectAuthoringChunk } from './management-chunk-fixture';

for (const role of ['author', 'viewer'] as const) {
  test(`${role}: failed Author deep link stays protected, navigates safely and reloads explicitly`, async ({ page, backend, theme }) => {
    backend.setRole(role);
    const fault = await rejectAuthoringChunk(page, 'author', 'missing');
    try {
      await page.goto(`${projectPath}/author/doc-a`);
      await expect(page.getByTestId('button-sign-in')).toBeVisible();
      expect(fault.attempts).toBe(0);
      expect(backend.scripts.some(url => /\/(?:author|structured-editor)-/.test(url))).toBe(false);
      await login(page, `${projectPath}/author/doc-a`);
      const failed = page.getByRole('heading', { name: 'Author could not be loaded', exact: true });
      await expect(failed).toBeVisible();
      const origin = await page.evaluate(() => performance.timeOrigin);
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Author');
      await expect(page.getByRole('textbox', { name: 'Topic body', exact: true })).toHaveCount(0);
      expect(fault.attempts).toBe(1);
      await noOverflow(page);
      await activate(page, page.getByRole('link', { name: 'Back to Documents', exact: true }));
      await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
      await fault.restore();
      await activate(page, page.getByTestId('link-author-doc-a'));
      await expect(failed).toBeVisible();
      expect(fault.attempts).toBe(1);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
      await activate(page, page.getByRole('button', { name: 'Reload Author', exact: true }));
      const body = page.getByRole('textbox', { name: 'Topic body', exact: true });
      await expect(body).toContainText('Current saved QA topic');
      await expect(body).toHaveAttribute('contenteditable', String(role === 'author'));
      if (role === 'viewer') {
        await body.focus(); await page.keyboard.type('BLOCKED_DOWNLOAD_RECOVERY');
        await expect(body).not.toContainText('BLOCKED_DOWNLOAD_RECOVERY');
      }
      await expect(page).toHaveURL(new RegExp(`${projectPath}/author/doc-a$`));
      expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(origin);
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
      expect(backend.writes).toHaveLength(0);
      expect(backend.scripts.filter(url => url === fault.url)).toHaveLength(2);
      await noOverflow(page);
    } finally { await fault.restore(); }
  });
}

for (const choice of ['restore', 'discard'] as const) {
  test(`Author network failure preserves actual crash recovery through navigation and explicit reload: ${choice}`, async ({ page, backend, theme }) => {
    backend.setRole(choice === 'restore' ? 'admin' : 'author');
    const saved = structuredClone(backend.db.topic_drafts[0]);
    await login(page, `${projectPath}/author/doc-a`);
    const body = page.getByRole('textbox', { name: 'Topic body', exact: true });
    await expect(body).toContainText('Current saved QA topic');
    backend.failDraftWrites = true;
    await body.press('ControlOrMeta+End');
    await page.keyboard.type(' recoverable download-failure text');
    await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
    const recovery = () => page.evaluate(prefix => Object.fromEntries(
      Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => [key, localStorage.getItem(key)]),
    ), recoveryPrefix);
    const copies = await recovery();
    expect(Object.keys(copies)).toHaveLength(1);
    expect(backend.db.topic_drafts[0]).toEqual(saved);
    const fault = await rejectAuthoringChunk(page, 'author', 'network');
    try {
      await page.reload();
      const origin = await page.evaluate(() => performance.timeOrigin);
      await expect(page.getByRole('heading', { name: 'Author could not be loaded', exact: true })).toBeVisible();
      expect(fault.attempts).toBe(1);
      expect(await recovery()).toEqual(copies);
      await activate(page, page.getByRole('link', { name: 'Back to Documents', exact: true }));
      await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
      await activate(page, page.getByTestId('link-author-doc-a'));
      await expect(page.getByRole('heading', { name: 'Author could not be loaded', exact: true })).toBeVisible();
      expect(fault.attempts).toBe(1);
      expect(await recovery()).toEqual(copies);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
      await fault.restore();
      backend.failDraftWrites = false;
      const writesBeforeChoice = backend.writes.length;
      await activate(page, page.getByRole('button', { name: 'Reload Author', exact: true }));
      await expect(page.getByRole('region', { name: 'Recover topic body' })).toBeVisible();
      await expect(body).toContainText('Current saved QA topic');
      await expect(body).not.toContainText('recoverable download-failure text');
      expect(await recovery()).toEqual(copies);
      expect(backend.db.topic_drafts[0]).toEqual(saved);
      expect(backend.writes).toHaveLength(writesBeforeChoice);
      await activate(page, page.getByRole('button', { name: choice === 'restore' ? 'Restore recovery' : 'Discard recovery', exact: true }));
      if (choice === 'restore') {
        await expect(body).toContainText('recoverable download-failure text');
        await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 4');
        expect(backend.db.topic_drafts[0]).toMatchObject({
          revision: 4,
          content: { type: 'doc', version: 1, ownerMetadata: { preserved: true },
            content: [{ type: 'paragraph', attrs: { id: 'stable-paragraph' } }] },
        });
        expect(backend.writes.length).toBeGreaterThan(writesBeforeChoice);
      } else {
        await expect(page.getByRole('region', { name: 'Recover topic body' })).toHaveCount(0);
        await expect(body).not.toContainText('recoverable download-failure text');
        expect(backend.db.topic_drafts[0]).toEqual(saved);
        expect(backend.writes).toHaveLength(writesBeforeChoice);
      }
      await expect.poll(recovery).toEqual({});
      expect(backend.writes.every(write => write.table === 'topic_drafts')).toBe(true);
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
      await noOverflow(page);
    } finally { await fault.restore(); }
  });
}

for (const role of ['admin', 'author', 'reviewer', 'viewer', null] satisfies Role[]) {
  test(`${role ?? 'inherited admin'}: nested Review download failure and recovery never permit editing or writes`, async ({ page, backend, theme }) => {
    backend.setRole(role);
    const saved = structuredClone(backend.db.topic_drafts);
    const fault = await rejectAuthoringChunk(page, 'reviewViewer', role === 'admin' || role === 'author' ? 'missing' : 'network');
    try {
      // The Review shell and missing-draft state must work without fetching the viewer.
      backend.db.topic_drafts = []; backend.captureReview();
      await login(page, `${projectPath}/review`);
      await expect(page.getByTestId('review-draft-missing')).toBeVisible();
      expect(fault.attempts).toBe(0);
      expect(backend.scripts.some(url => /\/(?:author|structured-editor|review-draft-viewer)-/.test(url))).toBe(false);
      backend.db.topic_drafts = structuredClone(saved); backend.captureReview();
      const origin = await page.evaluate(() => performance.timeOrigin);
      await activate(page, page.getByTestId('button-refresh'));
      const failed = page.getByTestId('review-viewer-error');
      await expect(failed).toBeVisible();
      await expect(failed).toHaveAttribute('role', 'alert');
      await expect(page.getByTestId('review-draft-revision')).toHaveText('3');
      await expect(page.getByRole('textbox', { name: 'Topic body', exact: true })).toHaveCount(0);
      expect(fault.attempts).toBe(1);
      await noOverflow(page);
      await fault.restore();
      // Data refresh is not a retry of React.lazy's cached failed module.
      await activate(page, page.getByTestId('button-refresh'));
      await expect(failed).toBeVisible();
      await activate(page, page.getByTestId('review-topic-topic-b'));
      await expect(page.getByTestId('review-draft-missing')).toBeVisible();
      await activate(page, page.getByTestId('review-topic-topic-a'));
      await expect(failed).toBeVisible();
      await navigate(page, 'nav-documents');
      await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
      await navigate(page, 'nav-review');
      await expect(failed).toBeVisible();
      expect(fault.attempts).toBe(1);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
      expect(backend.writes).toHaveLength(0);
      expect(backend.db.topic_drafts).toEqual(saved);
      await activate(page, page.getByTestId('button-reload-page'));
      const body = page.getByRole('textbox', { name: 'Topic body', exact: true });
      await expect(body).toContainText('Current saved QA topic');
      await expect(body).toHaveAttribute('contenteditable', 'false');
      await body.focus(); await page.keyboard.type('BLOCKED_REVIEW_RECOVERY');
      await expect(body).not.toContainText('BLOCKED_REVIEW_RECOVERY');
      await expect(page.getByTestId('review-draft-revision')).toHaveText('3');
      expect(backend.writes).toHaveLength(0);
      expect(backend.db.topic_drafts).toEqual(saved);
      expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(origin);
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
      expect(backend.scripts.filter(url => url === fault.url)).toHaveLength(2);
      expect(backend.scripts.some(url => /\/author-/.test(url))).toBe(false);
      await noOverflow(page);
    } finally { await fault.restore(); }
  });
}
