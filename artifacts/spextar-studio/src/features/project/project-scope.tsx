import type { ReactNode } from 'react';
import { AppShell, type Crumb } from '@/components/shell/app-shell';
import { ErrorState, NotFoundPanel, PageSkeleton } from '@/components/states';
import { useProject, useWorkspace, usePageTitle } from '@/hooks/use-studio-data';
import type { ProjectSummary, Workspace } from '@/domain/types';
import { projectBase } from './sections';

export interface ProjectScopeValue {
  workspace: Workspace;
  project: ProjectSummary;
  base: string;
}

/**
 * Resolves :workspaceId and :projectId, then renders the global project shell.
 * Handles loading, error-with-retry and not-found for both levels.
 */
export function ProjectScope({
  workspaceId,
  projectId,
  trail = [],
  title,
  children,
}: {
  workspaceId: string;
  projectId: string;
  trail?: Crumb[];
  title: string;
  children: (scope: ProjectScopeValue) => ReactNode;
}) {
  const ws = useWorkspace(workspaceId);
  const pr = useProject(workspaceId, projectId);
  const workspace = ws.data;
  const project = pr.data;
  usePageTitle(project ? `${title} · ${project.name}` : title);

  const crumbs: Crumb[] = [{ label: 'Workspaces', href: '/workspaces' }];
  if (workspace) crumbs.push({ label: workspace.name, href: `/workspaces/${workspace.id}/projects` });
  if (workspace && project) crumbs.push({ label: project.name, href: projectBase(workspace.id, project.id) });
  crumbs.push(...trail);

  const ctx = {
    workspaceId: workspace?.id,
    workspaceName: workspace?.name,
    project: project ? { id: project.id, name: project.name, key: project.key } : undefined,
  };

  let body: ReactNode;
  if (ws.isLoading || pr.isLoading) body = <PageSkeleton />;
  else if (ws.isError || pr.isError)
    body = (
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <ErrorState
          error={ws.error ?? pr.error}
          onRetry={() => {
            ws.refetch();
            pr.refetch();
          }}
        />
      </div>
    );
  else if (!workspace) body = <NotFoundPanel what="Workspace" />;
  else if (!project)
    body = (
      <NotFoundPanel
        what="Project"
        detail={`No project with this address exists in ${workspace.name}.`}
        backHref={`/workspaces/${workspace.id}/projects`}
        backLabel="Back to Projects"
      />
    );
  else body = children({ workspace, project, base: projectBase(workspace.id, project.id) });

  return (
    <AppShell ctx={ctx} crumbs={workspace && project ? crumbs : crumbs.slice(0, workspace ? 2 : 1)}>
      {body}
    </AppShell>
  );
}

export function PageHeader({
  eyebrow,
  title,
  titleLabel,
  description,
  actions,
  meta,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  titleLabel?: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between fade-up">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div>}
        <h1 aria-label={titleLabel} className="text-[26px] font-semibold leading-tight md:text-[30px]" data-testid="text-page-title">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-[14.5px] text-muted-foreground">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
