import { canManageProject } from '@/features/project/permissions';
import { InlineProjectName } from '@/features/project/inline-project-name';
import { Settings } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { FileUp, FolderPlus, Plus, Search } from 'lucide-react';
import { AppShell, type Crumb } from '@/components/shell/app-shell';
import { EmptyState, ErrorState, ListSkeleton, NotFoundPanel, PageSkeleton, ScopeMarker } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { PageHeader } from '@/features/project/project-scope';
import { projectBase } from '@/features/project/sections';
import { createLazyDialog } from '@/components/lazy-dialog';
import { ImportProjectDialog } from '@/features/projects/import-project-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePageTitle, useProjects, useWorkspace } from '@/hooks/use-studio-data';
import { PROJECT_STATUS_LABEL, relative } from '@/lib/format';
import { useServices } from '@/providers/services-provider';
import type { ProjectStatus } from '@/domain/types';
import { cn } from '@/lib/utils';

const CreateProjectDialog = createLazyDialog('Create project', () =>
  import('@/features/projects/create-project-dialog').then(module => ({ default: module.CreateProjectDialog })));

const FILTERS: { id: 'all' | ProjectStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'in-review', label: 'In review' },
  { id: 'archived', label: 'Archived' },
];

export default function ProjectsPage() {
  const { mode } = useServices();
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const ws = useWorkspace(workspaceId);
  const projects = useProjects(workspaceId);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | ProjectStatus>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const workspace = ws.data;
  usePageTitle(workspace ? `Projects · ${workspace.name}` : 'Projects');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects.data ?? []).filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!q || [p.name, p.key, p.description, p.product].some((s) => s.toLowerCase().includes(q))),
    );
  }, [projects.data, query, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.data?.length ?? 0 };
    for (const p of projects.data ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [projects.data]);

  const crumbs: Crumb[] = [{ label: 'Workspaces', href: '/workspaces' }];
  if (workspace) crumbs.push({ label: workspace.name });

  if (ws.isLoading)
    return (
      <AppShell crumbs={crumbs}>
        <PageSkeleton />
      </AppShell>
    );
  if (ws.isError)
    return (
      <AppShell crumbs={crumbs}>
        <div className="mx-auto max-w-3xl p-10"><ErrorState error={ws.error} onRetry={() => ws.refetch()} /></div>
      </AppShell>
    );
  if (!workspace)
    return (
      <AppShell crumbs={crumbs}>
        <NotFoundPanel what="Workspace" />
      </AppShell>
    );

  return (
    <AppShell ctx={{ workspaceId: workspace.id, workspaceName: workspace.name }} crumbs={crumbs}>
      <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-12">
        <PageHeader
          eyebrow={<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">Projects</span>}
          title={workspace.name}
          description={workspace.description}
          meta={workspace.status === 'archived' ? <span>Archived workspace · content is kept until permanently deleted</span> : undefined}
          actions={
            <>

              {mode === 'demo' && <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="button-import-project">
                <FileUp className="mr-1.5 h-4 w-4" /> Import demo project
              </Button>}
              <Button onClick={() => setCreateOpen(true)} data-testid="button-create-project">
                <Plus className="mr-1.5 h-4 w-4" /> Create project
              </Button>
            </>
          }
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center fade-up fade-up-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              className="pl-9"
              data-testid="input-search-projects"
            />
          </div>
          <div role="radiogroup" aria-label="Filter by status" className="flex gap-1 overflow-x-auto rounded-md border bg-card p-1">
            {FILTERS.filter(f => mode === 'demo' || f.id !== 'in-review').map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={filter === f.id}
                onClick={() => setFilter(f.id)}
                data-testid={`filter-${f.id}`}
                className={cn(
                  'whitespace-nowrap rounded px-3 py-1.5 text-[12.5px] transition-colors',
                  filter === f.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {f.label}
                <span className={cn('ml-1.5 font-mono text-[10.5px]', filter === f.id ? 'text-white/70' : 'text-muted-foreground/70')}>
                  {counts[f.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 fade-up fade-up-3">
          {projects.isLoading ? (
            <ListSkeleton />
          ) : projects.isError ? (
            <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
          ) : (projects.data?.length ?? 0) === 0 ? (
            <EmptyState icon={FolderPlus} title="No projects in this workspace" body={mode === 'backend' ? 'Create a project from scratch. Import is not available yet.' : 'Create a project from scratch or import an existing structure from a SPEXTAR JSON file.'}>
              {mode === 'demo' && <Button variant="outline" onClick={() => setImportOpen(true)}>Import demo project</Button>}
              <Button onClick={() => setCreateOpen(true)}>Create project</Button>
            </EmptyState>
          ) : list.length === 0 ? (
            <EmptyState icon={Search} title="No projects match" body="Try a different search or status filter.">
              <Button variant="outline" onClick={() => { setQuery(''); setFilter('all'); }} data-testid="button-reset-filters">Reset filters</Button>
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="hidden grid-cols-[minmax(0,1fr)_110px_100px_100px_90px] gap-4 border-b bg-muted/50 px-5 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground md:grid">
                <span>Project</span><span>Documents</span><span>Status</span><span>Updated</span><span />
              </div>
              <ul className="divide-y">
                {list.map((p) => (
                  <li key={p.id}>
                    <div
                      data-testid={`row-project-${p.id}`}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/40 md:grid-cols-[minmax(0,1fr)_110px_100px_100px_90px]"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <InlineProjectName project={p} href={projectBase(workspace.id, p.id)} />
                          {p.source !== 'fixture' && p.source !== 'backend' && <ScopeMarker kind="demo">{p.source === 'imported' ? 'Imported' : 'Local'}</ScopeMarker>}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{p.description || p.product || 'No description'}</span>
                      </span>
                      <span className="hidden text-sm md:block">
                        {p.documentCount} <span className="text-muted-foreground">· {p.topicCount} topics</span>
                      </span>
                      <span className="hidden md:block"><StatusPill status={p.status} label={PROJECT_STATUS_LABEL[p.status]} /></span>
                      <span className="hidden text-[13px] text-muted-foreground md:block">{relative(p.updatedAt)}</span>
                      <span className="flex flex-wrap items-center gap-1">{canManageProject(p) && <><Tooltip><TooltipTrigger asChild><Button asChild variant="ghost" size="icon"><Link href={projectBase(workspace.id, p.id) + '/settings'} aria-label={`Settings for ${p.name}`}><Settings className="h-4 w-4" /></Link></Button></TooltipTrigger><TooltipContent>Project settings</TooltipContent></Tooltip></>}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <CreateProjectDialog workspaceId={workspace.id} open={createOpen} onOpenChange={setCreateOpen} />
      <ImportProjectDialog workspaceId={workspace.id} open={importOpen} onOpenChange={setImportOpen} />
    </AppShell>
  );
}
