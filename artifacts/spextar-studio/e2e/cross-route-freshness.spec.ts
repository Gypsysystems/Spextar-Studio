import type { Page } from '@playwright/test';
import { test, expect, login, activate, navigate, signOut, noOverflow, projectPath } from './fixture';

test.beforeEach(({ backend }) => { backend.management.enabled = true; });

async function save(page: Page) {
  await activate(page, page.getByRole('dialog').locator('button[type=submit]'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('variable edits invalidate an already visited Output Preview without reloading the application', async ({ page, backend }) => {
  await login(page, projectPath + '/variables-conditions');
  const preview = () => activate(page, page.getByRole('tab', { name: 'Output preview', exact: true }));
  await preview();
  await page.getByTestId('select-output-preview').selectOption('pdf-manual');
  await expect(page.getByTestId('text-preview-resolved-var-a')).toHaveText('QA PDF');
  await activate(page, page.getByRole('tab', { name: 'Variables', exact: true }));
  await activate(page, page.getByTestId('button-edit-variable'));
  await page.getByTestId('input-variable-value').fill('New default');
  await page.getByTestId('input-variable-output-pdf-manual').fill('New PDF');
  await save(page);
  await preview();
  await page.getByTestId('select-output-preview').selectOption('pdf-manual');
  await expect(page.getByTestId('text-preview-resolved-var-a')).toHaveText('New PDF');
  await expect(page.getByTestId('text-preview-default-var-a')).toHaveText('New default');
  const writes = backend.writes.length;
  await navigate(page, 'nav-home');
  await expect(page.getByTestId('text-doc-count')).toHaveText('1');
  await navigate(page, 'nav-variables-conditions');
  await preview();
  await page.getByTestId('select-output-preview').selectOption('word-review');
  await expect(page.getByTestId('text-preview-resolved-var-a')).toHaveText('New default');
  await expect(page.getByTestId('status-preview-source-var-a')).toHaveText('Default value');
  expect(backend.writes).toHaveLength(writes);
  expect(backend.scripts.some(url => /\/(?:author|structured-editor|review-draft-viewer)-/.test(url))).toBe(false);
  await noOverflow(page);
});

test('create and conservative delete refresh Project Home counts and Documents hierarchy in the same session', async ({ page, backend }) => {
  backend.db.documents[0].status = 'in_review';
  await login(page, projectPath);
  await expect(page.getByTestId('text-doc-count')).toHaveText('1');
  const summary = page.getByRole('complementary', { name: 'Project summary' });
  await expect(summary.locator('dt').filter({ hasText: /^Topics$/ }).locator('+ dd')).toHaveText('2');
  await navigate(page, 'nav-home');
  await activate(page, page.getByRole('button', { name: /^Create document$/ }).first());
  await page.getByLabel(/create document title/i).fill('Cross-route document');
  await save(page);
  const doc = backend.db.documents.find(d => d.title === 'Cross-route document')!;
  await expect(page).toHaveURL(projectPath + '/author/' + doc.id);
  await activate(page, page.getByRole('button', { name: /^Create topic$/ }).first());
  await page.getByLabel(/create topic title/i).fill('Cross-route topic');
  await save(page);
  const topic = backend.db.topics.find(t => t.document_id === doc.id)!;
  await expect(page.getByTestId(`outline-topic-${topic.id}`)).toBeVisible();
  await navigate(page, 'nav-home');
  await expect(page.getByTestId('text-doc-count')).toHaveText('2');
  await expect(summary.locator('dt').filter({ hasText: /^Topics$/ }).locator('+ dd')).toHaveText('3');
  await expect(page.getByTestId('text-stage-count-author')).toHaveText('1');
  await navigate(page, 'nav-home');
  await activate(page, page.getByTestId(`button-expand-${doc.id}`));
  await expect(page.getByRole('link', { name: 'Cross-route topic', exact: true })).toBeVisible();
  await activate(page, page.getByRole('link', { name: 'Cross-route topic', exact: true }));
  await activate(page, page.getByRole('button', { name: /^Delete topic$/ }));
  await page.getByRole('dialog').getByRole('textbox').fill('Cross-route topic');
  await activate(page, page.getByRole('dialog').getByRole('button', { name: /^Delete topic$/ }));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId(`outline-topic-${topic.id}`)).toHaveCount(0);
  await activate(page, page.getByRole('button', { name: /^Delete document$/ }));
  await page.getByRole('dialog').getByRole('textbox').fill('Cross-route document');
  await activate(page, page.getByRole('dialog').getByRole('button', { name: /^Delete document$/ }));
  await expect(page).toHaveURL(projectPath + '/documents');
  await expect(page.getByTestId(`row-document-${doc.id}`)).toHaveCount(0);
  await navigate(page, 'nav-home');
  await expect(page.getByTestId('text-doc-count')).toHaveText('1');
  await expect(summary.locator('dt').filter({ hasText: /^Topics$/ }).locator('+ dd')).toHaveText('2');
  await expect(page.getByTestId('text-stage-count-author')).toHaveText('0');
  await expect(page.getByTestId(`link-recent-doc-${doc.id}`)).toHaveCount(0);
  await noOverflow(page);
});

test('empty Project Home accurately routes to implemented document creation', async ({ page, backend }) => {
  backend.db.documents = [];
  backend.db.topics = [];
  backend.db.topic_drafts = [];
  await login(page, projectPath);
  await expect(page.getByText('No documents yet', { exact: true })).toBeVisible();
  await expect(page.getByText(/Document creation arrives in a later phase/)).toHaveCount(0);
  await expect(page.getByText(/explicit project Admin or Author can create/)).toBeVisible();
  await activate(page, page.getByRole('link', { name: 'Open Documents', exact: true }));
  await expect(page).toHaveURL(projectPath + '/documents');
  await activate(page, page.getByRole('button', { name: /^Create document$/ }).first());
  await page.getByLabel(/create document title/i).fill('First document');
  await save(page);
  // The empty-document Author view has no selected topic. Verify a fresh direct
  // Project Home load as well as the in-app create→Author navigation.
  await page.goto(projectPath);
  await expect(page.getByTestId('text-doc-count')).toHaveText('1');
  await expect(page.getByText('No documents yet', { exact: true })).toHaveCount(0);
  await noOverflow(page);
});

test('sign-out clears visited management caches before a different read-only identity signs in', async ({ page, backend }) => {
  await login(page, projectPath + '/variables-conditions');
  await expect(page.getByTestId('text-variable-default')).toHaveText('QA Product');
  await activate(page, page.getByRole('tab', { name: 'Conditional tags', exact: true }));
  await expect(page.getByTestId('text-category-name')).toHaveText('Audience');
  await navigate(page, 'nav-home');
  await expect(page.getByRole('heading', { name: 'Project A', exact: true })).toBeVisible();
  await signOut(page);
  backend.setIdentity('user-b');
  backend.setRole('viewer');
  backend.db.project_variables = [];
  backend.db.condition_categories = [];
  backend.db.condition_values = [];
  backend.db.documents = [];
  backend.db.topics = [];
  backend.db.topic_drafts = [];
  backend.db.projects[0].name = 'Second identity project';
  // Stay in the same browser document: this specifically protects QueryClient teardown.
  await page.getByTestId('input-email').fill('user-b@example.test');
  await page.getByTestId('input-password').fill('synthetic-password-not-a-real-credential');
  await activate(page, page.getByTestId('button-sign-in'));
  await expect(page.getByTestId('card-workspace-ws-a')).toBeVisible();
  await activate(page, page.getByTestId('card-workspace-ws-a'));
  await activate(page, page.getByRole('link', { name: /Second identity project/ }).first());
  await expect(page.getByTestId('text-doc-count')).toHaveText('0');
  await navigate(page, 'nav-variables-conditions');
  await expect(page.getByTestId('button-new-variable')).toBeDisabled();
  await expect(page.getByTestId('text-variable-default')).toHaveCount(0);
  await expect(page.getByText('QA Product', { exact: true })).toHaveCount(0);
  await activate(page, page.getByRole('tab', { name: 'Conditional tags', exact: true }));
  await expect(page.getByTestId('button-new-category')).toBeDisabled();
  await expect(page.getByTestId('text-category-name')).toHaveCount(0);
  await activate(page, page.getByRole('tab', { name: 'Output preview', exact: true }));
  await expect(page.getByTestId('card-preview-variable-var-a')).toHaveCount(0);
  expect(backend.writes).toHaveLength(0);
  await noOverflow(page);
});
