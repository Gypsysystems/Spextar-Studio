import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { studioExtensions, replaceEditorDocument } from '@/features/editor/editor-extensions';
import { editorDocument, ensureNodeIds, mergeEditorDocument, structuredContentIssue, validLink } from '@/domain/structured-content';
import { contentKey, contentText, emptyContent, withText, type TopicContent } from '@/domain/topic-content';

const paragraph = (text = 'Technical content') => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const root = (content: unknown[]): TopicContent => ({ type: 'doc', version: 1, content: content as TopicContent['content'], metadata: { language: 'en', owner: 'SPEXTAR' } });
const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach((editor) => { const dom = editor.options.element; editor.destroy(); if (dom instanceof Element) dom.remove(); }); });
function engine(content = root([paragraph()])) {
  const element = document.createElement('div'); document.body.appendChild(element);
  const editor = new Editor({ element, extensions: studioExtensions(), content: editorDocument(content) as JSONContent });
  editors.push(editor); return editor;
}
function ids(editor: Editor) {
  const result: string[] = [];
  editor.state.doc.descendants((node) => { if (node.attrs.id) result.push(node.attrs.id as string); });
  return result;
}

describe('SPEXTAR structured JSON contract', () => {
  it('derives previews without joining adjacent list items or losing hard breaks', () => {
    const content = root([
      { type: 'bulletList', content: ['First item', 'Second item'].map((text) => ({ type: 'listItem', content: [paragraph(text)] })) },
      { type: 'paragraph', content: [{ type: 'text', text: 'Line one' }, { type: 'hardBreak' }, { type: 'text', text: 'Line two' }] },
    ]);
    expect(contentText(content)).toBe('First item\n\nSecond item\n\nLine one\nLine two');
  });
  it('refuses unexpected engine envelopes instead of discarding their metadata', () => {
    expect(() => mergeEditorDocument(emptyContent(), { type: 'doc', content: [], engineMetadata: true })).toThrow(/unsupported document envelope/i);
    expect(() => mergeEditorDocument(emptyContent(), { type: 'futureDoc', content: [] })).toThrow(/unsupported document envelope/i);
  });
  it('keeps unsafe link targets and opener behavior out of the editable subset', () => {
    for (const attrs of [{ href: 'https://example.com', target: '_top' }, { href: 'https://example.com', target: '_blank', rel: 'opener' }]) {
      const content = root([{ type: 'paragraph', content: [{ type: 'text', text: 'Link', marks: [{ type: 'link', attrs }] }] }]);
      expect(structuredContentIssue(content)).toMatch(/unsafe link/i);
    }
  });
  it('round-trips supported blocks, marks and root metadata without importing an engine-owned model', () => {
    const content = root([
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Preparation', marks: [{ type: 'bold' }] }] },
      paragraph(),
      { type: 'blockquote', content: [paragraph('Warning')] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Item')] }] },
      { type: 'orderedList', attrs: { start: 2 }, content: [{ type: 'listItem', content: [paragraph('Next')] }] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const x = 1;' }] },
      { type: 'horizontalRule' },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph('Header')] }] }] },
    ]);
    expect(structuredContentIssue(content)).toBeNull();
    const editor = engine(content);
    const merged = mergeEditorDocument(content, editor.getJSON());
    expect(merged.version).toBe(1);
    expect(merged.metadata).toEqual(content.metadata);
    expect(contentText(merged)).toContain('Preparation');
    expect(structuredContentIssue(merged)).toBeNull();
    expect(ids(editor).length).toBeGreaterThan(10);
    expect(new Set(ids(editor)).size).toBe(ids(editor).length);
  });
  it('does not mutate source JSON when adding IDs and retains existing IDs', () => {
    const source = root([paragraph(), paragraph('Second')]);
    const normalized = ensureNodeIds(source);
    expect(contentKey(source)).not.toContain('"id"');
    expect(ensureNodeIds(normalized)).toEqual(normalized);
    expect(normalized.metadata).toEqual(source.metadata);
  });
  it.each([
    root([{ type: 'image', attrs: { src: 'https://example.test/x.png' } }]),
    root([{ type: 'paragraph', attrs: { condition: 'future' }, content: [{ type: 'text', text: 'Keep' }] }]),
    root([{ type: 'paragraph', content: [{ type: 'text', text: 'Keep', marks: [{ type: 'futureMark' }] }] }]),
    { ...root([paragraph()]), version: 2 },
    root([{ type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Keep' }] }]),
    root([{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { rowspan: 2 }, content: [paragraph()] }] }] }]),
    root([{ type: 'paragraph', content: [{ type: 'text', text: 'Unsafe', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }]),
  ])('refuses unsupported/unsafe input without flattening or dropping it', (content) => {
    const before = contentKey(content);
    expect(structuredContentIssue(content)).not.toBeNull();
    expect(() => editorDocument(content)).toThrow();
    expect(() => mergeEditorDocument(content, emptyContent())).toThrow();
    expect(contentKey(content)).toBe(before);
  });
  it.each(['https://example.com/manual', 'http://localhost/help', 'mailto:writer@example.test', 'tel:+1234', '#section', '/manual'])('accepts safe link %s', (href) => expect(validLink(href)).toBe(true));
  it.each(['javascript:alert(1)', 'data:text/html,bad', 'vbscript:bad', 'https:\n//bad', 'file:///etc/passwd'])('rejects unsafe link %s', (href) => expect(validLink(href)).toBe(false));
});

describe('durable structural node identities', () => {
  it('preserves paragraph identity while typing, splitting, undoing and redoing', () => {
    const editor = engine();
    const original = ids(editor)[0];
    editor.commands.setTextSelection(4);
    editor.commands.insertContent(' new ');
    expect(ids(editor)[0]).toBe(original);
    editor.commands.splitBlock();
    const split = ids(editor);
    expect(split[0]).toBe(original);
    expect(new Set(split).size).toBe(split.length);
    editor.commands.undo();
    editor.commands.redo();
    expect(ids(editor)).toEqual(split);
  });
  it('preserves block identity during a heading conversion', () => {
    const editor = engine(); const original = ids(editor)[0];
    editor.commands.toggleHeading({ level: 2 });
    expect(editor.isActive('heading', { level: 2 })).toBe(true);
    expect(ids(editor)[0]).toBe(original);
  });
  it('repairs duplicate IDs without changing the original mapped owner', () => {
    const editor = engine(); const original = ids(editor)[0];
    editor.commands.insertContentAt(0, { type: 'paragraph', attrs: { id: original }, content: [{ type: 'text', text: 'Copy' }] });
    expect(ids(editor)[1]).toBe(original);
    expect(ids(editor)[0]).not.toBe(original);
  });
  it('retains a marked paragraph identity when converting it to a markless code block', () => {
    const editor = engine(root([{ type: 'paragraph', content: [{ type: 'text', text: 'Code', marks: [{ type: 'bold' }] }] }]));
    const original = ids(editor)[0];
    editor.commands.toggleCodeBlock();
    expect(editor.isActive('codeBlock')).toBe(true);
    expect(ids(editor)[0]).toBe(original);
  });
  it('assigns unique IDs to tables, rows, cells, list items and their paragraphs', () => {
    const editor = engine();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    const originals = ids(editor);
    editor.commands.addRowBefore();
    editor.commands.addColumnAfter();
    const all = ids(editor);
    expect(new Set(all).size).toBe(all.length);
    originals.forEach((id) => expect(all).toContain(id));
    expect(structuredContentIssue(mergeEditorDocument(emptyContent(), editor.getJSON()))).toBeNull();
  });
  it('keeps autosave echoes out of history and clears stale undo on explicit reload', () => {
    const editor = engine();
    editor.commands.insertContent('local');
    expect(editor.can().undo()).toBe(true);
    replaceEditorDocument(editor, withText(emptyContent(), 'Remote baseline'));
    expect(editor.getText()).toBe('Remote baseline');
    expect(editor.can().undo()).toBe(false);
    expect(editor.can().redo()).toBe(false);
  });
  it('blocks read-only document mutations, while permitting an explicit external load', () => {
    const editor = engine(); editor.setEditable(false);
    const before = editor.getJSON();
    editor.commands.toggleHeading({ level: 2 });
    editor.commands.insertContent('Blocked');
    expect(editor.getJSON()).toEqual(before);
    replaceEditorDocument(editor, withText(emptyContent(), 'Server read-only body'));
    expect(editor.getText()).toBe('Server read-only body');
  });
});
