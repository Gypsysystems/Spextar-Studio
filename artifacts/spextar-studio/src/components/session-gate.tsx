import type { ReactNode } from 'react';
import { Redirect, useLocation, useSearch } from 'wouter';
import { safeReturnPath } from '@/lib/return-path';
import { useStudioSession } from '@/providers/session-provider';
import { ErrorState, PageSkeleton } from './states';

/** The same gate protects every mode; future backend adapters do not alter routes. */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useStudioSession();
  const [location] = useLocation();
  const search = useSearch();
  if (session.isLoading) return <PageSkeleton />;
  if (session.isError) return <div className="p-8"><ErrorState error={session.error} onRetry={() => void session.refetch()} /></div>;
  if (!session.data) {
    const destination = safeReturnPath(location + (search ? `?${search}` : ''));
    // Deliberate sign-out never carries one identity's project URL into the next login.
    const signIn = session.isSigningOut || location === '/' || location === '/workspaces'
      ? '/sign-in' : `/sign-in?returnTo=${encodeURIComponent(destination)}`;
    return <Redirect to={signIn} replace />;
  }
  return children;
}
