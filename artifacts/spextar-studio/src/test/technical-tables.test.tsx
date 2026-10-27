import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { CellSelection, selectedRect, TableMap } from '@tiptap/pm/tables';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { studioExtensions } from '@/features/editor/editor-extensions';
import { tableContext, type TableAction } from '@/features/editor/table-tools';
import { StructuredEditor } from '@/features/editor/structured-editor';
import { editorDocument, mergeEditorDocument, structuredContentIssue } from '@/domain/structured-content';
import type { TopicContent } from '@/domain/topic-content';
import { tableFixture } from './table-fixture';
const instances: Editor[] = [];
function engine(content = tableFixture(), editable = true) {
  const update = vi.fn();
  const editor = new Editor({ extensions: studioExtensions(), content: editorDocument(content) as JSONContent,
    editable, onUpdate: update });
  instances.push(editor);
  select(editor, 0, 0);
  update.mockClear();
  return { editor, update, json: () => mergeEditorDocument(content, editor.getJSON()) };
}
function cells(editor: Editor) {
  let start = 0;
  editor.state.doc.descendants((node, pos) => { if (node.type.name === 'table' && start === 0) start = pos + 1; });
  const table = editor.state.doc.nodeAt(start - 1)!;
  return { start, table, map: TableMap.get(table) };
}
function select(editor: Editor, row: number, column: number, endRow = row, endColumn = column) {
  const { start, map } = cells(editor);
  editor.view.dispatch(editor.state.tr.setMeta('skipTrailingNode', true).setSelection(CellSelection.create(
    editor.state.doc, start + map.map[row * map.width + column], start + map.map[endRow * map.width + endColumn])));
}
function ids(editor: Editor) {
  const result: string[] = [];
  editor.state.doc.descendants((node) => { if (node.attrs.id) result.push(node.attrs.id as string); });
  return result;
}
afterEach(() => { instances.splice(0).forEach((editor) => editor.destroy()); });

describe('guarded technical tables', () => {
  it.each([
    ['row-before', 4, 3], ['row-after', 4, 3], ['row-delete', 2, 3],
    ['col-before', 3, 4], ['col-after', 3, 4], ['col-delete', 3, 2],
  ] as [TableAction, number, number][])('%s preserves a valid grid, metadata, unaffected IDs and exact undo/redo', (action, rows, cols) => {
    const { editor, json } = engine();
    select(editor, 1, 1);
    const before = editor.getJSON();
    expect(editor.commands.editTechnicalTable(action)).toBe(true);
    expect(tableContext(editor.state)).toMatchObject({ rows, columns: cols });
    expect(structuredContentIssue(json())).toBeNull();
    expect(json()).toMatchObject({ version: 1, metadata: { language: 'en', untouched: true } });
    expect(ids(editor)).toContain('table');
    expect(ids(editor)).toContain('cell-0-0');
    expect(ids(editor).length).toBe(new Set(ids(editor)).size);
    const after = editor.getJSON();
    editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
    editor.commands.redo(); expect(editor.getJSON()).toEqual(after);
  });
  it('merges a rectangular range, retains marks/content and the surviving cell ID, then splits safely', () => {
    const { editor, json } = engine();
    select(editor, 1, 0, 1, 2);
    const before = editor.getJSON();
    expect(editor.commands.editTechnicalTable('merge')).toBe(true);
    const merged = editor.getJSON();
    expect(cells(editor).table.child(1).childCount).toBe(1);
    expect(cells(editor).table.child(1).firstChild?.attrs).toMatchObject({ id: 'cell-1-0', colspan: 3 });
    for (let c = 0; c < 3; c++) expect(ids(editor)).toContain(`p-1-${c}`);
    expect(JSON.stringify(json())).toContain('"italic"');
    expect(editor.commands.editTechnicalTable('split')).toBe(true);
    expect(cells(editor).table.child(1).childCount).toBe(3);
    expect(cells(editor).table.child(1).firstChild?.textContent).toBe('1:01:11:2');
    expect(ids(editor)).toContain('cell-1-0');
    expect(ids(editor).length).toBe(new Set(ids(editor)).size);
    expect(structuredContentIssue(json())).toBeNull();
    const split = editor.getJSON();
    editor.commands.undo(); expect(editor.getJSON()).toEqual(merged);
    editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
    editor.commands.redo(); editor.commands.redo(); expect(editor.getJSON()).toEqual(split);
  });
  it('supports rowspan/colspan across the full table, including fully covered empty rows', () => {
    const { editor, json } = engine(tableFixture(2, 2));
    editor.commands.selectTechnicalCells('table');
    expect(editor.commands.editTechnicalTable('merge')).toBe(true);
    expect(cells(editor).table.firstChild?.firstChild?.attrs).toMatchObject({ colspan: 2, rowspan: 2, id: 'cell-0-0' });
    expect(cells(editor).table.child(1).childCount).toBe(0);
    expect(structuredContentIssue(json())).toBeNull();
    expect(editor.commands.editTechnicalTable('split')).toBe(true);
    expect(cells(editor).table.child(1).childCount).toBe(2);
    expect(structuredContentIssue(json())).toBeNull();
    expect(ids(editor).length).toBe(new Set(ids(editor)).size);
  });
  it('rejects merge of mixed header/data cells and unsafe span header boundaries without updates', () => {
    const { editor, update } = engine(tableFixture(3, 3, true));
    select(editor, 0, 0, 1, 1);
    const before = editor.getJSON();
    expect(editor.can().editTechnicalTable('merge')).toBe(false);
    expect(editor.commands.editTechnicalTable('merge')).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(update).not.toHaveBeenCalled();
    select(editor, 1, 0, 1, 1);
    editor.commands.editTechnicalTable('merge');
    expect(editor.can().editTechnicalTable('header-column')).toBe(false);
    expect(editor.commands.editTechnicalTable('header-column')).toBe(false);
  });
  it('handles header row, header column and selected-cell headers without changing IDs or marks', () => {
    const { editor } = engine();
    const beforeIds = ids(editor), before = editor.getJSON();
    editor.commands.editTechnicalTable('header-row');
    expect(tableContext(editor.state)?.headerRow).toBe(true);
    expect(cells(editor).table.firstChild?.firstChild?.type.name).toBe('tableHeader');
    select(editor, 1, 1);
    editor.commands.editTechnicalTable('header-column');
    expect(tableContext(editor.state)?.headerColumn).toBe(true);
    editor.commands.editTechnicalTable('header-cell');
    expect(tableContext(editor.state)?.headerCell).toBe(true);
    expect(ids(editor)).toEqual(beforeIds);
    expect(editor.getHTML()).toContain('<em>1:1</em>');
    editor.commands.undo(); editor.commands.undo(); editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
  });
  it.each(['cell', 'row', 'column', 'table'] as const)('selects %s without writes or trailing paragraphs', (range) => {
    const { editor, update } = engine();
    const before = editor.getJSON();
    expect(editor.commands.selectTechnicalCells(range)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(tableContext(editor.state)?.selected).toBe(range === 'cell' ? 1 : range === 'table' ? 9 : 3);
    expect(editor.getJSON()).toEqual(before);
    expect(update).not.toHaveBeenCalled();
  });
  it('extends and contracts a cell rectangle using arrows, consumes boundary movement without changes', () => {
    const { editor, update } = engine();
    editor.commands.extendTechnicalCells('right');
    editor.commands.extendTechnicalCells('down');
    expect(tableContext(editor.state)?.selected).toBe(4);
    editor.commands.extendTechnicalCells('up');
    expect(tableContext(editor.state)?.selected).toBe(2);
    editor.commands.extendTechnicalCells('left');
    expect(tableContext(editor.state)?.selected).toBe(1);
    expect(editor.commands.extendTechnicalCells('left')).toBe(true);
    expect(tableContext(editor.state)?.selected).toBe(1);
    expect(update).not.toHaveBeenCalled();
  });
  it('navigates cells without writes and Tab-appends one row as a revision-safe single undo event', () => {
    const { editor, update, json } = engine(tableFixture(2, 2));
    editor.commands.navigateTechnicalCell(1);
    expect(selectedRect(editor.state)).toMatchObject({ top: 0, left: 1 });
    editor.commands.navigateTechnicalCell(-1);
    expect(update).not.toHaveBeenCalled();
    select(editor, 1, 1);
    const before = editor.getJSON();
    editor.commands.navigateTechnicalCell(1);
    expect(selectedRect(editor.state)).toMatchObject({ top: 2, left: 0 });
    expect(tableContext(editor.state)?.rows).toBe(3);
    expect(structuredContentIssue(json())).toBeNull();
    const after = editor.getJSON();
    editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
    editor.commands.redo(); expect(editor.getJSON()).toEqual(after);
    expect(ids(editor).length).toBe(new Set(ids(editor)).size);
  });
  it.each([false, true])('permission guard rejects destructive operations and trailing changes (composition=%s)', (composing) => {
    const { editor, update } = engine(tableFixture(), composing);
    if (composing) Object.defineProperty(editor.view, 'composing', { value: true });
    const before = editor.getJSON();
    for (const action of ['row-before', 'row-after', 'row-delete', 'col-before', 'col-after', 'col-delete',
      'merge', 'split', 'header-row', 'header-column', 'header-cell', 'table-delete'] as TableAction[]) {
      expect(editor.can().editTechnicalTable(action)).toBe(false);
      expect(editor.commands.editTechnicalTable(action)).toBe(false);
    }
    expect(editor.getJSON()).toEqual(before); expect(update).not.toHaveBeenCalled();
  });
  it('allows read-only selection/navigation but never Tab-appends a row', () => {
    const { editor, update } = engine(tableFixture(), false);
    const before = editor.getJSON();
    editor.commands.selectTechnicalCells('row');
    expect(tableContext(editor.state)?.selected).toBe(3);
    editor.commands.navigateTechnicalCell(1);
    select(editor, 2, 2);
    expect(editor.commands.navigateTechnicalCell(1)).toBe(false);
    expect(editor.getJSON()).toEqual(before); expect(update).not.toHaveBeenCalled();
  });
  it('rejects exceeding the existing maximum grid width without mutating the shared .can() transaction', () => {
    const { editor, update } = engine(tableFixture(1, 128));
    const before = editor.getJSON();
    expect(editor.can().editTechnicalTable('col-after')).toBe(false);
    expect(editor.commands.editTechnicalTable('col-after')).toBe(false);
    expect(editor.getJSON()).toEqual(before); expect(update).not.toHaveBeenCalled();
  });
  it('supports spanning row/column deletion and requires explicit removal of the final table with undo', () => {
    const { editor, json } = engine(tableFixture(3, 3));
    select(editor, 0, 0, 1, 0);
    editor.commands.editTechnicalTable('merge');
    editor.commands.editTechnicalTable('row-delete');
    expect(tableContext(editor.state)?.rows).toBe(1);
    expect(structuredContentIssue(json())).toBeNull();
    editor.commands.selectTechnicalCells('table');
    const before = editor.getJSON();
    expect(editor.commands.editTechnicalTable('col-delete')).toBe(false);
    expect(editor.commands.editTechnicalTable('row-delete')).toBe(false);
    expect(editor.commands.editTechnicalTable('table-delete')).toBe(true);
    expect(editor.getHTML()).not.toContain('<table');
    expect(structuredContentIssue(json())).toBeNull();
    editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
  });
  it('retains callouts, links, code, nested marks and root metadata inside merged cells', () => {
    const content = tableFixture(1, 2);
    const raw = content as unknown as JSONContent;
    raw.content![0].content![0].content![0].content = [
      { type: 'callout', attrs: { id: 'note', kind: 'note' }, content: [
        { type: 'paragraph', attrs: { id: 'note-p' }, content: [{ type: 'text', text: 'Reference',
          marks: [{ type: 'link', attrs: { href: 'https://example.test' } }, { type: 'bold' }] }] },
      ] },
    ];
    raw.content![0].content![0].content![1].content = [
      { type: 'codeBlock', attrs: { id: 'code', language: 'sh' }, content: [{ type: 'text', text: 'ls -l' }] },
    ];
    const { editor, json } = engine(content);
    editor.commands.selectTechnicalCells('row'); editor.commands.editTechnicalTable('merge');
    expect(editor.getHTML()).toContain('data-callout-kind="note"');
    expect(editor.getHTML()).toContain('href="https://example.test"');
    expect(ids(editor)).toEqual(expect.arrayContaining(['note', 'note-p', 'code']));
    expect(json()).toMatchObject({ version: 1, metadata: content.metadata });
    expect(structuredContentIssue(json())).toBeNull();
  });
});

function surface(content = tableFixture(), editable = true) {
  const changed = vi.fn();
  function View() {
    const [value, setValue] = useState(content);
    return <StructuredEditor content={value} editable={editable} onChange={(next) => { changed(next); setValue(next); }} />;
  }
  return { ...render(<View />), user: userEvent.setup(), changed };
}
describe('Author table toolbar and malformed content safety', () => {
  it('enables available table operations on load without requiring an initial editor click', async () => {
    surface(tableFixture());
    await screen.findByRole('textbox', { name: 'Topic body' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add row below' })).toBeEnabled());
  });
  it('exposes merge/split, header-column/cell, range selection and predictable toolbar undo', async () => {
    const { user, changed } = surface(tableFixture(2, 2));
    const body = await screen.findByRole('textbox', { name: 'Topic body' });
    const editor = (body as HTMLElement & { editor: Editor }).editor;
    act(() => select(editor, 0, 0));
    await user.click(screen.getByRole('button', { name: 'Select row' }));
    expect(screen.getByRole('button', { name: 'Merge selected cells' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Merge selected cells' }));
    expect(body.querySelector('td')).toHaveAttribute('colspan', '2');
    await user.click(screen.getByRole('button', { name: 'Split cell' }));
    expect(body.querySelectorAll('td')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Toggle cell header' }));
    expect(body.querySelector('th')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(body.querySelector('th')).not.toBeInTheDocument();
    expect(changed.mock.lastCall?.[0]).toMatchObject({ metadata: { language: 'en' } });
    act(() => select(editor, 1, 1));
    await user.click(screen.getByRole('button', { name: 'Toggle header column' }));
    expect(screen.getByRole('button', { name: 'Toggle header column' })).toHaveAttribute('aria-pressed', 'true');
  });
  it.each(['Reviewer', 'Viewer'])('%s can select table cells but cannot mutate', async () => {
    const { user, changed } = surface(tableFixture(), false);
    const body = await screen.findByRole('textbox', { name: 'Topic body' });
    act(() => select((body as HTMLElement & { editor: Editor }).editor, 0, 0));
    for (const label of ['Merge selected cells', 'Split cell', 'Toggle header column', 'Toggle cell header', 'Add row below', 'Delete table']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
    await user.click(screen.getByRole('button', { name: 'Select table' }));
    expect(body.querySelectorAll('.selectedCell')).toHaveLength(9);
    expect(changed).not.toHaveBeenCalled();
  });
  it.each(['unknown-attr', 'jagged-grid', 'empty-uncovered-row', 'invalid-span'])('preserves %s JSON losslessly and read-only', async (kind) => {
    const content = tableFixture(2, 2);
    const table = (content as unknown as JSONContent).content![0];
    if (kind === 'unknown-attr') table.attrs!.future = { keep: 'unchanged' };
    if (kind === 'jagged-grid') table.content![1].content!.pop();
    if (kind === 'empty-uncovered-row') table.content![1].content = [];
    if (kind === 'invalid-span') table.content![0].content![0].attrs!.rowspan = 9;
    const before = structuredClone(content);
    const { changed } = surface(content);
    expect(screen.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('aria-readonly', 'true');
    expect(JSON.parse(screen.getByRole('textbox').textContent!)).toEqual(before);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });
});
