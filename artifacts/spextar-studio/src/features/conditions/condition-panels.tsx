import { Search, Tags, Plus, Info, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState, ListSkeleton, ScopeMarker } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ConditionCategory, ConditionValue } from '@/domain/project-conditions';

export function CategoryList({ items, total, query, onQuery, selectedId, onSelect, loading, error, onRetry, canEdit, pending, onCreate }: {
  items: ConditionCategory[]; total: number; query: string; onQuery: (q: string) => void; selectedId: string | null; onSelect: (id: string) => void;
  loading: boolean; error: unknown; onRetry: () => void; canEdit: boolean; pending: boolean; onCreate: () => void;
}) {
  return (
    <section aria-labelledby="categories-list-heading" className="min-w-0 space-y-3" data-testid="panel-category-list">
      <div className="flex items-center justify-between gap-2">
        <h2 id="categories-list-heading" className="text-[15px] font-semibold">Condition categories</h2>
        <Button size="sm" variant="outline" onClick={onCreate} disabled={!canEdit || pending} data-testid="button-new-category"><Plus className="mr-1 h-4 w-4" />New category</Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="category-search" className="text-[12.5px] text-muted-foreground">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="category-search" type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search categories" className="pl-9" data-testid="input-search-categories" />
        </div>
      </div>
      {loading ? <ListSkeleton rows={4} /> : error ? <ErrorState error={error} onRetry={onRetry} title="Condition categories did not load" /> : total === 0 ? (
        <EmptyState icon={Tags} title="No condition categories yet" body={canEdit ? 'Create a category such as Audience or Platform, then add its values.' : 'A project Admin or Author can create categories.'}>
          {canEdit && <Button size="sm" onClick={onCreate} disabled={pending} data-testid="button-empty-new-category">New category</Button>}
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={Search} title="No categories match" body="Try another name or key.">
          <Button size="sm" variant="outline" onClick={() => onQuery('')} data-testid="button-clear-category-search">Clear search</Button>
        </EmptyState>
      ) : (
        <ul className="space-y-2" data-testid="list-categories">
          {items.map((c) => {
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onSelect(c.id)} aria-current={active ? 'true' : undefined}
                  className={cn('w-full rounded-lg border bg-card px-3.5 py-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active && 'border-primary bg-primary text-primary-foreground ring-1 ring-primary [&_p]:text-primary-foreground')}
                  data-testid={`card-category-${c.id}`}>
                  <p className="truncate text-[14px] font-medium">{c.name}</p>
                  <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">{c.key}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const unassignedCopy = { include: 'Included', exclude: 'Excluded' } as const;
const matchCopy = { any: 'Match any (OR)', all: 'Match all (AND)' } as const;

export function CategoryDetails({ category, values, canEdit, pending, onEdit, onRename, onAddValue, onEditValue, onRenameValue }: {
  category: ConditionCategory;
  values: { items: ConditionValue[]; loading: boolean; error: unknown; onRetry: () => void };
  canEdit: boolean; pending: boolean; onEdit: () => void; onRename: () => void; onAddValue: () => void;
  onEditValue: (v: ConditionValue) => void; onRenameValue: (v: ConditionValue) => void;
}) {
  const disabled = !canEdit || pending;
  return (
    <section aria-label="Category details" className="min-w-0 space-y-4" data-testid="panel-category-details">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[20px] font-semibold" data-testid="text-category-name">{category.name}</h2>
          <code className="mt-1 inline-block break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px]" data-testid="text-category-key">{category.key}</code>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} disabled={disabled} data-testid="button-edit-category">Edit category</Button>
      </div>
      {category.description
        ? <p className="break-words text-[13.5px] text-muted-foreground" data-testid="text-category-description">{category.description}</p>
        : <p className="text-[13px] italic text-muted-foreground" data-testid="text-category-description">No description</p>}

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-[14px] font-semibold">Matching rules</h3>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[12px] text-muted-foreground">Content with no tag from this category</dt>
            <dd className="mt-0.5 text-[13.5px]" data-testid="text-category-unassigned">{unassignedCopy[category.unassignedBehavior]}{category.unassignedBehavior === 'include' && <span className="text-muted-foreground"> (default)</span>}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-muted-foreground">Multiple values in this category</dt>
            <dd className="mt-0.5 text-[13.5px]" data-testid="text-category-match">{matchCopy[category.valueMatchMode]}{category.valueMatchMode === 'any' && <span className="text-muted-foreground"> (default)</span>}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[12px] text-muted-foreground">Different categories always combine with AND. Rules are stored now and take effect once content assignment is available.</p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-semibold">Values</h3>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Listed by order number, lowest first.</p>
          </div>
          <Button size="sm" onClick={onAddValue} disabled={disabled || !!values.error || values.loading} data-testid="button-add-value"><Plus className="mr-1 h-4 w-4" />Add value</Button>
        </div>
        <div className="mt-3">
          {values.loading ? <ListSkeleton rows={3} /> : values.error ? <ErrorState error={values.error} onRetry={values.onRetry} title="Values did not load" /> : values.items.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground" data-testid="text-values-empty">
              No values yet. {canEdit ? 'Add the tags authors will pick from.' : 'A project Admin or Author can add values.'}
            </p>
          ) : (
            <ul className="divide-y" data-testid="list-values">
              {values.items.map((v) => (
                <li key={v.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-value-${v.id}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-10 shrink-0 text-right font-mono text-[12px] tabular-nums text-muted-foreground" aria-label={`Order ${v.sortOrder}`} data-testid={`text-value-order-${v.id}`}>{v.sortOrder}</span>
                    <div className="min-w-0">
                      <p className="break-words text-[13.5px] font-medium" data-testid={`text-value-name-${v.id}`}>{v.name}</p>
                      <code className="break-all font-mono text-[12px] text-muted-foreground" data-testid={`text-value-key-${v.id}`}>{v.key}</code>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 pl-[52px] sm:pl-0">
                    <Button size="sm" variant="ghost" onClick={() => onEditValue(v)} disabled={disabled} aria-label={`Edit ${v.name}`} data-testid={`button-edit-value-${v.id}`}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => onRenameValue(v)} disabled={disabled} aria-label={`Rename ${v.name}`} data-testid={`button-rename-value-${v.id}`}>Rename</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-[14px] font-semibold">Safe changes</h3>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Rename keeps the key and ID. Deletion is unavailable until reference tracking exists.</p>
        <div className="mt-3"><Button variant="outline" size="sm" onClick={onRename} disabled={disabled} data-testid="button-rename-category">Rename category</Button></div>
      </div>
    </section>
  );
}

export function ConditionRail({ category }: { category: ConditionCategory }) {
  return (
    <aside aria-label="Assignment and output preview" className="min-w-0 space-y-4" data-testid="panel-condition-rail">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold"><Info className="h-4 w-4 text-muted-foreground" aria-hidden />Assignment</h3>
        <ScopeMarker kind="placeholder" className="mt-2">Coming next</ScopeMarker>
        <p className="mt-2 text-[12.5px] text-muted-foreground" data-testid="text-condition-assignment">
          Tagging topics and blocks with these values arrives in a later release. Usage counts and references are not tracked yet.
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold"><Eye className="h-4 w-4 text-muted-foreground" aria-hidden />How this will resolve</h3>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]" data-testid="text-condition-resolution-rules">
          <li>Untagged for {category.name}: {category.unassignedBehavior === 'include' ? 'included in every output' : 'excluded from outputs that filter on it'}.</li>
          <li>Several values from this category: {category.valueMatchMode === 'any' ? 'shown if any one matches' : 'shown only if all match'}.</li>
          <li>Tags from different categories must all match.</li>
        </ul>
        <p className="mt-2 text-[12px] text-muted-foreground">Output filtering is not applied yet; no preview is computed.</p>
      </div>
    </aside>
  );
}

export function ConditionDetailsSkeleton() {
  return <div className="space-y-4" aria-hidden><Skeleton className="h-7 w-1/2" /><Skeleton className="h-5 w-32" /><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>;
}
