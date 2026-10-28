import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ServicesProvider } from '@/providers/services-provider';
import { SessionProvider, useStudioSession } from '@/providers/session-provider';
import { createDemoServices } from '@/services/demo-adapter';
import type { StudioSession } from '@/domain/types';
import { rememberRecovery, readRecovery } from '@/services/topic-draft-recovery';
import { emptyContent } from '@/domain/topic-content';

function Harness({ onClient }: { onClient: (client: QueryClient) => void }) {
  const session = useStudioSession();
  const client = useQueryClient();
  useEffect(() => onClient(client), [client, onClient]);
  return <>
    <output data-testid="session-state">{session.isLoading ? 'loading' : session.isError ? 'error' : session.data?.userId ?? 'signed-out'}</output>
    <button onClick={() => void session.signOut().catch(() => {})}>End session</button>
    <button disabled={session.isSigningOut} onClick={() => void session.enterDemo()}>Start demo</button>
  </>;
}

describe('session-scoped caches', () => {
  for (const next of ['same-user', 'different-user', 'explicit-sign-out'] as const) {
    it(`retains recovery after involuntary expiry but enforces ${next} cleanup`, async () => {
      const demoServices = createDemoServices({ latencyMs: 0 });
      const demoSession = await demoServices.auth.enterDemo();
      const backendSession: StudioSession = { ...demoSession, mode: 'backend', userId: 'writer-a' };
      const services = { ...demoServices, mode: 'backend' as const, auth: {
        ...demoServices.auth, getSession: async () => backendSession,
        signOut: async () => {},
      } };
      let notify!: (session: StudioSession | null) => void;
      services.auth.onSessionChange = listener => { notify = listener; return () => {}; };
      const clients: QueryClient[] = [];
      const onClient = (client: QueryClient) => { clients.push(client); };
      render(<ServicesProvider services={services}><SessionProvider><Harness onClient={onClient} /></SessionProvider></ServicesProvider>);
      await screen.findByText('writer-a');
      const scope = { userId: 'writer-a', projectId: 'project-a', documentId: 'doc-a', topicId: 'topic-a' };
      rememberRecovery(scope, emptyContent(), 3);
      const copies = readRecovery(scope);
      expect(copies).toHaveLength(1);
      const old = clients.at(-1)!;
      old.setQueryData(['private-data'], 'private');
      act(() => notify(null));
      await screen.findByText('signed-out');
      expect(old.getQueryCache().getAll()).toHaveLength(0);
      expect(clients.at(-1)).not.toBe(old);
      expect(readRecovery(scope)).toEqual(copies);
      if (next === 'explicit-sign-out') {
        await act(async () => screen.getByText('End session').click());
      } else {
        act(() => notify({ ...backendSession, userId: next === 'same-user' ? 'writer-a' : 'writer-b' }));
        await screen.findByText(next === 'same-user' ? 'writer-a' : 'writer-b');
      }
      expect(readRecovery(scope)).toEqual(next === 'same-user' ? copies : []);
    });
  }

  it('locks the UI immediately during slow sign-out and prevents an overlapping new session', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    await services.auth.enterDemo();
    let finish!: () => void;
    services.auth.signOut = () => new Promise<void>((resolve) => { finish = resolve; });
    const clients: QueryClient[] = [];
    const onClient = (client: QueryClient) => { clients.push(client); };
    render(<ServicesProvider services={services}><SessionProvider><Harness onClient={onClient} /></SessionProvider></ServicesProvider>);
    await screen.findByText('usr-demo-writer');
    const old = clients.at(-1)!;
    old.setQueryData(['private-data'], 'secret');
    act(() => screen.getByText('End session').click());
    await screen.findByText('signed-out');
    expect(screen.getByText('Start demo')).toBeDisabled();
    expect(old.getQueryCache().getAll()).toHaveLength(0);
    await act(async () => finish());
    expect(screen.getByText('Start demo')).not.toBeDisabled();
  });
  it('cancels old queries and clears query/mutation data on sign-out, including late results', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    await services.auth.enterDemo();
    let notify: ((session: StudioSession | null) => void) | undefined;
    services.auth.onSessionChange = (listener) => { notify = listener; return () => {}; };
    const clients: QueryClient[] = [];
    const onClient = (client: QueryClient) => { clients.push(client); };
    render(<ServicesProvider services={services}><SessionProvider><Harness onClient={onClient} /></SessionProvider></ServicesProvider>);
    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('usr-demo-writer'));
    const old = clients.at(-1)!;
    old.setQueryData(['documents', 'private-project'], [{ body: 'private' }]);
    old.getMutationCache().build(old, { mutationKey: ['private-mutation'] });
    let resolve!: (value: string) => void;
    const pending = old.fetchQuery({
      queryKey: ['late-private-response'],
      queryFn: () => new Promise<string>((done) => { resolve = done; }),
    }).catch(() => undefined);
    act(() => notify?.(null));
    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('signed-out'));
    const current = clients.at(-1)!;
    expect(current).not.toBe(old);
    expect(old.getQueryCache().getAll()).toHaveLength(0);
    expect(old.getMutationCache().getAll()).toHaveLength(0);
    resolve('old private result');
    await pending;
    expect(current.getQueryData(['documents', 'private-project'])).toBeUndefined();
    expect(current.getQueryData(['late-private-response'])).toBeUndefined();
  });
  it('replaces caches when auth changes user/organization and unsubscribes on unmount', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    const session = await services.auth.enterDemo();
    let notify!: (value: StudioSession | null) => void;
    const unsubscribe = vi.fn();
    services.auth.onSessionChange = (listener) => { notify = listener; return unsubscribe; };
    const clients: QueryClient[] = [];
    const onClient = (client: QueryClient) => { clients.push(client); };
    const view = render(<ServicesProvider services={services}><SessionProvider><Harness onClient={onClient} /></SessionProvider></ServicesProvider>);
    await screen.findByText('usr-demo-writer');
    const original = clients.at(-1)!;
    original.setQueryData(['organization'], { id: 'old-org' });
    act(() => notify({ ...session, userId: 'different-user', organizationId: 'different-org' }));
    await screen.findByText('different-user');
    expect(clients.at(-1)).not.toBe(original);
    expect(clients.at(-1)!.getQueryData(['organization'])).toBeUndefined();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('rejects foreign-mode sessions instead of rendering them', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    const demo = await services.auth.enterDemo();
    services.auth.getSession = async () => ({ ...demo, mode: 'backend' });
    render(<ServicesProvider services={services}><SessionProvider><Harness onClient={() => {}} /></SessionProvider></ServicesProvider>);
    await screen.findByText('error');
    expect(screen.queryByText('usr-demo-writer')).not.toBeInTheDocument();
  });
});
