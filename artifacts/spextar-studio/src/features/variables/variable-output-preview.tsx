import { useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldCheck, Variable as VariableIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useServices } from '@/providers/services-provider';
import { useProjectVariables } from '@/hooks/use-project-variables';
import { resolveVariable, variableOutputs, type ProjectVariable, type VariableOutputId } from '@/domain/project-variables';

function OverrideText({ variable, output }: { variable: ProjectVariable; output: VariableOutputId }) {
  const ov = variable.outputValues[output];
  if (ov === undefined) return <span className="italic text-muted-foreground">Not set</span>;
  if (!ov.trim()) return <span className="italic text-muted-foreground">{ov === '' ? 'Set but empty' : 'Set but blank (whitespace only)'}</span>;
  return <>{ov}</>;
}

function PreviewCard({ variable, output }: { variable: ProjectVariable; output: VariableOutputId }) {
  const ov = variable.outputValues[output];
  const fromOverride = !!ov?.trim();
  const resolved = resolveVariable(variable, output);
  const missingRequired = variable.required && !variable.value.trim();
  const id = variable.id;
  return (
    <li className="min-w-0 rounded-lg border bg-card p-4" data-testid={`card-preview-variable-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[14px] font-medium" data-testid={`text-preview-name-${id}`}>{variable.name}</p>
          <code className="mt-1 inline-block break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]" data-testid={`text-preview-token-${id}`}>{`{{${variable.key}}}`}</code>
        </div>
        <span className={cn('rounded-full border px-2 py-0.5 text-[11.5px]', fromOverride ? 'border-primary/40 bg-accent text-accent-foreground' : 'text-muted-foreground')}
          data-testid={`status-preview-source-${id}`}>{fromOverride ? 'Output override' : 'Default value'}</span>
      </div>
      <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[12px] text-muted-foreground">Default</dt>
          <dd className="mt-0.5 break-words" data-testid={`text-preview-default-${id}`}>{variable.value || <span className="italic text-muted-foreground">Empty</span>}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[12px] text-muted-foreground">Override for this output</dt>
          <dd className="mt-0.5 break-words" data-testid={`text-preview-override-${id}`}><OverrideText variable={variable} output={output} /></dd>
        </div>
      </dl>
      <div className="mt-3 rounded-md bg-muted/50 p-3">
        <p className="text-[12px] text-muted-foreground">Resolved value</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px]" data-testid={`text-preview-resolved-${id}`}>{resolved || <span className="italic text-muted-foreground">Empty</span>}</p>
      </div>
      {missingRequired && <p className="mt-2 text-[12.5px] text-destructive" data-testid={`text-preview-missing-required-${id}`}>Required variable is missing a default value.</p>}
    </li>
  );
}

export function VariableOutputPreview({ projectId }: { projectId: string }) {
  const { variables } = useServices();
  const vars = useProjectVariables(projectId);
  const validation = useQuery({
    queryKey: ['variables-output-preview-validation', projectId, vars.dataUpdatedAt, vars.errorUpdatedAt],
    queryFn: () => variables.validate(projectId), enabled: !!projectId && vars.isFetched, retry: false, staleTime: 0,
  });
  const [output, setOutput] = useState<VariableOutputId>('web-help');
  const [query, setQuery] = useState('');
  const selectId = useId();
  const searchId = useId();

  const all = useMemo(() => (vars.isError ? [] : vars.data ?? []), [vars.data, vars.isError]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((v) => [v.name, v.key, v.value].some((s) => s.toLowerCase().includes(q))) : all;
  }, [all, query]);
  const missingDefaults = all.filter((v) => v.required && !v.value.trim());

  return (
    <section aria-labelledby="output-preview-heading" className="space-y-5" data-testid="panel-output-preview">
      <div>
        <h2 id="output-preview-heading" className="text-[15px] font-semibold">Text variable output preview</h2>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground" data-testid="text-preview-scope">
          Read-only. Shows each variable value per output only. Conditional tags, references, topic rendering, generation and publishing are not included.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-[720px]">
        <div className="space-y-1.5">
          <Label htmlFor={selectId} className="text-[12.5px] text-muted-foreground">Output</Label>
          <select id={selectId} value={output} onChange={(e) => setOutput(e.target.value as VariableOutputId)} data-testid="select-output-preview"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {variableOutputs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={searchId} className="text-[12.5px] text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, key or value" className="pl-9" data-testid="input-search-output-preview" />
          </div>
        </div>
      </div>

      <div data-testid="panel-output-preview-validation">
        {vars.isLoading || validation.isLoading ? <Skeleton className="h-14 w-full" data-testid="status-preview-validation-loading" />
          : validation.isError ? <ErrorState error={validation.error} onRetry={() => validation.refetch()} title="Validation did not complete" />
          : validation.data ? (
            <div role="status" data-testid="text-preview-validation"
              className={cn('rounded-md border px-3 py-2 text-[13px]', validation.data.issues.length === 0 ? 'border-primary/30 bg-accent text-accent-foreground' : 'border-destructive/40 bg-destructive/10 text-destructive')}>
              <p className="flex items-center gap-1.5 font-medium"><ShieldCheck className="h-4 w-4" aria-hidden />
                {validation.data.issues.length === 0 ? `Variables valid: ${validation.data.variableCount} checked, no issues.`
                  : `${validation.data.issues.length} issue${validation.data.issues.length === 1 ? '' : 's'} in ${validation.data.variableCount} variables.`}</p>
              <p className="text-[12px] opacity-80">Checks variable definitions only. References are not validated.</p>
              {validation.data.issues.length > 0 && <ul className="mt-1 list-disc pl-4">{validation.data.issues.map((i, n) => <li key={n} data-testid={`text-preview-validation-issue-${n}`}>{i.message}</li>)}</ul>}
            </div>
          ) : null}
        {!vars.isError && missingDefaults.length > 0 && (
          <p className="mt-2 text-[12.5px] text-destructive" data-testid="text-preview-missing-defaults">
            {missingDefaults.length} required variable{missingDefaults.length === 1 ? ' is' : 's are'} missing a default: {missingDefaults.map((v) => v.name).join(', ')}.
          </p>
        )}
      </div>

      <div data-testid="panel-output-preview-list">
        {vars.isLoading ? <ListSkeleton rows={4} />
          : vars.isError ? <ErrorState error={vars.error} onRetry={() => vars.refetch()} title="Variables did not load" />
          : all.length === 0 ? <EmptyState icon={VariableIcon} title="No variables yet" body="There are no Text variables in this project to preview." />
          : list.length === 0 ? (
            <EmptyState icon={Search} title="No variables match" body="Try another name, key or value.">
              <Button size="sm" variant="outline" onClick={() => setQuery('')} data-testid="button-clear-output-preview-search">Clear search</Button>
            </EmptyState>
          ) : (
            <>
              <p className="mb-2 text-[12.5px] text-muted-foreground" data-testid="text-preview-count">{list.length} of {all.length} variables</p>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="list-output-preview">
                {list.map((v) => <PreviewCard key={v.id} variable={v} output={output} />)}
              </ul>
            </>
          )}
      </div>
    </section>
  );
}
