import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import App from '@/App';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble, testUser } from './supabase-double';
import { ServiceError } from '@/services/contracts';

const path = '/workspaces/ws-a/projects/project-a/settings';
async function mount(role: string | null = 'admin', prepare?: (f: ReturnType<typeof supabaseDouble>) => void) {
  const f = supabaseDouble();
  f.db.project_members = role ? [{ project_id: 'project-a', user_id: testUser.id, role }] : [];
  f.db.workspace_members.push({ workspace_id: 'ws-a', user_id: 'existing-user', role: 'member' });
  prepare?.(f);
  const services = createSupabaseServices(f.client);
  window.history.replaceState(null, '', path);
  const view = render(<App services={services} />);
  await screen.findByTestId('input-name');
  await waitFor(() => expect(screen.getByTestId('input-name')).toHaveValue('Project A'));
  return { ...f, services, ...view, user: userEvent.setup() };
}
async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId('button-confirm'));
  await waitFor(() => expect(screen.queryByTestId('dialog-confirm')).not.toBeInTheDocument());
}
describe('Project Settings route', () => {
  it('renders existing shell, real metadata and readable members without invitations', async () => {
    await mount();
    expect(screen.getByTestId('project-settings-page')).toBeVisible();
    expect(screen.queryByTestId('input-slug')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId(`text-member-id-${testUser.id}`)).toHaveTextContent('Technical Writer'));
    expect(screen.getByTestId(`text-member-id-${testUser.id}`)).not.toHaveTextContent(testUser.id);
    expect(screen.queryByRole('button', { name: /invite/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete project permanently' })).toBeDisabled();
    expect(screen.getByTestId(`button-remove-${testUser.id}`)).toBeDisabled();
    expect(screen.getByTestId('button-save-details')).toBeDisabled();
  });
  it('validates details, saves server metadata and updates breadcrumbs without route change', async () => {
    const f = await mount();
    await f.user.clear(screen.getByTestId('input-name')); await f.user.type(screen.getByTestId('input-name'), 'X');
    await f.user.click(screen.getByTestId('button-save-details'));
    expect(await screen.findByTestId('error-name')).toHaveTextContent('2–160');
    await f.user.clear(screen.getByTestId('input-name')); await f.user.type(screen.getByTestId('input-name'), 'Updated project');
    await f.user.click(screen.getByTestId('button-save-details'));
    await waitFor(() => expect(screen.getByTestId('status-success')).toHaveTextContent('Project details saved'));
    expect(f.db.projects[0]).toMatchObject({ name: 'Updated project', slug: 'pa' });
    await waitFor(() => expect(screen.getByTestId('button-save-details')).toBeDisabled());
    expect(window.location.pathname).toBe(path);
    expect(screen.getAllByText('Updated project').length).toBeGreaterThan(0);
  });
  it.each(['author', 'reviewer', 'viewer', null])('renders %s as read-only despite inherited workspace admin', async role => {
    const f = await mount(role);
    expect(screen.getByTestId('text-readonly')).toBeVisible();
    expect(screen.getByTestId('input-name')).toBeDisabled();
    expect(screen.queryByTestId('button-save-details')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-archive')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-add-member')).not.toBeInTheDocument();
    expect(screen.queryByTestId(`select-role-${testUser.id}`)).not.toBeInTheDocument();
    expect(f.calls.some(c => c.insert || c.patch || c.deleted)).toBe(false);
  });
  it('adds existing workspace member, confirms role change and confirms removal', async () => {
    const f = await mount();
    await f.user.selectOptions(screen.getByTestId('select-add-user'), 'existing-user');
    await f.user.selectOptions(screen.getByTestId('select-add-role'), 'reviewer');
    await f.user.click(screen.getByTestId('button-add-member'));
    await screen.findByTestId('row-member-existing-user');
    expect(screen.getByTestId('text-no-candidates')).toBeVisible();
    await f.user.selectOptions(screen.getByTestId('select-role-existing-user'), 'author');
    await f.user.click(screen.getByTestId('button-save-role-existing-user'));
    expect(f.db.project_members[1].role).toBe('reviewer');
    await confirm(f.user);
    await waitFor(() => expect(f.db.project_members[1].role).toBe('author'));
    await waitFor(() => expect(screen.getByTestId('button-save-role-existing-user')).toBeDisabled());
    await f.user.click(screen.getByTestId('button-remove-existing-user'));
    expect(f.db.project_members).toHaveLength(2);
    expect(screen.getByTestId('dialog-confirm')).toHaveClass('z-[51]');
    await f.user.click(screen.getByTestId('button-confirm-cancel'));
    expect(f.db.project_members).toHaveLength(2);
    await f.user.click(screen.getByTestId('button-remove-existing-user')); await confirm(f.user);
    await waitFor(() => expect(screen.queryByTestId('row-member-existing-user')).not.toBeInTheDocument());
    expect(f.db.project_members).toHaveLength(1);
  });
  it('archives and restores only after confirmation; unsaved detail edits block status changes', async () => {
    const f = await mount();
    await f.user.type(screen.getByTestId('input-description'), 'Unsaved');
    expect(screen.getByTestId('button-archive')).toBeDisabled();
    await f.user.click(screen.getByTestId('button-reset-details'));
    await f.user.click(screen.getByTestId('button-archive')); expect(f.db.projects[0].status).toBe('active');
    await confirm(f.user);
    await screen.findByTestId('button-restore');
    expect(f.db.projects[0].status).toBe('archived');
    await waitFor(() => expect(screen.getByTestId('button-restore')).toBeEnabled());
    await f.user.click(screen.getByTestId('button-restore')); await confirm(f.user);
    await screen.findByTestId('button-archive');
    expect(f.db.projects[0].status).toBe('active');
    expect(f.raw.rpc).not.toHaveBeenCalled();
  });
  it('keeps typed details on failure and permits explicit retry without duplicate automatic writes', async () => {
    const f = await mount();
    const save = vi.spyOn(f.services.projectSettings, 'update').mockRejectedValueOnce(new ServiceError('Connection unavailable. Retry.', 'network'));
    await f.user.clear(screen.getByTestId('input-name')); await f.user.type(screen.getByTestId('input-name'), 'Retry name');
    await f.user.click(screen.getByTestId('button-save-details'));
    expect(await screen.findByTestId('alert-error')).toHaveTextContent('Connection unavailable');
    expect(screen.getByTestId('input-name')).toHaveValue('Retry name');
    expect(save).toHaveBeenCalledTimes(1);
    await f.user.click(screen.getByTestId('button-save-details'));
    await waitFor(() => expect(f.db.projects[0].name).toBe('Retry name'));
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('does not adopt a newer revision on background refetch while local details are dirty', async () => {
    const f = await mount();
    await f.user.clear(screen.getByTestId('input-name')); await f.user.type(screen.getByTestId('input-name'), 'Local edits');
    f.db.projects[0].name = 'Other session'; f.db.projects[0].updated_at = '2026-12-01T00:00:00Z';
    await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    // Even if a background refresh delivers a new snapshot, the edit's original revision must be used.
    await f.user.click(screen.getByTestId('button-save-details'));
    expect(await screen.findByTestId('alert-error')).toHaveTextContent(/changed/i);
    expect(f.db.projects[0].name).toBe('Other session');
    expect(screen.getByTestId('input-name')).toHaveValue('Local edits');
    await f.user.click(screen.getByTestId('button-conflict-reload'));
    await confirm(f.user);
    await waitFor(() => expect(screen.getByTestId('input-name')).toHaveValue('Other session'));
  });
  it('shows data failure with retry and does not make unauthorized writes', async () => {
    const f = await mount();
    f.errors.set('write:projects', { code: '42501' });
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Denied' } });
    await f.user.click(screen.getByTestId('button-save-details'));
    expect(await screen.findByTestId('alert-error')).toHaveTextContent(/permission/i);
    expect(f.db.projects[0].name).toBe('Project A');
  });
});
