import { VariableReference, ReusableReference, ConditionalAssignments } from './semantic-reference-extensions';
import { Extension, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { EditorState, Plugin } from '@tiptap/pm/state';
import { Fragment, Slice, type Node as ProseNode } from '@tiptap/pm/model';
import { undo, redo } from '@tiptap/pm/history';
import { editorDocument, identifiedNodes, validLink } from '@/domain/structured-content';
import type { TopicContent } from '@/domain/topic-content';
import { Callout } from './callout-extension';
import { TopicSearch } from './topic-search';
import { TechnicalTable, TechnicalTableTools } from './table-tools';
import { SafePaste } from './paste-safety';

/** SPEXTAR-owned node identity, independent of hosted/proprietary editor extensions. */
const NodeIdentity = Extension.create({
  name: 'spextarNodeIdentity',
  addGlobalAttributes() {
    return [{ types: [...identifiedNodes], attributes: {
      id: { default: null, parseHTML: () => null, renderHTML: (attrs) => attrs.id ? { 'data-spextar-id': attrs.id } : {} },
    } }];
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      filterTransaction(transaction) {
        // Focusing, selecting and cancelling a picker must not normalize a saved
        // body ending in a linked atom into a write. Normalize only real edits.
        if (!transaction.docChanged) transaction.setMeta('skipTrailingNode', true);
        return editor.isEditable || !transaction.docChanged || transaction.getMeta('preventUpdate') === true;
      },
      appendTransaction(transactions, old, state) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null;
        const seen = new Set<string>();
        const transaction = state.tr;
        const previousIds = new Map<number, string>();
        const owners = new Map<string, number>();
        old.doc.descendants((node, pos) => {
          if (!(identifiedNodes as readonly string[]).includes(node.type.name) || !node.attrs.id) return;
          let deleted = false;
          for (const change of transactions) {
            const mapped = change.mapping.mapResult(pos);
            pos = mapped.pos; deleted ||= mapped.deletedAcross;
          }
          const next = state.doc.nodeAt(pos);
          if (!deleted && next?.attrs.id === node.attrs.id) owners.set(node.attrs.id as string, pos);
          if (!deleted && next && !next.attrs.id && (node.content.eq(next.content)
            || (node.isTextblock && next.isTextblock && node.type !== next.type))) previousIds.set(pos, node.attrs.id as string);
        });
        state.doc.descendants((node, pos) => {
          if (!(identifiedNodes as readonly string[]).includes(node.type.name)) return;
          let id = node.attrs.id as string | null;
          if (!id || seen.has(id) || (owners.has(id) && owners.get(id) !== pos)) {
            id = previousIds.get(pos) ?? crypto.randomUUID();
            if (seen.has(id)) id = crypto.randomUUID();
            transaction.setNodeMarkup(pos, undefined, { ...node.attrs, id }, node.marks);
          }
          seen.add(id);
        });
        // Appended transactions share their originating undo event: redo restores the same IDs.
        return transaction.docChanged ? transaction : null;
      },
      props: {
        transformPasted(slice, view) {
          if (view.dragging?.move) return slice;
          const strip = (fragment: Fragment): Fragment => {
            const nodes: ProseNode[] = [];
            fragment.forEach((node) => nodes.push(node.isText ? node : node.type.create(
              { ...node.attrs, ...((identifiedNodes as readonly string[]).includes(node.type.name) ? { id: null } : {}) },
              strip(node.content), node.marks,
            )));
            return Fragment.from(nodes);
          };
          return new Slice(strip(slice.content), slice.openStart, slice.openEnd);
        },
      },
    })];
  },
});

// History must restore the exact saved structure, not run trailing-paragraph
// normalization after undoing a table/callout operation. Keep StarterKit's
// history plugin and shortcuts; override only the command dispatch boundary.
const ExactHistoryCommands = Extension.create({
  name: 'exactHistoryCommands',
  priority: 50,
  addCommands() {
    return {
      undo: () => ({ editor, state, tr, dispatch }) => {
        tr.setMeta('skipTrailingNode', true);
        return editor.isEditable && undo(state, dispatch);
      },
      redo: () => ({ editor, state, tr, dispatch }) => {
        tr.setMeta('skipTrailingNode', true);
        return editor.isEditable && redo(state, dispatch);
      },
    };
  },
});

export function studioExtensions() {
  return [
    VariableReference, ReusableReference, ConditionalAssignments,
    SafePaste,
    TopicSearch,
    Callout,
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: false, linkOnPaste: false,
        isAllowedUri: (href) => validLink(href), HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
    }),
    TableKit.configure({ table: false }),
    TechnicalTable.configure({ resizable: false, renderWrapper: true }),
    TechnicalTableTools,
    NodeIdentity,
    ExactHistoryCommands,
  ];
}

/** Reload/restore/discard is a new editing baseline, not an undoable user edit.
 * Ordinary autosave echoes never call this helper. */
export function replaceEditorDocument(editor: Editor, content: TopicContent) {
  editor.commands.setContent(editorDocument(content), { emitUpdate: false, errorOnInvalidContent: true });
  const state = EditorState.create({ schema: editor.schema, doc: editor.state.doc, plugins: editor.state.plugins });
  editor.view.updateState(state);
  editor.view.dispatch(state.tr.setMeta('addToHistory', false));
}
