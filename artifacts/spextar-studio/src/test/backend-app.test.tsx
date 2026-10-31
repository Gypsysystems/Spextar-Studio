import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '@/App';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble, testSession } from './supabase-double';

describe('connected backend application flows', () => {
  it.each(['admin', 'author', 'reviewer', 'viewer'])('gives %s accurate empty-project guidance without granting document creation', async role => {
    const fake = supabaseDouble(testSession);
    fake.db.project_members[0].role = role;
    window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a');
    render(<App services={createSupabaseServices(fake.client)} />);
    expect(await screen.findByText('This project has no documents')).toBeVisible();
    expect(screen.getByText(role === 'admin' || role === 'author' ? 'Create a document to begin its topic outline.' : 'A project admin or author can create documents.')).toBeVisible();
    expect(screen.queryByText(/Document creation arrives in a later phase/)).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /^Documents$/ })).toBeVisible();
    const create = screen.queryAllByRole('button', { name: /^Create document$/ });
    if (role === 'admin' || role === 'author') {
      expect(create.length).toBeGreaterThan(0);
      expect(create[0]).toBeEnabled();
    } else {
      for (const button of create) expect(button).toBeDisabled();
    }
    expect(fake.raw.rpc).not.toHaveBeenCalled();
  });

  it('protects backend deep links and keeps OAuth providers inactive', async () => {
    const fake = supabaseDouble(null);
    window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a');
    render(<App services={createSupabaseServices(fake.client)} />);
    expect(await screen.findByTestId('button-sign-in')).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('button-sign-in')).toBeEnabled());
    expect(screen.getByTestId('input-email')).toBeEnabled();
    expect(screen.getByTestId('input-password')).toBeEnabled();
    expect(screen.queryByTestId('button-microsoft')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-google')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-enter-demo')).not.toBeInTheDocument();
    expect(fake.raw.from).not.toHaveBeenCalled();
  });
  it('shows authentication errors without opening protected routes', async () => {
    const fake = supabaseDouble(null);
    fake.raw.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'invalid_credentials' } } as never);
    render(<App services={createSupabaseServices(fake.client)} />);
    await waitFor(() => expect(screen.getByTestId('button-sign-in')).toBeEnabled());
    await userEvent.type(screen.getByTestId('input-email'), 'writer@example.test');
    await userEvent.type(screen.getByTestId('input-password'), 'incorrect-password');
    await userEvent.click(screen.getByTestId('button-sign-in'));
    expect(await screen.findByTestId('auth-error')).toHaveTextContent('Email or password is incorrect');
    expect(screen.getByTestId('input-password')).toHaveValue('');
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  });
  it('signs in, displays live-adapter data, signs out and closes protected content', async () => {
    const fake = supabaseDouble(null);
    render(<App services={createSupabaseServices(fake.client)} />);
    await waitFor(() => expect(screen.getByTestId('button-sign-in')).toBeEnabled());
    await userEvent.type(screen.getByTestId('input-email'), 'writer@example.test');
    await userEvent.type(screen.getByTestId('input-password'), 'test-password-only');
    await userEvent.click(screen.getByTestId('button-sign-in'));
    expect(await screen.findByTestId('card-workspace-ws-a')).toBeVisible();
    expect(screen.queryByTestId('card-workspace-ws-b')).not.toBeInTheDocument();
    expect(screen.queryByText('Local', { exact: true })).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('button-account'));
    await userEvent.click(await screen.findByTestId('button-sign-out'));
    expect(await screen.findByTestId('button-sign-in')).toBeVisible();
    expect(screen.queryByTestId('card-workspace-ws-a')).not.toBeInTheDocument();
  });
  it('restores a session on reload and navigates workspace → project with preserved breadcrumbs', async () => {
    const fake = supabaseDouble(testSession);
    const services = createSupabaseServices(fake.client);
    const view = render(<App services={services} />);
    await userEvent.click(await screen.findByTestId('card-workspace-ws-a'));
    await userEvent.click(await screen.findByRole('link', { name: 'Project A' }));
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Workspace A');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Project A');
    expect(await screen.findByRole('heading', { name: 'Project A' })).toBeVisible();
    expect(screen.queryByTestId('scope-demo')).not.toBeInTheDocument();
    view.unmount();
    render(<App services={createSupabaseServices(fake.client)} />);
    expect(await screen.findByRole('heading', { name: 'Project Stats' })).toBeVisible();
    expect(screen.queryByTestId('button-sign-in')).not.toBeInTheDocument();
  });
  it('creates a workspace and project, then reloads them from the backend adapter', async () => {
    const fake = supabaseDouble();
    const services = createSupabaseServices(fake.client);
    const view = render(<App services={services} />);
    await userEvent.click(await screen.findByTestId('button-create-workspace'));
    await userEvent.type(await screen.findByTestId('input-workspace-name'), 'Persistence Workspace');
    await userEvent.click(screen.getByTestId('button-submit-workspace'));
    await userEvent.click(await screen.findByTestId('button-create-project'));
    await userEvent.type(await screen.findByTestId('input-project-name'), 'Persistence Project');
    expect(screen.queryByTestId('input-project-product')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('button-submit-create-project'));
    expect(await screen.findByRole('heading', { name: 'Project Stats' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Persistence Project');
    view.unmount();
    render(<App services={createSupabaseServices(fake.client)} />);
    expect(await screen.findByRole('heading', { name: 'Project Stats' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Persistence Workspace');
  });
  it('offers organization onboarding when the account has no memberships', async () => {
    const fake = supabaseDouble();
    fake.db.organization_members = [];
    render(<App services={createSupabaseServices(fake.client)} />);
    await userEvent.click(await screen.findByTestId('button-create-organization'));
    await userEvent.type(screen.getByLabelText('Name', { exact: true }), 'New Organization');
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));
    expect(await screen.findByTestId('text-org-name')).toHaveTextContent('New Organization');
    await waitFor(() => expect(screen.getByTestId('button-create-workspace')).toBeEnabled());
  });
});
