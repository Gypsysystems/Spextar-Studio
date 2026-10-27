import { Extension } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { type Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { checkedContent } from '@/domain/topic-content';
import { structuredContentIssue, validLink } from '@/domain/structured-content';

export type PasteNotice = { message: string; text: string };
export const pasteNoticeEvent = 'spextar-paste-notice';
const maxClipboardSize = 1_000_000;
const supportedTags = new Set(('p div span br h1 h2 h3 strong b em i u s strike del code pre blockquote ul ol li hr ' +
  'table thead tbody tfoot tr td th colgroup col a aside').split(' '));

/** Inspect the original HTML before the engine silently drops unknown structures.
 * Office/browser wrappers are harmless; unsupported semantic content needs consent.
 * Nothing from the original clipboard is executed, stored or rendered as HTML. */
export function clipboardIssue(html: string): string | null {
  if (html.length > maxClipboardSize) return 'The clipboard is too large to paste safely.';
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const element of document.body.querySelectorAll('*')) {
    const tag = element.tagName.toLowerCase();
    if (!supportedTags.has(tag)) return `The clipboard contains unsupported ${tag} content.`;
    if (element.hasAttribute('data-type') && element.getAttribute('data-type') !== 'callout')
      return 'The clipboard contains an unknown structured node.';
    if ((element.hasAttribute('data-type') || element.hasAttribute('data-callout-kind')) && tag !== 'aside')
      return 'The clipboard contains an unsupported structured container.';
    if (element.hasAttribute('data-callout-kind') && !['note', 'tip', 'caution', 'warning'].includes(element.getAttribute('data-callout-kind')!))
      return 'The clipboard contains an unknown callout kind.';
    if (tag === 'aside') {
      const contents = Array.from(element.children).filter((child) => child.classList.contains('se-callout-content'));
      if (!element.hasAttribute('data-callout-kind') || contents.length !== 1
        || Array.from(element.childNodes).some((child) => child.nodeType === 3 ? !!child.textContent?.trim()
          : child.nodeType === 1 && !(child as Element).matches('.se-callout-content, .se-callout-label')))
        return 'The clipboard contains an unsupported callout structure.';
    }
    if (tag === 'a' && element.hasAttribute('href') && !validLink(element.getAttribute('href')!))
      return 'The clipboard contains an unsafe or unsupported link.';
    if (tag === 'td' || tag === 'th') {
      for (const name of ['colspan', 'rowspan']) {
        const value = element.getAttribute(name);
        if (value !== null && (!/^\d+$/.test(value) || +value < 1 || +value > 128))
          return 'The clipboard contains invalid table spans.';
      }
    }
  }
  // Check the original grid: HTML parsing into the editor can repair jagged rows.
  for (const table of document.body.querySelectorAll('table')) {
    const rows = Array.from(table.rows);
    const grid: boolean[][] = rows.map(() => []);
    for (let r = 0; r < rows.length; r++) {
      let col = 0;
      for (const cell of Array.from(rows[r].cells)) {
        while (grid[r][col]) col++;
        if (r + cell.rowSpan > rows.length || col + cell.colSpan > 128) return 'The clipboard table has an invalid grid.';
        for (let y = r; y < r + cell.rowSpan; y++) for (let x = col; x < col + cell.colSpan; x++) {
          if (grid[y][x]) return 'The clipboard table contains overlapping cells.';
          grid[y][x] = true;
        }
        col += cell.colSpan;
      }
    }
    const width = grid[0]?.length ?? 0;
    if (!width || grid.some((row) => row.length !== width || Array.from({ length: width }, (_, i) => !row[i]).some(Boolean)))
      return 'The clipboard table has an inconsistent grid.';
  }
  return null;
}

function notify(view: EditorView, message: string, text: string) {
  view.dom.dispatchEvent(new CustomEvent<PasteNotice>(pasteNoticeEvent, { bubbles: true, detail: { message, text } }));
}

function inspectClipboard(data: DataTransfer | null) {
  const html = data?.getData('text/html') ?? '';
  const text = data?.getData('text/plain') ?? '';
  const issue = data?.files?.length ? 'Files and media are not supported in Topic bodies.'
    : text.length > maxClipboardSize ? 'The clipboard is too large to paste safely.'
      : html ? clipboardIssue(html) : null;
  return { issue, text: text.length <= maxClipboardSize ? text : '' };
}

/** A single validated transaction or no change at all. Never partially paste. */
export function applySafePaste(view: EditorView, slice: Slice): boolean {
  if (!view.editable || view.composing) return false;
  try {
    const transaction = view.state.tr.replaceSelection(slice).setMeta('paste', true)
      .setMeta('uiEvent', 'paste').setMeta('skipTrailingNode', true);
    if (structuredContentIssue(checkedContent(transaction.doc.toJSON()))) return false;
    view.dispatch(transaction.scrollIntoView());
    return true;
  } catch { return false; }
}

export const SafePaste = Extension.create({
  name: 'safePaste',
  priority: 1100,
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-ArrowDown': () => stepHeading(this.editor.view, 1),
      'Mod-Alt-ArrowUp': () => stepHeading(this.editor.view, -1),
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      props: {
        // Run before ProseMirror parses the clipboard: malformed custom-node
        // markup must never reach contentElement/schema parsing first.
        handleDOMEvents: {
          paste(view, event) {
            if (!editor.isEditable || view.composing) { event.preventDefault(); return true; }
            const { issue, text } = inspectClipboard(event.clipboardData);
            if (!issue) return false;
            event.preventDefault();
            notify(view, `${issue} Nothing was inserted. The original clipboard is unchanged.`, text);
            return true;
          },
        },
        handlePaste(view, event, slice) {
          if (!editor.isEditable || view.composing) return true;
          const { issue, text } = inspectClipboard(event.clipboardData);
          if (!issue && applySafePaste(view, slice)) return true;
          notify(view, `${issue ?? 'This paste cannot be represented safely.'} Nothing was inserted. The original clipboard is unchanged.`,
            text.length <= maxClipboardSize ? text : '');
          return true;
        },
      },
    })];
  },
});

/** Heading navigation is selection-only, including in read-only documents. */
export function navigateHeading(view: EditorView, position: number): boolean {
  const node = view.state.doc.nodeAt(position);
  if (node?.type.name !== 'heading') return false;
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position + 1)))
    .setMeta('skipTrailingNode', true).setMeta('addToHistory', false).scrollIntoView());
  focusBody(view);
  return true;
}

export function focusBody(view: EditorView) {
  // ProseMirror intentionally skips DOM focus in read-only mode. Reviewers
  // still need a keyboard-focusable reading surface after navigation.
  view.dom.focus({ preventScroll: true });
  view.focus();
}

export function stepHeading(view: EditorView, direction: 1 | -1): boolean {
  if (view.composing) return false;
  const positions: number[] = [];
  view.state.doc.descendants((node, pos) => { if (node.type.name === 'heading') positions.push(pos); });
  const current = view.state.selection.from;
  const next = direction === 1 ? positions.find((pos) => pos + 1 > current)
    : positions.reverse().find((pos) => pos + 1 < current);
  if (next !== undefined) navigateHeading(view, next);
  return true;
}
