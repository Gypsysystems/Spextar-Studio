import { test, expect, login, activate, projectPath, noOverflow, bodyContent } from './fixture';
import { accessible } from './accessibility-helpers';

test('workflow guidance matches available project lifecycle and Author submission', async ({ page }) => {
  await login(page, projectPath);
  const lifecycle = page.getByRole('region', { name: 'Document lifecycle' });
  await expect(lifecycle).toBeVisible();
  await expect(lifecycle).not.toContainText('Actions unavailable');
  for (const stage of ['author', 'review', 'publish']) {
    await expect(page.getByTestId(`link-stage-${stage}`)).toHaveAttribute('href', `${projectPath}/${stage}`);
  }
  await noOverflow(page);
  await accessible(page);
  await page.goto(projectPath + '/author/doc-a');
  await expect(page.getByTestId('body-save-status')).toContainText('Saved');
  await expect(page.getByRole('button', { name: 'Submit for review', exact: true })).toBeEnabled();
  await expect(page.getByTestId('author-workflow-scope')).toContainText('Use Submit for review on a saved draft');
  await activate(page, page.getByTestId('link-inspector-review'));
  await expect(page.getByTestId('review-page')).toBeVisible();
  await noOverflow(page);
});

test('Author statistics follow canonical draft edits, saved refresh, topic selection and unsupported data', async ({ page, backend }) => {
  const release = backend.hold('topic_drafts');
  backend.db.topic_drafts[0].content = { ...bodyContent(), content: [
    { type: 'heading', attrs: { level: 2, id: 'heading' }, content: [{ type: 'text', text: 'Saved heading' }] },
    { type: 'callout', attrs: { kind: 'note', id: 'note' }, content: [
      { type: 'paragraph', attrs: { id: 'paragraph' }, content: [{ type: 'text', text: 'Actual paragraph text' }] },
    ] },
  ] };
  await login(page, projectPath + '/author/doc-a');
  await expect(page.getByTestId('topic-statistics')).toHaveText('Loading body statistics…');
  release();
  await expect(page.getByTestId('topic-statistics')).toHaveText('5 words · 1 paragraphs');
  await expect(page.getByTestId('author-workflow-scope')).toHaveText('Draft bodies autosave. Use Submit for review on a saved draft to start review.');
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await body.fill('New canonical paragraph');
  // Native replacement retains the first heading block: words, not paragraphs.
  await expect(page.getByTestId('topic-statistics')).toHaveText('3 words · 0 paragraphs');
  await expect(page.getByTestId('body-save-status')).toContainText('Saved · revision 4');
  await page.reload();
  await expect(page.getByTestId('topic-statistics')).toHaveText('3 words · 0 paragraphs');
  await activate(page, page.getByTestId('outline-topic-topic-b'));
  await expect(page.getByTestId('topic-statistics')).toHaveText('0 words · 0 paragraphs');
  backend.db.topic_drafts.push({ topic_id: 'topic-b', content: { type: 'doc', version: 99, content: [] },
    revision: 1, updated_at: '2026-10-27T10:00:00Z', updated_by: 'user-a' });
  await page.reload();
  await activate(page, page.getByTestId('outline-topic-topic-b'));
  await expect(page.getByTestId('topic-statistics')).toHaveText('Body statistics unavailable');
  await noOverflow(page);
});
