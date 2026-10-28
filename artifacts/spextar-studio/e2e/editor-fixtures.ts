import { expect, type Page } from '@playwright/test';

export type ContentNode = {
  type: string; text?: string; attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: ContentNode[];
};
export const paragraph = (id: string, text: string): ContentNode =>
  ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });
export const technicalBody = () => ({
  type: 'doc', version: 1, ownerMetadata: { preserved: true }, content: [
    paragraph('stable-paragraph', 'Alpha alpha'),
    { type: 'heading', attrs: { id: 'heading-one', level: 2 }, content: [{ type: 'text', text: 'Section one' }] },
    { type: 'callout', attrs: { id: 'callout-one', kind: 'note' }, content: [paragraph('note-paragraph', 'alpha note')] },
    { type: 'bulletList', attrs: { id: 'list-one' }, content: [
      { type: 'listItem', attrs: { id: 'item-one' }, content: [paragraph('list-paragraph', 'List entry')] },
    ] },
    { type: 'table', attrs: { id: 'table-one' }, content: [0, 1, 2].map(row => ({
      type: 'tableRow', attrs: { id: `row-${row}` }, content: [0, 1].map(col => ({
        type: row === 0 ? 'tableHeader' : 'tableCell',
        attrs: { id: `cell-${row}-${col}`, colspan: 1, rowspan: 1, colwidth: null },
        content: [paragraph(`cell-paragraph-${row}-${col}`,
          row === 1 && col === 0 ? 'alpha cell' : `Cell ${row} ${col}`)],
      })),
    })) },
    { type: 'heading', attrs: { id: 'heading-two', level: 3 }, content: [{ type: 'text', text: 'Section two' }] },
    paragraph('closing-paragraph', 'Closing paragraph'),
  ],
});
export function nodes(content: unknown): ContentNode[] {
  const node = content as ContentNode;
  return [node, ...(node.content ?? []).flatMap(nodes)];
}
export function nodeIds(content: unknown) {
  return nodes(content).filter(n => n.type !== 'text' && n.type !== 'doc').map(n => n.attrs?.id);
}
export function stableDocument(content: unknown) {
  expect(content).toMatchObject({ version: 1, ownerMetadata: { preserved: true } });
  const ids = nodeIds(content);
  expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
}

/** Real browser clipboard + native paste, not a dispatched DOM paste event or editor command. */
export async function clipboard(page: Page, html: string, text: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4181' });
  await page.evaluate(async ({ html, text }) => {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })]);
  }, { html, text });
}
export async function selectedCell(page: Page) {
  return page.evaluate(() => {
    const node = window.getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest('td,th')?.textContent ?? '';
  });
}
export async function selectedCellPosition(page: Page) {
  return page.evaluate(() => {
    const node = window.getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const cell = element?.closest<HTMLTableCellElement>('td,th');
    return cell ? `${(cell.parentElement as HTMLTableRowElement).rowIndex}:${cell.cellIndex}` : '';
  });
}
