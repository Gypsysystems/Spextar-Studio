import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble, testUser } from './supabase-double';
import { contentText, emptyContent, withText } from '@/domain/topic-content';
import { readRecovery, rememberRecovery } from '@/services/topic-draft-recovery';

function setup(role = 'author', recovery?: string) {
  const fake = supabaseDouble();
  const at = '2026-10-27T10:00:00Z';
  fake.db.documents.push({ id: 'doc-a', project_id: 'project-a', title: 'Manual', slug: 'manual', description: null,
    status: 'draft', settings: {}, created_by: testUser.id, created_at: at, updated_at: at });
  fake.db.topics.push({ id: 'topic-a', document_id: 'doc-a', title: 'Install', slug: 'install',
    status: 'draft', settings: {}, parent_topic_id: null, sort_order: 0, created_by: testUser.id, created_at: at, updated_at: at });
  fake.db.project_members[0].role = role;
  const scope = { userId: testUser.id, projectId: 'project-a', documentId: 'doc-a', topicId: 'topic-a' };
  if (recovery) rememberRecovery(scope, withText(emptyContent(), recovery), null);
  window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a/author/doc-a');
  const services = createSupabaseServices(fake.client);
  const view = render(<App services={services} />);
  return { ...fake, scope, services, view, user: userEvent.setup() };
}

describe('F3 Author integration', () => {
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
    await waitFor(() => expect(screen.getByTestId('input-topic-body')).toHaveValue('Persisted topic body'));
  });
  it('offers browser recovery rather than automatically submitting it', async () => {
    const { user, db, scope } = setup('author', 'Recovered after refresh');
    await screen.findByRole('region', { name: 'Recover topic body' });
    expect(screen.getByTestId('input-topic-body')).toHaveValue('');
    expect(screen.getByTestId('input-topic-body')).toHaveAttribute('readonly');
    expect(db.topic_drafts).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Restore recovery' }));
    await screen.findByText('Saved · revision 1', {}, { timeout: 4000 });
    expect(screen.getByTestId('input-topic-body')).toHaveValue('Recovered after refresh');
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
    expect(screen.getByTestId('input-topic-body')).toHaveValue('Other browser');
    await user.click(screen.getByRole('button', { name: 'Restore recovery' }));
    await screen.findByText('Saved · revision 2', {}, { timeout: 4000 });
    expect(screen.getByTestId('input-topic-body')).toHaveValue('My body');
  });
  it('retains a failed draft and exposes an actionable explicit retry', async () => {
    const { user, errors } = setup();
    await screen.findByText('No saved body yet');
    errors.set('write:topic_drafts', { code: 'network_down' });
    await user.type(screen.getByTestId('input-topic-body'), 'Offline draft');
    await screen.findByText('Body not saved', {}, { timeout: 4000 });
    expect(screen.getByTestId('input-topic-body')).toHaveValue('Offline draft');
    errors.clear();
    await user.click(screen.getByRole('button', { name: 'Retry body save' }));
    await screen.findByText('Saved · revision 1');
  });
  it.each(['reviewer', 'viewer'])('keeps %s body read-only and does not offer author recovery', async (role) => {
    const { calls } = setup(role, 'Private old draft');
    await screen.findByText(/No saved body yet · Read-only/);
    expect(screen.getByTestId('input-topic-body')).toHaveAttribute('readonly');
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
