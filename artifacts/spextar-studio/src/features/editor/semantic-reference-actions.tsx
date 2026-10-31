import { useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useReferenceCatalog, ConditionLabels } from './semantic-reference-preview';
import { jsonObject, conditionAssignableNodes, type ConditionPair } from '@/domain/semantic-references';
import { contentText, type JSONValue, type TopicContent } from '@/domain/topic-content';

type Action = 'variable' | 'condition' | 'reusable';
interface Frozen {
  kind: Action;
  from: number;
  to: number;
  doc: ProseNode;
  block: { pos: number; node: ProseNode } | null;
}
function currentBlock(editor: Editor) {
  const { $from, $to } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (conditionAssignableNodes.includes(node.type.name) && $to.pos <= $from.end(depth))
      return { pos: $from.before(depth), node };
  }
  const node = editor.state.doc.nodeAt(editor.state.selection.from);
  return node && conditionAssignableNodes.includes(node.type.name) ? { pos: editor.state.selection.from, node } : null;
}
export function SemanticActions({
  editor,
  enabled,
  content,
}: {
  editor: Editor;
  enabled: boolean;
  content: TopicContent;
}) {
  const catalog = useReferenceCatalog();
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const selection = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      inline:
        e.state.selection.$from.sameParent(e.state.selection.$to) &&
        e.state.selection.$from.parent.inlineContent &&
        e.state.selection.$from.parent.type.name !== 'codeBlock',
      block: !!currentBlock(e),
    }),
  });
  if (!catalog) return null;
  const open = (kind: Action) => {
    if (!enabled || !editor.isEditable) return;
    const { from, to } = editor.state.selection;
    setFrozen({ kind, from, to, doc: editor.state.doc, block: currentBlock(editor) });
    setSelected('');
    setError('');
  };
  const close = () => {
    setFrozen(null);
    editor.view.dom.focus();
    editor.view.focus();
  };
  const perform = (pairToRemove?: ConditionPair) => {
    if (!frozen || !enabled || !editor.isEditable || !editor.state.doc.eq(frozen.doc)) {
      setError('The body changed or editing is unavailable. Close and choose the position again.');
      return;
    }
    if (catalog.loading || catalog.error) {
      setError('Definitions must load before changing references.');
      return;
    }
    let ok = false;
    if (frozen.kind === 'condition' && frozen.block) {
      const node = editor.state.doc.nodeAt(frozen.block.pos);
      if (!node || node !== frozen.block.node) {
        setError('The selected block changed. Close and select it again.');
        return;
      }
      const pairs = (node.attrs.conditions?.values ?? []) as ConditionPair[];
      const value = catalog.values.find((v) => v.id === selected);
      const next = pairToRemove
        ? pairs.filter((p) => p.categoryId !== pairToRemove.categoryId || p.valueId !== pairToRemove.valueId)
        : value
          ? [
              ...pairs.filter((p) => p.valueId !== value.id || p.categoryId !== value.categoryId),
              { categoryId: value.categoryId, valueId: value.id },
            ]
          : null;
      if (!next) {
        setError('Choose a conditional value.');
        return;
      }
      if (next.length > 100) {
        setError('A block can have at most 100 conditional values. Remove a tag before adding another.');
        return;
      }
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(frozen.block.pos, undefined, {
          ...node.attrs,
          conditions: next.length ? { version: 1, values: next } : null,
        }),
      );
      ok = true;
    } else {
      const available =
        frozen.kind === 'variable'
          ? catalog.variables.some((v) => v.id === selected)
          : catalog.reusable.some((v) => v.id === selected);
      if (!available) {
        setError('Choose an available definition.');
        return;
      }
      const attrs = {
        id: crypto.randomUUID(),
        referenceVersion: 1,
        [frozen.kind === 'variable' ? 'variableId' : 'reusableId']: selected,
      };
      try {
        ok = editor
          .chain()
          .focus()
          .insertContentAt(
            { from: frozen.from, to: frozen.to },
            { type: frozen.kind === 'variable' ? 'variableReference' : 'reusableReference', attrs },
          )
          .run();
      } catch {
        ok = false;
      }
    }
    if (ok) close();
    else setError('This reference cannot be inserted at this position. Choose a paragraph or a block boundary.');
  };
  const taggedBlocks: Array<{ label: string; pairs: ConditionPair[] }> = [];
  const visit = (node: JSONValue) => {
    if (!jsonObject(node)) return;
    const assignments = jsonObject(node.attrs) && jsonObject(node.attrs.conditions) ? node.attrs.conditions : null;
    if (assignments?.version === 1 && Array.isArray(assignments.values) && assignments.values.length)
      taggedBlocks.push({
        label:
          contentText({ type: 'doc', content: [node] })
            .trim()
            .slice(0, 80) || (node.type === 'reusableReference' ? 'Linked reusable content' : 'Block without text'),
        pairs: assignments.values as unknown as ConditionPair[],
      });
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  if (Array.isArray(content.content)) content.content.forEach(visit);
  const options =
    frozen?.kind === 'variable'
      ? catalog.variables.map((v) => ({ id: v.id, label: v.name }))
      : frozen?.kind === 'reusable'
        ? catalog.reusable.map((v) => ({ id: v.id, label: `${v.name} (${v.scope})` }))
        : catalog.values.map((v) => ({
            id: v.id,
            label: `${catalog.categories.find((c) => c.id === v.categoryId)?.name ?? 'Category'}: ${v.name}`,
          }));
  const pairs = (frozen?.block?.node.attrs.conditions?.values ?? []) as ConditionPair[];
  return (
    <div className="space-y-2">
      <div role="group" aria-label="References" className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!enabled || !selection.inline}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => open('variable')}
        >
          Insert variable
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!enabled || !selection.block}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => open('condition')}
        >
          Conditional tags
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!enabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => open('reusable')}
        >
          Insert reusable content
        </Button>
      </div>
      {catalog.error && (
        <div role="alert" className="text-sm text-destructive">
          Reference definitions could not load.{' '}
          <Button size="sm" variant="outline" onClick={catalog.retry}>
            Retry reference definitions
          </Button>
        </div>
      )}
      {taggedBlocks.length > 0 && (
        <div role="group" aria-label="Applied conditional tags" className="rounded-md border bg-muted/30 p-2">
          <p className="mb-1 text-xs text-muted-foreground">
            Conditional tags on this body · neutral preview, content remains visible
          </p>
          <ul className="space-y-2">
            {taggedBlocks.map((block, i) => (
              <li key={i}>
                <p className="mb-1 text-xs text-muted-foreground">
                  Block {i + 1}: {block.label}
                </p>
                <ConditionLabels pairs={block.pairs} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {frozen && (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) close();
          }}
        >
          <DialogContent onCloseAutoFocus={(e) => e.preventDefault()} className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {frozen.kind === 'variable'
                  ? 'Insert variable'
                  : frozen.kind === 'reusable'
                    ? 'Insert reusable content'
                    : 'Conditional tags'}
              </DialogTitle>
              <DialogDescription>
                {frozen.kind === 'condition'
                  ? 'Apply or remove values on the current block. This preview keeps tagged content visible.'
                  : frozen.kind === 'reusable'
                    ? 'Insert a link to the current saved reusable draft. The preview follows saved edits; notification and snapshot policies are not applied.'
                    : 'Insert a reference at your selection. The default value is shown in the body.'}
              </DialogDescription>
            </DialogHeader>
            {catalog.loading ? (
              <p role="status">Loading definitions…</p>
            ) : catalog.error ? (
              <div role="alert">
                <p>Definitions could not load.</p>
                <Button variant="outline" onClick={catalog.retry}>
                  Retry definitions
                </Button>
              </div>
            ) : options.length ? (
              <div className="space-y-2">
                <label htmlFor="semantic-definition" className="text-sm">
                  {frozen.kind === 'condition'
                    ? 'Conditional value'
                    : frozen.kind === 'variable'
                      ? 'Variable'
                      : 'Reusable content'}
                </label>
                <select
                  id="semantic-definition"
                  autoFocus
                  className="w-full min-w-0 rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Choose a definition</option>
                  {options.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p>
                No{' '}
                {frozen.kind === 'condition'
                  ? 'conditional values'
                  : frozen.kind === 'variable'
                    ? 'variables'
                    : 'reusable content'}{' '}
                available. Add definitions in project management first.
              </p>
            )}
            {frozen.kind === 'condition' && pairs.length > 0 && (
              <ul className="space-y-2" aria-label="Current block tags">
                {pairs.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <ConditionLabels pairs={[p]} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!enabled || catalog.loading || catalog.error}
                      onClick={() => perform(p)}
                    >
                      Remove tag
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button disabled={!enabled || !selected || catalog.loading || catalog.error} onClick={() => perform()}>
                {frozen.kind === 'condition' ? 'Apply tag' : 'Insert reference'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
