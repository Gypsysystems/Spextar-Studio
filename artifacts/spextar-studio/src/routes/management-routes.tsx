import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { ErrorBoundary, type ErrorFallbackProps } from '@/components/error-boundary';
import { PageSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { ProjectScope } from '@/features/project/project-scope';

class ManagementLoadError extends Error {}

/** Match Author's explicit download recovery without resetting cached failed imports. */
export function createManagementRoute(title: string, load: () => Promise<{ default: ComponentType }>) {
  function Frame({ children }: { children: ReactNode }) {
    const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
    return <ProjectScope workspaceId={workspaceId} projectId={projectId} title={title} trail={[{ label: title }]}>
      {() => children}
    </ProjectScope>;
  }
  function DownloadFallback({ error }: ErrorFallbackProps) {
    const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
    if (!(error instanceof ManagementLoadError)) throw error;
    return <Frame><div className="p-6" role="alert">
      <h1 className="text-xl font-semibold">{title} could not be loaded</h1>
      <p className="mt-2 text-sm text-muted-foreground">Check your connection, then reload this page to download {title} again.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => window.location.reload()}>Reload {title}</Button>
        <Button variant="outline" asChild><Link href={`/workspaces/${workspaceId}/projects/${projectId}/documents`}>Back to Documents</Link></Button>
      </div>
    </div></Frame>;
  }
  const Page = lazy(() => load().catch(() => { throw new ManagementLoadError(`${title} download failed.`); }));
  return function LazyManagementRoute() {
    const [location] = useLocation();
    return <ErrorBoundary resetKey={location} FallbackComponent={DownloadFallback}>
      <Suspense fallback={<Frame>
        <div role="status" aria-live="polite" aria-label={`Loading ${title}`} className="p-6">
          <p className="text-sm text-muted-foreground">Loading {title}…</p>
          <PageSkeleton />
        </div>
      </Frame>}>
        <Page />
      </Suspense>
    </ErrorBoundary>;
  };
}

// Keep loaders stable, session-protected and navigation-only: no hover or mount prefetch.
export const ReusableContentRoute = createManagementRoute('Reusable Content', () => import('@/pages/reusable-content'));
export const VariablesConditionsRoute = createManagementRoute('Variables & Conditions', () => import('@/pages/variables-conditions'));
export const ProjectSettingsRoute = createManagementRoute('Project settings', () => import('@/pages/project-settings'));
export const ReviewRoute = createManagementRoute('Review', () => import('@/pages/review'));
