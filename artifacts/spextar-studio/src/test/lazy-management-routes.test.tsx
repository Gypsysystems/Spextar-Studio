import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { Link, Route, Router, Switch } from 'wouter';
import { createManagementRoute } from '@/routes/management-routes';
import { ServicesProvider } from '@/providers/services-provider';
import { SessionProvider } from '@/providers/session-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionGate } from '@/components/session-gate';
import { ErrorBoundary } from '@/components/error-boundary';
import { createDemoServices } from '@/services/demo-adapter';

const base = '/workspaces/product-docs/projects/meridian-x4-user-guide';
const projectRoute = '/workspaces/:workspaceId/projects/:projectId';
const pages = [
  ['Reusable Content', 'reusable-content'], ['Variables & Conditions', 'variables-conditions'],
  ['Project settings', 'settings'], ['Review', 'review'],
] as const;
function deferred() {
  let resolve!: (module: { default: ComponentType }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ default: ComponentType }>((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, load: vi.fn(() => promise) };
}
async function mount(title: string, slug: string, load: () => Promise<{ default: ComponentType }>, authenticated = true, atPage = true) {
  const services = createDemoServices({ latencyMs: 0 });
  if (authenticated) await services.auth.enterDemo();
  const Page = createManagementRoute(title, load);
  window.history.replaceState(null, '', `${base}/${atPage ? slug : 'documents'}`);
  render(<ServicesProvider services={services}><SessionProvider><TooltipProvider><Router>
    <ErrorBoundary FallbackComponent={() => <p>Existing runtime error boundary</p>}>
      <Switch>
        <Route path="/sign-in"><p>Sign-in destination</p></Route>
        <Route><SessionGate><Switch>
          <Route path={`${projectRoute}/${slug}`} component={Page} />
          <Route><p>Documents destination</p><Link href={`${base}/${slug}`}>Open management</Link></Route>
        </Switch></SessionGate></Route>
      </Switch>
    </ErrorBoundary>
  </Router></TooltipProvider></SessionProvider></ServicesProvider>);
  return userEvent.setup();
}
describe.each(pages)('%s lazy boundary', (title, slug) => {
  it('does not download on another route', async () => {
    const pending = deferred();
    await mount(title, slug, pending.load, true, false);
    await screen.findByText('Documents destination');
    expect(pending.load).not.toHaveBeenCalled();
  });
  it('does not download a protected deep link before sign-in', async () => {
    const pending = deferred();
    await mount(title, slug, pending.load, false);
    await screen.findByText('Sign-in destination');
    expect(pending.load).not.toHaveBeenCalled();
  });
  it('shows a scoped accessible loading shell and resolves a direct link', async () => {
    const pending = deferred();
    await mount(title, slug, pending.load);
    await screen.findByRole('status', { name: `Loading ${title}` });
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(title);
    expect(pending.load).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ default: () => <p>Loaded management</p> }));
    await screen.findByText('Loaded management');
    expect(screen.queryByRole('status', { name: `Loading ${title}` })).toBeNull();
  });
  it('allows leaving a pending download and reuses one loader on return', async () => {
    const pending = deferred();
    const user = await mount(title, slug, pending.load);
    await screen.findByRole('status', { name: `Loading ${title}` });
    await user.click(screen.getByTestId('nav-home'));
    await screen.findByText('Documents destination');
    await act(async () => pending.resolve({ default: () => <p>Loaded management</p> }));
    expect(screen.queryByText('Loaded management')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Open management' }));
    await screen.findByText('Loaded management');
    expect(pending.load).toHaveBeenCalledTimes(1);
  });
  it('offers explicit reload and safe navigation after a failed download', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = deferred();
    const user = await mount(title, slug, pending.load);
    await screen.findByRole('status', { name: `Loading ${title}` });
    await act(async () => pending.reject(new Error('Controlled missing chunk')));
    await screen.findByRole('heading', { name: `${title} could not be loaded` });
    expect(screen.getByRole('button', { name: `Reload ${title}` })).toBeEnabled();
    expect(pending.load).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('link', { name: 'Back to Documents' }));
    await screen.findByText('Documents destination');
  });
  it('keeps runtime errors distinct from download errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = deferred();
    await mount(title, slug, pending.load);
    await screen.findByRole('status', { name: `Loading ${title}` });
    await act(async () => pending.resolve({ default: () => { throw new Error('Runtime failure'); } }));
    await screen.findByText('Existing runtime error boundary');
    expect(screen.queryByText(`${title} could not be loaded`)).toBeNull();
  });
  it('cannot mount a resolved page after sign-out during a download', async () => {
    const pending = deferred();
    const user = await mount(title, slug, pending.load);
    await screen.findByRole('status', { name: `Loading ${title}` });
    await user.click(screen.getByTestId('button-account'));
    await user.click(await screen.findByTestId('button-sign-out'));
    await screen.findByText('Sign-in destination');
    await act(async () => pending.resolve({ default: () => <p>Loaded management</p> }));
    await waitFor(() => expect(screen.queryByText('Loaded management')).toBeNull());
  });
});
