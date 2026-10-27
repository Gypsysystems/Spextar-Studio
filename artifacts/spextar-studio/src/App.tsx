import { useMemo, type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ServicesProvider } from '@/providers/services-provider';
import { SessionProvider } from '@/providers/session-provider';
import { SessionGate } from '@/components/session-gate';
import { createRuntimeServices } from '@/services/runtime';
import type { Services } from '@/services/contracts';
import NotFound from '@/pages/not-found';
import SignInPage from '@/pages/sign-in';
import WorkspacesPage from '@/pages/workspaces';
import ProjectsPage from '@/pages/projects';
import ProjectHomePage from '@/pages/project-home';
import DocumentsPage from '@/pages/documents';
import { AuthorRoute } from '@/routes/author-route';
import VariablesConditionsPage from '@/pages/variables-conditions';
import { SectionPlaceholderPage } from '@/pages/section-placeholder';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const P = '/workspaces/:workspaceId/projects/:projectId';

function Router() {
  const [location] = useLocation();
  const routes = (
    <Switch>
      <Route path="/sign-in" component={SignInPage} />
      <Route><SessionGate><ApplicationRoutes /></SessionGate></Route>
    </Switch>
  );
  return <RoutedErrorBoundary key={location === '/sign-in' ? 'sign-in' : 'app'}>{routes}</RoutedErrorBoundary>;
}

function ApplicationRoutes() {
  return (
      <Switch>
        <Route path="/" component={WorkspacesPage} />
        <Route path="/workspaces" component={WorkspacesPage} />
        <Route path="/workspaces/:workspaceId/projects" component={ProjectsPage} />
        <Route path={P} component={ProjectHomePage} />
        <Route path={`${P}/documents`} component={DocumentsPage} />
        <Route path={`${P}/author`} component={AuthorRoute} />
        <Route path={`${P}/author/:documentId`} component={AuthorRoute} />
        <Route path={`${P}/review`}>{() => <SectionPlaceholderPage section="review" />}</Route>
        <Route path={`${P}/publish`}>{() => <SectionPlaceholderPage section="publish" />}</Route>
        <Route path={`${P}/reusable-content`}>{() => <SectionPlaceholderPage section="reusable-content" />}</Route>
        <Route path={`${P}/variables-conditions`} component={VariablesConditionsPage} />
        <Route path={`${P}/style-guide`}>{() => <SectionPlaceholderPage section="style-guide" />}</Route>
        <Route path={`${P}/history`}>{() => <SectionPlaceholderPage section="history" />}</Route>
        <Route path={`${P}/settings`}>{() => <SectionPlaceholderPage section="settings" />}</Route>
        <Route path={`${P}/brand-outputs`}>{() => <SectionPlaceholderPage section="brand-outputs" />}</Route>
        <Route component={NotFound} />
      </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App({ services }: { services?: Services } = {}) {
  const selected = useMemo(() => services ?? createRuntimeServices(), [services]);
  const scopeId = useMemo(() => ++nextScopeId, [selected]);
  return (
      <ServicesProvider services={selected}>
        <SessionProvider key={scopeId}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
        </SessionProvider>
      </ServicesProvider>
  );
}

export default App;

// Replacing an adapter instance also discards its auth state and local data cache.
let nextScopeId = 0;
