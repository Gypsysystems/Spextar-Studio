import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import userEvent from '@testing-library/user-event';
import { StructuredEditor } from '@/features/editor/structured-editor';
import { emptyContent, withText, type TopicContent } from '@/domain/topic-content';

function setup(initial = emptyContent(), editable = true) {
  const changed = vi.fn();
  function Surface() {
    const [content, setContent] = useState(initial);
    return <StructuredEditor content={content} editable={editable} onChange={(next) => { changed(next); setContent(next); }} />;
  }
  const view = render(<Surface />);
  return { ...view, user: userEvent.setup(), changed };
}
async function body() {
  const editor = await screen.findByRole('textbox', { name: 'Topic body' });
  await waitFor(() => expect(editor).toHaveAttribute('contenteditable', 'true'));
  return editor;
}
describe('structured authoring toolbar', () => {
  it.each([
    ['Bold', 'strong'], ['Italic', 'em'], ['Underline', 'u'], ['Strikethrough', 's'], ['Inline code', 'code'],
  ])('applies %s without losing the JSON/root metadata on controlled echoes', async (command, tag) => {
    const metadata = { language: 'en', custom: ['preserve', 1] };
    const { user, changed } = setup({ ...withText(emptyContent(), 'Marked'), metadata });
    const area = await body();
    // Native text hit-testing is not implemented by JSDOM.
    act(() => (area as HTMLElement & { editor: Editor }).editor.commands.setTextSelection({ from: 1, to: 7 }));
    await user.click(screen.getByRole('button', { name: command }));
    expect(area.querySelector(tag)).toHaveTextContent('Marked');
    expect(changed.mock.lastCall?.[0]).toMatchObject({ version: 1, metadata });
    expect(changed.mock.lastCall?.[0].content[0].attrs.id).toBeTruthy();
  });
  it.each([1, 2, 3])('supports heading level %i and Paragraph conversion', async (level) => {
    const { user } = setup(withText(emptyContent(), 'Heading'));
    const area = await body();
    await user.click(screen.getByRole('button', { name: `Heading ${level}` }));
    expect(area.querySelector(`h${level}`)).toHaveTextContent('Heading');
    expect(screen.getByRole('button', { name: `Heading ${level}` })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Paragraph' }));
    expect(area.querySelector('p')).toHaveTextContent('Heading');
  });
  it.each([
    ['Code block', 'pre'], ['Blockquote', 'blockquote'], ['Bullet list', 'ul'], ['Ordered list', 'ol'],
  ])('supports %s', async (command, tag) => {
    const { user } = setup(withText(emptyContent(), 'Block'));
    const area = await body();
    await user.click(screen.getByRole('button', { name: command }));
    expect(area.querySelector(tag)).toHaveTextContent('Block');
  });
  it('supports horizontal rule, Undo and Redo, without treating own echoes as reloads', async () => {
    const { user } = setup(withText(emptyContent(), 'Body'));
    const area = await body();
    await user.click(screen.getByRole('button', { name: 'Horizontal rule' }));
    expect(area.querySelector('hr')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(area.querySelector('hr')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(area.querySelector('hr')).toBeInTheDocument();
  });
  it('inserts a table and operates its rows, columns, headers and deletion', async () => {
    const { user, changed } = setup();
    const area = await body();
    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    expect(area.querySelectorAll('tr')).toHaveLength(3);
    expect(area.querySelectorAll('th')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Add row below' }));
    expect(area.querySelectorAll('tr')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Add column right' }));
    expect(area.querySelector('tr')?.children).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Delete column' }));
    await user.click(screen.getByRole('button', { name: 'Delete row' }));
    expect(area.querySelectorAll('tr')).toHaveLength(3);
    expect(area.querySelector('tr')?.children).toHaveLength(3);
    const headers = area.querySelectorAll('th').length;
    await user.click(screen.getByRole('button', { name: 'Toggle header row' }));
    expect(area.querySelectorAll('th').length).not.toBe(headers);
    expect(changed.mock.lastCall?.[0].content.some((node: { type: string }) => node.type === 'table')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Delete table' }));
    expect(area.querySelector('table')).not.toBeInTheDocument();
  });
  it('validates link URLs and provides insertion, editing and removal', async () => {
    const { user } = setup();
    const area = await body();
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('URL'), 'javascript:bad');
    await user.type(within(dialog).getByLabelText('Link text'), 'Reference');
    await user.click(within(dialog).getByRole('button', { name: 'Save link' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/valid/);
    await user.clear(within(dialog).getByLabelText('URL'));
    await user.type(within(dialog).getByLabelText('URL'), 'https://example.com/reference');
    await user.click(within(dialog).getByRole('button', { name: 'Save link' }));
    expect(area.querySelector('a')).toHaveAttribute('href', 'https://example.com/reference');
    // JSDOM has no native caret hit-testing: select inside the inserted link.
    act(() => (area as HTMLElement & { editor: Editor }).editor.commands.setTextSelection(3));
    await user.click(screen.getByRole('button', { name: 'Edit link' }));
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(area.querySelector('a')).not.toBeInTheDocument();
    expect(area).toHaveTextContent('Reference');
  });
  it('offers keyboard toolbar navigation with visible labelled controls', async () => {
    const { user } = setup(); await body();
    const first = screen.getByRole('button', { name: 'Heading 1' });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Heading 2' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'Find and replace' })).toHaveFocus();
  });
  it('does not emit on mount, read-only selection, or loading and disables mutation commands', async () => {
    const { changed } = setup(withText(emptyContent(), 'Readable'), false);
    const area = await screen.findByRole('textbox', { name: 'Topic body' });
    expect(area).toHaveAttribute('aria-readonly', 'true');
    expect(area).toHaveAttribute('contenteditable', 'false');
    within(screen.getByRole('toolbar')).getAllByRole('button').filter((button) => button.getAttribute('aria-label') !== 'Find and replace')
      .forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Find and replace' })).toBeEnabled();
    expect(changed).not.toHaveBeenCalled();
  });
  it('shows unsupported JSON verbatim, emits no normalized replacement, and can load a supported replacement', async () => {
    const content: TopicContent = { type: 'doc', version: 1, custom: 'Keep', content: [{ type: 'futureReuse', attrs: { ref: 'keep-me' } }] };
    const changed = vi.fn();
    const view = render(<StructuredEditor content={content} editable onChange={changed} />);
    expect(screen.getByRole('note')).toHaveTextContent(/original JSON is preserved/);
    expect(screen.getByRole('textbox')).toHaveTextContent('keep-me');
    screen.getByRole('textbox').focus();
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(changed).not.toHaveBeenCalled();
    view.rerender(<StructuredEditor content={withText(emptyContent(), 'Supported')} editable onChange={changed} />);
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveTextContent('Supported'));
    expect(changed).not.toHaveBeenCalled();
  });
});
