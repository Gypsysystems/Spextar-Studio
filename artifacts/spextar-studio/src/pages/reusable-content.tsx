import { ReferenceUsage } from '@/features/content/reference-usage';
import { useMemo, useState } from 'react';
import { useParams } from 'wouter';
import { Plus, FileText } from 'lucide-react';
import { ProjectScope, PageHeader } from '@/features/project/project-scope';
import { ScopeMarker } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useServices } from '@/providers/services-provider';
import { useReusableContent, useReusableMutation, useReusablePermissions, type ReusableMutation } from '@/hooks/use-reusable-content';
import type { ReusableContext, ReusableItem } from '@/domain/reusable-content';
import { ReusableDetails, ReusableDetailsSkeleton, ReusableList, ReusableRail, type ScopeFilter, type StatusFilter } from '@/features/reusable/reusable-panels';
import { ReusableFormDialog, ReusableIdentityDialog } from '@/features/reusable/reusable-dialogs';
import { ReusableDraftPanel } from '@/features/reusable/reusable-draft-panel';

type DialogState = null | 'create' | 'edit' | 'rename' | 'duplicate';
const matches = (r: ReusableItem, q: string) => [r.name, r.slug, r.description ?? '', ...r.tags].some((s) => s.toLowerCase().includes(q));

function ReusableBody({ context }: { context: ReusableContext }) {
  const backend = useServices().mode === 'backend';
  const list = useReusableContent(context);
  const perms = useReusablePermissions(context);
  const mutation = useReusableMutation(context);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [target, setTarget] = useState<ReusableItem | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [draftOpenFor, setDraftOpenFor] = useState<string | null>(null);

  const scopes = { loading: perms.isLoading, error: perms.isError, workspace: perms.data?.workspace === true, project: perms.data?.project === true };
  const canCreate = !scopes.loading && !scopes.error && (scopes.workspace || scopes.project);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => (scope === 'all' || r.scope === scope) && (status === 'all' || r.status === status) && (!q || matches(r, q)));
  }, [all, query, scope, status]);
  const selected = list.isError ? null : items.find((r) => r.id === selectedId) ?? items[0] ?? null;
  const pending = mutation.isPending;

  const open = (d: DialogState) => {
    if (d !== 'create' && !selected) return;
    mutation.reset(); setTarget(d === 'create' ? null : selected); setDialog(d);
  };
  const run = async (op: ReusableMutation) => {
    try {
      const { item, warning: w } = await mutation.mutateAsync(op);
      setWarning(w ?? null);
      setSelectedId(item.id);
      const q = query.trim().toLowerCase();
      if (q && !matches(item, q)) setQuery('');
      if (scope !== 'all' && item.scope !== scope) setScope('all');
      if (status !== 'all' && item.status !== status) setStatus('all');
      setDialog(null);
    } catch { /* shown in dialog; typed fields kept */ }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-10 md:py-10" data-testid="reusable-page">
      <PageHeader
        eyebrow={backend ? canCreate ? undefined : <ScopeMarker kind="read-only" /> : <ScopeMarker kind="demo">Demo · session-only changes</ScopeMarker>}
        title="Reusable Content"
        description="Shared snippets and blocks for this project and workspace. Linked previews resolve saved drafts."
        actions={<Button onClick={() => open('create')} disabled={!canCreate || pending} data-testid="reusable-new"><Plus className="mr-1.5 h-4 w-4" />New reusable content</Button>}
      />
      {perms.isError && <p className="mt-3 text-[12.5px] text-destructive" data-testid="reusable-permissions-error">Permissions could not be checked, so creating is disabled. <button type="button" className="underline" onClick={() => perms.refetch()} data-testid="reusable-permissions-retry">Retry</button></p>}
      {!perms.isLoading && !perms.isError && !canCreate && <p className="mt-3 text-[12.5px] text-muted-foreground" data-testid="reusable-readonly-note">Read-only. Only Admins and Authors can create reusable content.</p>}
      {warning && (
        <div role="alert" className="mt-4 flex flex-wrap items-start justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-400/10 dark:text-amber-200" data-testid="reusable-warning">
          <p className="min-w-0 [overflow-wrap:anywhere]"><span className="font-medium">Saved with a warning: </span>{warning}</p>
          <Button size="sm" variant="ghost" onClick={() => setWarning(null)} data-testid="reusable-warning-dismiss">Dismiss</Button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,.85fr)]">
        <ReusableList items={items} total={all.length} query={query} onQuery={setQuery} scope={scope} onScope={setScope} status={status} onStatus={setStatus}
          selectedId={selected?.id ?? null} onSelect={setSelectedId} loading={list.isLoading} error={list.isError ? list.error : null}
          onRetry={() => list.refetch()} canCreate={canCreate} onCreate={() => open('create')} />
        {list.isLoading ? <><ReusableDetailsSkeleton /><ReusableDetailsSkeleton /></> : selected ? <>
          <ReusableDetails item={selected} pending={pending} canDuplicate={selected.canEdit && !scopes.loading && !scopes.error && scopes[selected.scope]}
            onEdit={() => open('edit')} onRename={() => open('rename')} onDuplicate={() => open('duplicate')}>
            {draftOpenFor === selected.id
              ? <ReusableDraftPanel key={`${selected.id}-${selected.canEdit}`} context={context} item={selected} />
              : (
                <div className="rounded-lg border border-dashed p-4">
                  <h3 className="text-[14px] font-semibold">Body draft</h3>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">The structured editor loads only when you open the draft.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setDraftOpenFor(selected.id)} data-testid="reusable-body-open"><FileText className="mr-1.5 h-4 w-4" />Open draft</Button>
                </div>
              )}
          </ReusableDetails>
          <ReusableRail usage={<ReferenceUsage scope={context} target={{kind:'reusable',definitionId:selected.id}} />} item={selected} />
        </> : null}
      </div>

      <ReusableFormDialog open={dialog === 'create' || dialog === 'edit'} mode={dialog === 'edit' ? 'edit' : 'create'} item={dialog === 'edit' ? target ?? undefined : undefined}
        scopes={scopes} pending={pending} error={mutation.error} onClose={() => setDialog(null)}
        onSubmit={(v) => {
          if (v.mode === 'create') return void run({ action: 'create', input: v.input });
          if (target) void run({ action: 'update', id: target.id, input: v.input, expectedUpdatedAt: target.updatedAt });
        }} />
      {target && (
        <ReusableIdentityDialog open={dialog === 'rename' || dialog === 'duplicate'} mode={dialog === 'duplicate' ? 'duplicate' : 'rename'} item={target}
          pending={pending} error={mutation.error} onClose={() => setDialog(null)}
          onSubmit={(v) => {
            if (dialog === 'duplicate') void run({ action: 'duplicate', id: target.id, input: v });
            else void run({ action: 'rename', id: target.id, name: v.name, expectedUpdatedAt: target.updatedAt });
          }} />
      )}
    </div>
  );
}

export default function ReusableContentPage() {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  return (
    <ProjectScope workspaceId={workspaceId} projectId={projectId} title="Reusable Content" trail={[{ label: 'Reusable Content' }]}>
      {({ workspace, project }) => <ReusableBody key={project.id} context={{ workspaceId: workspace.id, projectId: project.id }} />}
    </ProjectScope>
  );
}
