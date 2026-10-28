import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { createReviewViewer } from '@/pages/review';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { createDemoServices } from '@/services/demo-adapter';
import { ServiceError } from '@/services/contracts';
import { emptyContent, type TopicDraft } from '@/domain/topic-content';
import { supabaseDouble } from './supabase-double';

const at = '2026-10-27T10:00:00Z';
const route = '/workspaces/ws-a/projects/project-a/review';
const docRow = (id = 'doc-a', status = 'in_review') => ({
  id, project_id: 'project-a', title: id, slug: id, status, description: 'Read carefully',
  settings: {}, created_by: 'user-a', created_at: at, updated_at: at,
});
const topicRow = (id: string, parent: string | null = null, order = 0, documentId = 'doc-a') => ({
  id, document_id: documentId, parent_topic_id: parent, title: id, slug: id,
  status: 'draft', sort_order: order, settings: { kind: 'task' }, created_by: 'user-a', created_at: at, updated_at: at,
});
const content = (text = 'Saved technical content') => ({ type: 'doc', version: 1,
  content: [{ type: 'paragraph', attrs: { id: 'block-stable' }, content: [{ type: 'text', text }] }] });
const draftRow = (id = 'topic-a', text = 'Saved technical content') => ({
  topic_id: id, content: content(text), revision: 7, updated_at: at, updated_by: 'user-a',
});
function backend(role: string | null = 'admin', setup?: (fake: ReturnType<typeof supabaseDouble>) => void) {
  const fake = supabaseDouble();
  fake.db.documents = [docRow(), docRow('not-in-review', 'draft')];
  fake.db.topics = [topicRow('topic-a')];
  fake.db.topic_drafts = [draftRow()];
  fake.db.project_members = role ? [{ project_id: 'project-a', user_id: 'user-a', role }] : [];
  setup?.(fake);
  const services = createSupabaseServices(fake.client);
  window.history.replaceState(null, '', route);
  return { ...fake, services, user: userEvent.setup(), mount: () => render(<App services={services} />) };
}
function assertNoWrites(fake: ReturnType<typeof backend>) {
  expect(fake.calls.filter((c) => c.patch || c.insert || c.deleted)).toHaveLength(0);
  expect(fake.raw.rpc).not.toHaveBeenCalled();
}
describe('Review current-draft inspection', () => {
  it('replaces only Review with a scoped, explicitly current-draft workspace and correct breadcrumbs', async () => {
    const f = backend(); f.mount();
    expect(await screen.findByTestId('review-page')).toBeVisible();
    expect(await screen.findByTestId('review-draft-revision')).toHaveTextContent('7');
    expect(screen.getByTestId('review-scope-note')).toHaveTextContent('not a submitted snapshot or a completed review');
    expect(screen.getByTestId('review-document-doc-a')).toBeVisible();
    expect(screen.queryByTestId('review-document-not-in-review')).not.toBeInTheDocument();
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    await waitFor(() => expect(within(crumb).getByText('doc-a')).toBeVisible());
    expect(within(crumb).getByText('Review')).toBeVisible();
    expect(screen.getByTestId('text-draft-updated-by')).toHaveTextContent('user-a');
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
    assertNoWrites(f);
  });
  it.each(['admin', 'author', 'reviewer', 'viewer', null])('never saves or exposes enabled write commands for role %s', async (role) => {
    const f = backend(role);
    const save = vi.spyOn(f.services.topicDrafts, 'save');
    const before = structuredClone(f.db.topic_drafts);
    f.mount();
    const body = await screen.findByRole('textbox', { name: 'Topic body' });
    expect(body).toHaveAttribute('contenteditable', 'false');
    expect(body).toHaveTextContent('Saved technical content');
    for (const button of screen.queryAllByRole('button', { name: /^(Bold|Italic|Undo|Redo|Insert table)$/i })) expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { name: /approve|assign|submit|publish|save changes/i })).not.toBeInTheDocument();
    body.focus(); await f.user.keyboard('DO NOT SAVE{Backspace}');
    await f.user.click(screen.getByTestId('button-refresh'));
    expect(await screen.findByTestId('review-draft-revision')).toHaveTextContent('7');
    expect(save).not.toHaveBeenCalled();
    expect(f.db.topic_drafts).toEqual(before);
    expect(localStorage.length).toBeLessThanOrEqual(1); // only existing organization preference, never recovery
    assertNoWrites(f);
  });
  it('preserves server hierarchy order/depth and switches topics/documents without leaking bodies', async () => {
    const f = backend('reviewer', ({ db }) => {
      db.documents.push(docRow('doc-b'));
      db.topics = [topicRow('second-root', null, 1), topicRow('child', 'topic-a'), topicRow('topic-a'), topicRow('other', null, 0, 'doc-b')];
      db.topic_drafts.push(draftRow('child', 'Child persisted body'), draftRow('other', 'Other document body'));
    });
    f.mount();
    await screen.findByRole('textbox', { name: 'Topic body' });
    const outline = screen.getByRole('navigation', { name: 'Topics in doc-a' });
    expect(within(outline).getAllByRole('button').map((b) => b.textContent)).toEqual(['topic-a', 'child', 'second-root']);
    expect(screen.getByTestId('review-topic-child').parentElement).toHaveStyle({ paddingLeft: '12px' });
    await f.user.click(screen.getByTestId('review-topic-child'));
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveTextContent('Child persisted body');
    await f.user.click(screen.getByTestId('review-document-doc-b'));
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveTextContent('Other document body');
    expect(screen.queryByText('Child persisted body')).not.toBeInTheDocument();
    assertNoWrites(f);
  });
  it('shows only saved server content, never fixture body or browser recovery copies', async () => {
    const f = backend();
    const get = vi.spyOn(f.services.topicDrafts, 'get');
    localStorage.setItem('unrelated-recovery', JSON.stringify({ content: content('Unsaved recovery body') }));
    f.mount();
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveTextContent('Saved technical content');
    expect(screen.queryByText('Unsaved recovery body')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /restore|discard/i })).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith({ userId: 'user-a', projectId: 'project-a', documentId: 'doc-a', topicId: 'topic-a' });
    expect(f.calls.filter((c) => c.table === 'topic_drafts').every((c) => c.filters.some(([k, v]) => k === 'topic_id' && v === 'topic-a'))).toBe(true);
    assertNoWrites(f);
  });
  it('shows missing drafts honestly without creating a row or loading an editable body', async () => {
    const f = backend('author', ({ db }) => { db.topic_drafts = []; }); f.mount();
    expect(await screen.findByTestId('review-draft-missing')).toBeVisible();
    expect(screen.queryByTestId('review-draft-revision')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Topic body' })).not.toBeInTheDocument();
    assertNoWrites(f);
  });
  it('handles no eligible documents without attempting draft reads', async () => {
    const f = backend('admin', ({ db }) => { db.documents = [docRow('draft-only', 'draft'), docRow('approved-only', 'approved'), docRow('published-only', 'published')]; });
    const get = vi.spyOn(f.services.topicDrafts, 'get'); f.mount();
    expect(await screen.findByText('No documents in review')).toBeVisible();
    expect(get).not.toHaveBeenCalled();
    assertNoWrites(f);
  });
  it('handles documents without topics and never fabricates a draft', async () => {
    const f = backend('admin', ({ db }) => { db.topics = []; }); f.mount();
    expect(await screen.findByTestId('review-topics-empty')).toBeVisible();
    expect(screen.getByText('No topics to inspect')).toBeVisible();
    expect(f.calls.filter((c) => c.table === 'topic_drafts')).toHaveLength(0);
  });
  it('refreshes current revision and removes documents that leave In Review', async () => {
    const f = backend(); f.mount();
    await screen.findByRole('textbox', { name: 'Topic body' });
    Object.assign(f.db.topic_drafts[0], { revision: 8, content: content('Newer saved copy') });
    await f.user.click(screen.getByTestId('button-refresh'));
    await waitFor(() => expect(screen.getByTestId('review-draft-revision')).toHaveTextContent('8'));
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveTextContent('Newer saved copy');
    f.db.documents[0].status = 'approved';
    await f.user.click(screen.getByTestId('button-refresh'));
    expect(await screen.findByText('No documents in review')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Topic body' })).not.toBeInTheDocument();
    assertNoWrites(f);
  });
  it('keeps unsupported content verbatim and read-only without normalization or writes', async () => {
    const f = backend('admin', ({ db }) => { db.topic_drafts[0].content = { type: 'doc', version: 99, custom: { keep: true }, content: [{ type: 'futureNode', attrs: { id: 'future' } }] }; });
    const original = structuredClone(f.db.topic_drafts);
    f.mount();
    const body = await screen.findByRole('textbox', { name: 'Topic body' });
    expect(body).toHaveAttribute('aria-readonly', 'true');
    expect(JSON.parse(body.textContent!)).toEqual(original[0].content);
    expect(screen.getByText(/original JSON is preserved unchanged/)).toBeVisible();
    expect(f.db.topic_drafts).toEqual(original);
    assertNoWrites(f);
  });
  it('surfaces malformed draft metadata instead of rendering or inventing a revision', async () => {
    const f = backend('admin', ({ db }) => { db.topic_drafts[0].revision = 0; }); f.mount();
    expect(await screen.findByText('Current draft did not load')).toBeVisible();
    expect(screen.queryByTestId('review-draft-revision')).not.toBeInTheDocument();
    assertNoWrites(f);
  });
  it('offers explicit retry after a draft permission error without demo fallback', async () => {
    const f = backend();
    f.errors.set('topic_drafts', { code: '42501' }); f.mount();
    expect(await screen.findByText('Current draft did not load')).toBeVisible();
    expect(screen.queryByTestId('review-demo-note')).not.toBeInTheDocument();
    f.errors.clear();
    await f.user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveTextContent('Saved technical content');
    assertNoWrites(f);
  });
  it('hides cached bodies after list errors and recovers through retry', async () => {
    const f = backend(); f.mount();
    await screen.findByRole('textbox', { name: 'Topic body' });
    const read = f.services.documents.listDocuments;
    vi.spyOn(f.services.documents, 'listDocuments').mockRejectedValue(new ServiceError('Read denied.', 'forbidden'));
    await f.user.click(screen.getByTestId('button-refresh'));
    expect(await screen.findByText('Documents did not load')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Topic body' })).not.toBeInTheDocument();
    vi.mocked(f.services.documents.listDocuments).mockImplementation(read);
    await f.user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveTextContent('Saved technical content');
  });
  it('does not show a late draft response from a previously selected topic', async () => {
    const f = backend('admin', ({ db }) => { db.topics.push(topicRow('next', null, 1)); db.topic_drafts.push(draftRow('next', 'Next current body')); });
    let release!: (value: TopicDraft | null) => void;
    const get = f.services.topicDrafts.get;
    vi.spyOn(f.services.topicDrafts, 'get').mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockImplementation(get);
    f.mount();
    await screen.findByTestId('review-viewer-loading');
    await f.user.click(screen.getByTestId('review-topic-next'));
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveTextContent('Next current body');
    release({ topicId: 'topic-a', content: content('Late old topic'), revision: 7, updatedAt: at, updatedBy: 'user-a' });
    await waitFor(() => expect(screen.queryByText('Late old topic')).not.toBeInTheDocument());
  });
  it('shows document-list loading without reading any draft until scope is ready', async () => {
    const f = backend();
    let release!: () => void;
    const delay = new Promise<void>((resolve) => { release = resolve; });
    const list = f.services.documents.listDocuments;
    const get = vi.spyOn(f.services.topicDrafts, 'get');
    vi.spyOn(f.services.documents, 'listDocuments').mockImplementation(async (id) => { await delay; return list(id); });
    f.mount();
    await screen.findByTestId('review-page');
    expect(screen.getByLabelText('Loading')).toBeVisible();
    expect(get).not.toHaveBeenCalled();
    release();
    expect(await screen.findByTestId('review-draft-revision')).toHaveTextContent('7');
  });
  it('keeps demo inspection explicitly sample-only and isolated from persistence/recovery', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    await services.auth.enterDemo();
    const get = vi.spyOn(services.topicDrafts, 'get'), save = vi.spyOn(services.topicDrafts, 'save');
    const fetch = vi.spyOn(globalThis, 'fetch');
    window.history.replaceState(null, '', '/workspaces/product-docs/projects/meridian-x4-user-guide/review');
    render(<App services={services} />);
    expect(await screen.findByTestId('review-demo-note')).toHaveTextContent('Not a saved draft, no revision exists');
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'false');
    expect(screen.queryByTestId('review-draft-revision')).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});

describe('Review viewer download boundary', () => {
  it('delays loading the engine behind a visible fallback', async () => {
    let release!: (value: { default: () => React.ReactNode }) => void;
    const load = vi.fn(() => new Promise<{ default: () => React.ReactNode }>((resolve) => { release = resolve; }));
    const Viewer = createReviewViewer(load);
    expect(load).not.toHaveBeenCalled();
    render(<Viewer content={emptyContent()} />);
    expect(screen.getByTestId('review-viewer-loading')).toBeVisible();
    release({ default: () => <p>Loaded read-only viewer</p> });
    expect(await screen.findByText('Loaded read-only viewer')).toBeVisible();
  });
  it('provides explicit page reload recovery after a failed module download', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const Viewer = createReviewViewer(async () => { throw new Error('Download offline'); });
      render(<Viewer content={emptyContent()} />);
      expect(await screen.findByTestId('review-viewer-error')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Reload page' })).toBeEnabled();
      expect(screen.queryByRole('textbox', { name: 'Topic body' })).not.toBeInTheDocument();
    } finally { log.mockRestore(); }
  });
});
