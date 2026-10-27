import { useMemo, useState } from 'react';
import { useParams } from 'wouter';
import { Plus, ShieldCheck } from 'lucide-react';
import { ProjectScope, PageHeader } from '@/features/project/project-scope';
import { ScopeMarker } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useServices } from '@/providers/services-provider';
import { useProjectVariables, useVariableMutation, useValidateVariables, type VariableMutation } from '@/hooks/use-project-variables';
import type { ProjectSummary } from '@/domain/types';
import type { ProjectVariable, VariableOutputId } from '@/domain/project-variables';
import { DetailsSkeleton, VariableDetails, VariableList, VariableRail } from '@/features/variables/variable-panels';
import { VariableOutputPreview } from '@/features/variables/variable-output-preview';
import { ConditionsTab } from '@/features/conditions/conditions-tab';
import { IdentityDialog, MutationError, VariableFormDialog } from '@/features/variables/variable-dialogs';

type DialogState = null | 'create' | 'edit' | 'rename' | 'duplicate';

function ValidationSummary({ validate }: { validate: ReturnType<typeof useValidateVariables> }) {
  if (validate.isError) return <div className="mt-4"><MutationError error={validate.error} /></div>;
  const r = validate.data;
  if (!r) return null;
  const ok = r.issues.length === 0;
  return (
    <div role="status" className={`mt-4 rounded-md border px-3 py-2 text-[13px] ${ok ? 'border-primary/30 bg-accent text-accent-foreground' : 'border-destructive/40 bg-destructive/10 text-destructive'}`} data-testid="text-validation-summary">
      <p className="font-medium">{ok ? `Variables valid: ${r.variableCount} checked, no issues.` : `${r.issues.length} issue${r.issues.length === 1 ? '' : 's'} in ${r.variableCount} variables.`}</p>
      <p className="text-[12px] opacity-80">Checks variable definitions only. References are not validated.</p>
      {!ok && <ul className="mt-1 list-disc pl-4">{r.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
    </div>
  );
}

function VariablesBody({ project }: { project: ProjectSummary }) {
  const backend = useServices().mode === 'backend';
  const canEdit = project.canEditContent === true;
  const vars = useProjectVariables(project.id);
  const mutation = useVariableMutation(project.id, canEdit);
  const validate = useValidateVariables(project.id);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogTarget, setDialogTarget] = useState<ProjectVariable | null>(null);
  const [output, setOutput] = useState<VariableOutputId>('web-help');
  const [tab, setTab] = useState('variables');
  const onVars = tab === 'variables';

  const all = useMemo(() => vars.data ?? [], [vars.data]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((v) => [v.name, v.key, v.value].some((s) => s.toLowerCase().includes(q))) : all;
  }, [all, query]);
  const selected = vars.isError ? null : list.find((v) => v.id === selectedId) ?? list[0] ?? null;
  const pending = mutation.isPending || validate.isPending;

  const open = (d: DialogState) => {
    if (d !== 'create' && !selected) return;
    mutation.reset(); setDialogTarget(d === 'create' ? null : selected); setDialog(d);
  };
  const run = async (op: VariableMutation) => {
    try {
      const saved = await mutation.mutateAsync(op);
      validate.reset();
      setSelectedId(saved.id);
      const q = query.trim().toLowerCase();
      if (q && ![saved.name, saved.key, saved.value].some((s) => s.toLowerCase().includes(q))) setQuery('');
      setDialog(null);
    } catch { /* error shown in dialog; fields preserved */ }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-10 md:py-10">
      <PageHeader
        eyebrow={<ScopeMarker kind={backend ? 'connected' : 'demo'}>{onVars ? (backend ? canEdit ? 'Live variables' : 'Live variables · read-only access' : 'Demo · variable edits last for this session only')
          : tab === 'conditions' ? (backend ? canEdit ? 'Live conditional tags' : 'Live conditional tags · read-only access' : 'Demo · condition edits last for this session only')
          : (backend ? 'Live output preview · read-only' : 'Demo output preview · read-only')}</ScopeMarker>}
        title="Variables & Conditions"
        description="Manage reusable values and conditional content for this project."
        actions={onVars ? <>
          <Button variant="outline" onClick={() => validate.mutate()} disabled={pending} data-testid="button-validate-project">
            <ShieldCheck className="mr-1.5 h-4 w-4" />{validate.isPending ? 'Validating…' : 'Validate project'}
          </Button>
          <Button onClick={() => open('create')} disabled={!canEdit || pending} data-testid="button-new-variable"><Plus className="mr-1.5 h-4 w-4" />New variable</Button>
        </> : undefined}
      />
      {!canEdit && tab !== 'preview' && <p className="mt-3 text-[12.5px] text-muted-foreground" data-testid="text-readonly-note">Read-only. Only explicit project Admins and Authors can change {onVars ? 'variables' : 'conditional tags'}.</p>}
      {onVars && <ValidationSummary validate={validate} />}

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b bg-transparent p-0">
          {[['variables', 'Variables'], ['conditions', 'Conditional tags'], ['preview', 'Output preview']].map(([v, l]) => (
            <TabsTrigger key={v} value={v} data-testid={`tab-${v}`}
              className="relative rounded-none bg-transparent px-0 pb-2.5 pt-1 text-[14px] text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:h-0.5 data-[state=active]:after:w-6 data-[state=active]:after:rounded-full data-[state=active]:after:bg-primary">
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="variables" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,.85fr)]">
            <VariableList items={list} total={all.length} query={query} onQuery={setQuery} selectedId={selected?.id ?? null} onSelect={setSelectedId}
              loading={vars.isLoading} error={vars.isError ? vars.error : null} onRetry={() => vars.refetch()} canEdit={canEdit} onCreate={() => open('create')} />
            {vars.isLoading ? <><DetailsSkeleton /><DetailsSkeleton /></> : selected ? <>
              <VariableDetails variable={selected} canEdit={canEdit} pending={pending} onEdit={() => open('edit')} onRename={() => open('rename')} onDuplicate={() => open('duplicate')} />
              <VariableRail variable={selected} output={output} onOutput={setOutput} />
            </> : null}
          </div>
        </TabsContent>
        <TabsContent value="conditions" className="mt-6">
          <ConditionsTab projectId={project.id} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="preview" className="mt-6">
          <VariableOutputPreview projectId={project.id} />
        </TabsContent>
      </Tabs>

      <VariableFormDialog open={dialog === 'create' || dialog === 'edit'} mode={dialog === 'edit' ? 'edit' : 'create'}
        variable={dialog === 'edit' ? dialogTarget ?? undefined : undefined} pending={pending} error={mutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(input) => {
          if (dialog === 'edit') { if (dialogTarget) return run({ action: 'update', id: dialogTarget.id, input }); return; }
          return run({ action: 'create', input });
        }} />
      <IdentityDialog open={dialog === 'rename' || dialog === 'duplicate'} mode={dialog === 'duplicate' ? 'duplicate' : 'rename'}
        variable={dialogTarget ?? undefined} existingKeys={all.map((v) => v.key)} pending={pending} error={mutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(input) => dialogTarget && run({ action: dialog === 'duplicate' ? 'duplicate' : 'rename', id: dialogTarget.id, input })} />
    </div>
  );
}

export default function VariablesConditionsPage() {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  return (
    <ProjectScope workspaceId={workspaceId} projectId={projectId} title="Variables & Conditions" trail={[{ label: 'Variables & Conditions' }]}>
      {({ project }) => <VariablesBody key={project.id} project={project} />}
    </ProjectScope>
  );
}
