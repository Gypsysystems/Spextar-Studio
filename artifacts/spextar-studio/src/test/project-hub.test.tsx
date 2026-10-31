import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble } from './supabase-double';
import { reviewFixture } from './review-fixtures';

const base = '/workspaces/ws-a/projects/project-a';
async function mount(path = base, role = 'admin') {
  const f = supabaseDouble();
  f.db.project_members[0].role = role;
  f.db.documents = ['draft', 'in_review', 'approved', 'published'].map((status, i) => ({ id: `doc-${i}`, project_id: 'project-a', title: `Document ${i}`, slug: `doc-${i}`, status, description: null, settings: {}, created_by: 'user-a', created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z' }));
  const services = createSupabaseServices(f.client);
  vi.spyOn(services.reviews!, 'latest').mockResolvedValue({ ...reviewFixture(), document_id: 'doc-0', status: 'changes_requested' });
  window.history.replaceState(null, '', path);
  render(<App services={services} />);
  await screen.findByRole('heading', { name: 'Project Stats' });
  return { ...f, services, user: userEvent.setup() };
}
describe('Project document hub', () => {
  it('lists every document, filters in place, searches, sorts and opens directly', async () => {
    const f = await mount();
    const list = screen.getByRole('region', { name: 'Project documents' });
    await within(list).findByText('Changes Recommended');
    expect(within(list).getAllByTestId(/^row-document-/)).toHaveLength(4);
    expect(screen.queryByText('Project facts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-author')).not.toBeInTheDocument();
    for (const [label, id] of [['In Progress', '0'], ['In Review', '1'], ['Reviewed', '2'], ['Published', '3'], ['All', 'all']]) {
      await f.user.click(screen.getByRole('combobox', { name: 'Filter by status' }));
      await f.user.click(screen.getByRole('option', { name: label }));
      expect(within(list).getAllByTestId(/^row-document-/)).toHaveLength(id === 'all' ? 4 : 1);
      if (id !== 'all') expect(within(list).getByTestId(`row-document-doc-${id}`)).toBeVisible();
      expect(window.location.pathname).toBe(base);
    }
    await f.user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'Document 2');
    expect(within(list).getAllByTestId(/^row-document-/)).toHaveLength(1);
    expect(within(list).getByRole('link', { name: 'Document 2' })).toHaveAttribute('href', base + '/author/doc-2');
  });
  it.each(['documents', 'author', 'review', 'publish'])('adapts legacy %s list links', async route => {
    await mount(base + '/' + route);
    await waitFor(() => expect(window.location.pathname).toBe(base));
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeVisible();
  });
  it('renames inline with Enter, preserves slug, refreshes title and cancels with Escape', async () => {
    const f = await mount();
    await f.user.click(screen.getByRole('button', { name: 'Edit project name' }));
    const input = await screen.findByRole('textbox', { name: 'Project name' });
    await f.user.clear(input); await f.user.type(input, 'Renamed project{Enter}');
    await screen.findByText('Project name saved.');
    expect(f.db.projects[0]).toMatchObject({ name: 'Renamed project', slug: 'pa' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Renamed project');
    await f.user.click(screen.getByRole('button', { name: 'Edit project name' }));
    await f.user.type(await screen.findByRole('textbox', { name: 'Project name' }), 'discard{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Project name' })).not.toBeInTheDocument();
    expect(f.db.projects[0].name).toBe('Renamed project');
  });
  it('retains edits and reports a failed rename without a reload', async () => {
    const f = await mount();
    vi.spyOn(f.services.projectSettings, 'update').mockRejectedValueOnce(new Error('Save conflict. Cancel and reopen to load current details.'));
    await f.user.click(screen.getByRole('button', { name: 'Edit project name' }));
    const input = await screen.findByRole('textbox', { name: 'Project name' });
    await f.user.clear(input); await f.user.type(input, 'My edit{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Save conflict');
    expect(input).toHaveValue('My edit');
    expect(f.db.projects[0].name).toBe('Project A');
  });
  it.each(['author', 'reviewer', 'viewer'])('keeps %s project administration unavailable', async role => {
    await mount(base, role);
    expect(screen.queryByRole('button', { name: 'Edit project name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    if (role !== 'author') expect(screen.queryByRole('button', { name: 'Create document' })).not.toBeInTheDocument();
  });
});
