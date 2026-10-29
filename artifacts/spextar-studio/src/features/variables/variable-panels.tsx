import { Search, Variable as VariableIcon, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReferenceUsage } from '@/features/content/reference-usage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { BrandedText } from '@/components/brand/logo';
import { resolveVariable, variableOutputs, type ProjectVariable, type VariableOutputId } from '@/domain/project-variables';

export function VariableList({ items, total, query, onQuery, selectedId, onSelect, loading, error, onRetry, canEdit, onCreate }: {
  items: ProjectVariable[]; total: number; query: string; onQuery: (q: string) => void; selectedId: string | null;
  onSelect: (id: string) => void; loading: boolean; error: unknown; onRetry: () => void; canEdit: boolean; onCreate: () => void;
}) {
  return (
    <section aria-labelledby="variables-list-heading" className="min-w-0 space-y-3" data-testid="panel-variable-list">
      <h2 id="variables-list-heading" className="text-[15px] font-semibold">Variables</h2>
      <div className="space-y-1.5">
        <Label htmlFor="variable-search" className="text-[12.5px] text-muted-foreground">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="variable-search" type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search variables" className="pl-9" data-testid="input-search-variables" />
        </div>
      </div>
      {loading ? <ListSkeleton rows={4} /> : error ? <ErrorState error={error} onRetry={onRetry} title="Variables did not load" /> : total === 0 ? (
        <EmptyState icon={VariableIcon} title="No variables yet" body={canEdit ? 'Create a variable for a reusable value such as a product name.' : 'A project Admin or Author can create variables.'}>
          {canEdit && <Button size="sm" onClick={onCreate} data-testid="button-empty-new-variable">New variable</Button>}
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={Search} title="No variables match" body="Try another name, key or value.">
          <Button size="sm" variant="outline" onClick={() => onQuery('')} data-testid="button-clear-variable-search">Clear search</Button>
        </EmptyState>
      ) : (
        <ul className="space-y-2" data-testid="list-variables">
          {items.map((v) => {
            const active = v.id === selectedId;
            return (
              <li key={v.id}>
                <button type="button" onClick={() => onSelect(v.id)} aria-current={active ? 'true' : undefined}
                  className={cn('w-full rounded-lg border bg-card px-3.5 py-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active && 'border-primary bg-primary text-primary-foreground ring-1 ring-primary [&_p]:text-primary-foreground')}
                  data-testid={`card-variable-${v.id}`}>
                  <p className="truncate text-[14px] font-medium">{v.name}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground"><BrandedText tone={active ? 'light' : 'auto'}>{v.value || <span className="italic">No default value</span>}</BrandedText></p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Pair({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-[13.5px]" data-testid={testId}><BrandedText>{children}</BrandedText></dd>
    </div>
  );
}

export function VariableDetails({ variable, canEdit, pending, onEdit, onRename, onDuplicate }: {
  variable: ProjectVariable; canEdit: boolean; pending: boolean; onEdit: () => void; onRename: () => void; onDuplicate: () => void;
}) {
  const disabled = !canEdit || pending;
  return (
    <section aria-label="Variable details" className="min-w-0 space-y-4" data-testid="panel-variable-details">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[20px] font-semibold" data-testid="text-variable-name">{variable.name}</h2>
          <code className="mt-1 inline-block break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px]" data-testid="text-variable-token">{`{{${variable.key}}}`}</code>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} disabled={disabled} data-testid="button-edit-variable">Edit variable</Button>
      </div>
      {variable.description && <p className="text-[13.5px] text-muted-foreground" data-testid="text-variable-description">{variable.description}</p>}
      <div className="rounded-lg border bg-card p-4">
        <dl className="grid grid-cols-2 gap-4">
          <Pair label="Type" testId="text-variable-type">Text</Pair>
          <Pair label="Scope" testId="text-variable-scope">Project</Pair>
          <Pair label="Default value" testId="text-variable-default">{variable.value || <span className="italic text-muted-foreground">Empty</span>}</Pair>
          <Pair label="Fallback" testId="text-variable-fallback">{variable.required ? 'Required' : 'Optional'}</Pair>
        </dl>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-[14px] font-semibold">Output-specific values</h3>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Override only when an output needs different wording.</p>
        <ul className="mt-3 divide-y">
          {variableOutputs.map((o) => {
            const ov = variable.outputValues[o.id];
            const has = !!ov?.trim();
            return (
              <li key={o.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-testid={`row-output-${o.id}`}>
                <span className="text-[13px] font-medium">{o.label}</span>
                <div className="min-w-0 break-words sm:text-right">
                  <p className="text-[13px]" data-testid={`text-output-value-${o.id}`}><BrandedText>{resolveVariable(variable, o.id) || <span className="italic text-muted-foreground">Empty</span>}</BrandedText></p>
                  {!has && <p className="text-[11.5px] text-muted-foreground">Uses default</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-[14px] font-semibold">Safe changes</h3>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Rename preserves saved references. Permanent deletion remains unavailable.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onRename} disabled={disabled} data-testid="button-rename-variable">Rename</Button>
          <Button variant="outline" size="sm" onClick={onDuplicate} disabled={disabled} data-testid="button-duplicate-variable">Duplicate</Button>
        </div>
      </div>
    </section>
  );
}

export function VariableRail({ variable, output, onOutput }: { variable: ProjectVariable; output: VariableOutputId; onOutput: (o: VariableOutputId) => void }) {
  return (
    <aside aria-label="Variable usage and preview" className="min-w-0 space-y-4" data-testid="panel-variable-rail">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold"><Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />Where used</h3>
        <div data-testid="text-where-used"><ReferenceUsage kind="variable" id={variable.id} /></div>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-[14px] font-semibold">Resolved preview</h3>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="preview-output" className="text-[12px] text-muted-foreground">Output profile</Label>
          <Select value={output} onValueChange={(v) => onOutput(v as VariableOutputId)}>
            <SelectTrigger id="preview-output" data-testid="select-preview-output"><SelectValue /></SelectTrigger>
            <SelectContent>{variableOutputs.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="mt-3 space-y-2 rounded-md bg-muted/50 p-3">
          <code className="block break-all font-mono text-[12px] text-muted-foreground" data-testid="text-preview-token">{`{{${variable.key}}}`}</code>
          <p className="break-words text-[13.5px]" data-testid="text-preview-resolved"><BrandedText>{resolveVariable(variable, output) || <span className="italic text-muted-foreground">Empty</span>}</BrandedText></p>
        </div>
      </div>
    </aside>
  );
}

export function DetailsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-7 w-1/2" /><Skeleton className="h-5 w-32" /><Skeleton className="h-32 w-full" /><Skeleton className="h-40 w-full" />
    </div>
  );
}
