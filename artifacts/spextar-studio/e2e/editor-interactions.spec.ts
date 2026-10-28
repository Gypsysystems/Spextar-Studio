import { test, expect, login, activate, noOverflow, projectPath, type Backend } from './fixture';
import type { Page } from '@playwright/test';
import { clipboard, nodes, nodeIds, paragraph, selectedCell, selectedCellPosition, stableDocument, technicalBody } from './editor-fixtures';

const author = projectPath + '/author/doc-a';
const body = (page: Page) => page.getByRole('textbox', { name: 'Topic body', exact: true });
const tool = (page: Page, label: string) => page.getByRole('toolbar', { name: 'Topic body formatting' }).getByRole('button', { name: label, exact: true });
const current = (backend: Backend) => backend.db.topic_drafts[0].content;
const serialized = (backend: Backend) => JSON.stringify(current(backend));
async function saved(page: Page) {
  await expect(page.getByTestId('body-save-status')).toHaveText(/^Saved · revision \d+$/);
}
async function ready(page: Page, backend: Backend) {
  backend.db.topic_drafts[0].content = technicalBody();
  await login(page, author);
  await expect(body(page)).toHaveAttribute('contenteditable', 'true');
  await saved(page);
}

test('technical table controls, native cell navigation, rectangular selection and exact history persist safely', async ({ page, backend }) => {
  await ready(page, backend);
  const table = body(page).locator('table');
  await activate(page, table.locator('tr').nth(1).locator('td').first());
  await expect.poll(() => selectedCell(page)).toBe('alpha cell');
  await page.keyboard.press('Tab');
  await expect.poll(() => selectedCell(page)).toBe('Cell 1 1');
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => selectedCell(page)).toBe('alpha cell');
  await activate(page, tool(page, 'Add row below'));
  await expect(table.locator('tr')).toHaveCount(4);
  // Insertion keeps the original selection; explicitly select the new row.
  await activate(page, table.locator('tr').nth(2).locator('td').first().locator('p'));
  await expect.poll(() => selectedCellPosition(page)).toBe('2:0');
  await activate(page, tool(page, 'Delete row'));
  await expect(table.locator('tr')).toHaveCount(3);
  await activate(page, table.locator('tr').nth(1).locator('td').first().locator('p'));
  await expect.poll(() => selectedCellPosition(page)).toBe('1:0');
  await activate(page, tool(page, 'Add column right'));
  await expect(table.locator('tr').first().locator('th,td')).toHaveCount(3);
  await activate(page, table.locator('tr').nth(1).locator('td').nth(1).locator('p'));
  await expect.poll(() => selectedCellPosition(page)).toBe('1:1');
  await activate(page, tool(page, 'Delete column'));
  await expect(table.locator('tr').first().locator('th,td')).toHaveCount(2);
  await activate(page, table.locator('tr').nth(1).locator('td').first());
  await expect.poll(() => selectedCell(page)).toBe('alpha cell');
  await activate(page, tool(page, 'Select row'));
  await expect(page.locator('.se-table-summary')).toContainText('2 selected');
  await activate(page, tool(page, 'Merge selected cells'));
  await expect(table.locator('[colspan="2"]')).toHaveCount(1);
  await expect.poll(() => nodes(current(backend)).filter(n => n.attrs?.colspan === 2).length).toBe(1);
  await saved(page);
  const merged = serialized(backend);
  await activate(page, tool(page, 'Split cell'));
  await expect(table.locator('th,td')).toHaveCount(6);
  await expect.poll(() => nodes(current(backend)).filter(n => n.type === 'tableCell' || n.type === 'tableHeader').length).toBe(6);
  await saved(page);
  const split = serialized(backend);
  await body(page).press('ControlOrMeta+z');
  await expect.poll(() => serialized(backend)).toBe(merged);
  await body(page).press('ControlOrMeta+Shift+z');
  await expect.poll(() => serialized(backend)).toBe(split);
  await activate(page, tool(page, 'Toggle header row'));
  await expect(table.locator('tr').first().locator('th')).toHaveCount(0);
  await activate(page, tool(page, 'Toggle header row'));
  await expect(table.locator('tr').first().locator('th')).toHaveCount(2);
  await activate(page, tool(page, 'Toggle header column'));
  await expect(table.locator('tr').nth(1).locator('th')).toHaveCount(1);
  await expect.poll(() => nodes(current(backend)).filter(n => n.type === 'tableHeader').length).toBe(4);
  await saved(page);
  stableDocument(current(backend));
  expect(nodeIds(current(backend))).toContain('stable-paragraph');
  const result = serialized(backend);
  await page.reload();
  await expect(body(page).locator('table tr')).toHaveCount(3);
  expect(serialized(backend)).toBe(result);
  await noOverflow(page);
});

test('native text selection, formatting and semantic callout conversion preserve identities and toolbar keyboard focus', async ({ page, backend }) => {
  await ready(page, backend);
  await body(page).press('ControlOrMeta+Home');
  await page.keyboard.press('Shift+End');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Alpha alpha');
  await activate(page, tool(page, 'Bold'));
  await expect(body(page).locator('p').first().locator('strong')).toHaveText('Alpha alpha');
  for (const kind of ['Note', 'Tip', 'Caution', 'Warning']) {
    await activate(page, tool(page, `${kind} callout`));
    await expect(body(page).locator(`aside[data-callout-kind="${kind.toLowerCase()}"]`).first()).toContainText('Alpha alpha');
  }
  await expect.poll(() => nodes(current(backend)).find(n => n.content?.some(c => c.attrs?.id === 'stable-paragraph'))?.attrs?.kind).toBe('warning');
  await saved(page);
  const callout = nodes(current(backend)).find(n => n.content?.some(c => c.attrs?.id === 'stable-paragraph'))!;
  await activate(page, tool(page, 'Remove callout'));
  await expect(body(page).locator('p').first().locator('strong')).toHaveText('Alpha alpha');
  await expect.poll(() => nodes(current(backend)).find(n => n.attrs?.id === callout.attrs?.id)).toBeUndefined();
  await saved(page);
  await activate(page, tool(page, 'Undo'));
  await expect(body(page).locator('aside[data-callout-kind="warning"]')).toContainText('Alpha alpha');
  await activate(page, tool(page, 'Redo'));
  await expect(body(page).locator('p').first().locator('strong')).toHaveText('Alpha alpha');
  await activate(page, tool(page, 'Undo'));
  await expect(body(page).locator('aside[data-callout-kind="warning"]')).toContainText('Alpha alpha');
  await tool(page, 'Bold').focus();
  await page.keyboard.press('Home');
  await expect(tool(page, 'Find and replace')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tool(page, 'Undo')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(body(page)).toBeFocused();
  await saved(page);
  await page.reload();
  await expect(body(page).locator('aside[data-callout-kind="warning"] strong')).toHaveText('Alpha alpha');
  expect(nodes(current(backend)).find(n => n.attrs?.id === callout.attrs?.id)?.attrs?.kind).toBe('warning');
  stableDocument(current(backend));
  await noOverflow(page);
});

test('Find navigates without writes; case-sensitive replacement preserves marked text, callouts, table structure and IDs', async ({ page, backend }) => {
  const content = technicalBody();
  content.content[0].content = [
    { type: 'text', text: 'Alpha', marks: [{ type: 'bold' }] }, { type: 'text', text: ' alpha' },
  ];
  backend.db.topic_drafts[0].content = content;
  await login(page, author);
  await expect(body(page)).toContainText('Alpha alpha');
  const before = serialized(backend);
  await body(page).press('ControlOrMeta+f');
  const search = page.getByRole('region', { name: 'Find and replace in this topic' });
  await search.getByLabel('Find in this topic', { exact: true }).fill('alpha');
  await expect(search.getByRole('status')).toHaveText('1 of 4 matches');
  await activate(page, search.getByRole('button', { name: 'Next match', exact: true }));
  await expect(search.getByRole('status')).toHaveText('2 of 4 matches');
  await search.getByLabel('Find in this topic', { exact: true }).press('Shift+Enter');
  await expect(search.getByRole('status')).toHaveText('1 of 4 matches');
  await search.getByLabel('Match case').check();
  await expect(search.getByRole('status')).toHaveText('1 of 3 matches');
  expect(backend.writes).toHaveLength(0);
  expect(serialized(backend)).toBe(before);
  await search.getByLabel('Replace with', { exact: true }).fill('omega');
  await activate(page, search.getByRole('button', { name: 'Replace current', exact: true }));
  await expect(search.getByRole('status')).toContainText('of 2 matches');
  await activate(page, search.getByRole('button', { name: 'Replace all', exact: true }));
  await expect(search.getByRole('status')).toContainText('No matches');
  await expect.poll(() => serialized(backend).includes('omega cell')).toBe(true);
  await saved(page);
  expect(nodeIds(current(backend))).toEqual(nodeIds(content));
  expect(nodes(current(backend)).find(n => n.text === 'Alpha')?.marks).toEqual([{ type: 'bold' }]);
  await activate(page, search.getByRole('button', { name: 'Close find and replace' }));
  await page.reload();
  await expect(body(page).locator('aside')).toContainText('omega note');
  await expect(body(page).locator('table')).toContainText('omega cell');
  stableDocument(current(backend));
  await noOverflow(page);
});

test('real rich clipboard paste preserves supported containers and formatting, assigns unique IDs, and round-trips through save and undo', async ({ page, backend }) => {
  await ready(page, backend);
  const original = serialized(backend);
  await clipboard(page, '<h2>Clipboard heading</h2><p data-node-id="stable-paragraph"><strong>Clipboard bold</strong> and <em>italic</em></p><ul><li><p>Clipboard list</p></li></ul><table><tr><th><p>Header</p></th><th><p>Other</p></th></tr><tr><td><p>Rich cell</p></td><td><p>Value</p></td></tr></table>', 'Clipboard heading\nClipboard bold and italic\nClipboard list\nHeader Other\nRich cell Value');
  await body(page).press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(body(page).locator('h2').filter({ hasText: 'Clipboard heading' })).toHaveCount(1);
  await expect(body(page).locator('strong')).toHaveText('Clipboard bold');
  await expect(body(page).locator('em')).toHaveText('italic');
  await expect(body(page).locator('table')).toHaveCount(2);
  await expect.poll(() => serialized(backend).includes('Rich cell')).toBe(true);
  await saved(page);
  stableDocument(current(backend));
  for (const id of nodeIds(JSON.parse(original))) expect(nodeIds(current(backend))).toContain(id);
  await activate(page, tool(page, 'Undo'));
  await expect(body(page)).not.toContainText('Clipboard heading');
  await activate(page, tool(page, 'Redo'));
  await expect(body(page)).toContainText('Clipboard heading');
  await expect.poll(() => serialized(backend).includes('Rich cell')).toBe(true);
  await saved(page);
  const persisted = serialized(backend);
  await page.reload();
  await expect(body(page).locator('table')).toHaveCount(2);
  expect(serialized(backend)).toBe(persisted);
  await noOverflow(page);
});

test('unsafe or malformed clipboard is non-destructive; literal-text fallback requires explicit consent', async ({ page, backend }) => {
  await ready(page, backend);
  const before = serialized(backend);
  for (const html of [
    '<figure data-type="future-reference"><p>Unsupported semantic content</p></figure>',
    '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>',
    '<p><a href="javascript:alert(1)">Unsafe link</a></p>',
  ]) {
    await clipboard(page, html, 'Unconverted clipboard source');
    await body(page).press('ControlOrMeta+End');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.getByRole('alert').filter({ hasText: 'Nothing was inserted' })).toBeVisible();
    expect(serialized(backend)).toBe(before);
    expect(backend.writes).toHaveLength(0);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Unconverted clipboard source');
    await activate(page, page.getByRole('button', { name: 'Dismiss paste', exact: true }));
  }
  await clipboard(page, '<figure data-type="future-reference">Literal fallback</figure>', 'Literal fallback');
  await body(page).press('ControlOrMeta+End');
  await page.keyboard.press('ControlOrMeta+v');
  await activate(page, page.getByRole('button', { name: 'Paste text only (formatting will be removed)', exact: true }));
  await expect(body(page)).toContainText('Literal fallback');
  await expect.poll(() => serialized(backend).includes('Literal fallback')).toBe(true);
  await saved(page);
  expect(nodes(current(backend)).some(n => n.type === 'future-reference')).toBe(false);
  stableDocument(current(backend));
  await noOverflow(page);
});

test('structured callout edits survive save failure and recovery without bypassing stale-revision protection', async ({ page, backend }) => {
  await ready(page, backend);
  const originalIds = nodeIds(current(backend));
  backend.failDraftWrites = true;
  await activate(page, body(page).locator('aside p'));
  await page.keyboard.press('End');
  await page.keyboard.type(' recovered callout');
  await expect(page.getByTestId('body-save-status')).toHaveText('Body not saved');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toBeVisible();
  await expect(body(page)).not.toContainText('recovered callout');
  backend.failDraftWrites = false;
  await activate(page, page.getByRole('button', { name: 'Restore recovery', exact: true }));
  await expect(body(page).locator('aside')).toContainText('recovered callout');
  await expect.poll(() => serialized(backend).includes('recovered callout')).toBe(true);
  await saved(page);
  expect(nodeIds(current(backend))).toEqual(originalIds);
  backend.conflictNextSave = true;
  await activate(page, body(page).locator('aside p'));
  await page.keyboard.press('End');
  await page.keyboard.type(' stale structured edit');
  await expect(page.getByTestId('body-save-status')).toHaveText('Concurrent-edit conflict');
  expect(serialized(backend)).not.toContain('stale structured edit');
  const server = serialized(backend);
  await activate(page, page.getByRole('button', { name: /Reload saved/ }));
  await expect(body(page)).toContainText('Newer server body');
  await expect(page.getByRole('region', { name: 'Recover topic body' })).toBeVisible();
  await activate(page, page.getByRole('button', { name: 'Discard recovery', exact: true }));
  expect(serialized(backend)).toBe(server);
  await noOverflow(page);
});

test('long-document heading and toolbar keyboard navigation preserve content and defer the editor until Author', async ({ page, backend }) => {
  const content = technicalBody();
  content.content.splice(2, 0, ...Array.from({ length: 35 }, (_, i) => paragraph(`long-${i}`, `Long technical paragraph ${i}`)));
  backend.db.topic_drafts[0].content = content;
  await login(page);
  expect(backend.scripts.some(url => /\/(?:author-|structured-editor-)/.test(url))).toBe(false);
  const before = serialized(backend);
  await page.goto(author);
  await expect(body(page)).toHaveAttribute('contenteditable', 'true');
  expect(backend.scripts.some(url => /\/structured-editor-/.test(url))).toBe(true);
  await body(page).press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+Alt+ArrowDown');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest('h2,h3')?.textContent)).toBe('Section one');
  await page.keyboard.press('ControlOrMeta+Alt+ArrowDown');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest('h2,h3')?.textContent)).toBe('Section two');
  await page.keyboard.press('ControlOrMeta+Alt+ArrowUp');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest('h2,h3')?.textContent)).toBe('Section one');
  expect(backend.writes).toHaveLength(0);
  expect(serialized(backend)).toBe(before);
  await noOverflow(page);
});

for (const role of ['reviewer', 'viewer', null] as const) {
  test(`${role ?? 'inherited-admin'}: advanced editor inspection and search never mutate`, async ({ page, backend }) => {
    backend.setRole(role);
    backend.db.topic_drafts[0].content = technicalBody();
    const before = serialized(backend);
    await login(page, author);
    await expect(body(page)).toHaveAttribute('contenteditable', 'false');
    await expect(tool(page, 'Bold')).toBeDisabled();
    await expect(tool(page, 'Note callout')).toBeDisabled();
    await expect(tool(page, 'Insert table')).toBeDisabled();
    await activate(page, body(page).locator('table tr').nth(1).locator('td').first());
    await expect(tool(page, 'Add row below')).toBeDisabled();
    await expect(tool(page, 'Merge selected cells')).toBeDisabled();
    await activate(page, tool(page, 'Find and replace'));
    const search = page.getByRole('region', { name: 'Find and replace in this topic' });
    await search.getByLabel('Find in this topic', { exact: true }).fill('alpha');
    await expect(search.getByRole('status')).toHaveText('1 of 4 matches');
    await activate(page, search.getByRole('button', { name: 'Next match', exact: true }));
    await expect(search.getByRole('status')).toHaveText('2 of 4 matches');
    await expect(search.getByLabel('Replace with', { exact: true })).toBeDisabled();
    await expect(search.getByRole('button', { name: 'Replace all', exact: true })).toBeDisabled();
    expect(backend.writes).toHaveLength(0);
    expect(serialized(backend)).toBe(before);
    await noOverflow(page);
  });
}
