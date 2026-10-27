import { useMemo, useState } from 'react';
import { useConditionCategories, useConditionMutation, useConditionValues, type ConditionMutation } from '@/hooks/use-project-conditions';
import { sortCategories, sortConditionValues, type ConditionCategory, type ConditionValue } from '@/domain/project-conditions';
import { CategoryDetails, CategoryList, ConditionDetailsSkeleton, ConditionRail } from './condition-panels';
import { CategoryFormDialog, ConditionRenameDialog, ValueFormDialog } from './condition-dialogs';

type Dialog = null
  | { kind: 'createCategory' } | { kind: 'editCategory'; category: ConditionCategory } | { kind: 'renameCategory'; category: ConditionCategory }
  | { kind: 'createValue'; category: ConditionCategory; nextOrder: number } | { kind: 'editValue'; category: ConditionCategory; value: ConditionValue }
  | { kind: 'renameValue'; category: ConditionCategory; value: ConditionValue };

const matches = (c: ConditionCategory, q: string) => [c.name, c.key].some((s) => s.toLowerCase().includes(q));

export function ConditionsTab({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const cats = useConditionCategories(projectId);
  const mutation = useConditionMutation(projectId, canEdit);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const all = useMemo(() => (cats.isError ? [] : sortCategories(cats.data ?? [])), [cats.data, cats.isError]);
  const list = useMemo(() => { const q = query.trim().toLowerCase(); return q ? all.filter((c) => matches(c, q)) : all; }, [all, query]);
  const selected = cats.isError ? null : list.find((c) => c.id === selectedId) ?? list[0] ?? null;
  const vals = useConditionValues(projectId, selected?.id ?? null);
  const values = useMemo(() => (vals.isError ? [] : sortConditionValues(vals.data ?? [])), [vals.data, vals.isError]);
  const pending = mutation.isPending;

  const open = (d: Dialog) => { mutation.reset(); setDialog(d); };
  const close = () => { if (!pending) setDialog(null); };
  const run = async (op: ConditionMutation) => {
    try {
      const saved = await mutation.mutateAsync(op);
      if (op.action === 'createCategory' || op.action === 'updateCategory' || op.action === 'renameCategory') {
        const c = saved as ConditionCategory;
        setSelectedId(c.id);
        const q = query.trim().toLowerCase();
        if (q && !matches(c, q)) setQuery('');
      }
      setDialog(null);
    } catch { /* error shown in dialog; form and target snapshot preserved */ }
  };
  const selectCategory = (id: string) => { setSelectedId(id); };
  const nextOrder = values.length ? Math.min(2147483647, values.reduce((max, v) => Math.max(max, v.sortOrder), 0) + 10) : 0;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,.85fr)]" data-testid="panel-conditions">
        <CategoryList items={list} total={all.length} query={query} onQuery={setQuery} selectedId={selected?.id ?? null} onSelect={selectCategory}
          loading={cats.isLoading} error={cats.isError ? cats.error : null} onRetry={() => cats.refetch()} canEdit={canEdit} pending={pending}
          onCreate={() => open({ kind: 'createCategory' })} />
        {cats.isLoading ? <><ConditionDetailsSkeleton /><ConditionDetailsSkeleton /></> : selected ? <>
          <CategoryDetails key={selected.id} category={selected} canEdit={canEdit} pending={pending}
            values={{ items: values, loading: vals.isLoading, error: vals.isError ? vals.error : null, onRetry: () => vals.refetch() }}
            onEdit={() => open({ kind: 'editCategory', category: selected })}
            onRename={() => open({ kind: 'renameCategory', category: selected })}
            onAddValue={() => open({ kind: 'createValue', category: selected, nextOrder })}
            onEditValue={(v) => open({ kind: 'editValue', category: selected, value: v })}
            onRenameValue={(v) => open({ kind: 'renameValue', category: selected, value: v })} />
          <ConditionRail category={selected} />
        </> : null}
      </div>

      <CategoryFormDialog open={dialog?.kind === 'createCategory' || dialog?.kind === 'editCategory'}
        mode={dialog?.kind === 'editCategory' ? 'edit' : 'create'} category={dialog?.kind === 'editCategory' ? dialog.category : undefined}
        pending={pending} error={mutation.error} onClose={close}
        onSubmit={(r) => {
          if (r.mode === 'create') return void run({ action: 'createCategory', input: r.input });
          if (dialog?.kind === 'editCategory') void run({ action: 'updateCategory', categoryId: dialog.category.id, input: r.input });
        }} />
      <ConditionRenameDialog open={dialog?.kind === 'renameCategory' || dialog?.kind === 'renameValue'}
        kind={dialog?.kind === 'renameValue' ? 'value' : 'category'}
        targetId={dialog?.kind === 'renameValue' ? dialog.value.id : dialog?.kind === 'renameCategory' ? dialog.category.id : ''}
        currentName={dialog?.kind === 'renameValue' ? dialog.value.name : dialog?.kind === 'renameCategory' ? dialog.category.name : ''}
        currentKey={dialog?.kind === 'renameValue' ? dialog.value.key : dialog?.kind === 'renameCategory' ? dialog.category.key : ''}
        pending={pending} error={mutation.error} onClose={close}
        onSubmit={(input) => {
          if (dialog?.kind === 'renameCategory') void run({ action: 'renameCategory', categoryId: dialog.category.id, input });
          else if (dialog?.kind === 'renameValue') void run({ action: 'renameValue', categoryId: dialog.category.id, valueId: dialog.value.id, input });
        }} />
      <ValueFormDialog open={dialog?.kind === 'createValue' || dialog?.kind === 'editValue'}
        mode={dialog?.kind === 'editValue' ? 'edit' : 'create'} value={dialog?.kind === 'editValue' ? dialog.value : undefined}
        suggestedOrder={dialog?.kind === 'createValue' ? dialog.nextOrder : 0}
        pending={pending} error={mutation.error} onClose={close}
        onSubmit={(r) => {
          if (r.mode === 'create' && dialog?.kind === 'createValue') void run({ action: 'createValue', categoryId: dialog.category.id, input: r.input });
          else if (r.mode === 'edit' && dialog?.kind === 'editValue') void run({ action: 'updateValue', categoryId: dialog.category.id, valueId: dialog.value.id, input: r.input });
        }} />
    </>
  );
}
