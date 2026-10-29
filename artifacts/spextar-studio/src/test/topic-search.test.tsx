import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { studioExtensions, replaceEditorDocument } from '@/features/editor/editor-extensions';
import { findTopicMatches, SEARCH_MATCH_LIMIT, topicSearchKey } from '@/features/editor/topic-search';
import { StructuredEditor } from '@/features/editor/structured-editor';
import { editorDocument, mergeEditorDocument } from '@/domain/structured-content';
import { contentText, emptyContent, withText, type TopicContent } from '@/domain/topic-content';

const paragraph = (text: string, id: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });
const root = (content: JSONContent[]): TopicContent => ({ type: 'doc', version: 1, metadata: { language: 'en', custom: [1, 'keep'] }, content: content as TopicContent['content'] });
const sample = () => root([
  { type: 'heading', attrs: { level: 2, id: 'h' }, content: [{ type: 'text', text: 'Pump pump PUMP' }] },
  { type: 'callout', attrs: { kind: 'warning', id: 'callout' }, content: [
    { type: 'paragraph', attrs: { id: 'mixed' }, content: [
      { type: 'text', text: 'pu', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'mp', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' safely' },
    ] },
  ] },
  { type: 'table', attrs: { id: 'table' }, content: [{ type: 'tableRow', attrs: { id: 'row' }, content: [
    { type: 'tableCell', attrs: { id: 'cell' }, content: [paragraph('pump', 'inside-cell')] },
  ] }] },
  { type: 'bulletList', attrs: { id: 'list' }, content: [{ type: 'listItem', attrs: { id: 'item' }, content: [paragraph('pump', 'inside-item')] }] },
  { type: 'codeBlock', attrs: { id: 'code', language: 'shell' }, content: [{ type: 'text', text: 'pump --verify' }] },
]);
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));
function engine(content = sample(), editable = true) {
  const editor = new Editor({ extensions: studioExtensions(), content: editorDocument(content) as JSONContent, editable });
  editors.push(editor); return editor;
}
const search = (editor: Editor) => topicSearchKey.getState(editor.state)!;
const nodeIds = (editor: Editor) => {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => { if (node.attrs.id) ids.push(node.attrs.id); }); return ids;
};
function ui(content = sample(), editable = true) {
  const changed = vi.fn();
  function Surface() {
    const [value, setValue] = useState(content);
    return <StructuredEditor content={value} editable={editable} onChange={(next) => { setValue(next); changed(next); }} />;
  }
  return { ...render(<Surface />), user: userEvent.setup(), changed };
}

describe('topic-local search engine', () => {
  it('finds literal text across formatting runs in headings, callouts, cells, lists and code', () => {
    const editor = engine(); const before = editor.getJSON();
    editor.commands.setTopicSearch('pump');
    expect(search(editor).matches).toHaveLength(7);
    expect(editor.getJSON()).toEqual(before);
    editor.commands.setTopicSearch('pump', true);
    expect(search(editor).matches).toHaveLength(5);
  });
  it.each(['a.b', 'x+y', '[abc]', '\\path', '$1', '(literal)', '.*', '😀', 'Σ'])('treats %s as literal Unicode text', (query) => {
    const editor = engine(root([paragraph(`${query} ${query}`, 'literal')]));
    expect(findTopicMatches(editor.state.doc, query, false).matches).toHaveLength(2);
  });
  it('does not cross paragraphs, hard breaks, cell boundaries, or search labels/attributes', () => {
    const editor = engine(root([
      paragraph('pu', 'a'), paragraph('mp', 'b'),
      { type: 'paragraph', attrs: { id: 'break' }, content: [{ type: 'text', text: 'pu' }, { type: 'hardBreak' }, { type: 'text', text: 'mp' }] },
      { type: 'callout', attrs: { id: 'warning-id', kind: 'warning' }, content: [paragraph('quiet', 'c')] },
    ]));
    for (const query of ['pump', 'warning', 'warning-id']) expect(findTopicMatches(editor.state.doc, query, false).matches).toHaveLength(0);
  });
  it('wraps match navigation without body transactions and clears decorations', () => {
    const editor = engine(); const changed = vi.fn(); editor.on('update', changed);
    editor.commands.setTopicSearch('pump');
    editor.commands.navigateTopicMatch(-1); expect(search(editor).active).toBe(6);
    editor.commands.navigateTopicMatch(1); expect(search(editor).active).toBe(0);
    expect(editor.state.selection.from).toBe(search(editor).matches[0].from);
    editor.commands.setTopicSearch('');
    expect(search(editor).active).toBe(-1); expect(search(editor).matches).toHaveLength(0);
    expect(changed).not.toHaveBeenCalled();
  });
  it('never appends/saves a trailing paragraph merely from searching a legacy callout', () => {
    const editor = engine(root([{ type: 'callout', attrs: { id: 'only', kind: 'note' }, content: [paragraph('pump pump', 'p')] }]));
    const before = editor.getJSON(), changed = vi.fn(); editor.on('update', changed);
    editor.commands.setTopicSearch('pump');
    editor.commands.navigateTopicMatch(1);
    editor.commands.setTopicSearch('');
    expect(editor.getJSON()).toEqual(before); expect(changed).not.toHaveBeenCalled();
  });
  it('replaces all without changing original nodes, IDs, metadata, code language, callout kinds or marks', () => {
    const content = sample(), editor = engine(content), beforeIds = nodeIds(editor);
    editor.commands.setTopicSearch('pump');
    expect(editor.commands.replaceTopicMatch('valve', true)).toBe(true);
    const next = mergeEditorDocument(content, editor.getJSON());
    expect(nodeIds(editor).slice(0, beforeIds.length)).toEqual(beforeIds);
    expect(next.metadata).toEqual(content.metadata);
    expect(contentText(next).toLowerCase()).not.toContain('pump');
    expect(contentText(next)).toContain('valve --verify');
    const callout = editor.state.doc.child(1);
    expect(callout.attrs).toMatchObject({ kind: 'warning', id: 'callout' });
    expect(callout.firstChild?.child(0).marks[0].type.name).toBe('bold');
    expect(callout.firstChild?.child(0).text).toBe('va');
    expect(callout.firstChild?.child(1).marks[0].type.name).toBe('italic');
    expect(callout.firstChild?.child(1).text).toBe('lve');
    expect(editor.state.doc.child(4).attrs.language).toBe('shell');
    editor.commands.undo(); expect(contentText(mergeEditorDocument(content, editor.getJSON())).trim()).toBe(contentText(content));
    editor.commands.redo(); expect(editor.state.doc.textContent).not.toContain('pump');
  });
  it('replaces only the active match, advances to the following match, and allows empty replacement', () => {
    const editor = engine(root([paragraph('pump pump pump', 'p')]));
    editor.commands.setTopicSearch('pump');
    editor.commands.navigateTopicMatch(1);
    editor.commands.replaceTopicMatch('valve');
    expect(editor.state.doc.textContent).toBe('pump valve pump');
    expect(search(editor).active).toBe(1);
    editor.commands.replaceTopicMatch('');
    expect(editor.state.doc.textContent).toBe('pump valve ');
    expect(editor.state.doc.firstChild?.attrs.id).toBe('p');
  });
  it('does not recursively replace newly inserted search text', () => {
    const editor = engine(root([paragraph('aa aa', 'p')]));
    editor.commands.setTopicSearch('aa');
    editor.commands.replaceTopicMatch('aaaa', true);
    expect(editor.state.doc.textContent).toBe('aaaa aaaa');
  });
  it('preserves link targets and never interprets replacement as HTML or replacement-pattern syntax', () => {
    const editor = engine(root([{ type: 'paragraph', attrs: { id: 'p' }, content: [
      { type: 'text', text: 'pump', marks: [{ type: 'link', attrs: { href: 'https://example.com/pump' } }] },
    ] }]));
    editor.commands.setTopicSearch('pump');
    editor.commands.replaceTopicMatch('<img src=x>$&$1', true);
    expect(editor.state.doc.textContent).toBe('<img src=x>$&$1');
    expect(editor.state.doc.firstChild?.firstChild?.marks[0].attrs.href).toBe('https://example.com/pump');
    expect(editor.view.dom.querySelector('img')).toBeNull();
  });
  it('does not split a replacement emoji across formatting boundaries', () => {
    const editor = engine(root([{ type: 'paragraph', attrs: { id: 'p' }, content: [
      { type: 'text', text: 'p', marks: [{ type: 'bold' }] }, { type: 'text', text: 'ump', marks: [{ type: 'italic' }] },
    ] }]));
    editor.commands.setTopicSearch('pump'); editor.commands.replaceTopicMatch('😀x');
    expect(editor.state.doc.firstChild?.firstChild?.text).toBe('😀');
    expect(editor.state.doc.textContent).toBe('😀x');
  });
  it('rejects multiline replacement and leaves the body unchanged', () => {
    const editor = engine(), before = editor.getJSON();
    editor.commands.setTopicSearch('pump');
    expect(editor.commands.replaceTopicMatch('unsafe\nblock', true)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });
  it('caps highlights and refuses a misleading partial replace-all', () => {
    const editor = engine(root([paragraph('x '.repeat(SEARCH_MATCH_LIMIT + 1), 'p')]));
    editor.commands.setTopicSearch('x'); expect(search(editor).limited).toBe(true);
    expect(search(editor).matches).toHaveLength(SEARCH_MATCH_LIMIT);
    expect(editor.commands.replaceTopicMatch('y', true)).toBe(false);
  });
  it('recomputes matches after ordinary edits/undo and clears search on a genuine external reload', () => {
    const editor = engine(root([paragraph('pump', 'p')]));
    editor.commands.setTopicSearch('pump');
    editor.commands.setTextSelection(5); editor.commands.insertContent(' pump');
    expect(search(editor).matches).toHaveLength(2);
    editor.commands.undo(); expect(search(editor).matches).toHaveLength(1);
    replaceEditorDocument(editor, root([paragraph('remote', 'remote')]));
    expect(search(editor).query).toBe('');
    expect(search(editor).matches).toHaveLength(0);
  });
  it.each(['reviewer', 'viewer'])('allows %s search/navigation but refuses direct replacement', () => {
    const editor = engine(sample(), false), before = editor.getJSON();
    editor.commands.setTopicSearch('pump');
    expect(search(editor).matches).toHaveLength(7);
    expect(editor.commands.navigateTopicMatch(1)).toBe(true);
    expect(editor.commands.replaceTopicMatch('no')).toBe(false);
    expect(editor.commands.replaceTopicMatch('no', true)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });
});

describe('topic search panel', () => {
  it('opens with focus, navigates, matches case, replaces current/all, and closes with Escape', async () => {
    const { user, changed } = ui();
    await user.click(await screen.findByRole('button', { name: 'Find and replace' }));
    const find = screen.getByRole('textbox', { name: 'Find in this topic' });
    expect(find).toHaveFocus();
    await user.type(find, 'pump'); expect(screen.getByRole('status')).toHaveTextContent('1 of 7 matches');
    expect(changed).not.toHaveBeenCalled();
    await user.keyboard('{Enter}'); expect(screen.getByRole('status')).toHaveTextContent('2 of 7 matches');
    await user.keyboard('{Shift>}{Enter}{/Shift}'); expect(screen.getByRole('status')).toHaveTextContent('1 of 7 matches');
    await user.click(screen.getByRole('checkbox', { name: 'Match case' }));
    expect(screen.getByRole('status')).toHaveTextContent('1 of 5 matches');
    await user.type(screen.getByRole('textbox', { name: 'Replace with' }), 'valve');
    await user.click(screen.getByRole('button', { name: 'Replace current' }));
    expect(screen.getByRole('status')).toHaveTextContent('Replaced 1 match');
    await user.click(screen.getByRole('button', { name: 'Replace all' }));
    expect(screen.getByRole('status')).toHaveTextContent('Replaced 4 matches');
    expect(changed.mock.lastCall?.[0].metadata).toEqual({ language: 'en', custom: [1, 'keep'] });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Find and replace in this topic' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Find and replace' })).toHaveFocus();
  });
  it.each(['Reviewer', 'Viewer'])('offers %s search but disables replace controls with no save', async () => {
    const { user, changed } = ui(sample(), false);
    await user.click(await screen.findByRole('button', { name: 'Find and replace' }));
    await user.type(screen.getByRole('textbox', { name: 'Find in this topic' }), 'pump');
    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 7 matches');
    expect(screen.getByRole('textbox', { name: 'Replace with' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace current' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
    expect(changed).not.toHaveBeenCalled();
  });
  it('shows no matches, resets stale matches when query changes, and treats metacharacters literally', async () => {
    const { user } = ui(withText(emptyContent(), 'a.b axb'));
    await user.click(await screen.findByRole('button', { name: 'Find and replace' }));
    const find = screen.getByRole('textbox', { name: 'Find in this topic' });
    await user.type(find, 'a.b'); expect(screen.getByRole('status')).toHaveTextContent('1 of 1 matches');
    await user.clear(find); await user.type(find, 'missing');
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
  });
  it('supports topic-scoped Ctrl+F without intercepting outside inputs', async () => {
    const { user } = ui();
    const area = await screen.findByRole('textbox', { name: 'Topic body' });
    act(() => area.focus());
    await user.keyboard('{Control>}f{/Control}');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Find in this topic' })).toHaveFocus());
  });
  it('cancels pending shortcut focus when the editor unmounts', async () => {
    const surface = ui();
    const area = await screen.findByRole('textbox', { name: 'Topic body' });
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    try {
      act(() => area.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true })));
      expect(frame).toHaveBeenCalled();
      surface.unmount();
      expect(cancel).toHaveBeenCalledWith(42);
    } finally { frame.mockRestore(); cancel.mockRestore(); }
  });
  it('keeps unknown content verbatim and does not expose replacement against a partial document', () => {
    const changed = vi.fn(), unknown = root([{ type: 'unknown-node', content: [{ type: 'text', text: 'pump' }] }]);
    render(<StructuredEditor content={unknown} editable onChange={changed} />);
    expect(screen.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByRole('button', { name: 'Find and replace' })).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });
});
