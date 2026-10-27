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
  it('autosaves topic title/status but never body, retaining the draft through refetch', async () => {
    const { user, db, calls, raw } = setup();
    const body = await screen.findByTestId('input-topic-body');
    expect(screen.getByText(/Topic body · session-only · not saved until F3/)).toBeVisible();
    await user.type(body, 'UNSAVED BODY');
    const title = screen.getByTestId('input-topic-title');
    await user.clear(title);
    await user.type(title, 'Updated installation');
    await user.selectOptions(screen.getByLabelText('Topic status'), 'in-review');
    await waitFor(() => expect(db.topics[0].title).toBe('Updated installation'), { timeout: 4000 });
    await waitFor(() => expect(db.topics[0].status).toBe('in_review'), { timeout: 4000 });
    await waitFor(() => expect(screen.getByText('Metadata saved')).toBeVisible());
    expect(screen.getByTestId('input-topic-body')).toHaveValue('UNSAVED BODY');
    expect(calls.filter((call) => call.patch).every((call) => !JSON.stringify(call.patch).includes('UNSAVED BODY'))).toBe(true);
    expect(raw.rpc).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('button-discard-edits'));
    expect(body).toHaveValue('');
    expect(db.topics[0].title).toBe('Updated installation');
  });
  it.each(['reviewer', 'viewer'])('keeps %s metadata, body and hierarchy controls read-only', async (role) => {
    setup(role);
    expect(await screen.findByTestId('input-topic-body')).toHaveAttribute('readonly');
    expect(screen.getByTestId('input-topic-title')).toHaveAttribute('readonly');
    expect(screen.getByTestId('button-promote')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Create topic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate document' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Topic status')).toBeDisabled();
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
