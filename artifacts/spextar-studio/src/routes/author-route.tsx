import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { ErrorBoundary, type ErrorFallbackProps } from '@/components/error-boundary';
import { PageSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { ProjectScope } from '@/features/project/project-scope';

class AuthorLoadError extends Error {}

function AuthorFrame({ children }: { children: ReactNode }) {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  return <ProjectScope workspaceId={workspaceId} projectId={projectId} title="Author" trail={[{ label: 'Author' }]}>
    {() => children}
  </ProjectScope>;
}

function AuthorLoadFallback({ error }: ErrorFallbackProps) {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  // Runtime errors still reach the existing routed error boundary. Only a
  // failed module download gets chunk-specific recovery instructions.
  if (!(error instanceof AuthorLoadError)) throw error;
  return <AuthorFrame>
    <div className="p-6" role="alert">
      <h1 className="text-xl font-semibold">Author could not be loaded</h1>
      <p className="mt-2 text-sm text-muted-foreground">Check your connection, then reload this page to download Author again.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => window.location.reload()}>Reload Author</Button>
        <Button variant="outline" asChild><Link href={`/workspaces/${workspaceId}/projects/${projectId}/documents`}>Back to Documents</Link></Button>
      </div>
    </div>
  </AuthorFrame>;
}

/** Stable lazy component per factory invocation; never recreated on render.
 * An injectable loader makes delayed/rejected downloads independently testable. */
export function createAuthorRoute(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(() => load().catch(() => { throw new AuthorLoadError('Author download failed.'); }));
  return function LazyAuthorRoute() {
    const [location] = useLocation();
    return <ErrorBoundary resetKey={location} FallbackComponent={AuthorLoadFallback}>
      <Suspense fallback={<AuthorFrame>
        <div role="status" aria-live="polite" aria-label="Loading Author" className="p-6">
          <p className="text-sm text-muted-foreground">Loading Author…</p>
          <PageSkeleton />
        </div>
      </AuthorFrame>}>
        <Page />
      </Suspense>
    </ErrorBoundary>;
  };
}

// This must stay behind SessionGate and must not be preloaded on hover/mount.
export const AuthorRoute = createAuthorRoute(() => import('@/pages/author'));
