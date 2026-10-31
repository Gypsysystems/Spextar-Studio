import '@/features/review/review-draft-viewer';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble } from './supabase-double';
import { reviewFixture, reviewAt as at } from './review-fixtures';
import { checkedReview } from '@/domain/reviews';
import { packageFixture, semanticBody } from './review-package-fixtures';

function backend(role: string | null = 'admin', status = 'in_review') {
  const fake = supabaseDouble();
  fake.db.documents = [{ id: 'doc-a', project_id: 'project-a', title: 'Working title', slug: 'working-title', status, description: null, settings: {}, created_by: 'user-a', created_at: at, updated_at: at }];
  fake.db.topics = [{ id: 'topic-a', document_id: 'doc-a', parent_topic_id: null, title: 'Working topic', slug: 'working-topic', status, sort_order: 0, settings: {}, created_by: 'user-a', created_at: at, updated_at: at }];
  fake.db.topic_drafts = [{ topic_id: 'topic-a', content: { type: 'doc', version: 1, content: [] }, revision: 8, updated_at: at, updated_by: 'user-a' }];
  fake.db.document_reviews = [reviewFixture() as unknown as Record<string, unknown>];
  fake.db.project_members = role ? [{ project_id: 'project-a', user_id: 'user-a', role }] : [];
  const services = createSupabaseServices(fake.client);
  window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a/review?document=doc-a');
  return { ...fake, services, user: userEvent.setup(), mount: () => render(<App services={services} />) };
}
describe('Submitted review lifecycle', () => {
  it('renders frozen semantics after catalog changes without any mutable dependency reads', async () => {
    const f = backend();
    const review = f.db.document_reviews[0];
    review.dependency_package = packageFixture();
    (review.topics_snapshot as Record<string, unknown>[])[0].content = semanticBody();
    f.db.project_variables = []; f.db.condition_categories = []; f.db.condition_values = [];
    f.db.reusable_contents = []; f.db.reusable_content_drafts = [];
    f.mount();
    const body = await screen.findByRole('textbox', { name: 'Topic body' });
    expect(body).toHaveTextContent('Frozen product value');
    expect(screen.getByLabelText('Applied conditional tags')).toHaveTextContent('Audience: Technician');
    expect(body).toHaveTextContent('submitted revision 2');
    expect(body).toHaveAttribute('contenteditable','false');
    await f.user.click(screen.getByRole('button',{name:'Refresh'}));
    expect(await screen.findByText('Audience: Technician')).toBeVisible();
    expect(f.calls.filter(c => ['project_variables','condition_categories','condition_values','reusable_contents','reusable_content_drafts','topic_drafts'].includes(c.table))).toEqual([]);
  });
  it('does not resolve legacy review semantics from current catalogs', async () => {
    const f = backend(); (f.db.document_reviews[0].topics_snapshot as Record<string, unknown>[])[0].content = semanticBody(); f.mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('older review has no frozen dependencies');
    expect(f.calls.filter(c => ['project_variables','condition_categories','condition_values','reusable_contents'].includes(c.table))).toEqual([]);
  });
  it.each(['submit', 'decide', 'startDraft'] as const)('%s rejects stale and unconfirmed transitions without retries or fallback writes', async action => {
    const f = backend();
    const perform = () => action === 'submit' ? f.services.reviews!.submit('project-a', 'doc-a', at)
      : action === 'decide' ? f.services.reviews!.decide('project-a', 'doc-a', 'review-a', 'approved', '')
        : f.services.reviews!.startDraft('project-a', 'doc-a', 'review-a', at);
    f.raw.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT409' } });
    await expect(perform()).rejects.toMatchObject({ code: 'conflict' });
    expect(f.raw.rpc).toHaveBeenCalledTimes(1);
    f.raw.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(perform()).rejects.toMatchObject({ code: 'unavailable' });
    expect(f.raw.rpc).toHaveBeenCalledTimes(2);
    expect(f.calls.filter(c => c.patch || c.insert || c.deleted)).toEqual([]);
  });
  it.each(['40001', '23505'])('recognizes legacy %s conflicts without retry', async code => {
    const f = backend(); f.raw.rpc.mockResolvedValue({ data: null, error: { code } });
    await expect(f.services.reviews!.submit('project-a', 'doc-a', at)).rejects.toMatchObject({ code: 'conflict' });
    expect(f.raw.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['author', 'viewer'])('surfaces server decision denial for %s without alternative writes', async role => {
    const f = backend(role); f.raw.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(f.services.reviews!.decide('project-a', 'doc-a', 'review-a', 'approved', '')).rejects.toMatchObject({ code: 'forbidden' });
    expect(f.raw.rpc).toHaveBeenCalledTimes(1);
    expect(f.calls.filter(c => c.patch || c.insert || c.deleted)).toEqual([]);
  });
  it('requires a nonblank request-changes note at the service boundary', async () => {
    const f = backend('reviewer');
    await expect(f.services.reviews!.decide('project-a', 'doc-a', 'review-a', 'changes_requested', '\n\t ')).rejects.toMatchObject({ code: 'validation' });
    expect(f.raw.rpc).not.toHaveBeenCalled();
  });
  it.each(['draft', 'approved'])('Author confirms the explicit %s lifecycle action with expected state', async status => {
    const f = backend('author', status);
    if (status === 'approved') Object.assign(f.db.document_reviews[0], { status: 'approved', decided_by: 'user-a', decided_at: at });
    f.raw.rpc.mockResolvedValue({ data: 'review-a', error: null });
    window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a/author/doc-a'); f.mount();
    await screen.findByRole('textbox', { name: 'Topic body' });
    const action = status === 'draft' ? 'Submit for review' : 'Start new draft';
    const trigger = await screen.findByRole('button', { name: action });
    await waitFor(() => expect(trigger).toBeEnabled()); await f.user.click(trigger);
    await f.user.click(screen.getByRole('button', { name: `Confirm ${action.toLowerCase()}` }));
    await waitFor(() => expect(f.raw.rpc).toHaveBeenCalledTimes(1));
    expect(f.raw.rpc).toHaveBeenCalledWith(status === 'draft' ? 'submit_document_review' : 'start_document_draft', {
      p_project_id: 'project-a', p_document_id: 'doc-a', p_expected_updated_at: at, ...(status === 'approved' ? { p_review_id: 'review-a' } : {}),
    });
  });
  it.each(['admin', 'author', 'reviewer', 'viewer', null])('renders immutable content and role controls for %s', async role => {
    const f = backend(role); const get = vi.spyOn(f.services.topicDrafts, 'get'); f.mount();
    const body = await screen.findByRole('textbox', { name: 'Topic body' });
    expect(body).toHaveTextContent('Submitted technical content');
    expect(body).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByRole('heading', { name: 'Submitted document' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Approve' }) !== null).toBe(role === 'admin' || role === 'reviewer');
    expect(get).not.toHaveBeenCalled();
    expect(f.calls.filter(c => c.patch || c.insert || c.deleted)).toEqual([]);
    expect(f.raw.rpc).not.toHaveBeenCalled();
    expect(screen.getByTestId('review-page').textContent).not.toMatch(/review-a|topic-a|user-a|SQL|RPC|topic_drafts/);
    await f.user.click(screen.getByRole('button', { name: 'Missing body' }));
    expect(await screen.findByText('No saved body was submitted for this topic.')).toBeVisible();
  });
  it('refreshes the same snapshot despite current draft changes', async () => {
    const f = backend(); f.mount(); await screen.findByText('Submitted technical content');
    f.db.topic_drafts[0].content = { type: 'doc', version: 1, content: [] }; f.db.topics[0].title = 'Changed current title';
    await f.user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Submitted technical content')).toBeVisible();
    expect(f.calls.some(c => c.table === 'topic_drafts')).toBe(false);
  });
  it('fails closed on missing snapshots and errors', async () => {
    const f = backend(); f.db.document_reviews = []; f.mount();
    expect(await screen.findByText('No submitted review')).toBeVisible();
    f.errors.set('document_reviews', { code: '42501' });
    await f.user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Submitted review did not load')).toBeVisible();
    expect(f.calls.some(c => c.table === 'topic_drafts')).toBe(false);
  });
  it.each(['Approve', 'Recommend changes'])('confirms %s once and restores focus on cancel', async action => {
    const f = backend('reviewer'); f.raw.rpc.mockResolvedValue({ data: 'review-a', error: null }); f.mount();
    const trigger = await screen.findByRole('button', { name: action });
    await f.user.click(trigger); await f.user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus()); await f.user.click(trigger);
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: `Confirm ${action.toLowerCase()}` });
    if (action === 'Recommend changes') {
      expect(confirm).toBeDisabled();
      await f.user.type(within(dialog).getByRole('textbox', { name: 'Decision note' }), '   ');
      expect(confirm).toBeDisabled();
      await f.user.type(within(dialog).getByRole('textbox', { name: 'Decision note' }), 'Clarify the procedure');
    }
    await f.user.click(confirm);
    await waitFor(() => expect(f.raw.rpc).toHaveBeenCalledTimes(1));
    expect(f.raw.rpc.mock.calls[0][0]).toBe(action === 'Approve' ? 'approve_document_review' : 'request_document_changes');
    expect(f.calls.filter(c => c.patch || c.insert || c.deleted)).toEqual([]);
  });
  it('shows stale decisions without blind retry', async () => {
    const f = backend(); f.raw.rpc.mockResolvedValue({ data: null, error: { code: 'PT409' } }); f.mount();
    await f.user.click(await screen.findByRole('button', { name: 'Approve' }));
    await f.user.click(screen.getByRole('button', { name: 'Confirm approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed'); expect(f.raw.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['in_review', 'approved'])('locks Author body and hierarchy for %s', async status => {
    const f = backend('author', status); window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a/author/doc-a'); f.mount();
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByLabelText('Topic title')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: /Promote/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Create topic' })).not.toBeInTheDocument();
    expect(f.calls.filter(c => c.patch || c.insert || c.deleted)).toEqual([]);
  });
  it('serializes semantic references and future content without loss or aliasing', () => {
    const input = reviewFixture(); input.topics_snapshot[0].content!.content = [
      { type: 'paragraph', attrs: { id: 'p', conditions: { version: 1, values: [{ categoryId: 'category', valueId: 'value' }] } }, content: [{ type: 'variableReference', attrs: { id: 'v', referenceVersion: 1, variableId: 'variable' } }] },
      { type: 'reusableReference', attrs: { id: 'r', referenceVersion: 1, reusableId: 'reusable' } },
      { type: 'futureModule', attrs: { opaque: 'preserved' } },
    ];
    const serialized = JSON.stringify(input); const snapshot = checkedReview(JSON.parse(serialized), 'project-a', 'doc-a');
    expect(snapshot).toEqual(JSON.parse(serialized)); input.topics_snapshot[0].content!.content = [];
    expect(snapshot).toEqual(JSON.parse(serialized));
    expect(() => checkedReview(snapshot, 'foreign-project', 'doc-a')).toThrow();
    expect(() => checkedReview({ ...snapshot, topics_snapshot: [{ ...snapshot.topics_snapshot[1], revision: 1 }] }, 'project-a', 'doc-a')).toThrow();
  });
});
