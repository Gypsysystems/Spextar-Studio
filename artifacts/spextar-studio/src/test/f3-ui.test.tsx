import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble, testUser } from './supabase-double';
import { contentText, emptyContent, withText, type TopicContent } from '@/domain/topic-content';
import { readRecovery, rememberRecovery } from '@/services/topic-draft-recovery';
import { tableFixture } from './table-fixture';

function setup(role = 'author', recovery?: string, initialContent?: TopicContent) {
  const fake = supabaseDouble();
  const at = '2026-10-27T10:00:00Z';
  fake.db.documents.push({ id: 'doc-a', project_id: 'project-a', title: 'Manual', slug: 'manual', description: null,
    status: 'draft', settings: {}, created_by: testUser.id, created_at: at, updated_at: at });
  fake.db.topics.push({ id: 'topic-a', document_id: 'doc-a', title: 'Install', slug: 'install',
    status: 'draft', settings: {}, parent_topic_id: null, sort_order: 0, created_by: testUser.id, created_at: at, updated_at: at });
  fake.db.project_members[0].role = role;
  if (initialContent) fake.db.topic_drafts.push({ topic_id: 'topic-a', content: initialContent, revision: 1, updated_at: at, updated_by: testUser.id });
  const scope = { userId: testUser.id, projectId: 'project-a', documentId: 'doc-a', topicId: 'topic-a' };
  if (recovery) rememberRecovery(scope, withText(emptyContent(), recovery), null);
  window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a/author/doc-a');
  const services = createSupabaseServices(fake.client);
  const view = render(<App services={services} />);
  return { ...fake, scope, services, view, user: userEvent.setup() };
}

describe('F3 Author integration', () => {
  it('persists a safe rich paste through recovery and revision checks, but rejects unsupported HTML without writes', async () => {
    const initial: TopicContent = { type: 'doc', version: 1, metadata: { locale: 'en' }, content: [
      { type: 'paragraph', attrs: { id: 'original' }, content: [{ type: 'text', text: 'Original' }] },
    ] };
    const { db, scope, calls, user } = setup('author', undefined, initial);
    // Await the cold lazy editor/draft mount, not the default one-second DOM budget.
    await screen.findByText('Saved · revision 1', {}, { timeout: 5000 });
    const body = screen.getByTestId('input-topic-body');
    const paste = (html: string, text: string) => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files: [],
        getData: (type: string) => type === 'text/html' ? html : text } });
      act(() => body.dispatchEvent(event));
    };
    paste('<p>Unsupported<img src="x"></p>', 'Unsupported');
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was inserted');
    expect(readRecovery(scope)).toHaveLength(0);
    expect(calls.filter((call) => call.patch || call.insert)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Dismiss paste' }));
    paste('<h2>Setup</h2><blockquote><p><b>Technical paste</b></p></blockquote>', 'Setup Technical paste');
    const recovery = readRecovery(scope)[0].copy.content;
    expect(JSON.stringify(recovery)).toContain('"blockquote"');
    expect(recovery.metadata).toEqual({ locale: 'en' });
    await screen.findByText('Saved · revision 2', {}, { timeout: 4000 });
    expect(db.topic_drafts[0].content).toEqual(recovery);
    expect(readRecovery(scope)).toHaveLength(0);
    // A later paste must not silently replace a newer server revision.
    Object.assign(db.topic_drafts[0], { content: withText(emptyContent(), 'Newer remote'), revision: 3 });
    paste('<p>Local paste</p>', 'Local paste');
    await screen.findByText('Concurrent-edit conflict', {}, { timeout: 4000 });
    expect(contentText(db.topic_drafts[0].content as TopicContent)).toBe('Newer remote');
    expect(readRecovery(scope)).toHaveLength(1);
  });
  const selectFirstCell = () => {
    const editor = (screen.getByTestId('input-topic-body') as HTMLElement & { editor: Editor }).editor;
    act(() => editor.view.dispatch(editor.state.tr.setMeta('skipTrailingNode', true)
      .setSelection(CellSelection.create(editor.state.doc, 2))));
  };
  it.each(['admin', 'author'])('persists %s advanced tables through autosave, retry, recovery and reload without F2 writes', async (role) => {
    const { user, db, calls, errors, scope, view, client } = setup(role, undefined, tableFixture(2, 2));
    await screen.findByText('Saved · revision 1');
    selectFirstCell();
    await user.click(screen.getByRole('button', { name: 'Select table' }));
    expect(calls.filter((call) => call.patch || call.insert)).toHaveLength(0);
    errors.set('write:topic_drafts', { code: 'network_down' });
    await user.click(screen.getByRole('button', { name: 'Merge selected cells' }));
    const recovery = readRecovery(scope)[0].copy.content;
    expect(JSON.stringify(recovery)).toContain('"rowspan":2');
    await screen.findByText('Body not saved', {}, { timeout: 4000 });
    errors.clear();
    await user.click(screen.getByRole('button', { name: 'Retry body save' }));
    await screen.findByText('Saved · revision 2');
    expect(db.topic_drafts[0].content).toEqual(recovery);
    expect(readRecovery(scope)).toHaveLength(0);
    view.unmount();
    render(<App services={createSupabaseServices(client)} />);
    await screen.findByText('Saved · revision 2');
    expect(screen.getByTestId('input-topic-body').querySelector('td')).toHaveAttribute('rowspan', '2');
    expect(screen.getByTestId('input-topic-body').querySelector('td')).toHaveAttribute('colspan', '2');
    expect(calls.filter((call) => call.patch || call.insert).every((call) => call.table === 'topic_drafts')).toBe(true);
  });
  it('retains merged table JSON during conflict and explicitly restores it without overwriting a newer revision', async () => {
    const { user, db, scope } = setup('author', undefined, tableFixture(2, 2));
    await screen.findByText('Saved · revision 1');
    selectFirstCell();
    await user.click(screen.getByRole('button', { name: 'Select row' }));
    await user.click(screen.getByRole('button', { name: 'Merge selected cells' }));
    const local = readRecovery(scope)[0].copy.content;
    const remote = withText(emptyContent(), 'Remote table revision');
    Object.assign(db.topic_drafts[0], { content: remote, revision: 2 });
    await screen.findByText('Concurrent-edit conflict', {}, { timeout: 4000 });
    expect(db.topic_drafts[0].content).toEqual(remote);
    await user.click(screen.getByRole('button', { name: 'Retry body save' }));
    expect(db.topic_drafts[0].content).toEqual(remote);
    await user.click(screen.getByRole('button', { name: 'Reload saved draft' }));
    await screen.findByRole('region', { name: 'Recover topic body' });
    await user.click(screen.getByRole('button', { name: 'Restore recovery' }));
    await screen.findByText('Saved · revision 3', {}, { timeout: 4000 });
    expect(db.topic_drafts[0].content).toEqual(local);
    expect(readRecovery(scope)).toHaveLength(0);
  });
  it.each(['reviewer', 'viewer'])('keeps backend %s table operations read-only with zero writes', async (role) => {
    const { user, calls } = setup(role, undefined, tableFixture(2, 2));
    await screen.findByText(/Saved · revision 1 · Read-only/);
    selectFirstCell();
    await user.click(screen.getByRole('button', { name: 'Select table' }));
    for (const label of ['Merge selected cells', 'Split cell', 'Toggle cell header', 'Toggle header column', 'Delete row', 'Delete table']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
    expect(calls.filter((call) => call.patch || call.insert)).toHaveLength(0);
  });
  const searchContent: TopicContent = { type: 'doc', version: 1, metadata: { locale: 'en' }, content: [
    { type: 'callout', attrs: { id: 'callout-id', kind: 'warning' }, content: [
      { type: 'paragraph', attrs: { id: 'p-id' }, content: [
        { type: 'text', text: 'Pump ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'pump', marks: [{ type: 'italic' }] },
      ] },
    ] },
  ] };
  it('searches without writes and persists replacements through recovery, network retry and reload', async () => {
    const { user, db, calls, errors, scope, view, client } = setup('author', undefined, searchContent);
    await screen.findByText('Saved · revision 1');
    await user.click(screen.getByRole('button', { name: 'Find and replace' }));
    await user.type(screen.getByRole('textbox', { name: 'Find in this topic' }), 'pump');
    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(calls.filter((call) => call.patch || call.insert)).toHaveLength(0);
    errors.set('write:topic_drafts', { code: 'network_down' });
    await user.type(screen.getByRole('textbox', { name: 'Replace with' }), 'Valve');
    await user.click(screen.getByRole('button', { name: 'Replace all' }));
    expect(readRecovery(scope)[0].copy.content).toMatchObject({ metadata: { locale: 'en' } });
    expect(JSON.stringify(readRecovery(scope)[0].copy.content)).toContain('"id":"callout-id"');
    await screen.findByText('Body not saved', {}, { timeout: 4000 });
    errors.clear();
    await user.click(screen.getByRole('button', { name: 'Retry body save' }));
    await screen.findByText('Saved · revision 2');
    expect(contentText(db.topic_drafts[0].content as TopicContent).trim()).toBe('Valve Valve');
    expect(readRecovery(scope)).toHaveLength(0);
    view.unmount();
    render(<App services={createSupabaseServices(client)} />);
    await waitFor(() => expect(screen.getByTestId('input-topic-body')).toHaveTextContent('Valve Valve'));
    expect(screen.queryByRole('region', { name: 'Find and replace in this topic' })).toBeNull();
    expect(calls.filter((call) => call.patch || call.insert).every((call) => call.table === 'topic_drafts')).toBe(true);
  });
  it('does not let replace-all overwrite a newer revision; preserves replaced JSON for explicit recovery', async () => {
    const { user, db, scope } = setup('author', undefined, searchContent);
    await screen.findByText('Saved · revision 1');
    await user.click(screen.getByRole('button', { name: 'Find and replace' }));
    await user.type(screen.getByRole('textbox', { name: 'Find in this topic' }), 'pump');
    await user.type(screen.getByRole('textbox', { name: 'Replace with' }), 'Valve');
    await user.click(screen.getByRole('button', { name: 'Replace all' }));
    const local = readRecovery(scope)[0].copy.content;
    const remote = withText(emptyContent(), 'Newer remote content');
    Object.assign(db.topic_drafts[0], { content: remote, revision: 2 });
    await screen.findByText('Concurrent-edit conflict', {}, { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: 'Retry body save' }));
    expect(db.topic_drafts[0].content).toEqual(remote);
    await user.click(screen.getByRole('button', { name: 'Reload saved draft' }));
    await screen.findByRole('region', { name: 'Recover topic body' });
    await user.click(screen.getByRole('button', { name: 'Restore recovery' }));
    await screen.findByText('Saved · revision 3', {}, { timeout: 4000 });
    expect(db.topic_drafts[0].content).toEqual(local);
    expect(readRecovery(scope)).toHaveLength(0);
  });
  it.each(['reviewer', 'viewer'])('lets backend %s search persisted callouts without replacement or writes', async (role) => {
    const { user, calls } = setup(role, undefined, searchContent);
    await screen.findByText(/Saved · revision 1 · Read-only/);
    await user.click(screen.getByRole('button', { name: 'Find and replace' }));
    await user.type(screen.getByRole('textbox', { name: 'Find in this topic' }), 'pump');
    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Replace with' })).toBeDisabled();
    expect(calls.filter((call) => call.patch || call.insert)).toHaveLength(0);
  });
  it('persists semantic callouts through the existing draft adapter and reload without F2 writes', async () => {
    const { user, db, calls, view, client } = setup();
    await screen.findByText('No saved body yet');
    await user.click(screen.getByRole('button', { name: 'Note callout' }));
    await user.type(screen.getByTestId('input-topic-body'), 'Technical note');
    await screen.findByText(/Saved · revision/, {}, { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: 'Caution callout' }));
    await waitFor(() => expect(screen.getByTestId('body-save-status')).toHaveTextContent(/Saved · revision/), { timeout: 4000 });
    const saved = db.topic_drafts[0].content as ReturnType<typeof emptyContent>;
    expect(JSON.stringify(saved)).toContain('"kind":"caution"');
    expect(contentText(saved).trim()).toBe('Technical note');
    expect(calls.filter((call) => call.patch || call.insert).every((call) => call.table === 'topic_drafts')).toBe(true);
    view.unmount();
    render(<App services={createSupabaseServices(client)} />);
    const area = await screen.findByTestId('input-topic-body');
    await waitFor(() => expect(area.querySelector('[data-callout-kind="caution"]')).toHaveTextContent('Technical note'));
    expect(db.topic_drafts[0].content).toEqual(saved);
  });
  it('shows unsaved/saved states, restores saved body on remount and keeps F2 metadata separate', async () => {
    const { user, db, calls, view, client } = setup();
    await screen.findByText('No saved body yet');
    await user.type(screen.getByTestId('input-topic-body'), 'Persisted topic body');
    expect(screen.getByTestId('body-save-status')).toHaveTextContent('Unsaved changes');
    await screen.findByText('Saved · revision 1', {}, { timeout: 4000 });
    expect(contentText(db.topic_drafts[0].content as ReturnType<typeof emptyContent>)).toBe('Persisted topic body');
    expect(calls.filter((call) => call.patch || call.insert).every((call) => call.table === 'topic_drafts')).toBe(true);
    view.unmount();
    render(<App services={createSupabaseServices(client)} />);
    await waitFor(() => expect(screen.getByTestId('input-topic-body')).toHaveTextContent('Persisted topic body'));
  });
  it('offers browser recovery rather than automatically submitting it', async () => {
    const { user, db, scope } = setup('author', 'Recovered after refresh');
    await screen.findByRole('region', { name: 'Recover topic body' });
    expect(screen.getByTestId('input-topic-body')).toHaveTextContent('');
    expect(screen.getByTestId('input-topic-body')).toHaveAttribute('aria-readonly', 'true');
    expect(db.topic_drafts).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Restore recovery' }));
    await screen.findByText('Saved · revision 1', {}, { timeout: 4000 });
    expect(screen.getByTestId('input-topic-body')).toHaveTextContent('Recovered after refresh');
    expect(readRecovery(scope)).toHaveLength(0);
  });
  it('shows conflicts and requires reload/explicit restore before applying over the latest revision', async () => {
    const { user, db, scope } = setup();
    await screen.findByText('No saved body yet');
    await user.type(screen.getByTestId('input-topic-body'), 'My body');
    db.topic_drafts.push({ topic_id: scope.topicId, content: withText(emptyContent(), 'Other browser'), revision: 1, updated_at: new Date().toISOString(), updated_by: 'other' });
    await screen.findByText('Concurrent-edit conflict', {}, { timeout: 4000 });
    expect(contentText(db.topic_drafts[0].content as ReturnType<typeof emptyContent>)).toBe('Other browser');
    await user.click(screen.getByRole('button', { name: 'Reload saved draft' }));
    await screen.findByRole('region', { name: 'Recover topic body' });
    expect(screen.getByTestId('input-topic-body')).toHaveTextContent('Other browser');
    await user.click(screen.getByRole('button', { name: 'Restore recovery' }));
    await screen.findByText('Saved · revision 2', {}, { timeout: 4000 });
    expect(screen.getByTestId('input-topic-body')).toHaveTextContent('My body');
  });
  it('retains a failed draft and exposes an actionable explicit retry', async () => {
    const { user, errors } = setup();
    await screen.findByText('No saved body yet');
    errors.set('write:topic_drafts', { code: 'network_down' });
    await user.type(screen.getByTestId('input-topic-body'), 'Offline draft');
    await screen.findByText('Body not saved', {}, { timeout: 4000 });
    expect(screen.getByTestId('input-topic-body')).toHaveTextContent('Offline draft');
    errors.clear();
    await user.click(screen.getByRole('button', { name: 'Retry body save' }));
    await screen.findByText('Saved · revision 1');
  });
  it.each(['reviewer', 'viewer'])('keeps %s body read-only and does not offer author recovery', async (role) => {
    const { calls } = setup(role, 'Private old draft');
    await screen.findByText(/No saved body yet · Read-only/);
    expect(screen.getByTestId('input-topic-body')).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByRole('region', { name: 'Recover topic body' })).not.toBeInTheDocument();
    expect(calls.some((call) => call.insert || call.patch)).toBe(false);
  });
  it('clears identity-scoped recovery and pending saves on explicit sign-out', async () => {
    const { user, scope, db, errors } = setup();
    await screen.findByText('No saved body yet');
    errors.set('write:topic_drafts', { code: 'network_down' });
    await user.type(screen.getByTestId('input-topic-body'), 'Private unsaved body');
    expect(readRecovery(scope)).toHaveLength(1);
    await user.click(screen.getByTestId('button-account'));
    await user.click(screen.getByTestId('button-sign-out'));
    await screen.findByTestId('input-email');
    expect(readRecovery(scope)).toHaveLength(0);
    expect(db.topic_drafts).toHaveLength(0);
  });
});
