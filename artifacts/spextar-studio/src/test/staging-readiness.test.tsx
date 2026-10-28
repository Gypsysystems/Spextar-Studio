import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { ErrorBoundary } from '@/components/error-boundary';
import { safeReturnPath } from '@/lib/return-path';
import { resolveStudioMode } from '@/services/runtime';
import { createDemoServices } from '@/services/demo-adapter';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { ServiceError } from '@/services/contracts';
import { supabaseDouble } from './supabase-double';

const base = '/workspaces/ws-a/projects/project-a';
describe('Staging configuration and safe return links', () => {
  it.each([false, true])('requires explicit supported production mode without losing explicit demo parity (production=%s)', (production) => {
    expect(resolveStudioMode('demo', production)).toBe('demo');
    expect(resolveStudioMode('backend', production)).toBe('backend');
    if (production) expect(() => resolveStudioMode(undefined, true)).toThrow('Set VITE_STUDIO_MODE');
    else expect(resolveStudioMode(undefined, false)).toBe('demo');
  });
  it.each(['', 'Backend', 'test', null, false])('fails closed for unsupported mode %j', (mode) => {
    expect(() => resolveStudioMode(mode, true)).toThrow('Unsupported Studio mode');
  });
  it.each([
    'https://evil.example/workspaces', '//evil.example', '/\\evil.example',
    '/%2fevil.example', '/%5cevil.example', '/\n/evil.example', '/sign-in',
    '/a/../sign-in?returnTo=/sign-in', '/sign%2Din', '/%ZZ', 'javascript:alert(1)', null,
  ])('rejects unsafe/looping return path %j', (input) => expect(safeReturnPath(input)).toBe('/workspaces'));
  it('preserves same-app paths/query and drops fragments without permitting a new origin', () => {
    expect(safeReturnPath(base + '/review?topic=selected#discard')).toBe(base + '/review?topic=selected');
    expect(safeReturnPath('/workspaces')).toBe('/workspaces');
    expect(safeReturnPath('/')).toBe('/');
  });
});

describe('Staging authentication/navigation regression', () => {
  it('returns backend users to the requested protected deep link after real sign-in contract success', async () => {
    const fake = supabaseDouble(null);
    const services = createSupabaseServices(fake.client);
    window.history.replaceState(null, '', base + '/review');
    render(<App services={services} />);
    await screen.findByRole('heading', { name: 'Sign in to SPEXTAR' });
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(base + '/review');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('input-email'), 'writer@example.test');
    await user.type(screen.getByTestId('input-password'), 'test-only-password');
    await user.click(screen.getByTestId('button-sign-in'));
    expect(await screen.findByText('No documents in review')).toBeVisible();
    expect(window.location.pathname).toBe(base + '/review');
  });
  it('preserves deep links in isolated demo entry too', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    const requested = '/workspaces/product-docs/projects/meridian-x4-user-guide/variables-conditions';
    window.history.replaceState(null, '', requested);
    render(<App services={services} />);
    await userEvent.setup().click(await screen.findByTestId('button-enter-demo'));
    expect(await screen.findByRole('heading', { name: 'Variables & Conditions' })).toBeVisible();
    expect(window.location.pathname).toBe(requested);
  });
  it('discards malicious return links on the sign-in page without navigation outside Studio', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    window.history.replaceState(null, '', '/sign-in?returnTo=' + encodeURIComponent('//evil.example'));
    render(<App services={services} />);
    await userEvent.setup().click(await screen.findByTestId('button-enter-demo'));
    expect(await screen.findByTestId('card-workspace-product-docs')).toBeVisible();
    expect(window.location.pathname).toBe('/workspaces');
  });
  it('never carries a signed-out project return path into the next user login', async () => {
    const fake = supabaseDouble();
    const services = createSupabaseServices(fake.client);
    window.history.replaceState(null, '', base + '/review');
    render(<App services={services} />);
    await screen.findByText('No documents in review');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('button-account'));
    await user.click(screen.getByTestId('button-sign-out'));
    await screen.findByRole('heading', { name: 'Sign in to SPEXTAR' });
    expect(window.location.search).toBe('');
    expect(screen.queryByTestId('review-page')).not.toBeInTheDocument();
  });
  it('disables backend import in both header and empty-state affordances, with honest copy', async () => {
    const fake = supabaseDouble(); fake.db.projects = []; fake.db.project_members = [];
    const services = createSupabaseServices(fake.client);
    window.history.replaceState(null, '', '/workspaces/ws-a/projects');
    render(<App services={services} />);
    await screen.findByText('No projects in this workspace');
    expect(screen.getAllByRole('button', { name: 'Import project' })).toHaveLength(2);
    screen.getAllByRole('button', { name: 'Import project' }).forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByText(/Import is not available yet/)).toBeVisible();
    expect(fake.raw.rpc).not.toHaveBeenCalled();
  });
  it('keeps demo empty-state import available and clearly isolated', async () => {
    const services = createDemoServices({ latencyMs: 0 }); await services.auth.enterDemo();
    vi.spyOn(services.projects, 'listProjects').mockResolvedValue([]);
    window.history.replaceState(null, '', '/workspaces/product-docs/projects');
    render(<App services={services} />);
    await screen.findByText('No projects in this workspace');
    screen.getAllByRole('button', { name: 'Import project' }).forEach((button) => expect(button).toBeEnabled());
  });
  it('shows retryable route read errors rather than stale workspace content', async () => {
    const fake = supabaseDouble();
    const services = createSupabaseServices(fake.client);
    const read = services.workspaces.getWorkspace;
    const scoped = vi.spyOn(services.workspaces, 'getWorkspace').mockRejectedValue(new ServiceError('Scoped staging access failure', 'forbidden'));
    window.history.replaceState(null, '', base + '/review');
    render(<App services={services} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Scoped staging access failure');
    expect(screen.queryByTestId('review-page')).not.toBeInTheDocument();
    scoped.mockImplementation(read);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No documents in review')).toBeVisible();
    expect(fake.calls.filter((c) => c.insert || c.patch || c.deleted)).toHaveLength(0);
  });
});

describe('Shared exception fallback theme and recovery', () => {
  it('uses semantic theme tokens and a functioning retry after a caught rendering failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let broken = true;
    function Surface() { if (broken) throw new Error('Staging test failure'); return <p>Recovered route</p>; }
    try {
      render(<ErrorBoundary><Surface /></ErrorBoundary>);
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveClass('bg-background', 'text-foreground');
      broken = false;
      await userEvent.setup().click(within(alert).getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('Recovered route')).toBeVisible();
    } finally { log.mockRestore(); }
  });
});
