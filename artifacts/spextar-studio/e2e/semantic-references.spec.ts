import { test, expect, login, activate, noOverflow, projectPath, type Backend } from './fixture';
import { accessible, tabTo, visibleFocus } from './accessibility-helpers';
const at = '2026-10-27T10:00:00Z';
function seed(backend: Backend) {
  backend.management.enabled = true;
  backend.db.reusable_contents = [
    {
      id: 'reuse-a',
      workspace_id: 'ws-a',
      project_id: 'project-a',
      scope: 'project',
      name: 'Safety notice',
      slug: 'safety-notice',
      description: null,
      settings: {},
      status: 'draft',
      update_policy: 'notify',
      tags: [],
      created_by: 'user-a',
      created_at: at,
      updated_at: at,
    },
  ];
  backend.db.reusable_content_drafts = [
    {
      reusable_content_id: 'reuse-a',
      content: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', attrs: { id: 'reuse-p' }, content: [{ type: 'text', text: 'Wear eye protection' }] },
        ],
      },
      revision: 2,
      updated_at: at,
      updated_by: 'user-a',
    },
  ];
}
const linkedBody = () => ({
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      attrs: { id: 'p', conditions: { version: 1, values: [{ categoryId: 'cat-a', valueId: 'val-a' }] } },
      content: [
        { type: 'text', text: 'Product: ' },
        { type: 'variableReference', attrs: { id: 'v', referenceVersion: 1, variableId: 'var-a' } },
      ],
    },
    { type: 'reusableReference', attrs: { id: 'r', referenceVersion: 1, reusableId: 'reuse-a' } },
  ],
});
test('Author inserts semantic references, saves/reopens, inspects usage and removes a conditional value', async ({
  page,
  backend,
}) => {
  seed(backend);
  await login(page, projectPath + '/author/doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 3');
  await body.press('ControlOrMeta+End');
  await activate(page, page.getByRole('button', { name: 'Insert variable', exact: true }));
  await page.getByLabel('Variable', { exact: true }).selectOption('var-a');
  await activate(page, page.getByRole('button', { name: 'Insert reference', exact: true }));
  await expect(body).toContainText('QA Product');
  await expect(body).toBeFocused();
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 4');
  expect(JSON.stringify(backend.db.topic_drafts[0].content)).toContain('variableReference');
  await activate(page, page.getByRole('button', { name: 'Conditional tags', exact: true }));
  await page.getByLabel('Conditional value', { exact: true }).selectOption('val-a');
  await activate(page, page.getByRole('button', { name: 'Apply tag', exact: true }));
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 5');
  await expect(page.getByLabel('Applied conditional tags')).toContainText('Audience: Developer');
  await body.press('ControlOrMeta+End');
  await activate(page, page.getByRole('button', { name: 'Insert reusable content', exact: true }));
  await page.getByLabel('Reusable content', { exact: true }).selectOption('reuse-a');
  await activate(page, page.getByRole('button', { name: 'Insert reference', exact: true }));
  await expect(body).toContainText('Wear eye protection');
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 6');
  await page.reload();
  await expect(body).toContainText('QA Product');
  await expect(body).toContainText('Wear eye protection');
  await expect(page.getByLabel('Applied conditional tags')).toContainText('Audience: Developer');
  await page.goto(projectPath + '/variables-conditions');
  await expect(page.getByTestId('text-where-used')).toContainText('1 saved reference');
  await expect(page.getByTestId('text-where-used')).toContainText('QA document · QA topic');
  await activate(page, page.getByTestId('button-rename-variable'));
  await page.getByTestId('input-identity-name').fill('Renamed product');
  await activate(page, page.getByRole('dialog').locator('button[type=submit]'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto(projectPath + '/author/doc-a');
  await expect(body).toContainText('QA Product');
  await body.press('ControlOrMeta+Home');
  await activate(page, page.getByRole('button', { name: 'Conditional tags', exact: true }));
  await activate(page, page.getByRole('button', { name: 'Remove tag', exact: true }));
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 7');
  await page.reload();
  await expect(page.getByLabel('Applied conditional tags')).toHaveCount(0);
  await noOverflow(page);
});
for (const role of ['reviewer', 'viewer'] as const)
  test(`${role} sees current Author previews and frozen Review references with no writes`, async ({ page, backend }) => {
    seed(backend);
    backend.setRole(role);
    backend.db.topic_drafts[0].content = linkedBody();
    await login(page, projectPath + '/author/doc-a');
    const body = page.getByRole('textbox', { name: 'Topic body' });
    await expect(body).toContainText('QA Product');
    await expect(body).toContainText('Wear eye protection');
    await expect(page.getByRole('button', { name: 'Insert variable', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Conditional tags', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Insert reusable content', exact: true })).toBeDisabled();
    backend.db.project_variables[0].value = 'Updated product';
    backend.db.reusable_content_drafts[0].content = {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated safety notice' }] }],
    };
    backend.captureReview();
    await page.goto(projectPath + '/review');
    await expect(body).toContainText('Updated product');
    await expect(body).toContainText('Updated safety notice');
    backend.db.project_variables = [];
    backend.db.reusable_contents = [];
    backend.db.condition_values = [];
    backend.reads.length = 0;
    await page.reload();
    await expect(body).toContainText('Updated product');
    await expect(body).toContainText('Updated safety notice');
    await expect(page.getByLabel('Applied conditional tags')).toContainText('Audience: Developer');
    expect(backend.reads.filter(r => ['project_variables','condition_categories','condition_values','reusable_contents','reusable_content_drafts'].includes(r.table))).toHaveLength(0);
    expect(await body.innerText()).not.toMatch(/var-a|reuse-a|val-a/);
    expect(backend.writes).toEqual([]);
    await noOverflow(page);
  });
test('reference picker keyboard focus, cancellation, tags and linked preview meet accessibility checks', async ({
  page,
  backend,
}) => {
  seed(backend);
  backend.db.topic_drafts[0].content = linkedBody();
  await login(page, projectPath + '/author/doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(body).toContainText('Wear eye protection');
  const trigger = page.getByRole('button', { name: 'Insert variable', exact: true });
  await tabTo(page, trigger);
  await visibleFocus(trigger);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Variable', { exact: true })).toBeFocused();
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(body).toBeFocused();
  await accessible(page);
  await noOverflow(page);
  expect(backend.writes).toEqual([]);
});

test('loading a topic body preserves document action positions for touch input', async ({ page, backend }) => {
  seed(backend);
  const release = backend.hold('topic_drafts');
  await login(page, projectPath + '/author/doc-a');
  await expect(page.getByTestId('body-save-status')).toContainText('Loading saved body');
  const button = page.getByRole('button', { name: 'Duplicate document', exact: true });
  await expect(button).toBeVisible();
  const position = () => button.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const before = await position();
  release();
  await expect(page.getByTestId('body-save-status')).toHaveText('Saved · revision 3');
  expect(Math.abs((await position()) - before)).toBeLessThanOrEqual(2);
  await activate(page, button);
  await expect(page.getByLabel(/duplicate document title/i)).toBeVisible();
  expect(backend.writes).toEqual([]);
});

for (const type of ['bulletList', 'orderedList'] as const)
  test(`${type} container conditions preserve list semantics and accessibility in linked read-only preview`, async ({
    page,
    backend,
  }) => {
    seed(backend);
    backend.setRole('viewer');
    const draft = {
      type: 'doc',
      version: 1,
      content: [
        {
          type,
          attrs: {
            id: 'tagged-list',
            ...(type === 'orderedList' ? { start: 4, type: 'I' } : {}),
            conditions: { version: 1, values: [{ categoryId: 'cat-a', valueId: 'val-a' }] },
          },
          content: ['First tagged item', 'Second tagged item'].map((text, i) => ({
            type: 'listItem',
            attrs: { id: `item-${i}` },
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })),
        },
      ],
    };
    backend.db.reusable_content_drafts[0].content = draft;
    backend.db.topic_drafts[0].content = linkedBody();
    const savedDraft = structuredClone(backend.db.reusable_content_drafts[0]);
    const savedTopic = structuredClone(backend.db.topic_drafts[0]);
    backend.captureReview();
    await login(page, projectPath + '/review');
    const body = page.getByRole('textbox', { name: 'Topic body' });
    const preview = body.locator('.se-linked-body');
    await expect(preview).toContainText('Audience: Developer');
    const list = preview.getByRole('list');
    await expect(list).toHaveCount(1);
    expect(await list.evaluate((el) => Array.from(el.children).map((n) => n.tagName))).toEqual(['LI', 'LI']);
    await expect(list.getByRole('listitem')).toHaveText(['First tagged item', 'Second tagged item']);
    await expect(list).not.toContainText('Audience: Developer');
    expect(await list.evaluate((el) => el.previousElementSibling?.textContent)).toBe('Audience: Developer');
    if (type === 'orderedList') {
      await expect(list).toHaveAttribute('start', '4');
      await expect(list).toHaveAttribute('type', 'I');
    }
    await expect(body).toHaveAttribute('contenteditable', 'false');
    expect(await body.innerText()).not.toMatch(/cat-a|val-a|tagged-list|item-0|reuse-a/);
    await accessible(page);
    await noOverflow(page);
    expect(backend.db.reusable_content_drafts[0]).toEqual(savedDraft);
    expect(backend.db.topic_drafts[0]).toEqual(savedTopic);
    expect(backend.writes).toEqual([]);
  });
