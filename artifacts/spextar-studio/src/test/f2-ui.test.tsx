import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble, testUser } from './supabase-double';

function setup(role = 'author', route = 'author/doc-a') {
  const fake = supabaseDouble();
  const at = '2026-10-27T10:00:00Z';
  const document = { id: 'doc-a', project_id: 'project-a', title: 'Installation', slug: 'installation', description: null,
    status: 'draft', settings: {}, created_by: testUser.id, created_at: at, updated_at: at };
  const topic = { id: 'topic-a', document_id: 'doc-a', title: 'Install', slug: 'install', status: 'draft',
    settings: { kind: 'task', custom: true }, parent_topic_id: null, sort_order: 0,
    created_by: testUser.id, created_at: at, updated_at: at };
  fake.db.documents.push(document);
  fake.db.topics.push(topic);
  fake.db.project_members[0].role = role;
  fake.raw.rpc.mockImplementation(async (name, args, options) => {
    if (options?.get) return { data: null, error: { code: 'PGRST202', hint: `public.${name}(${name === 'create_document' ? 'p_project_id, p_title, p_slug, p_description' : 'p_document_id, p_parent_topic_id, p_title, p_slug'})` } };
    if (name === 'create_document') {
      fake.db.documents.push({ ...document, id: 'new-document', title: args.p_title, slug: args.p_slug });
      return { data: 'new-document', error: null };
    }
    if (name === 'create_topic') {
      fake.db.topics.push({ ...topic, id: 'new-topic', title: args.p_title, slug: args.p_slug, parent_topic_id: args.p_parent_topic_id });
      return { data: 'new-topic', error: null };
    }
    return { data: null, error: null };
  });
  window.history.replaceState(null, '', `/workspaces/ws-a/projects/project-a/${route}`);
  render(<App services={createSupabaseServices(fake.client)} />);
  return { ...fake, user: userEvent.setup() };
}

describe('F2 UI persistence and read-only states', () => {
  it('autosaves F2 metadata separately from F3 body through refetch', async () => {
    const { user, db, calls, raw } = setup();
    // Cold Author/editor imports are no longer incidentally warmed by management imports.
    const body = await screen.findByTestId('input-topic-body', {}, { timeout: 5000 });
    expect(screen.getByText('Draft body · autosave')).toBeVisible();
    await waitFor(() => expect(body).toHaveAttribute('contenteditable', 'true'));
    await user.type(body, 'UNSAVED BODY');
    const title = screen.getByTestId('input-topic-title');
    await user.clear(title);
    await user.type(title, 'Updated installation');
    await user.selectOptions(screen.getByLabelText('Topic status'), 'in-review');
    await waitFor(() => expect(db.topics[0].title).toBe('Updated installation'), { timeout: 4000 });
    await waitFor(() => expect(db.topics[0].status).toBe('in_review'), { timeout: 4000 });
    await waitFor(() => expect(screen.getByText('Metadata saved')).toBeVisible());
    expect(screen.getByTestId('input-topic-body')).toHaveTextContent('UNSAVED BODY');
    expect(calls.filter((call) => call.patch && call.table !== 'topic_drafts').every((call) => !JSON.stringify(call.patch).includes('UNSAVED BODY'))).toBe(true);
    await waitFor(() => expect(db.topic_drafts).toHaveLength(1));
    expect(JSON.stringify(db.topic_drafts[0].content)).toContain('UNSAVED BODY');
    expect(raw.rpc).not.toHaveBeenCalled();
    expect(screen.queryByTestId('button-discard-edits')).not.toBeInTheDocument();
    expect(db.topics[0].title).toBe('Updated installation');
  });
  it.each(['reviewer', 'viewer'])('keeps %s metadata, body and hierarchy controls read-only', async (role) => {
    setup(role);
    expect(await screen.findByTestId('input-topic-body')).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByTestId('input-topic-title')).toHaveAttribute('readonly');
    expect(screen.getByTestId('button-promote')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Create topic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate document' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Topic status')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Delete topic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete document' })).not.toBeInTheDocument();
  });
  it('shows autosave errors, preserves a failed draft and retries explicitly', async () => {
    const { user, errors, db } = setup();
    const title = await screen.findByTestId('input-topic-title');
    errors.set('topics', { code: '42501' });
    await user.clear(title);
    await user.type(title, 'Retry this title');
    expect(await screen.findByText(/You do not have permission/, {}, { timeout: 4000 })).toBeVisible();
    expect(screen.getByTestId('input-topic-title')).toHaveValue('Retry this title');
    expect(db.topics[0].title).toBe('Install');
    errors.delete('topics');
    await user.click(screen.getByRole('button', { name: 'Retry metadata save' }));
    await waitFor(() => expect(db.topics[0].title).toBe('Retry this title'));
  });
  it('creates a document using the existing dialog design, refreshes counts and opens Author', async () => {
    const { user, db } = setup('author', 'documents');
    await user.click(await screen.findByRole('button', { name: 'Create document' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Create document title'), 'Service manual');
    expect(within(dialog).getByLabelText('Create document slug')).toHaveValue('service-manual');
    await user.click(within(dialog).getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(window.location.pathname).toContain('/author/new-document'));
    expect(db.documents).toHaveLength(2);
    expect(await screen.findByText('This document has no topics.')).toBeVisible();
  });
  it('creates a topic under the selected parent and refreshes the outline', async () => {
    const { user, raw } = setup();
    await user.click(await screen.findByRole('button', { name: 'Create topic' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Create topic title'), 'Safety precautions');
    await user.click(within(dialog).getByRole('button', { name: 'Create topic' }));
    expect(await screen.findByTestId('outline-topic-new-topic')).toBeVisible();
    expect(raw.rpc).toHaveBeenLastCalledWith('create_topic', { p_document_id: 'doc-a', p_parent_topic_id: 'topic-a', p_title: 'Safety precautions', p_slug: 'safety-precautions' });
  });
});

describe('F2 destructive confirmation and navigation', () => {
  it('requires the exact title and allows cancellation without writing', async () => {
    const { user, calls, db } = setup();
    await user.click(await screen.findByRole('button', { name: 'Delete topic' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Delete topic' });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Title to confirm deletion'), 'Wrong title');
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls.filter((call) => call.deleted)).toHaveLength(0);
    expect(db.topics).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Delete topic' }));
    expect(screen.getByLabelText('Title to confirm deletion')).toHaveValue('');
  });
  it('blocks a document with topics and a topic with children without issuing deletes', async () => {
    const { user, db, calls } = setup();
    db.topics.push({ ...db.topics[0], id: 'child', parent_topic_id: 'topic-a', title: 'Child', slug: 'child' });
    await user.click(await screen.findByRole('button', { name: 'Delete topic' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Only leaf topics/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Delete topic' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Only empty documents/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Delete document' })).toBeDisabled();
    expect(calls.filter((call) => call.deleted)).toHaveLength(0);
  });
  it('deletes an empty document from Author and navigates away before the detail becomes missing', async () => {
    const { user, db } = setup();
    db.topics = [];
    await user.click(await screen.findByRole('button', { name: 'Delete document' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title to confirm deletion'), 'Installation');
    await user.click(within(dialog).getByRole('button', { name: 'Delete document' }));
    await waitFor(() => expect(window.location.pathname).toBe('/workspaces/ws-a/projects/project-a/documents'));
    await waitFor(() => expect(db.documents).toHaveLength(0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Create document' })).toBeVisible();
    expect(screen.queryByText('Installation')).not.toBeInTheDocument();
  });
  it('deletes from Documents and refreshes the list without leaving a stale row', async () => {
    const { user, db } = setup('author', 'documents');
    db.topics = [];
    await user.click(await screen.findByRole('button', { name: 'Delete document' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title to confirm deletion'), 'Installation');
    await user.click(within(dialog).getByRole('button', { name: 'Delete document' }));
    await waitFor(() => expect(screen.queryByText('Installation')).not.toBeInTheDocument());
    expect(db.documents).toHaveLength(0);
    expect(window.location.pathname).toBe('/workspaces/ws-a/projects/project-a/documents');
  });
  it('deletes a selected topic, clears its deep link, and retains unrelated autosaving body drafts', async () => {
    const { user, db, calls } = setup('author', 'author/doc-a?topic=topic-a');
    db.topics.push({ ...db.topics[0], id: 'topic-b', title: 'Next step', slug: 'next', sort_order: 1 });
    await screen.findByTestId('input-topic-body');
    await user.click(screen.getByTestId('outline-topic-topic-b'));
    await waitFor(() => expect(screen.getByTestId('input-topic-body')).toHaveAttribute('contenteditable', 'true'));
    await user.type(screen.getByTestId('input-topic-body'), 'KEEP LOCAL DRAFT');
    await user.click(screen.getByTestId('outline-topic-topic-a'));
    await waitFor(() => expect(screen.getByTestId('input-topic-body')).toHaveAttribute('contenteditable', 'true'));
    await user.type(screen.getByTestId('input-topic-body'), 'DISCARD DELETED DRAFT');
    await user.click(screen.getByRole('button', { name: 'Delete topic' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title to confirm deletion'), 'Install');
    await user.click(within(dialog).getByRole('button', { name: 'Delete topic' }));
    await waitFor(() => expect(screen.queryByTestId('outline-topic-topic-a')).not.toBeInTheDocument());
    expect(screen.getByTestId('input-topic-title')).toHaveValue('Next step');
    expect(screen.getByTestId('input-topic-body')).toHaveTextContent('KEEP LOCAL DRAFT');
    expect(window.location.search).toBe('');
    expect(db.topics.map((topic) => topic.id)).toEqual(['topic-b']);
    expect(calls.filter((call) => call.patch)).toHaveLength(0);
  });
  it('shows a dependency error from Supabase and keeps the confirmation open for retry', async () => {
    const { user, errors, db } = setup();
    errors.set('delete:topics', { code: '23503' });
    await user.click(await screen.findByRole('button', { name: 'Delete topic' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title to confirm deletion'), 'Install');
    await user.click(within(dialog).getByRole('button', { name: 'Delete topic' }));
    expect(await within(dialog).findByText(/Related records prevent deletion/)).toBeVisible();
    expect(db.topics).toHaveLength(1);
    expect(within(dialog).getByLabelText('Title to confirm deletion')).toHaveValue('Install');
    errors.delete('delete:topics');
    await user.click(within(dialog).getByRole('button', { name: 'Delete topic' }));
    await waitFor(() => expect(db.topics).toHaveLength(0));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('fails closed when the project role is revoked after confirmation opens', async () => {
    const { user, db, calls } = setup();
    await user.click(await screen.findByRole('button', { name: 'Delete topic' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title to confirm deletion'), 'Install');
    db.project_members[0].role = 'reviewer';
    await user.click(within(dialog).getByRole('button', { name: 'Delete topic' }));
    expect(await screen.findByText('Deletion was not confirmed')).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('input-topic-title')).toHaveAttribute('readonly'));
    expect(calls.filter((call) => call.deleted)).toHaveLength(0);
    expect(db.topics).toHaveLength(1);
  });
});
