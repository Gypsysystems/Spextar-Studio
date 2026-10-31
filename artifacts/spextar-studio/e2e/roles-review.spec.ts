import { test, expect, login, activate, noOverflow, projectPath, bodyContent, type Role } from './fixture';

for (const role of ['admin', 'author', 'reviewer', 'viewer', null] satisfies Role[]) {
  test(`${role ?? 'inherited workspace admin'}: authoring affordances, explicit administration, Review and Output Preview never write`, async ({ page, backend }) => {
    backend.setRole(role);
    const editable = role === 'admin' || role === 'author';
    await login(page, projectPath + '/variables-conditions');
    await expect(page.getByTestId('text-variable-default')).toBeVisible();
    await expect(page.getByTestId('button-new-variable')).toBeEnabled({ enabled: editable });
    await activate(page, page.getByRole('tab', { name: 'Conditional tags', exact: true }));
    await expect(page.getByTestId('text-category-name')).toHaveText('Audience');
    await activate(page, page.getByRole('tab', { name: 'Output preview', exact: true }));
    await expect(page.getByTestId('text-preview-resolved-var-a')).toHaveText('QA Product');
    await page.getByLabel('Output', { exact: true }).selectOption('pdf-manual');
    await expect(page.getByTestId('text-preview-resolved-var-a')).toHaveText('QA PDF');
    await noOverflow(page);
    await page.goto(projectPath + '/settings');
    await expect(page.getByTestId('input-name')).toBeEnabled({ enabled: role === 'admin' });
    await page.goto(projectPath + '/author/doc-a');
    const body = page.getByRole('textbox', { name: 'Topic body' });
    await expect(body).toContainText('Current saved QA topic');
    await expect(body).toHaveAttribute('contenteditable', String(editable));
    if (!editable) {
      await body.focus(); await page.keyboard.type('BLOCKED');
      await expect(body).not.toContainText('BLOCKED');
    }
    await noOverflow(page);
    await page.goto(projectPath + '/review?document=doc-a');
    await expect(body).toContainText('Current saved QA topic');
    await expect(body).toHaveAttribute('contenteditable', 'false');
    await body.focus(); await page.keyboard.type('BLOCKED');
    await expect(body).not.toContainText('BLOCKED');
    await expect(page.getByTestId('review-draft-revision')).toHaveText('3');
    await activate(page, page.getByTestId('review-topic-topic-b'));
    await expect(page.getByTestId('review-draft-missing')).toBeVisible();
    await expect(page.getByTestId('review-draft-revision')).toHaveCount(0);
    expect(backend.writes).toHaveLength(0);
  });
}

test('Review saved hierarchy, error/retry, frozen validation, lossless legacy content and empty eligibility', async ({ page, backend }) => {
  await login(page, projectPath + '/review?document=doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(body).toContainText('Current saved QA topic');
  const topicLabels = await page.locator('[data-testid^="review-topic-"]').allTextContents();
  expect(topicLabels.join(' ')).toMatch(/QA topic.*Child topic/);
  backend.failures.add('document_reviews');
  await page.reload();
  await expect(page.getByText('Submitted review did not load', { exact: true })).toBeVisible();
  await expect(body).toHaveCount(0);
  backend.failures.delete('document_reviews');
  await activate(page, page.getByRole('button', { name: 'Retry', exact: true }));
  await expect(body).toContainText('Current saved QA topic');
  const unknown = { ...bodyContent(), content: [{ type: 'futureModule', attrs: { opaque: 'never flatten' } }] };
  (backend.db.document_reviews[0].topics_snapshot as Record<string, unknown>[])[0].content = unknown;
  await page.reload();
  // Versioned frozen packages reject unsupported content. Legacy NULL packages
  // retain the original lossless read-only inspection contract instead.
  await expect(page.getByText('Submitted review did not load', { exact: true })).toBeVisible();
  await expect(body).toHaveCount(0);
  backend.db.document_reviews[0].dependency_package = null;
  await page.reload();
  await expect(body).toHaveAttribute('aria-readonly', 'true');
  expect(await body.evaluate(el => el.tagName)).toBe('PRE');
  expect(JSON.parse(await body.textContent() ?? '')).toEqual(unknown);
  await noOverflow(page);
  backend.db.documents = [];
  await page.reload();
  await expect(page.getByText('No documents to review', { exact: true })).toBeVisible();
  await expect(body).toHaveCount(0);
  expect(backend.writes).toHaveLength(0);
});

test('initial graph excludes Author/editor; Review defers viewer until a saved draft exists; direct Author refresh works', async ({ page, backend }) => {
  backend.db.topic_drafts = []; backend.captureReview();
  await login(page);
  await expect(page.getByTestId('card-workspace-ws-a')).toBeVisible();
  expect(backend.scripts.some(url => /\/(?:author|structured-editor|review-draft-viewer)-/.test(url))).toBe(false);
  await page.goto(projectPath + '/review?document=doc-a');
  await expect(page.getByTestId('review-draft-missing')).toBeVisible();
  expect(backend.scripts.some(url => /\/(?:author|structured-editor|review-draft-viewer)-/.test(url))).toBe(false);
  backend.db.topic_drafts.push({ topic_id: 'topic-a', content: bodyContent(), revision: 3, updated_at: '2026-10-27T10:00:00Z', updated_by: 'user-a' });
  backend.captureReview();
  await activate(page, page.getByRole('button', { name: 'Refresh', exact: true }));
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toBeVisible();
  expect(backend.scripts.some(url => /\/review-draft-viewer-/.test(url))).toBe(true);
  expect(backend.scripts.some(url => /\/structured-editor-/.test(url))).toBe(true);
  expect(backend.scripts.some(url => /\/author-/.test(url))).toBe(false);
  await page.goto(projectPath + '/author/doc-a');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toBeVisible();
  expect(backend.scripts.some(url => /\/author-/.test(url))).toBe(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toContainText('Current saved QA topic');
  expect(backend.writes).toHaveLength(0);
});
