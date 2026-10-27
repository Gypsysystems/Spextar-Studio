import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { tableContext, type TableAction, type TableRange } from './table-tools';

const operations: [TableAction, string, string][] = [
  ['row-before', 'Add row above', 'R+↑'], ['row-after', 'Add row below', 'R+↓'],
  ['row-delete', 'Delete row', 'R−'], ['col-before', 'Add column left', 'C+←'],
  ['col-after', 'Add column right', 'C+→'], ['col-delete', 'Delete column', 'C−'],
  ['merge', 'Merge selected cells', 'Merge'], ['split', 'Split cell', 'Split'],
  ['header-row', 'Toggle header row', 'H row'], ['header-column', 'Toggle header column', 'H col'],
  ['header-cell', 'Toggle cell header', 'H cell'], ['table-delete', 'Delete table', 'Delete table'],
];
const ranges: [TableRange, string, string][] = [
  ['cell', 'Select cell', 'Cell'], ['row', 'Select row', 'Row'],
  ['column', 'Select column', 'Column'], ['table', 'Select table', 'Table'],
];
export function TableToolbar({ editor, enabled }: { editor: Editor; enabled: boolean }) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({
    context: tableContext(e.state),
    available: Object.fromEntries(operations.map(([action]) => [action, enabled && e.can().editTechnicalTable(action)])),
  }) });
  if (!state.context) return null;
  const { context } = state;
  return <>
    {operations.map(([action, label, text]) => {
      const pressed = action === 'header-row' ? context.headerRow
        : action === 'header-column' ? context.headerColumn : action === 'header-cell' ? context.headerCell : undefined;
      return <button key={action} type="button" className="se-btn" aria-label={label} title={label}
        aria-pressed={pressed} disabled={!enabled || !state.available[action]}
        data-testid={`button-editor-${action}`} onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().editTechnicalTable(action).run()}>{text}</button>;
    })}
    <span className="se-table-select-label">Select:</span>
    {ranges.map(([range, label, text]) => <button key={range} type="button" className="se-btn"
      aria-label={label} title={`${label} · Alt+Shift+arrows extends selection`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.chain().focus().selectTechnicalCells(range).run()}>{text}</button>)}
    <span className="se-table-summary" aria-live="polite">
      {context.rows} × {context.columns} · {context.selected} selected
    </span>
    <span className="se-table-help">Tab / Shift+Tab: cells · Alt+Shift+arrows: select.
      Merge requires a rectangular selection of the same header/data type.</span>
  </>;
}
