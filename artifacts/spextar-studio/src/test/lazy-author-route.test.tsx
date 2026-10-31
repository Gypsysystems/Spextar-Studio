import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { Link, Route, Router, Switch } from 'wouter';
import { createAuthorRoute } from '@/routes/author-route';
import { ServicesProvider } from '@/providers/services-provider';
import { SessionProvider } from '@/providers/session-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionGate } from '@/components/session-gate';
import { ErrorBoundary } from '@/components/error-boundary';
import { createDemoServices } from '@/services/demo-adapter';

const base = '/workspaces/product-docs/projects/meridian-x4-user-guide';
const projectRoute = '/workspaces/:workspaceId/projects/:projectId';
function deferred() {
  let resolve!: (module: { default: ComponentType }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ default: ComponentType }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject, load: vi.fn(() => promise) };
}
async function mount(load: () => Promise<{ default: ComponentType }>, path = `${base}/author/mx4-getting-started`, authenticated = true) {
  const services = createDemoServices({ latencyMs: 0 });
  if (authenticated) await services.auth.enterDemo();
  const Author = createAuthorRoute(load);
  window.history.replaceState(null, '', path);
  render(<ServicesProvider services={services}><SessionProvider><TooltipProvider><Router>
    <ErrorBoundary FallbackComponent={() => <p>Existing runtime error boundary</p>}>
      <Switch>
        <Route path="/sign-in"><p>Sign-in destination</p></Route>
        <Route><SessionGate><Switch>
          <Route path={`${projectRoute}/author`} component={Author} />
          <Route path={`${projectRoute}/author/:documentId`} component={Author} />
          <Route><p>Documents destination</p><Link href={`${base}/author`}>Open Author</Link></Route>
        </Switch></SessionGate></Route>
      </Switch>
    </ErrorBoundary>
  </Router></TooltipProvider></SessionProvider></ServicesProvider>);
  return { services, user: userEvent.setup() };
}
describe('lazy Author route boundary', () => {
  it('does not invoke the Author loader on another route', async () => {
    const { load } = deferred();
    await mount(load, `${base}/documents`);
    await screen.findByText('Documents destination');
    expect(load).not.toHaveBeenCalled();
  });
  it('does not download Author before the session gate allows access', async () => {
    const { load } = deferred();
    await mount(load, `${base}/author`, false);
    await screen.findByText('Sign-in destination');
    expect(load).not.toHaveBeenCalled();
  });
  it.each([`${base}/author`, `${base}/author/mx4-getting-started`])('loads direct route %s with an accessible shell fallback', async (path) => {
    const pending = deferred();
    await mount(pending.load, path);
    await screen.findByRole('status', { name: 'Loading Author' });
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(pending.load).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ default: () => <p>Loaded Author</p> }));
    await screen.findByText('Loaded Author');
    expect(screen.queryByRole('status', { name: 'Loading Author' })).toBeNull();
  });
  it('allows leaving a pending route and reuses one loader when returning', async () => {
    const pending = deferred();
    const { user } = await mount(pending.load);
    await screen.findByRole('status', { name: 'Loading Author' });
    await user.click(screen.getByTestId('nav-home'));
    await screen.findByText('Documents destination');
    await act(async () => pending.resolve({ default: () => <p>Loaded Author</p> }));
    expect(screen.queryByText('Loaded Author')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Open Author' }));
    await screen.findByText('Loaded Author');
    expect(pending.load).toHaveBeenCalledTimes(1);
  });
  it('shows explicit reload and safe navigation on chunk download failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = deferred();
    const { user } = await mount(pending.load);
    await screen.findByRole('status', { name: 'Loading Author' });
    await act(async () => pending.reject(new Error('Controlled failed import')));
    await screen.findByRole('heading', { name: 'Author could not be loaded' });
    expect(screen.getByRole('button', { name: 'Reload Author' })).toBeEnabled();
    expect(screen.queryByText(/Controlled failed import/)).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Back to Documents' }));
    await screen.findByText('Documents destination');
  });
  it('does not disguise runtime errors as a chunk download failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = deferred();
    await mount(pending.load);
    await screen.findByRole('status', { name: 'Loading Author' });
    await act(async () => pending.resolve({ default: () => { throw new Error('Runtime failure'); } }));
    await screen.findByText('Existing runtime error boundary');
    expect(screen.queryByText('Author could not be loaded')).toBeNull();
  });
  it('cannot mount a resolved editor after sign-out while the download is pending', async () => {
    const pending = deferred();
    const { user } = await mount(pending.load);
    await screen.findByRole('status', { name: 'Loading Author' });
    await user.click(screen.getByTestId('button-account'));
    await user.click(await screen.findByTestId('button-sign-out'));
    await screen.findByText('Sign-in destination');
    await act(async () => pending.resolve({ default: () => <p>Loaded Author</p> }));
    await waitFor(() => expect(screen.queryByText('Loaded Author')).toBeNull());
  });
});
