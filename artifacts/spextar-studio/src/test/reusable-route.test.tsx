import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import type { TopicContent } from '@/domain/topic-content';
import { reusableRecovery } from '@/services/reusable-recovery';
import { reusableBody, reusableContext as context, reusableDouble } from './reusable-fixtures';

// Transport/controller integration here; real Tiptap interactions are covered by editor regressions and controlled browser acceptance.
vi.mock('@/features/editor/structured-editor', () => ({
  StructuredEditor: ({ content, editable, onChange, deferRender }: { content: TopicContent; editable: boolean; onChange: (c: TopicContent) => void; deferRender?: boolean }) =>
    <textarea data-testid="reusable-test-editor" data-deferred={deferRender} readOnly={!editable} value={JSON.stringify(content)} onChange={e => onChange(JSON.parse(e.target.value))} />,
}));
const path = '/workspaces/ws-a/projects/project-a/reusable-content';
async function mount(role: string | null = 'author', workspaceAdmin = false, prepare?: (f: ReturnType<typeof reusableDouble>) => void) {
  const f = reusableDouble(role, workspaceAdmin);
  prepare?.(f);
  window.history.replaceState(null, '', path);
  const view = render(<App services={f.services} />);
  await screen.findByTestId('reusable-page');
  return { ...f, ...view, user: userEvent.setup() };
}
async function ready() { return screen.findByTestId('reusable-card-reuse-a'); }
async function choose(user: ReturnType<typeof userEvent.setup>, id: string, label: string) {
  await user.click(screen.getByTestId(id));
  await user.click(await screen.findByRole('option', { name: label }));
}

describe('Reusable management route and interactions', () => {
  it('renders real scoped data, searches/filters/selects, and reports reference tracking honestly', async () => {
    const { user } = await mount(); await ready();
    expect(screen.getByTestId('reusable-name')).toHaveTextContent('Product introduction');
    expect(screen.getByTestId('reusable-where-used')).toHaveTextContent(/Deletion remains unavailable|Permanent definition deletion remains unavailable/i);
    expect(screen.getByTestId('reusable-policy-note')).toHaveTextContent(/does not create notifications, snapshots, propagation history/i);
    expect(screen.queryByText(/used in \d+|affected documents|\d+ references/i)).not.toBeInTheDocument();
    await user.type(screen.getByTestId('reusable-search'), 'Shared');
    expect(screen.queryByTestId('reusable-card-reuse-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('reusable-name')).toHaveTextContent('Shared notice');
    await user.clear(screen.getByTestId('reusable-search'));
    await choose(user, 'reusable-filter-scope', 'Project');
    expect(screen.queryByTestId('reusable-card-reuse-shared')).not.toBeInTheDocument();
    await choose(user, 'reusable-filter-status', 'Approved');
    expect(screen.getByTestId('reusable-clear-filters')).toBeInTheDocument();
    await user.click(screen.getByTestId('reusable-clear-filters'));
    await user.click(screen.getByTestId('reusable-card-reuse-shared'));
    expect(screen.getByTestId('reusable-edit')).toBeDisabled();
  });
  it('creates project content, refreshes the library and selects the new item', async () => {
    const f = await mount(); await ready();
    const reads = vi.spyOn(f.services.reusable, 'list');
    await f.user.click(screen.getByTestId('reusable-new'));
    await f.user.type(screen.getByTestId('reusable-field-name'), 'Created library block');
    await f.user.click(screen.getByTestId('reusable-submit'));
    await waitFor(() => expect(screen.getByTestId('reusable-name')).toHaveTextContent('Created library block'));
    expect(reads).toHaveBeenCalled();
    expect(f.db.reusable_contents.at(-1)).toMatchObject({ project_id: 'project-a', scope: 'project', slug: 'created-library-block' });
  });
  it('edits metadata/settings, renames without changing slug and duplicates the saved body', async () => {
    const f = await mount(); await ready();
    await f.user.click(screen.getByTestId('reusable-edit'));
    await choose(f.user, 'reusable-field-status', 'In review');
    await choose(f.user, 'reusable-field-policy', 'Automatic');
    fireEvent.change(screen.getByTestId('reusable-field-settings'), { target: { value: '{"keep":{"nested":true}}' } });
    await f.user.click(screen.getByTestId('reusable-submit'));
    await waitFor(() => expect(screen.queryByTestId('reusable-dialog')).not.toBeInTheDocument());
    expect(f.db.reusable_contents[0]).toMatchObject({ status: 'in_review', update_policy: 'auto', settings: { keep: { nested: true } } });
    await f.user.click(screen.getByTestId('reusable-rename'));
    await f.user.clear(screen.getByTestId('reusable-field-name')); await f.user.type(screen.getByTestId('reusable-field-name'), 'Renamed block');
    await f.user.click(screen.getByTestId('reusable-submit'));
    await waitFor(() => expect(screen.getByTestId('reusable-name')).toHaveTextContent('Renamed block'));
    expect(f.db.reusable_contents[0].slug).toBe('product-introduction');
    await f.user.click(screen.getByTestId('reusable-duplicate'));
    await f.user.clear(screen.getByTestId('reusable-field-name')); await f.user.type(screen.getByTestId('reusable-field-name'), 'Duplicated block');
    await f.user.click(screen.getByTestId('reusable-submit'));
    await waitFor(() => expect(screen.getByTestId('reusable-name')).toHaveTextContent('Duplicated block'));
    const id = f.db.reusable_contents.at(-1)!.id;
    expect(f.db.reusable_content_drafts.find(d => d.reusable_content_id === id)?.content).toEqual(reusableBody);
  });
  it.each(['reviewer', 'viewer'])('keeps %s controls/body read-only', async role => {
    const f = await mount(role); await ready();
    for (const id of ['new', 'edit', 'rename', 'duplicate']) expect(screen.getByTestId(`reusable-${id}`)).toBeDisabled();
    await f.user.click(screen.getByTestId('reusable-body-open'));
    expect(await screen.findByTestId('reusable-test-editor')).toHaveAttribute('readonly');
    expect(screen.getByTestId('reusable-test-editor')).toHaveAttribute('data-deferred', 'true');
    expect(f.calls.some(c => c.patch || c.insert)).toBe(false);
  });
  it('lets an inherited workspace admin manage shared content but not project content', async () => {
    const f = await mount(null, true); await ready();
    expect(screen.getByTestId('reusable-edit')).toBeDisabled();
    await f.user.click(screen.getByTestId('reusable-card-reuse-shared'));
    expect(screen.getByTestId('reusable-edit')).toBeEnabled();
    await f.user.click(screen.getByTestId('reusable-new'));
    expect(screen.getByTestId('reusable-field-scope')).toHaveTextContent('Workspace');
    await f.user.click(screen.getByTestId('reusable-field-scope'));
    expect(screen.getByRole('option', { name: 'Project (this project only)' })).toHaveAttribute('aria-disabled', 'true');
  });
  it('rejects malformed settings without writing and retains fields on backend failure', async () => {
    const f = await mount(); await ready();
    await f.user.click(screen.getByTestId('reusable-edit'));
    fireEvent.change(screen.getByTestId('reusable-field-settings'), { target: { value: '["not an object"]' } });
    await f.user.click(screen.getByTestId('reusable-submit'));
    expect(screen.getByTestId('reusable-settings-error')).toBeInTheDocument();
    expect(f.calls.some(c => c.patch)).toBe(false);
    fireEvent.change(screen.getByTestId('reusable-field-settings'), { target: { value: '{"valid":true}' } });
    f.errors.set('write:reusable_contents', { code: '42501' });
    await f.user.click(screen.getByTestId('reusable-submit'));
    expect(await screen.findByTestId('reusable-mutation-error')).toBeInTheDocument();
    expect(screen.getByTestId('reusable-field-settings')).toHaveValue('{"valid":true}');
  });
  it('shows library/permissions errors without demo fixtures and allows retry', async () => {
    const f = await mount('author', false, f => f.errors.set('reusable_contents', { code: 'network' }));
    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
    expect(screen.queryByTestId('reusable-card-reuse-a')).not.toBeInTheDocument();
    expect(screen.queryByText('Safety notice')).not.toBeInTheDocument();
    f.errors.clear(); await f.user.click(screen.getByRole('button', { name: /try again|retry/i }));
    await ready();
  });
  it('shows an honest empty library and a non-destructive partial-copy warning', async () => {
    const f = await mount('author', false, f => { f.db.reusable_contents = []; });
    expect(await screen.findByTestId('reusable-empty-new')).toBeInTheDocument();
    f.unmount();
    const second = await mount(); await ready();
    second.errors.set('write:reusable_content_drafts', { code: '42501' });
    await second.user.click(screen.getByTestId('reusable-duplicate'));
    await second.user.click(screen.getByTestId('reusable-submit'));
    expect(await screen.findByTestId('reusable-warning')).toHaveTextContent(/body could not be copied/i);
    expect(second.db.reusable_contents).toHaveLength(3);
  });
  it('integrates structured draft autosave, conflict/reload/recovery and identity cleanup', async () => {
    const f = await mount(); await ready();
    await f.user.click(screen.getByTestId('reusable-body-open'));
    const editor = await screen.findByTestId('reusable-test-editor');
    expect(editor).toHaveAttribute('data-deferred', 'true');
    await waitFor(() => expect(editor).not.toHaveAttribute('readonly'));
    const body = { ...reusableBody, content: [{ ...reusableBody.content[0], content: [{ type: 'text', text: 'Unsaved UI draft' }] }] };
    f.db.reusable_content_drafts[0].revision = 3;
    fireEvent.change(editor, { target: { value: JSON.stringify(body) } });
    await waitFor(() => expect(screen.getByTestId('reusable-body-status')).toHaveTextContent('Conflict'), { timeout: 2500 });
    expect(reusableRecovery(context, 'reuse-a', true).read()).toHaveLength(1);
    await f.user.click(screen.getByTestId('reusable-body-reload'));
    expect(await screen.findByTestId('reusable-body-recovery')).toBeInTheDocument();
    await f.user.click(screen.getByTestId('reusable-body-recovery-restore'));
    await waitFor(() => expect(screen.getByTestId('reusable-body-status')).toHaveTextContent('Saved'), { timeout: 2500 });
    expect(f.db.reusable_content_drafts[0]).toMatchObject({ revision: 4, content: body });
    fireEvent.change(editor, { target: { value: JSON.stringify({ ...body, extra: 'unsaved before sign-out' }) } });
    expect(reusableRecovery(context, 'reuse-a', true).read()).toHaveLength(1);
    // Exercise deliberate user sign-out through the provider, not an ambiguous
    // null adapter event (which can also mean an expired refresh credential).
    await f.user.click(screen.getByTestId('button-account'));
    await f.user.click(await screen.findByTestId('button-sign-out'));
    await screen.findByTestId('input-email');
    expect(reusableRecovery(context, 'reuse-a', true).read()).toHaveLength(0);
  });
});
