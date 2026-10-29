import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';
import { readSemanticCatalog } from '@/services/reference-reads';
import { changeCondition, conditionAssignments, conditionedNodes, type SemanticContext, type SemanticCatalog } from '@/domain/semantic-references';

export function SemanticTools({ editor, context, editable, onCatalog }: {
  editor: Editor; context: SemanticContext; editable: boolean; onCatalog: (catalog?: SemanticCatalog) => void;
}) {
  const services = useServices();
  const query = useQuery({ queryKey: ['semantic-catalog', context.workspaceId, context.projectId],
    queryFn: () => readSemanticCatalog(services, context), staleTime: 0, retry: false,
    refetchOnWindowFocus: true, refetchOnMount: 'always' });
  const [variable, setVariable] = useState('');
  const [reusable, setReusable] = useState('');
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const [, rerender] = useState(0);
  useEffect(() => { const update = () => rerender(n => n + 1); editor.on('selectionUpdate', update); editor.on('transaction', update);
    return () => { editor.off('selectionUpdate', update); editor.off('transaction', update); }; }, [editor]);
  useEffect(() => { onCatalog(query.isError ? undefined : query.data); }, [query.data, query.isError, onCatalog]);
  const catalog = query.isError ? undefined : query.data;
  const run = (action: () => boolean) => {
    if (!editable || !editor.isEditable || !catalog) return;
    try { setMessage(action() ? '' : 'Choose a supported insertion point or text block and try again.'); }
    catch { setMessage('The reference could not be applied safely. Your content has not been replaced.'); }
  };
  const target = () => {
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if ((conditionedNodes as readonly string[]).includes(node.type.name)) return { node, pos: $from.before(depth) };
    }
    return null;
  };
  const selected = catalog?.values.find(v => v.id === value);
  const current = target();
  const assignments = conditionAssignments.safeParse(current?.node.attrs.conditions ?? []);
  const assigned = !!selected && assignments.success && assignments.data.some(a => a.categoryId === selected.categoryId && a.valueIds.includes(selected.id));
  const condition = (remove: boolean) => run(() => {
    const block = target();
    if (!block || !selected) return false;
    const conditions = changeCondition(block.node.attrs.conditions, selected.categoryId, selected.id, remove);
    editor.view.dispatch(editor.state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, conditions: conditions.length ? conditions : null }));
    editor.view.focus(); return true;
  });
  return <section aria-label="Semantic references" className="my-3 space-y-2 rounded-md border bg-card p-3 text-xs">
    <p className="font-semibold">Semantic references</p>
    <p className="text-muted-foreground">Values resolve for Web Help. Linked content previews the current saved draft; it is not copied into this topic.</p>
    {query.isPending && <p role="status">Loading reference definitions…</p>}
    {query.isError && <div role="alert">Reference definitions are unavailable. <button className="se-btn" onClick={() => void query.refetch()}>Retry references</button></div>}
    {editable ? <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0">Variable
        <select aria-label="Variable reference" className="block max-w-full rounded border bg-background p-1.5" value={variable} onChange={e => setVariable(e.target.value)}>
          <option value="">Choose a variable</option>{catalog?.variables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      <button type="button" className="se-btn" disabled={!catalog?.variables.some(v => v.id === variable)} onClick={() => run(() =>
        editor.chain().focus().insertContent({ type: 'variableReference', attrs: { refVersion: 1, targetId: variable } }).run())}>Insert variable</button>
      <label className="min-w-0">Reusable content
        <select aria-label="Reusable content reference" className="block max-w-full rounded border bg-background p-1.5" value={reusable} onChange={e => setReusable(e.target.value)}>
          <option value="">Choose reusable content</option>{catalog?.reusable.map(r => <option key={r.item.id} value={r.item.id}>{r.item.name}</option>)}
        </select>
      </label>
      <button type="button" className="se-btn" disabled={!catalog?.reusable.some(r => r.item.id === reusable && r.draft)} onClick={() => run(() =>
        editor.chain().focus().insertContent({ type: 'reusableReference', attrs: { refVersion: 1, targetId: reusable } }).run())}>Insert linked content</button>
      <label className="min-w-0">Condition value
        <select aria-label="Condition value reference" className="block max-w-full rounded border bg-background p-1.5" value={value} onChange={e => setValue(e.target.value)}>
          <option value="">Choose a condition value</option>{catalog?.values.map(v => <option key={v.id} value={v.id}>{catalog.categories.find(c => c.id === v.categoryId)?.name}: {v.name}</option>)}
        </select>
      </label>
      <button type="button" className="se-btn" disabled={!selected || !current || assigned} onClick={() => condition(false)}>Apply condition</button>
      <button type="button" className="se-btn" disabled={!assigned} onClick={() => condition(true)}>Remove condition</button>
    </div> : <p>Read-only reference inspection. No insertion or assignment controls are available.</p>}
    {!query.isPending && !query.isError && !catalog?.variables.length && !catalog?.categories.length && !catalog?.reusable.length && <p>No reference definitions in this project yet.</p>}
    <p className="text-muted-foreground">Conditions apply to the current supported block. No tags means Include; same-category values are OR, categories combine with AND. Output filtering is not applied here.</p>
    {current && current.node.attrs.conditions?.length > 0 && <p>Current block has {current.node.attrs.conditions.length} conditional category assignment(s).</p>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
