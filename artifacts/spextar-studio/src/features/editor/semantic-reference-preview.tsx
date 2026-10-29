import { createContext, useContext, type ReactNode } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';
import type { Services } from '@/services/contracts';
import type { ReferenceScope, ConditionPair } from '@/domain/semantic-references';
import { jsonObject } from '@/domain/semantic-references';
import type { JSONValue, TopicContent } from '@/domain/topic-content';
import { calloutLabels, type CalloutKind, structuredContentIssue, validLink } from '@/domain/structured-content';
import { qk } from '@/hooks/use-studio-data';
import { reusableKeys } from '@/hooks/use-reusable-content';
import type { ProjectVariable, VariableOutputId } from '@/domain/project-variables';
import { resolveVariable } from '@/domain/project-variables';
import type { ConditionCategory, ConditionValue } from '@/domain/project-conditions';
import type { ReusableItem } from '@/domain/reusable-content';
import { BrandedText } from '@/components/brand/logo';

export interface ReferenceCatalog {
  scope: ReferenceScope;
  services: Services;
  variables: ProjectVariable[];
  categories: ConditionCategory[];
  values: ConditionValue[];
  reusable: ReusableItem[];
  loading: boolean;
  error: boolean;
  retry: () => void;
}
const Context = createContext<ReferenceCatalog | null>(null);
export const useReferenceCatalog = () => useContext(Context);
export function ReferenceProvider({ scope, children }: { scope: ReferenceScope; children: ReactNode }) {
  const services = useServices();
  const variables = useQuery({
    queryKey: qk.variables(scope.projectId),
    queryFn: () => services.variables.list(scope.projectId),
    retry: false,
  });
  const categories = useQuery({
    queryKey: qk.conditionCategories(scope.projectId),
    queryFn: () => services.conditions.listCategories(scope.projectId),
    retry: false,
  });
  const reusable = useQuery({
    queryKey: reusableKeys.list(scope),
    queryFn: () => services.reusable.list(scope),
    retry: false,
  });
  const values = useQueries({
    queries: (categories.data ?? []).map((c) => ({
      queryKey: qk.conditionValues(scope.projectId, c.id),
      queryFn: () => services.conditions.listValues(scope.projectId, c.id),
      retry: false,
    })),
  });
  const all = [variables, categories, reusable, ...values];
  return (
    <Context.Provider
      value={{
        scope,
        services,
        variables: variables.data ?? [],
        categories: categories.data ?? [],
        values: values.flatMap((v) => v.data ?? []),
        reusable: reusable.data ?? [],
        loading: all.some((q) => q.isLoading),
        error: all.some((q) => q.isError),
        retry: () => {
          all.forEach((q) => {
            void q.refetch();
          });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function VariableValue({ id, output }: { id: string; output?: VariableOutputId }) {
  const catalog = useReferenceCatalog();
  if (catalog?.loading) return <>Loading variable…</>;
  if (!catalog || catalog.error) return <span className="text-destructive">Variable unavailable</span>;
  const variable = catalog.variables.find((v) => v.id === id);
  return variable ? (
    <span title={`Variable: ${variable.name}`}>
      <BrandedText>
        {(output ? resolveVariable(variable, output) : variable.value) ||
          (variable.required ? 'Required variable is empty' : 'Empty variable')}
      </BrandedText>
    </span>
  ) : (
    <span className="text-destructive">Missing variable</span>
  );
}
export function VariableNode({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper
      as="span"
      className="se-variable-reference"
      contentEditable={false}
      data-semantic-reference="variable"
    >
      <VariableValue id={node.attrs.variableId as string} />
    </NodeViewWrapper>
  );
}
export function ConditionLabels({ pairs }: { pairs: ConditionPair[] }) {
  const c = useReferenceCatalog();
  return (
    <>
      {pairs.map((p, i) => {
        const category = c?.categories.find((v) => v.id === p.categoryId);
        const value = c?.values.find((v) => v.id === p.valueId && v.categoryId === p.categoryId);
        return (
          <span key={i} className="mr-1 inline-block rounded border px-1.5 py-0.5 text-xs">
            {c?.loading
              ? 'Loading tag…'
              : c?.error
                ? 'Tag unavailable'
                : category && value
                  ? `${category.name}: ${value.name}`
                  : 'Missing conditional tag'}
          </span>
        );
      })}
    </>
  );
}
export function ReusableNode({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className="se-reusable-reference"
      contentEditable={false}
      data-conditions={node.attrs.conditions ? 'assigned' : undefined}
      data-semantic-reference="reusable"
    >
      <ReusablePreview id={node.attrs.reusableId as string} trail={[]} />
    </NodeViewWrapper>
  );
}
export function ReusablePreview({ id, trail }: { id: string; trail: string[] }) {
  const catalog = useReferenceCatalog();
  const item = catalog?.reusable.find((r) => r.id === id);
  if (catalog?.loading) return <p>Loading linked content…</p>;
  if (!catalog || catalog.error) return <p className="text-destructive">Linked content unavailable</p>;
  if (!item) return <p className="text-destructive">Missing reusable content</p>;
  if (trail.includes(id) || trail.length >= 8)
    return <p className="text-destructive">Linked content cycle or nesting limit reached</p>;
  return <ResolvedReusable catalog={catalog} item={item} trail={[...trail, id]} />;
}
function ResolvedReusable({
  catalog,
  item,
  trail,
}: {
  catalog: ReferenceCatalog;
  item: ReusableItem;
  trail: string[];
}) {
  const draft = useQuery({
    queryKey: ['linked-reusable-draft', catalog.scope.workspaceId, catalog.scope.projectId, item.id, item.updatedAt],
    queryFn: () => catalog.services.reusable.getDraft(catalog.scope, item.id),
    retry: false,
    staleTime: 0,
  });
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Linked reusable content · {item.name} · current saved draft
      </p>
      {draft.isLoading ? (
        <p>Loading linked draft…</p>
      ) : draft.isError ? (
        <p role="alert" className="text-destructive">
          Linked draft unavailable.{' '}
          <button type="button" className="underline" onClick={() => void draft.refetch()}>
            Retry linked draft
          </button>
        </p>
      ) : !draft.data ? (
        <p>No saved reusable draft</p>
      ) : structuredContentIssue(draft.data.content) ? (
        <p className="text-destructive">Linked draft contains unsupported content; it has been preserved.</p>
      ) : (
        <ReferenceBody content={draft.data.content} trail={trail} />
      )}
    </div>
  );
}
/** Safe React rendering; no saved HTML, labels, IDs or provider output are executed. */
export function ReferenceBody({ content, trail = [] }: { content: TopicContent; trail?: string[] }) {
  const render = (n: JSONValue, key: number): ReactNode => {
    if (!jsonObject(n)) return null;
    const a = jsonObject(n.attrs) ? n.attrs : {};
    const conditions =
      jsonObject(a.conditions) && Array.isArray(a.conditions.values) ? (
        <ConditionLabels pairs={a.conditions.values as unknown as ConditionPair[]} />
      ) : null;
    if (n.type === 'variableReference') return <VariableValue key={key} id={String(a.variableId)} />;
    if (n.type === 'reusableReference')
      return (
        <div key={key}>
          {conditions}
          <ReusablePreview id={String(a.reusableId)} trail={trail} />
        </div>
      );
    let child: ReactNode = Array.isArray(n.content) ? n.content.map(render) : null;
    if (n.type === 'text') {
      child = <BrandedText>{String(n.text)}</BrandedText>;
      for (const m of Array.isArray(n.marks) ? n.marks : [])
        if (jsonObject(m)) {
          if (m.type === 'bold') child = <strong>{child}</strong>;
          if (m.type === 'italic') child = <em>{child}</em>;
          if (m.type === 'underline') child = <u>{child}</u>;
          if (m.type === 'strike') child = <s>{child}</s>;
          if (m.type === 'code') child = <code>{child}</code>;
          if (m.type === 'link' && jsonObject(m.attrs) && typeof m.attrs.href === 'string' && validLink(m.attrs.href))
            child = (
              <a href={m.attrs.href} target="_blank" rel="noopener noreferrer">
                {child}
              </a>
            );
        }
      return <span key={key}>{child}</span>;
    }
    const tags: Record<string, string> = {
      paragraph: 'p',
      heading: `h${a.level ?? 2}`,
      blockquote: 'blockquote',
      bulletList: 'ul',
      orderedList: 'ol',
      listItem: 'li',
      codeBlock: 'pre',
      table: 'table',
      tableRow: 'tr',
      tableCell: 'td',
      tableHeader: 'th',
      callout: 'aside',
    };
    if (n.type === 'hardBreak') return <br key={key} />;
    if (n.type === 'horizontalRule')
      return (
        <div key={key}>
          {conditions}
          <hr />
        </div>
      );
    if (n.type === 'callout')
      return (
        <aside
          key={key}
          role="note"
          aria-label={calloutLabels[a.kind as CalloutKind]}
          className="se-callout"
          data-callout-kind={String(a.kind)}
        >
          <div className="se-callout-label" aria-hidden="true">
            {calloutLabels[a.kind as CalloutKind]}
          </div>
          <div className="se-callout-content">
            {conditions}
            {child}
          </div>
        </aside>
      );
    const Tag = (tags[String(n.type)] ?? 'div') as 'div';
    if (n.type === 'table')
      return (
        <div key={key}>
          {conditions}
          <table>
            <tbody>{child}</tbody>
          </table>
        </div>
      );
    if (n.type === 'tableCell' || n.type === 'tableHeader') {
      const Cell = n.type === 'tableHeader' ? 'th' : 'td';
      return (
        <Cell key={key} colSpan={Number(a.colspan ?? 1)} rowSpan={Number(a.rowspan ?? 1)}>
          {child}
        </Cell>
      );
    }
    if (n.type === 'orderedList')
      return (
        <ol key={key} start={Number(a.start ?? 1)} type={(a.type ?? '1') as '1' | 'a' | 'A' | 'i' | 'I'}>
          {conditions}
          {child}
        </ol>
      );
    return (
      <Tag key={key}>
        {conditions}
        {child}
      </Tag>
    );
  };
  return <div className="se-linked-body">{Array.isArray(content.content) ? content.content.map(render) : null}</div>;
}
