import { test, expect, login, activate, noOverflow, projectPath } from './fixture';
import { accessible, tabTo, visibleFocus } from './accessibility-helpers';

test('saved Draft submission, Author lock, Reviewer approval, explicit new Draft preserve submitted content', async ({ page, backend }) => {
  backend.db.document_reviews = [];
  await login(page, projectPath + '/author/doc-a');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true');
  const submit = page.getByRole('button', { name: 'Submit for review', exact: true });
  await activate(page, submit);
  await expect(page.getByRole('dialog')).toBeVisible(); await accessible(page);
  await page.keyboard.press('Escape'); await expect(submit).toBeFocused();
  await tabTo(page, submit); await visibleFocus(submit); await page.keyboard.press('Enter');
  await activate(page, page.getByRole('button', { name: 'Confirm submit for review' }));
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Create topic', exact: true })).toHaveCount(0);
  expect(backend.db.documents[0].status).toBe('in_review');
  const evidence = structuredClone(backend.db.document_reviews[0]);
  backend.setRole('reviewer'); await page.goto(projectPath + '/review');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toContainText('Current saved QA topic');
  await activate(page, page.getByRole('button', { name: 'Approve', exact: true }));
  await accessible(page);
  await activate(page, page.getByRole('button', { name: 'Confirm approve' }));
  await expect(page.getByText('Approved · Review 1')).toBeVisible();
  expect(backend.db.document_reviews[0].topics_snapshot).toEqual(evidence.topics_snapshot);
  backend.setRole('author'); await page.goto(projectPath + '/author/doc-a');
  await activate(page, page.getByRole('button', { name: 'Start new draft', exact: true }));
  await accessible(page);
  await activate(page, page.getByRole('button', { name: 'Confirm start new draft' }));
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(body).toHaveAttribute('contenteditable', 'true');
  await body.press('ControlOrMeta+End'); await page.keyboard.type(' New draft only');
  await expect.poll(() => JSON.stringify(backend.db.topic_drafts[0].content)).toContain('New draft only');
  await page.goto(projectPath + '/review');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).not.toContainText('New draft only');
  expect(backend.db.document_reviews[0].topics_snapshot).toEqual(evidence.topics_snapshot);
  await noOverflow(page); await accessible(page);
});

test('changes note validation, request changes returns Draft, decision denial and immutable missing body', async ({ page, backend }) => {
  backend.db.documents[0].status = 'in_review'; backend.setRole('reviewer');
  await login(page, projectPath + '/review');
  await activate(page, page.getByRole('button', { name: 'Request changes', exact: true }));
  const confirm = page.getByRole('button', { name: 'Confirm request changes' });
  await expect(confirm).toBeDisabled(); await page.getByLabel('Decision note').fill('   '); await expect(confirm).toBeDisabled();
  await page.getByLabel('Decision note').fill('Clarify the warning'); await accessible(page);
  await activate(page, confirm); await expect(page.getByText('Changes requested · Review 1')).toBeVisible();
  expect(backend.db.documents[0].status).toBe('draft');
  expect(backend.db.topics.every(t => t.status === 'draft')).toBe(true);
  await activate(page, page.getByRole('button', { name: 'Child topic', exact: true }));
  await expect(page.getByText('No saved body was submitted for this topic.')).toBeVisible();
  for (const role of ['author', 'viewer'] as const) {
    backend.setRole(role); await page.reload();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Request changes', exact: true })).toHaveCount(0);
  }
  expect(backend.writes.every(w => w.table.startsWith('rpc/'))).toBe(true);
  await noOverflow(page); await accessible(page);
});

test('unsaved/error body blocks submission and snapshot reads fail closed', async ({ page, backend }) => {
  backend.db.document_reviews = []; backend.failDraftWrites = true;
  await login(page, projectPath + '/author/doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body' }); await expect(body).toHaveAttribute('contenteditable', 'true');
  await body.press('ControlOrMeta+End'); await page.keyboard.type(' Unsaved');
  await activate(page, page.getByRole('button', { name: 'Submit for review', exact: true }));
  await activate(page, page.getByRole('button', { name: 'Confirm submit for review' }));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Save or resolve');
  expect(backend.writes.some(w => w.table === 'rpc/submit_document_review')).toBe(false);
  await page.keyboard.press('Escape');
  backend.failures.add('document_reviews'); await page.goto(projectPath + '/review');
  await expect(page.getByText('Submitted review did not load')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveCount(0);
  await noOverflow(page);
});

test('a competing decision rejects the stale confirmation without retries or content writes', async ({ page, backend }) => {
  backend.db.documents[0].status = 'in_review'; backend.setRole('reviewer');
  await login(page, projectPath + '/review');
  await activate(page, page.getByRole('button', { name: 'Approve', exact: true }));
  const snapshot = structuredClone(backend.db.document_reviews[0].topics_snapshot);
  // Another authorized browser completed the review after this dialog opened.
  backend.db.documents[0].status = 'approved';
  Object.assign(backend.db.document_reviews[0], { status: 'approved', decided_by: 'user-a', decided_at: '2026-10-29T12:30:00Z' });
  await activate(page, page.getByRole('button', { name: 'Confirm approve' }));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');
  expect(backend.writes).toHaveLength(1);
  expect(backend.db.document_reviews[0].topics_snapshot).toEqual(snapshot);
  await accessible(page); await noOverflow(page);
});

test('submission keeps its confirmation timestamp after a stale response and background refresh', async ({ page, backend }) => {
  backend.db.document_reviews = [];
  await login(page, projectPath + '/author/doc-a');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true');
  await activate(page, page.getByRole('button', { name: 'Submit for review', exact: true }));
  Object.assign(backend.db.documents[0], { title: 'Changed after confirmation', updated_at: '2026-10-29T13:30:00Z' });
  await activate(page, page.getByRole('button', { name: 'Confirm submit for review' }));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');
  await expect(page.getByText('Changed after confirmation', { exact: true }).first()).toBeVisible();
  await activate(page, page.getByRole('button', { name: 'Confirm submit for review' }));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');
  const submissions = backend.writes.filter(write => write.table === 'rpc/submit_document_review');
  expect(submissions).toHaveLength(1);
  expect(submissions[0].body.p_expected_updated_at).toBe('2026-10-27T10:00:00Z');
  await accessible(page); await noOverflow(page);
});
