import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import type { LifecycleDetails, LifecycleScope } from '@/domain/lifecycle';
import { useLifecycle, useLifecycleMutation, type LifecycleAction } from '@/hooks/use-lifecycle';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/states';

const dependencies = {
  organization: 'Related workspaces, projects, documents, topics, drafts, reusable content and memberships may also be permanently deleted.',
  workspace: 'Related projects, documents, topics, drafts, workspace-shared reusable content and memberships may also be permanently deleted.',
  project: 'Related documents, topics, drafts, variables, conditions, project-scoped reusable content and memberships may also be permanently deleted.',
};
export function LifecycleDialog({ scope, open, onOpenChange, deleteOnly = false }: {
  scope: LifecycleScope; open: boolean; onOpenChange: (open: boolean) => void; deleteOnly?: boolean;
}) {
  const q = useLifecycle(scope);
  const m = useLifecycleMutation(scope);
  const [, navigate] = useLocation();
  const [snapshot, setSnapshot] = useState<LifecycleDetails | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [step, setStep] = useState<'details' | 'delete' | 'archive' | 'discard'>(deleteOnly ? 'delete' : 'details');
  const [typed, setTyped] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!snapshot && q.data) {
      setSnapshot(q.data); setName(q.data.name); setSlug(q.data.slug); setDescription(q.data.description ?? '');
    }
  }, [q.data, snapshot]);
  const dirty = !!snapshot && (name !== snapshot.name || slug !== snapshot.slug || description !== (snapshot.description ?? ''));
  const pending = m.isPending;
  const archived = snapshot?.status === 'archived';
  const canDelete = !!snapshot?.canDelete && (scope.kind === 'organization' || archived);

  const run = async (action: LifecycleAction) => {
    setError(null); setNotice(null);
    try {
      await m.mutateAsync(action);
      if (action.kind === 'delete') {
        onOpenChange(false);
        navigate(scope.kind === 'project' ? `/workspaces/${scope.parentId}/projects` : '/workspaces', { replace: true });
      } else {
        const next = await q.refetch();
        if (next.error || !next.data) throw new Error('The change was saved, but the latest details could not load. Reload before continuing.');
        setSnapshot(null); setTyped(''); setAcknowledged(false); setStep('details');
        setNotice(action.kind === 'update' ? 'Details saved.' : action.archived ? 'Workspace archived. You can restore it from Archived workspaces.' : 'Workspace restored.');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'The change could not be completed. Reload and try again.'); }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!snapshot || !snapshot.canEdit || pending) return;
    void run({ kind: 'update', expected: snapshot, value: scope.kind === 'organization' ? { name, slug } : { name, description } });
  };
  const reload = async () => {
    const next = await q.refetch();
    if (next.data && !next.error) {
      setSnapshot(null); setError(null); setNotice(null); setTyped(''); setAcknowledged(false);
    }
  };
  return <Dialog open={open} onOpenChange={(value) => {
    if (pending) return;
    if (!value && dirty) setStep('discard'); else onOpenChange(value);
  }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" data-testid="dialog-lifecycle"
      onInteractOutside={(e) => { if (pending || dirty) e.preventDefault(); }}
      onEscapeKeyDown={(e) => { if (pending) e.preventDefault(); }}
      onOpenAutoFocus={(e) => {
        if (step !== 'details') { e.preventDefault(); document.getElementById('lifecycle-cancel')?.focus(); }
      }}>
      <DialogHeader>
        <DialogTitle>{step === 'discard' ? 'Discard unsaved changes?' : step === 'delete' ? `Permanently delete ${scope.kind}?` : step === 'archive'
          ? `${archived ? 'Restore' : 'Archive'} workspace?` : `Manage ${scope.kind}`}</DialogTitle>
        <DialogDescription>{step === 'discard' ? 'Your unsaved detail edits will be lost. Saved content is not changed.' : step === 'delete' ? scope.kind === 'organization'
          ? 'Organization deletion is permanent. There is no archive or restore option.'
          : 'This cannot be undone. Archiving is reversible; permanent deletion is not.'
          : step === 'archive' ? 'Archiving keeps the content. Restore the workspace whenever you need it again.'
          : 'Manage details and availability. Changes require the appropriate administrator role.'}</DialogDescription>
      </DialogHeader>
      {q.isLoading && <p role="status">Loading details…</p>}
      {q.isError && <ErrorState error={q.error} onRetry={() => void reload()} />}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => void reload()}>Reload details</Button></div>}
      {step === 'discard' && <Button variant="destructive" onClick={() => onOpenChange(false)}>Discard and close</Button>}
      {snapshot && !q.isError && step === 'details' && <form onSubmit={save} className="space-y-4">
        <fieldset disabled={!snapshot.canEdit || pending} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="lifecycle-name">Name</Label>
            <Input id="lifecycle-name" minLength={3} maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} /></div>
          {scope.kind === 'organization' ? <div className="space-y-1.5"><Label htmlFor="lifecycle-slug">Address slug</Label>
            <Input id="lifecycle-slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(e) => setSlug(e.target.value)} />
            <p className="text-xs text-muted-foreground">Use lowercase letters, numbers and single hyphens.</p></div>
            : <div className="space-y-1.5"><Label htmlFor="lifecycle-description">Description</Label>
              <Textarea id="lifecycle-description" maxLength={400} value={description} onChange={(e) => setDescription(e.target.value)} /></div>}
          <Button type="submit" disabled={!dirty}>{pending ? 'Saving…' : 'Save details'}</Button>
        </fieldset>
        {!snapshot.canEdit && <p role="note" className="text-sm text-muted-foreground">Only an administrator can change these details.</p>}
        {scope.kind === 'workspace' && <div className="space-y-2 border-t pt-4">
          <p className="text-sm">Status: {archived ? 'Archived' : 'Active'}</p>
          <Button type="button" variant="outline" disabled={!snapshot.canEdit || pending || dirty} onClick={() => { setError(null); setStep('archive'); }}>
            {archived ? 'Restore workspace' : 'Archive workspace'}</Button>
        </div>}
        <div className="space-y-2 border-t border-destructive/30 pt-4">
          <h3 className="font-semibold text-destructive">Permanent deletion</h3>
          <p className="text-sm text-muted-foreground">{scope.kind === 'organization' ? 'Only the owner can delete this organization.'
            : 'Archive this item first. Deleting it permanently can remove related content.'}</p>
          <Button type="button" variant="destructive" disabled={!canDelete || pending || dirty} onClick={() => { setError(null); setTyped(''); setAcknowledged(false); setStep('delete'); }}>
            Delete {scope.kind} permanently</Button>
        </div>
      </form>}
      {snapshot && !q.isError && step === 'archive' && <div className="space-y-3">
        <p className="break-words text-sm">{snapshot.name} will be {archived ? 'active and visible in the default workspace list' : 'moved to Archived workspaces. Its content is kept'}.</p>
        <Button disabled={pending || !snapshot.canEdit} onClick={() => void run({ kind: 'archive', archived: !archived, expected: snapshot })}>
          {pending ? 'Saving…' : archived ? 'Restore workspace' : 'Archive workspace'}</Button>
      </div>}
      {snapshot && !q.isError && step === 'delete' && <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (canDelete && !pending && typed === snapshot.name && acknowledged) void run({ kind: 'delete', expected: snapshot, confirmation: { name: typed, acknowledged } });
      }}>
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{dependencies[scope.kind]} This can include content you are not currently viewing. Deleted content cannot be restored here.</p>
        {!canDelete && <p role="alert" className="text-sm">{!snapshot.canDelete ? scope.kind === 'organization'
          ? 'Only the organization owner can delete it.' : 'Only an administrator can delete this item.' : 'Archive this item in its settings before deleting it.'}</p>}
        <div className="space-y-1.5"><Label htmlFor="lifecycle-confirm">Type the exact name: <span className="break-all font-semibold">{snapshot.name}</span></Label>
          <Input id="lifecycle-confirm" autoComplete="off" spellCheck={false} disabled={!canDelete || pending} value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={acknowledged}
          disabled={!canDelete || pending} onChange={(e) => setAcknowledged(e.target.checked)} />
          I understand this permanently deletes data and cannot be undone.</label>
        <Button type="submit" variant="destructive" disabled={!canDelete || pending || typed !== snapshot.name || !acknowledged}>
          {pending ? 'Deleting…' : `Delete ${scope.kind} permanently`}</Button>
      </form>}
      <DialogFooter>
        <Button id="lifecycle-cancel" variant="outline" disabled={pending} onClick={() => {
          if (step !== 'details' && !deleteOnly) { setStep('details'); setTyped(''); setAcknowledged(false); setError(null); }
          else if (dirty) setStep('discard');
          else onOpenChange(false);
        }}>{step === 'details' ? 'Done' : 'Cancel'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
