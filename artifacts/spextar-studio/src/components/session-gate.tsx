import type { ReactNode } from 'react';
import { Redirect } from 'wouter';
import { useStudioSession } from '@/providers/session-provider';
import { ErrorState, PageSkeleton } from './states';

/** The same gate protects every mode; future backend adapters do not alter routes. */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useStudioSession();
  if (session.isLoading) return <PageSkeleton />;
  if (session.isError) return <div className="p-8"><ErrorState error={session.error} onRetry={() => void session.refetch()} /></div>;
  if (!session.data) return <Redirect to="/sign-in" replace />;
  return children;
}
