import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { DOMParser as PMParser, DOMSerializer } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { studioExtensions } from '@/features/editor/editor-extensions';
import { clipboardIssue, navigateHeading, stepHeading, pasteNoticeEvent, type PasteNotice } from '@/features/editor/paste-safety';
import { StructuredEditor } from '@/features/editor/structured-editor';
import { editorDocument, mergeEditorDocument, structuredContentIssue } from '@/domain/structured-content';
import type { JSONValue, TopicContent } from '@/domain/topic-content';
import { tableFixture } from './table-fixture';

const editors: Editor[] = [];
const base: TopicContent = { type: 'doc', version: 1, metadata: { retained: true }, content: [
  { type: 'heading', attrs: { id: 'intro', level: 1 }, content: [{ type: 'text', text: 'Introduction' }] },
  { type: 'paragraph', attrs: { id: 'body' }, content: [{ type: 'text', text: 'Body' }] },
] };
function engine(content = base, editable = true) {
  const onUpdate = vi.fn();
  const editor = new Editor({ extensions: studioExtensions(), content: editorDocument(content) as JSONContent, editable, onUpdate });
  editors.push(editor);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)).setMeta('skipTrailingNode', true));
  onUpdate.mockClear();
  return { editor, onUpdate, json: () => mergeEditorDocument(content, editor.getJSON()) };
}
function paste(editor: Editor, html: string, text = 'Clipboard text', files: File[] = []) {
  const event = { clipboardData: { getData: (type: string) => type === 'text/html' ? html : text, files },
    preventDefault: vi.fn() } as unknown as ClipboardEvent;
  const notices: PasteNotice[] = [];
  const receive = (event: Event) => notices.push((event as CustomEvent<PasteNotice>).detail);
  editor.view.dom.addEventListener(pasteNoticeEvent, receive);
  let handled = editor.view.someProp('handleDOMEvents', (handlers) => handlers.paste?.(editor.view, event));
  if (!handled) {
    const container = document.createElement('div'); container.innerHTML = html;
    const slice = PMParser.fromSchema(editor.schema).parseSlice(container);
    handled = editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, slice));
  }
  editor.view.dom.removeEventListener(pasteNoticeEvent, receive);
  return { handled, notices };
}
function ids(editor: Editor) {
  const result: string[] = [];
  editor.state.doc.descendants((node) => { if (node.attrs.id) result.push(node.attrs.id); });
  return result;
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe('structured clipboard safety', () => {
  it('preserves rich supported headings/marks/lists/quotes/tables and owned root metadata', () => {
    const { editor, json, onUpdate } = engine();
    const result = paste(editor, '<h2>New heading</h2><p><b>Bold</b> <i>italic</i> <u>under</u> <s>strike</s> <code>code</code> <a href="https://example.com">link</a></p><ul><li><p>item</p></li></ul><blockquote><p>quote</p></blockquote><table><tr><th>header</th><th>other</th></tr><tr><td>one</td><td>two</td></tr></table>');
    expect(result.handled).toBe(true); expect(result.notices).toEqual([]);
    expect(structuredContentIssue(json())).toBeNull();
    const serialized = JSON.stringify(json());
    for (const type of ['heading', 'bold', 'italic', 'underline', 'strike', 'code', 'link', 'bulletList', 'blockquote', 'table'])
      expect(serialized).toContain(`"${type}"`);
    expect(json().metadata).toEqual(base.metadata);
    expect(ids(editor)).toContain('intro'); expect(ids(editor)).toContain('body');
    expect(new Set(ids(editor)).size).toBe(ids(editor).length);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
  it('copies a supported callout and table with fresh identities, retaining original IDs', () => {
    const content: TopicContent = { ...tableFixture(), content: [
      { type: 'callout', attrs: { id: 'warning', kind: 'warning' }, content: [
        { type: 'paragraph', attrs: { id: 'inside' }, content: [{ type: 'text', text: 'Careful' }] },
      ] }, ...(tableFixture().content as JSONValue[])] };
    const { editor, json } = engine(content);
    const oldIds = ids(editor);
    const container = document.createElement('div');
    container.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.doc.content));
    const result = paste(editor, container.innerHTML);
    expect(result.notices).toEqual([]);
    const newIds = ids(editor);
    expect(newIds.length).toBeGreaterThan(oldIds.length);
    oldIds.forEach((id) => expect(newIds).toContain(id));
    expect(new Set(newIds).size).toBe(newIds.length);
    expect(JSON.stringify(json())).toContain('"kind":"warning"');
  });
  it.each([
    '<p>before<img src="x">after</p>', '<p><a href="javascript:alert(1)">bad</a></p>',
    '<h4>Unsupported level</h4>', '<section data-type="future">unknown</section>',
    '<aside data-callout-kind="danger"><p>future</p></aside>',
    '<aside data-callout-kind="note"><p>missing content wrapper</p></aside>',
    '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>',
    '<table><tr><td rowspan="0">A</td></tr></table>',
    '<table><tr><td rowspan="3">A</td></tr></table>',
    '<table><tr><td colspan="129">A</td></tr></table>',
    '<p>Text<script>alert(1)</script></p>',
    '<div data-type="unknown">Future</div>',
    '<div data-callout-kind="note"><p>Lost callout</p></div>',
    '<aside data-callout-kind="note"><div class="se-callout-content"><p>Inside</p></div><p>Outside would be lost</p></aside>',
  ])('rejects unsupported/unsafe content atomically: %s', (html) => {
    const { editor, onUpdate } = engine();
    const before = editor.getJSON(), selection = editor.state.selection.toJSON();
    const { notices } = paste(editor, html);
    expect(notices).toHaveLength(1);
    expect(notices[0].text).toBe('Clipboard text');
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it('blocks file and oversized clipboard content without retaining oversized text', () => {
    const { editor, onUpdate } = engine();
    expect(paste(editor, '', '', [new File(['x'], 'x.png')]).notices).toHaveLength(1);
    const result = paste(editor, '', 'x'.repeat(1_000_001));
    expect(result.notices[0].text).toBe('');
    expect(clipboardIssue('x'.repeat(1_000_001))).toContain('too large');
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it('blocks paste for readonly roles and composition without changing selection or emitting notices', () => {
    const { editor, onUpdate } = engine(base, false);
    const before = editor.getJSON();
    expect(paste(editor, '<p>no</p>').notices).toEqual([]);
    editor.setEditable(true, false);
    Object.defineProperty(editor.view, 'composing', { configurable: true, get: () => true });
    expect(paste(editor, '<p>no</p>').notices).toEqual([]);
    expect(editor.getJSON()).toEqual(before); expect(onUpdate).not.toHaveBeenCalled();
  });
  it('pastes one undoable transaction and redo restores the exact same IDs', () => {
    const { editor } = engine();
    const before = editor.getJSON();
    paste(editor, '<blockquote><p>one</p></blockquote><p>two</p>');
    const after = editor.getJSON();
    expect(editor.commands.undo()).toBe(true); expect(editor.getJSON()).toEqual(before);
    expect(editor.commands.redo()).toBe(true); expect(editor.getJSON()).toEqual(after);
  });
  it('handles native paste through identity transforms, not just parsed slices', () => {
    const { editor } = engine();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [],
      getData: (type: string) => type === 'text/html' ? '<p data-spextar-id="intro"><strong>Copied</strong></p>' : 'Copied' } });
    editor.view.dom.dispatchEvent(event);
    expect(editor.getText()).toContain('Copied');
    expect(ids(editor).filter((id) => id === 'intro')).toHaveLength(1);
    expect(new Set(ids(editor)).size).toBe(ids(editor).length);
  });
});

describe('long topic navigation and fallback UX', () => {
  it('navigates 250 headings without a body update, identity change or undo event', () => {
    const content: TopicContent = { ...base, content: Array.from({ length: 250 }, (_, i) => ({
      type: 'heading', attrs: { id: `heading-${i}`, level: (i % 3) + 1 }, content: [{ type: 'text', text: `Section ${i}` }],
    })) };
    const { editor, onUpdate } = engine(content, false);
    const before = editor.getJSON();
    const positions: number[] = [];
    editor.state.doc.descendants((node, pos) => { if (node.type.name === 'heading') positions.push(pos); });
    for (const pos of [positions[0], positions[100], positions[249]]) {
      expect(navigateHeading(editor.view, pos)).toBe(true);
      expect(editor.state.selection.from).toBe(pos + 1);
    }
    expect(navigateHeading(editor.view, 2)).toBe(false);
    expect(editor.getJSON()).toEqual(before); expect(onUpdate).not.toHaveBeenCalled();
    expect(editor.can().undo()).toBe(false);
  });
  it('steps headings from lists/callouts/tables and at boundaries without writes', () => {
    const { editor, onUpdate } = engine({ ...base, content: [...(base.content as JSONValue[]),
      { type: 'callout', attrs: { kind: 'note', id: 'note' }, content: [
        { type: 'heading', attrs: { id: 'nested', level: 2 }, content: [{ type: 'text', text: 'Nested' }] },
      ] }, ...(tableFixture().content as JSONValue[]),
      { type: 'bulletList', attrs: { id: 'list' }, content: [
        { type: 'listItem', attrs: { id: 'item' }, content: [{ type: 'paragraph', attrs: { id: 'list-p' }, content: [{ type: 'text', text: 'Item' }] }] },
      ] },
      { type: 'heading', attrs: { id: 'last', level: 3 }, content: [{ type: 'text', text: 'Last' }] },
    ] });
    const before = editor.getJSON();
    navigateHeading(editor.view, 0);
    expect(stepHeading(editor.view, -1)).toBe(true);
    expect(editor.state.selection.from).toBe(1);
    expect(stepHeading(editor.view, 1)).toBe(true);
    expect(editor.state.selection.$from.parent.textContent).toBe('Nested');
    stepHeading(editor.view, 1);
    expect(editor.state.selection.$from.parent.textContent).toBe('Last');
    stepHeading(editor.view, 1);
    expect(editor.state.selection.$from.parent.textContent).toBe('Last');
    stepHeading(editor.view, -1);
    expect(editor.state.selection.$from.parent.textContent).toBe('Nested');
    expect(editor.getJSON()).toEqual(before); expect(onUpdate).not.toHaveBeenCalled();
  });
  it('requires explicit consent for plain-text degradation and never renders clipboard HTML', async () => {
    const change = vi.fn();
    render(<StructuredEditor content={base} editable onChange={change} />);
    const body = screen.getByRole('textbox', { name: 'Topic body' });
    await waitFor(() => expect(body).toHaveAttribute('contenteditable', 'true'));
    act(() => body.dispatchEvent(new CustomEvent<PasteNotice>(pasteNoticeEvent, { detail: {
      message: 'Unsupported HTML. Nothing was inserted.', text: '<img src=x>\nPlain text',
    } })));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was inserted');
    fireEvent.click(screen.getByRole('button', { name: /Paste text only/ }));
    expect(change).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(change.mock.calls[0][0])).toContain('<img src=x>');
    expect(body.querySelector('img')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('heading control restores editor focus without body changes, and toolbar Escape returns to caret', async () => {
    const change = vi.fn();
    render(<StructuredEditor content={base} editable={false} onChange={change} />);
    fireEvent.change(screen.getByLabelText('Jump to heading'), { target: { value: '0' } });
    const body = screen.getByRole('textbox', { name: 'Topic body' });
    expect(body).toHaveFocus();
    const search = screen.getByRole('button', { name: 'Find and replace' });
    search.focus(); fireEvent.keyDown(search, { key: 'Escape' });
    expect(body).toHaveFocus(); expect(change).not.toHaveBeenCalled();
  });
});
