import { UserIdentity } from '@/components/user-identity';
import { Search, Plus, Layers, Info, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, ListSkeleton, ScopeMarker } from '@/components/states';
import { cn } from '@/lib/utils';
import type { ReusableItem, ReusableScope, ReusableStatus, UpdatePolicy } from '@/domain/reusable-content';

export const statusLabels: Record<ReusableStatus, string> = { draft: 'Draft', in_review: 'In review', approved: 'Approved', published: 'Published' };
export const policyLabels: Record<UpdatePolicy, string> = { notify: 'Notify', manual: 'Manual', auto: 'Automatic' };
export const policyHelp: Record<UpdatePolicy, string> = {
  notify: 'Intended: linked uses will be told when this content changes.',
  manual: 'Intended: linked uses keep their copy until someone updates them by hand.',
  auto: 'Intended: linked uses will follow changes automatically.',
};
export const scopeLabels: Record<ReusableScope, string> = { workspace: 'Workspace', project: 'Project' };
export type ScopeFilter = 'all' | ReusableScope;
export type StatusFilter = 'all' | ReusableStatus;

export function ReusableList({ items, total, query, onQuery, scope, onScope, status, onStatus, selectedId, onSelect, loading, error, onRetry, canCreate, onCreate }: {
  items: ReusableItem[]; total: number; query: string; onQuery: (q: string) => void;
  scope: ScopeFilter; onScope: (s: ScopeFilter) => void; status: StatusFilter; onStatus: (s: StatusFilter) => void;
  selectedId: string | null; onSelect: (id: string) => void; loading: boolean; error: unknown; onRetry: () => void; canCreate: boolean; onCreate: () => void;
}) {
  const filtered = query.trim() !== '' || scope !== 'all' || status !== 'all';
  return (
    <section aria-labelledby="reusable-list-heading" className="min-w-0 space-y-3" data-testid="reusable-list">
      <div className="flex items-center justify-between gap-2">
        <h2 id="reusable-list-heading" className="text-[15px] font-semibold">Library</h2>
        {!loading && !error && <span className="text-[12px] tabular-nums text-muted-foreground" data-testid="reusable-count">{items.length} of {total}</span>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reusable-search" className="text-[12.5px] text-muted-foreground">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="reusable-search" type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Name, slug, tag" className="pl-9" data-testid="reusable-search" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="reusable-filter-scope" className="text-[12.5px] text-muted-foreground">Scope</Label>
          <Select value={scope} onValueChange={(v) => onScope(v as ScopeFilter)}>
            <SelectTrigger id="reusable-filter-scope" data-testid="reusable-filter-scope"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="workspace">Workspace</SelectItem>
              <SelectItem value="project">Project</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reusable-filter-status" className="text-[12.5px] text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => onStatus(v as StatusFilter)}>
            <SelectTrigger id="reusable-filter-status" data-testid="reusable-filter-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(statusLabels) as ReusableStatus[]).map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {loading ? <ListSkeleton rows={4} /> : error ? <ErrorState error={error} onRetry={onRetry} title="Reusable content did not load" /> : total === 0 ? (
        <EmptyState icon={Layers} title="No reusable content yet" body={canCreate ? 'Create a snippet or block you want to share across topics.' : 'A workspace or project Admin or Author can create reusable content.'}>
          {canCreate && <Button size="sm" onClick={onCreate} data-testid="reusable-empty-new"><Plus className="mr-1 h-4 w-4" />New reusable content</Button>}
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={Search} title="Nothing matches" body="Try another search or loosen the filters.">
          {filtered && <Button size="sm" variant="outline" onClick={() => { onQuery(''); onScope('all'); onStatus('all'); }} data-testid="reusable-clear-filters">Clear filters</Button>}
        </EmptyState>
      ) : (
        <ul className="space-y-2" data-testid="reusable-items">
          {items.map((r) => {
            const active = r.id === selectedId;
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onSelect(r.id)} aria-current={active ? 'true' : undefined}
                  className={cn('w-full rounded-lg border bg-card px-3.5 py-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active && 'border-primary bg-primary text-primary-foreground ring-1 ring-primary [&_p]:text-primary-foreground [&_span]:border-primary-foreground/40 [&_span]:text-primary-foreground')}
                  data-testid={`reusable-card-${r.id}`}>
                  <p className="break-words text-[14px] font-medium [overflow-wrap:anywhere]">{r.name}</p>
                  <p className="mt-0.5 break-all font-mono text-[12px] text-muted-foreground">{r.slug}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded border px-1.5 py-0.5 text-muted-foreground">{scopeLabels[r.scope]}</span>
                    <span className="rounded border px-1.5 py-0.5 text-muted-foreground">{statusLabels[r.status]}</span>
                    {!r.canEdit && <span className="rounded border px-1.5 py-0.5 text-muted-foreground">Read-only</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function fmt(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString();
}

export function ReusableDetails({ item, pending, onEdit, onRename, onDuplicate, canDuplicate, children }: {
  item: ReusableItem; pending: boolean; onEdit: () => void; onRename: () => void; onDuplicate: () => void; canDuplicate: boolean; children?: React.ReactNode;
}) {
  const disabled = !item.canEdit || pending;
  const settingsJson = JSON.stringify(item.settings, null, 2);
  return (
    <section aria-label="Reusable content details" className="min-w-0 space-y-4" data-testid="reusable-details">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[20px] font-semibold [overflow-wrap:anywhere]" data-testid="reusable-name">{item.name}</h2>
          <code className="mt-1 inline-block break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px]" data-testid="reusable-slug">{item.slug}</code>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={disabled} data-testid="reusable-edit">Edit</Button>
          <Button variant="outline" size="sm" onClick={onRename} disabled={disabled} data-testid="reusable-rename">Rename</Button>
          <Button variant="outline" size="sm" onClick={onDuplicate} disabled={!canDuplicate || pending} data-testid="reusable-duplicate">Duplicate</Button>
        </div>
      </div>
      {!item.canEdit && <p className="text-[12.5px] text-muted-foreground" data-testid="reusable-readonly">Read-only. You cannot change {item.scope}-scoped content.</p>}
      {item.description
        ? <p className="whitespace-pre-wrap break-words text-[13.5px] text-muted-foreground [overflow-wrap:anywhere]" data-testid="reusable-description">{item.description}</p>
        : <p className="text-[13px] italic text-muted-foreground" data-testid="reusable-description">No description</p>}

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-[14px] font-semibold">Metadata</h3>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          {[
            ['Scope', scopeLabels[item.scope], 'scope'], ['Lifecycle status', statusLabels[item.status], 'status'],
            ['Linked-update policy', policyLabels[item.updatePolicy], 'policy'], ['Updated', fmt(item.updatedAt), 'updated'],
            ['Created', fmt(item.createdAt), 'created'], ['Created by', '', 'created-by'],
          ].map(([k, v, id]) => (
            <div key={id} className="min-w-0">
              <dt className="text-[12px] text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 break-words text-[13.5px] [overflow-wrap:anywhere]" data-testid={`reusable-meta-${id}`}>{id === 'created-by' ? <UserIdentity userId={item.createdBy} /> : v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3">
          <p className="text-[12px] text-muted-foreground">Tags</p>
          {item.tags.length ? (
            <ul className="mt-1 flex flex-wrap gap-1.5" data-testid="reusable-tags">
              {item.tags.map((t) => <li key={t} className="max-w-full break-all rounded border bg-muted px-1.5 py-0.5 text-[12px]">{t}</li>)}
            </ul>
          ) : <p className="mt-0.5 text-[13px] italic text-muted-foreground" data-testid="reusable-tags">No tags</p>}
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">Status and policy remain metadata. Linked previews read the current saved draft. Saving does not publish, review, or rewrite topic bodies.</p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-[14px] font-semibold">Settings</h3>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Stored JSON object. Keys you do not edit are kept as-is.</p>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-[12px]" data-testid="reusable-settings">{settingsJson}</pre>
      </div>
      {children}
    </section>
  );
}

export function ReusableRail({ item, usage }: { item: ReusableItem; usage?: React.ReactNode }) {
  return (
    <aside aria-label="Where used and linked updates" className="min-w-0 space-y-4" data-testid="reusable-rail">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold"><Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />Where used</h3>

        <p className="mt-2 text-[12.5px] text-muted-foreground" data-testid="reusable-where-used">
          Insert linked reusable content from Author. The current saved draft is resolved on opening or refreshing a preview.
        </p>
        {usage}
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold"><Info className="h-4 w-4 text-muted-foreground" aria-hidden />Linked-update policy</h3>
        <p className="mt-2 break-words text-[13.5px] font-medium" data-testid="reusable-rail-policy">{policyLabels[item.updatePolicy]}</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">{policyHelp[item.updatePolicy]}</p>
        <p className="mt-2 text-[12px] text-muted-foreground" data-testid="reusable-policy-note">Notification and retained-copy policies record future intent. Linked previews read the current saved draft; saving does not publish, notify, or rewrite topic bodies. Deletion is unavailable to protect linked content.</p>
      </div>
    </aside>
  );
}

export function ReusableDetailsSkeleton() {
  return <div className="space-y-4" aria-hidden><Skeleton className="h-7 w-1/2" /><Skeleton className="h-5 w-32" /><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>;
}
