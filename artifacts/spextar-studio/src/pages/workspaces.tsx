import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight, Building2, Plus, Search, Users } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { EmptyState, ErrorState, ListSkeleton, ScopeMarker } from '@/components/states';
import { PageHeader } from '@/features/project/project-scope';
import { createLazyDialog } from '@/components/lazy-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrganization, usePageTitle, useSession, useWorkspaces } from '@/hooks/use-studio-data';
import { relative } from '@/lib/format';
import { OrganizationContext } from '@/features/workspaces/organization-context';
import { useServices } from '@/providers/services-provider';
import type { WorkspaceSummary } from '@/domain/types';

const CreateWorkspaceDialog = createLazyDialog('Create workspace', () =>
  import('@/features/workspaces/create-workspace-dialog').then(module => ({ default: module.CreateWorkspaceDialog })));
const ManageWorkspaceDialog = createLazyDialog('Manage workspace', () =>
  import('@/features/workspaces/lifecycle-dialog').then(module => ({ default: module.LifecycleDialog })));

export default function WorkspacesPage() {
  const { mode } = useServices();
  usePageTitle('Workspaces', 'Choose a documentation workspace in SPEXTAR Studio.');
  const { data, isLoading, isError, error, refetch } = useWorkspaces();
  const { data: org } = useOrganization();
  const { data: session } = useSession();
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active');
  // Own the dialog above the filtered list so archive/restore cannot unmount it mid-save.
  const [managedWorkspace, setManagedWorkspace] = useState<WorkspaceSummary | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((w) => (mode !== 'backend' || status === 'all' || (w.status ?? 'active') === status)
      && (!q || w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)));
  }, [data, query, status, mode]);

  return (
    <AppShell crumbs={[{ label: 'Workspaces' }]}>
      <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-10 md:py-12">
        <PageHeader
          eyebrow={
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary" data-testid="text-org-name">
              {org?.name ?? 'Organization'}
            </span>
          }
          title={session ? `Good to see you, ${session.name.split(' ')[0]}` : 'Workspaces'}
          description="Each workspace holds the projects for one documentation team. Pick up where the team left off."
          meta={!session ? <ScopeMarker kind="demo">Preview without sign-in</ScopeMarker> : undefined}
          actions={
            <Button onClick={() => setCreateOpen(true)} disabled={mode === 'backend' && !org} data-testid="button-create-workspace">
              <Plus className="mr-1.5 h-4 w-4" /> Create workspace
            </Button>
          }
        />

        <div className="mt-6"><OrganizationContext /></div>
        <div className="mt-6 flex flex-wrap items-center gap-3 fade-up fade-up-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workspaces"
              aria-label="Search workspaces"
              className="pl-9"
              data-testid="input-search-workspaces"
            />
          </div>
          {data && <span className="text-sm text-muted-foreground">{filtered.length} of {data.length}</span>}
          {mode === 'backend' && <div className="space-y-1">
            <label htmlFor="workspace-status" className="sr-only">Workspace status</label>
            <select id="workspace-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
              className="h-9 max-w-full rounded-md border border-input bg-card px-2 text-sm">
              <option value="active">Active workspaces</option><option value="archived">Archived workspaces</option><option value="all">All workspaces</option>
            </select>
          </div>}
        </div>

        <div className="mt-5 fade-up fade-up-3">
          {isLoading ? (
            <ListSkeleton rows={3} />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Building2} title={query ? 'No workspaces match' : status === 'archived' ? 'No archived workspaces' : 'No workspaces yet'} body={query ? `Nothing matches "${query}".` : status === 'archived' ? 'Archived workspaces appear here. You can restore them whenever needed.' : 'Create a workspace to start organizing projects.'}>
              {query || status === 'archived' ? (
                <Button variant="outline" onClick={() => { setQuery(''); setStatus('active'); }} data-testid="button-clear-search">{query ? 'Clear search' : 'Reset filters'}</Button>
              ) : (
                <Button disabled={mode === 'backend' && !org} onClick={() => setCreateOpen(true)}>Create workspace</Button>
              )}
            </EmptyState>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-[0_20px_50px_-32px_rgba(0,0,0,0.65)]">
              {filtered.map((w, i) => (
                <li key={w.id}>
                  <Link
                    href={`/workspaces/${w.id}/projects`}
                    data-testid={`card-workspace-${w.id}`}
                    className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-5 transition-colors hover:bg-[hsl(var(--surface-raised))] md:gap-6"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/15 font-mono text-sm text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15.5px] font-medium">{w.name}</span>
                        {w.status === 'archived' && <span className="text-xs text-muted-foreground">Archived</span>}
                        {w.source !== 'fixture' && w.source !== 'backend' && <ScopeMarker kind="demo">Local</ScopeMarker>}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{w.description || 'No description'}</span>
                      <span className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground md:hidden">
                        <span>{w.projectCount} projects</span>
                        <span>Updated {relative(w.updatedAt)}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span className="hidden text-right md:block">
                        <span className="block font-medium text-foreground" data-testid={`text-project-count-${w.id}`}>{w.projectCount}</span>
                        <span className="text-xs">projects</span>
                      </span>
                      <span className="hidden items-center gap-1 md:flex"><Users className="h-3.5 w-3.5" />{w.memberCount}</span>
                      <span className="hidden w-24 text-xs lg:block">{relative(w.updatedAt)}</span>
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </span>
                  </Link>
                  {mode === 'backend' && <div className="flex justify-end px-5 pb-4">
                    <Button variant="outline" size="sm" disabled={w.role !== 'admin'}
                      onClick={() => setManagedWorkspace(w)} data-testid="button-manage-workspace">Manage workspace</Button>
                  </div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      {managedWorkspace && <ManageWorkspaceDialog key={managedWorkspace.id} scope={{ kind: 'workspace', id: managedWorkspace.id, parentId: managedWorkspace.organizationId }}
        open onOpenChange={(value) => { if (!value) setManagedWorkspace(null); }} />}
    </AppShell>
  );
}
