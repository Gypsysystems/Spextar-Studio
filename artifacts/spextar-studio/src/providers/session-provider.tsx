import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StudioSession } from '@/domain/types';
import { ServiceError } from '@/services/contracts';
import { useServices } from './services-provider';
import { clearIdentityRecovery } from '@/services/topic-draft-recovery';
import { clearReusableIdentityRecovery } from '@/services/reusable-recovery';
import { disposeTopicDrafts } from '@/features/content/topic-draft-registry';

interface SessionState {
  data: StudioSession | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  revision: number;
}
interface SessionContextValue extends SessionState {
  isSigningOut: boolean;
  refetch: () => Promise<void>;
  enterDemo: () => Promise<StudioSession>;
  signIn: (email: string, password: string) => Promise<StudioSession>;
  signOut: () => Promise<void>;
}
const SessionContext = createContext<SessionContextValue | null>(null);

/** Auth state lives outside the data cache; identity transitions replace that cache. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const services = useServices();
  const request = useRef(0);
  const ending = useRef(false);
  const acceptedIdentity = useRef<StudioSession | null>(null);
  const dataCache = useRef<QueryClient | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [state, setState] = useState<SessionState>({
    data: null, isLoading: true, isError: false, error: null, revision: 0,
  });
  const accept = useCallback((session: StudioSession | null) => {
    if (session && session.mode !== services.mode) {
      throw new ServiceError('Session does not match the application mode.', 'unauthorized');
    }
    const previous = acceptedIdentity.current;
    if (previous?.mode === 'backend' && (session?.mode !== 'backend' || session.userId !== previous.userId)) {
      if (dataCache.current) disposeTopicDrafts(dataCache.current);
      clearIdentityRecovery(previous.userId);
      clearReusableIdentityRecovery(previous.userId);
    }
    acceptedIdentity.current = session;
    setState((old) => ({
      data: session, isLoading: false, isError: false, error: null,
      revision: old.data?.mode === session?.mode && old.data?.userId === session?.userId
        && old.data?.organizationId === session?.organizationId && old.data?.role === session?.role ? old.revision : old.revision + 1,
    }));
  }, [services]);
  const refetch = useCallback(async () => {
    if (ending.current) return;
    const id = ++request.current;
    setState((old) => ({ ...old, data: null, isLoading: true, isError: false, error: null }));
    try {
      const session = await services.auth.getSession();
      if (request.current === id) accept(session);
    } catch (error) {
      if (request.current === id) setState((old) => ({
        ...old, data: null, isLoading: false, isError: true,
        error: error instanceof Error ? error : new Error('Could not restore session'),
        revision: old.revision + 1,
      }));
    }
  }, [services, accept]);
  useEffect(() => {
    void refetch();
    const unsubscribe = services.auth.onSessionChange?.((session) => {
      if (ending.current && session) return;
      ++request.current;
      try { accept(session); } catch {
        accept(null);
      }
    });
    return () => { ++request.current; unsubscribe?.(); };
  }, [services, refetch, accept]);

  const enterDemo = useCallback(async () => {
    if (ending.current) throw new ServiceError('Sign-out is still in progress.', 'unauthorized');
    if (services.mode !== 'demo') throw new ServiceError('Demo access is disabled in backend mode.', 'unauthorized');
    const id = ++request.current;
    const session = await services.auth.enterDemo();
    if (request.current !== id) throw new ServiceError('Session request was superseded.', 'unauthorized');
    accept(session);
    return session;
  }, [services, accept]);
  const signOut = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    setIsSigningOut(true);
    ++request.current;
    // Close access immediately, even if the remote adapter is slow or fails.
    accept(null);
    try {
      await services.auth.signOut();
    } finally {
      ending.current = false;
      setIsSigningOut(false);
    }
  }, [services, accept]);
  const signIn = useCallback(async (email: string, password: string) => {
    if (ending.current || services.mode !== 'backend' || !services.auth.signInWithPassword) {
      throw new ServiceError('Email/password sign-in is unavailable in this mode.', 'unauthorized');
    }
    const id = ++request.current;
    const session = await services.auth.signInWithPassword(email, password);
    if (id !== request.current || ending.current) throw new ServiceError('Sign-in was superseded. Please try again.', 'unauthorized');
    accept(session);
    return session;
  }, [services, accept]);
  return (
    <SessionContext.Provider value={{ ...state, isSigningOut, refetch, enterDemo, signIn, signOut }}>
      <ScopedDataCache key={`${services.mode}:${state.revision}`} clientRef={dataCache}>{children}</ScopedDataCache>
    </SessionContext.Provider>
  );
}

function ScopedDataCache({ children, clientRef }: { children: ReactNode; clientRef: { current: QueryClient | null } }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: {
      retry: (count, error) => count < 1 && (!(error instanceof ServiceError) || error.code === 'network'),
      refetchOnWindowFocus: true, staleTime: 15_000,
    } },
  }));
  clientRef.current = client;
  useEffect(() => () => {
    disposeTopicDrafts(client);
    if (clientRef.current === client) clientRef.current = null;
    void client.cancelQueries();
    client.clear(); // Includes mutation cache. Old requests cannot populate the new client.
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function useStudioSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useStudioSession must be used inside SessionProvider');
  return value;
}
