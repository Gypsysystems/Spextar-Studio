import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor, type JSONContent } from '@tiptap/core';
import { StructuredEditor } from '@/features/editor/structured-editor';
import { studioExtensions } from '@/features/editor/editor-extensions';
import { calloutKinds, calloutLabels, editorDocument, ensureNodeIds, mergeEditorDocument, structuredContentIssue } from '@/domain/structured-content';
import { checkedContent, contentText, type TopicContent } from '@/domain/topic-content';

const paragraph = { type: 'paragraph', attrs: { id: 'paragraph-1' }, content: [{ type: 'text', text: 'Keep technical detail', marks: [{ type: 'bold' }] }] };
const document = (kind = 'note'): TopicContent => ({
  type: 'doc', version: 1, metadata: { language: 'en', extensions: ['keep'] },
  content: [{ type: 'callout', attrs: { id: 'callout-1', kind }, content: [paragraph] }],
});
const engines: Editor[] = [];
afterEach(() => engines.splice(0).forEach((editor) => editor.destroy()));
function engine(content = document()) {
  const editor = new Editor({ extensions: studioExtensions(), content: editorDocument(content) as JSONContent });
  engines.push(editor); return editor;
}

describe('semantic callout JSON and engine contract', () => {
  it.each(calloutKinds)('round-trips %s with root metadata, child marks and stable IDs', (kind) => {
    const content = document(kind);
    expect(structuredContentIssue(content)).toBeNull();
    const editor = engine(content);
    expect(mergeEditorDocument(content, editor.getJSON())).toEqual(content);
    expect(contentText(content)).toBe('Keep technical detail');
    expect(editor.getHTML()).toContain(`aria-label="${calloutLabels[kind]}"`);
    expect(editor.getHTML()).not.toContain('role="alert"');
    // Internal clipboard HTML preserves semantics/content but allocates fresh identities.
    const copy = engine({ type: 'doc', content: [] });
    copy.commands.setContent(editor.getHTML());
    const json = mergeEditorDocument(content, copy.getJSON());
    expect(structuredContentIssue(json)).toBeNull();
    expect(contentText(json).trim()).toBe(contentText(content));
    expect(JSON.stringify(json)).toContain(`"kind":"${kind}"`);
    expect(JSON.stringify(json)).not.toContain('"id":"callout-1"');
  });
  it.each([
    { attrs: { kind: 'danger' }, content: [paragraph] },
    { attrs: { kind: 'Note' }, content: [paragraph] },
    { attrs: { kind: null }, content: [paragraph] },
    { attrs: { kind: 'warning', extra: true }, content: [paragraph] },
    { attrs: {}, content: [paragraph] },
    { content: [paragraph] },
    { attrs: { kind: 'note' }, content: [] },
    { attrs: { kind: 'note' }, content: [{ type: 'text', text: 'invalid bare inline' }] },
  ])('rejects malformed callout %# without changing its JSON', (node) => {
    const content = checkedContent(JSON.parse(JSON.stringify({ type: 'doc', version: 1, content: [{ type: 'callout', ...node }] })));
    const before = JSON.stringify(content);
    expect(structuredContentIssue(content)).toBeTruthy();
    expect(() => ensureNodeIds(content)).toThrow();
    expect(JSON.stringify(content)).toBe(before);
  });
  it('retains structured children including lists, links, code and tables', () => {
    const content = document('warning');
    const callout = (content.content as JSONContent[])[0];
    callout.content!.push(
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step' }] }] }] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'npm run verify' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Reference', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Value' }] }] }] }] },
    );
    const normalized = ensureNodeIds(content);
    const editor = engine(normalized);
    const merged = mergeEditorDocument(normalized, editor.getJSON());
    expect(structuredContentIssue(merged)).toBeNull();
    expect(contentText(merged)).toContain('Value');
    expect(contentText(merged)).toContain('npm run verify');
  });
  it('changes type without nesting or changing IDs, unwraps losslessly, and undoes/redoes', () => {
    const editor = engine();
    editor.commands.setTextSelection(3);
    expect(editor.commands.setCallout('warning')).toBe(true);
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({ id: 'callout-1', kind: 'warning' });
    expect(editor.state.doc.firstChild?.firstChild?.attrs.id).toBe('paragraph-1');
    expect(editor.state.doc.firstChild?.childCount).toBe(1);
    editor.commands.unsetCallout();
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(editor.state.doc.firstChild?.attrs.id).toBe('paragraph-1');
    editor.commands.undo();
    expect(editor.state.doc.firstChild?.type.name).toBe('callout');
    editor.commands.redo();
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph');
  });
  it('exits a final empty callout paragraph with Enter and keeps existing content', () => {
    const content = document();
    (content.content as JSONContent[])[0].content!.push({ type: 'paragraph', attrs: { id: 'exit' } });
    const editor = engine(content);
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    expect(editor.commands.keyboardShortcut('Enter')).toBe(true);
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
    expect(editor.state.doc.content.content.some((node) => node.type.name === 'paragraph' && node.attrs.id === 'exit')).toBe(true);
    expect(editor.state.doc.firstChild?.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.textContent).toBe('Keep technical detail');
  });
  it('preserves copied callout content while assigning fresh IDs within a Topic', () => {
    const editor = engine();
    const copied = editor.getJSON().content![0];
    editor.commands.insertContentAt(editor.state.doc.content.size, copied);
    const ids: string[] = [];
    editor.state.doc.descendants((node) => { if (node.attrs.id) ids.push(node.attrs.id); });
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 2)).toEqual(['callout-1', 'paragraph-1']);
    expect(editor.state.doc.textContent).toBe('Keep technical detailKeep technical detail');
  });
});

describe('callout Author controls', () => {
  it.each(calloutKinds)('inserts and edits a %s callout through the toolbar without mount writes', async (kind) => {
    const changed = vi.fn();
    render(<StructuredEditor content={{ type: 'doc', version: 1, content: [paragraph] }} editable onChange={changed} />);
    const area = await screen.findByRole('textbox', { name: 'Topic body' });
    await waitFor(() => expect(area).toHaveAttribute('contenteditable', 'true'));
    expect(changed).not.toHaveBeenCalled();
    const editor = (area as HTMLElement & { editor: Editor }).editor;
    act(() => editor.commands.setTextSelection(3));
    await userEvent.click(screen.getByRole('button', { name: `${calloutLabels[kind]} callout` }));
    expect(within(area).getByRole('note', { name: calloutLabels[kind] })).toHaveTextContent('Keep technical detail');
    expect(screen.getByRole('button', { name: `${calloutLabels[kind]} callout` })).toHaveAttribute('aria-pressed', 'true');
    expect(changed.mock.lastCall?.[0].content[0].attrs.kind).toBe(kind);
    const id = changed.mock.lastCall?.[0].content[0].attrs.id;
    await userEvent.click(screen.getByRole('button', { name: 'Warning callout' }));
    expect(changed.mock.lastCall?.[0].content[0].attrs).toMatchObject({ kind: 'warning', id });
    act(() => editor.commands.insertContent(' Edited'));
    expect(area).toHaveTextContent('Edited');
    await userEvent.click(screen.getByRole('button', { name: 'Remove callout' }));
    expect(area.querySelector('aside')).toBeNull();
    expect(area).toHaveTextContent('Edited');
  });
  it.each(['Reviewer', 'Viewer'])('keeps %s callouts read-only including direct engine commands', async () => {
    const changed = vi.fn();
    render(<StructuredEditor content={document('warning')} editable={false} onChange={changed} />);
    const area = await screen.findByRole('textbox', { name: 'Topic body' });
    expect(area).toHaveAttribute('contenteditable', 'false');
    expect(within(area).getByRole('note', { name: 'Warning' })).toBeVisible();
    within(screen.getByRole('toolbar')).getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
    const editor = (area as HTMLElement & { editor: Editor }).editor;
    act(() => { editor.commands.setCallout('tip'); editor.commands.unsetCallout(); editor.commands.insertContent('forbidden'); });
    expect(changed).not.toHaveBeenCalled();
    expect(editor.state.doc.firstChild?.attrs.kind).toBe('warning');
    expect(area).not.toHaveTextContent('forbidden');
  });
  it('shows an unknown callout unchanged as read-only JSON without emitting a save', () => {
    const changed = vi.fn();
    const content = document('unknown-future-kind');
    render(<StructuredEditor content={content} editable onChange={changed} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByRole('textbox')).toHaveTextContent('unknown-future-kind');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });
});
