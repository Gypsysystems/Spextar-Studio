import { Extension } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { EditorState, Selection, type Command, type Transaction } from '@tiptap/pm/state';
import {
  addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, CellSelection,
  deleteColumn, deleteRow, deleteTable, goToNextCell, isInTable, mergeCells,
  selectedRect, selectionCell, splitCell, toggleHeader, toggleHeaderCell,
} from '@tiptap/pm/tables';
import { closeHistory } from '@tiptap/pm/history';
import { structuredContentIssue } from '@/domain/structured-content';
import { checkedContent } from '@/domain/topic-content';

export type TableAction = 'row-before' | 'row-after' | 'row-delete' | 'col-before' | 'col-after'
  | 'col-delete' | 'merge' | 'split' | 'header-row' | 'header-column' | 'header-cell' | 'table-delete';
export type TableRange = 'cell' | 'row' | 'column' | 'table';
type Direction = 'left' | 'right' | 'up' | 'down';

const actions: Record<TableAction, Command> = {
  'row-before': addRowBefore, 'row-after': addRowAfter, 'row-delete': deleteRow,
  'col-before': addColumnBefore, 'col-after': addColumnAfter, 'col-delete': deleteColumn,
  merge: mergeCells, split: splitCell, 'header-row': toggleHeader('row'),
  'header-column': toggleHeader('column'), 'header-cell': toggleHeaderCell, 'table-delete': deleteTable,
};
const supported = (state: EditorState) => !structuredContentIssue(checkedContent(state.doc.toJSON()));

/** Candidate commands run in an isolated state: .can() and rejected results must
 * never modify the shared Tiptap chain transaction or trigger normalizers. */
function isolated(state: EditorState) {
  return EditorState.create({ schema: state.schema, doc: state.doc, selection: state.selection, storedMarks: state.storedMarks });
}
function applyCandidate(target: Transaction, candidate: Transaction) {
  for (const step of candidate.steps) target.step(step);
  target.setSelection(Selection.fromJSON(target.doc, candidate.selection.toJSON()));
  target.setStoredMarks(candidate.storedMarks);
}
export function tableContext(state: EditorState) {
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const cells = rect.map.cellsInRect(rect);
  return { rows: rect.map.height, columns: rect.map.width, selected: cells.length,
    headerRow: rect.map.cellsInRect({ left: 0, top: 0, right: rect.map.width, bottom: 1 })
      .every((pos) => rect.table.nodeAt(pos)?.type.name === 'tableHeader'),
    headerColumn: rect.map.cellsInRect({ left: 0, top: 0, right: 1, bottom: rect.map.height })
      .every((pos) => rect.table.nodeAt(pos)?.type.name === 'tableHeader'),
    headerCell: cells.every((pos) => rect.table.nodeAt(pos)?.type.name === 'tableHeader') };
}
function safeAction(state: EditorState, action: TableAction) {
  const rect = selectedRect(state);
  if (action === 'merge') {
    const types = new Set(rect.map.cellsInRect(rect).map((pos) => rect.table.nodeAt(pos)?.type.name));
    if (types.size !== 1) return false; // Never silently erase header semantics.
  }
  // A header boundary may not bisect a spanning cell.
  if (action === 'header-row' || action === 'header-column') {
    const row = action === 'header-row';
    const cells = rect.map.cellsInRect({ left: 0, top: 0,
      right: row ? rect.map.width : 1, bottom: row ? 1 : rect.map.height });
    if (cells.some((pos) => (rect.table.nodeAt(pos)?.attrs[row ? 'rowspan' : 'colspan'] ?? 1) > 1)) return false;
  }
  return true;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    technicalTables: {
      editTechnicalTable: (action: TableAction) => ReturnType;
      selectTechnicalCells: (range: TableRange) => ReturnType;
      extendTechnicalCells: (direction: Direction) => ReturnType;
      navigateTechnicalCell: (direction: 1 | -1) => ReturnType;
    };
  }
}

export const TechnicalTableTools = Extension.create({
  name: 'technicalTableTools',
  addCommands() {
    return {
      editTechnicalTable: (action) => ({ editor, state, tr, dispatch }) => {
        tr.setMeta('skipTrailingNode', true);
        if (!editor.isEditable || editor.view.composing || !isInTable(state) || !supported(state)
          || !safeAction(state, action)) return false;
        let candidate: Transaction | undefined;
        if (!actions[action](isolated(state), (next) => { candidate = next; }) || !candidate
          || structuredContentIssue(checkedContent(candidate.doc.toJSON()))) return false;
        if (dispatch) { closeHistory(tr); applyCandidate(tr, candidate); }
        return true;
      },
      selectTechnicalCells: (range) => ({ state, tr, dispatch }) => {
        tr.setMeta('skipTrailingNode', true);
        if (!isInTable(state) || !supported(state)) return false;
        const $cell = selectionCell(state), rect = selectedRect(state);
        const current = state.selection instanceof CellSelection ? state.selection : new CellSelection($cell);
        const selection = range === 'cell' ? new CellSelection($cell)
          : range === 'row' ? CellSelection.rowSelection(current.$anchorCell, current.$headCell)
            : range === 'column' ? CellSelection.colSelection(current.$anchorCell, current.$headCell)
              : CellSelection.create(tr.doc, rect.tableStart + rect.map.map[0],
                rect.tableStart + rect.map.map[rect.map.map.length - 1]);
        if (dispatch) tr.setSelection(selection).scrollIntoView();
        return true;
      },
      extendTechnicalCells: (direction) => ({ state, tr, dispatch }) => {
        tr.setMeta('skipTrailingNode', true);
        if (!isInTable(state) || !supported(state)) return false;
        const rect = selectedRect(state);
        const current = state.selection instanceof CellSelection ? state.selection : new CellSelection(selectionCell(state));
        const head = rect.map.findCell(current.$headCell.pos - rect.tableStart);
        const row = direction === 'up' ? head.top - 1 : direction === 'down' ? head.bottom : head.top;
        const col = direction === 'left' ? head.left - 1 : direction === 'right' ? head.right : head.left;
        // Consume at the boundary without moving into an unrelated Topic block.
        if (row < 0 || row >= rect.map.height || col < 0 || col >= rect.map.width) return true;
        if (dispatch) tr.setSelection(CellSelection.create(tr.doc, current.$anchorCell.pos,
          rect.tableStart + rect.map.map[row * rect.map.width + col])).scrollIntoView();
        return true;
      },
      navigateTechnicalCell: (direction) => ({ editor, state, tr, dispatch }) => {
        tr.setMeta('skipTrailingNode', true);
        if (editor.view.composing || !isInTable(state) || !supported(state)) return false;
        const baseline = isolated(state);
        let candidate: Transaction | undefined;
        if (!goToNextCell(direction)(baseline, (next) => { candidate = next; })) {
          if (direction < 0 || !editor.isEditable) return false;
          // Tab at the final cell appends one row, in the same undo event.
          addRowAfter(baseline, (next) => { candidate = next; });
          if (!candidate || structuredContentIssue(checkedContent(candidate.doc.toJSON()))) return false;
          const after = baseline.apply(candidate);
          let nextSelection: Selection | undefined;
          if (!goToNextCell(1)(after, (next) => { nextSelection = next.selection; }) || !nextSelection) return false;
          candidate.setSelection(Selection.fromJSON(candidate.doc, nextSelection.toJSON()));
        }
        if (candidate && dispatch) {
          if (candidate.docChanged) closeHistory(tr);
          applyCandidate(tr, candidate); tr.scrollIntoView();
        }
        return !!candidate;
      },
    };
  },
  addKeyboardShortcuts() {
    return {
      'Alt-Shift-ArrowLeft': () => this.editor.commands.extendTechnicalCells('left'),
      'Alt-Shift-ArrowRight': () => this.editor.commands.extendTechnicalCells('right'),
      'Alt-Shift-ArrowUp': () => this.editor.commands.extendTechnicalCells('up'),
      'Alt-Shift-ArrowDown': () => this.editor.commands.extendTechnicalCells('down'),
    };
  },
});

export const TechnicalTable = Table.extend({
  addKeyboardShortcuts() {
    return { ...this.parent?.(),
      Tab: () => this.editor.commands.navigateTechnicalCell(1),
      'Shift-Tab': () => this.editor.commands.navigateTechnicalCell(-1) };
  },
});
