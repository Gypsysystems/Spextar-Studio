import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseNode, Mark } from '@tiptap/pm/model';
import { structuredContentIssue } from '@/domain/structured-content';
import { checkedContent } from '@/domain/topic-content';

export interface TopicMatch { from: number; to: number }
export interface TopicSearchState {
  query: string; caseSensitive: boolean; matches: TopicMatch[]; active: number; limited: boolean;
}
export const topicSearchKey = new PluginKey<TopicSearchState>('spextarTopicSearch');
const blank = (): TopicSearchState => ({ query: '', caseSensitive: false, matches: [], active: -1, limited: false });
export const SEARCH_MATCH_LIMIT = 10000;
// Supported by the pinned StarterKit trailing-node extension. Search must never
// create a trailing paragraph or turn a failed command into an incidental save.
const skipTrailingNode = (tr: Transaction) => tr.setMeta('skipTrailingNode', true);

/** Literal, Unicode-aware matches across inline marks, never across a block or hard break. */
export function findTopicMatches(doc: ProseNode, query: string, caseSensitive: boolean) {
  const matches: TopicMatch[] = [];
  if (!query) return { matches, limited: false };
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'gu' : 'giu');
  let limited = false;
  doc.descendants((node, pos) => {
    if (limited) return false;
    if (!node.isTextblock) return true;
    let text = '', start = pos + 1;
    const flush = () => {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        if (matches.length === SEARCH_MATCH_LIMIT) { limited = true; break; }
        matches.push({ from: start + match.index, to: start + match.index + match[0].length });
      }
      text = '';
    };
    node.forEach((child, offset) => {
      if (child.isText) {
        if (!text) start = pos + 1 + offset;
        text += child.text;
      } else flush();
    });
    flush();
    return false;
  });
  return { matches, limited };
}

/** Text-only replacements keep every structural node/ID and untouched marks/attributes.
 * Across marked runs, consume replacement text at each original run length; overflow
 * inherits the last run's marks. Empty replacement deletes text, never a container. */
function replaceMatches(tr: Transaction, matches: TopicMatch[], replacement: string) {
  const edits: { from: number; to: number; text: string; marks: readonly Mark[] }[] = [];
  for (const match of matches) {
    const runs: { from: number; to: number; marks: readonly Mark[] }[] = [];
    tr.doc.nodesBetween(match.from, match.to, (node, pos) => {
      if (node.isText) runs.push({ from: Math.max(pos, match.from), to: Math.min(pos + node.nodeSize, match.to), marks: node.marks });
    });
    let consumed = 0;
    runs.forEach((run, i) => {
      let end = i === runs.length - 1 ? replacement.length : Math.min(replacement.length, consumed + run.to - run.from);
      // Never divide a surrogate pair at a formatting boundary.
      if (end > 0 && end < replacement.length && /[\uD800-\uDBFF]/.test(replacement[end - 1])) end++;
      edits.push({ ...run, text: replacement.slice(consumed, end) });
      consumed = end;
    });
  }
  for (const edit of edits.reverse()) {
    if (edit.text) tr.replaceWith(edit.from, edit.to, tr.doc.type.schema.text(edit.text, edit.marks));
    else tr.delete(edit.from, edit.to);
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spextarTopicSearch: {
      setTopicSearch: (query: string, caseSensitive?: boolean) => ReturnType;
      navigateTopicMatch: (direction: 1 | -1) => ReturnType;
      replaceTopicMatch: (replacement: string, all?: boolean) => ReturnType;
    };
  }
}

export const TopicSearch = Extension.create({
  name: 'spextarTopicSearch',
  addCommands() {
    return {
      setTopicSearch: (query, caseSensitive = false) => ({ tr }) => {
        skipTrailingNode(tr).setMeta(topicSearchKey, { query, caseSensitive }); return true;
      },
      navigateTopicMatch: (direction) => ({ state, tr }) => {
        skipTrailingNode(tr);
        const search = topicSearchKey.getState(state);
        if (!search?.matches.length) return false;
        const active = (search.active + direction + search.matches.length) % search.matches.length;
        const match = search.matches[active];
        tr.setMeta(topicSearchKey, { active }).setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView();
        return true;
      },
      replaceTopicMatch: (replacement, all = false) => ({ editor, state, tr, dispatch }) => {
        skipTrailingNode(tr);
        const search = topicSearchKey.getState(state);
        if (!editor.isEditable || editor.view.composing || !search?.matches.length || (all && search.limited)
          || /[\r\n]/.test(replacement) || structuredContentIssue(checkedContent(state.doc.toJSON()))) return false;
        const matches = all ? search.matches : [search.matches[search.active]];
        if (!matches[0]) return false;
        if (dispatch) { closeHistory(tr); replaceMatches(tr, matches, replacement); tr.scrollIntoView(); }
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin<TopicSearchState>({
      key: topicSearchKey,
      state: {
        init: blank,
        apply(tr, old) {
          const meta = tr.getMeta(topicSearchKey) as Partial<TopicSearchState> | undefined;
          const changedQuery = meta?.query !== undefined || meta?.caseSensitive !== undefined;
          if (!tr.docChanged && !changedQuery) return meta?.active === undefined ? old : { ...old, active: meta.active };
          const query = meta?.query ?? old.query, caseSensitive = meta?.caseSensitive ?? old.caseSensitive;
          const found = findTopicMatches(tr.doc, query, caseSensitive);
          const position = changedQuery ? -1 : tr.mapping.map(old.matches[old.active]?.from ?? 0);
          let active = found.matches.findIndex((match) => match.from >= position);
          if (active < 0 && found.matches.length) active = 0;
          return { query, caseSensitive, ...found, active };
        },
      },
      props: {
        decorations(state) {
          const search = topicSearchKey.getState(state)!;
          return DecorationSet.create(state.doc, search.matches.map((match, index) => Decoration.inline(match.from, match.to,
            { class: index === search.active ? 'se-search-match se-search-current' : 'se-search-match' })));
        },
      },
    })];
  },
});
