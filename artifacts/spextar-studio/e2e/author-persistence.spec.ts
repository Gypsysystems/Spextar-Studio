import { test, expect, login, activate, noOverflow, projectPath, recoveryPrefix } from './fixture';

test('debounced autosave preserves structured metadata and node IDs with expected revisions', async ({ page, backend }) => {
  await login(page, projectPath + '/author/doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 3');
  await body.press('ControlOrMeta+End');
  await page.keyboard.type(' browser autosave');
  await expect(page.getByTestId('body-save-status')).toHaveText('Unsaved changes');
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 4');
  expect(backend.writes).toHaveLength(1);
  expect(backend.writes[0].query).toContain('revision=eq.3');
  expect(backend.writes[0].query).toContain('topic_id=eq.topic-a');
  expect(backend.db.topic_drafts[0].content).toMatchObject({
    version: 1, ownerMetadata: { preserved: true }, content: [{ attrs: { id: 'stable-paragraph' } }],
  });
  expect(await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)), recoveryPrefix)).toEqual([]);
  await page.reload();
  await expect(body).toContainText('browser autosave');
  await noOverflow(page);
});

test('first save inserts revision 1; later edits use revision-safe updates', async ({ page, backend }) => {
  backend.db.topic_drafts = [];
  await login(page, projectPath + '/author/doc-a');
  await expect(page.getByTestId('body-save-status')).toHaveText('No saved body yet');
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await body.focus(); await page.keyboard.type('First persisted body');
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 1');
  expect(backend.writes[0].method).toBe('POST');
  expect(backend.writes[0].body).not.toHaveProperty('revision');
  await body.press('ControlOrMeta+End'); await page.keyboard.type(' updated');
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 2');
  expect(backend.writes[1].query).toContain('revision=eq.1');
  expect(backend.writes[1].body).not.toHaveProperty('revision');
});

test('stale revisions cannot overwrite newer content; explicit retry/reload/discard remain safe', async ({ page, backend }) => {
  await login(page, projectPath + '/author/doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(body).toContainText('Current saved QA topic');
  backend.conflictNextSave = true;
  await body.press('ControlOrMeta+End'); await page.keyboard.type(' stale local edit');
  await expect(page.getByTestId('body-save-status')).toHaveText('Concurrent-edit conflict');
  expect(backend.db.topic_drafts[0].revision).toBe(4);
  const server = JSON.stringify(backend.db.topic_drafts[0].content);
  await activate(page, page.getByRole('button', { name: 'Retry body save', exact: true }));
  await expect.poll(() => backend.writes.length).toBe(2);
  await expect(page.getByTestId('body-save-status')).toHaveText('Concurrent-edit conflict');
  expect(JSON.stringify(backend.db.topic_drafts[0].content)).toBe(server);
  await activate(page, page.getByRole('button', { name: /Reload saved/ }));
  await expect(body).toContainText('Newer server body');
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toBeVisible();
  await activate(page, page.getByRole('button', { name: 'Discard recovery', exact: true }));
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toHaveCount(0);
  expect(backend.writes).toHaveLength(2);
  expect(JSON.stringify(backend.db.topic_drafts[0].content)).toBe(server);
});

test('failed saves survive refresh as scoped recovery; restore saves and clears only matching copies', async ({ page, backend }) => {
  await login(page, projectPath + '/author/doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(body).toContainText('Current saved QA topic');
  backend.failDraftWrites = true;
  await body.press('ControlOrMeta+End'); await page.keyboard.type(' crash recovery text');
  await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
  expect(backend.db.topic_drafts[0].revision).toBe(3);
  await page.reload();
  const offer = page.getByRole('region', { name: 'Recover topic body' });
  await expect(offer).toBeVisible();
  await expect(body).not.toContainText('crash recovery text');
  backend.failDraftWrites = false;
  await activate(page, page.getByRole('button', { name: 'Restore recovery', exact: true }));
  await expect(body).toContainText('crash recovery text');
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 4');
  await expect(offer).toHaveCount(0);
  expect(await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)), recoveryPrefix)).toEqual([]);
  await noOverflow(page);
});
