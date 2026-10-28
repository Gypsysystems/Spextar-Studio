import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';
import { slugify } from '@/domain/project-identifiers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ErrorState } from '@/components/states';
import { LifecycleControl } from './lifecycle-control';

/** Organization context uses existing Workspaces surface; no new navigation routes. */
export function OrganizationContext() {
  const { mode, organizations } = useServices();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const current = useQuery({ queryKey: ['organization'], queryFn: () => organizations.getOrganization(), enabled: mode === 'backend' });
  const list = useQuery({ queryKey: ['organizations'], queryFn: () => organizations.listOrganizations!(), enabled: mode === 'backend' && !!organizations.listOrganizations });
  const create = useMutation({ mutationFn: () => organizations.createOrganization!({ name, slug }) });
  const select = useMutation({ mutationFn: (id: string) => organizations.selectOrganization!(id) });
  if (mode !== 'backend') return null;
  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(undefined, { onSuccess: () => { setOpen(false); setName(''); setSlug(''); } });
  };
  return <div className="mb-5 space-y-3" data-testid="organization-context">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1">
        <Label htmlFor="organization-select" className="mb-1.5 block text-xs text-muted-foreground">Organization</Label>
        <select id="organization-select" className="h-9 w-full rounded-md border bg-card px-3 text-sm"
          value={current.data?.id ?? ''} disabled={list.isLoading || select.isPending || list.isError}
          onChange={(event) => select.mutate(event.target.value)} data-testid="select-organization">
          {!current.data && <option value="">Create an organization to get started</option>}
          {(list.data ?? []).map((org) => <option key={org.id} value={org.id}>{org.name} · {org.role}</option>)}
        </select>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="outline" data-testid="button-create-organization">Create organization</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Create organization</DialogTitle><DialogDescription>Create a home for your workspaces and projects. You will be its owner.</DialogDescription></DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="organization-name">Name</Label><Input id="organization-name" required minLength={3} maxLength={80} value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} /></div>
            <div className="space-y-1.5"><Label htmlFor="organization-slug">Slug</Label><Input id="organization-slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
            {create.isError && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
            <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create organization'}</Button>
          </form>
        </DialogContent>
      </Dialog>
      {current.data && <LifecycleControl scope={{ kind: 'organization', id: current.data.id }} label="Manage organization"
        disabled={current.data.role !== 'owner' && current.data.role !== 'admin'} />}
    </div>
    {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
    {select.isError && <p role="alert" className="text-sm text-destructive">{select.error.message}</p>}
  </div>;
}
