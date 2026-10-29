import type { JSONValue, TopicContent } from './topic-content';

export type ReferenceKind = 'variable' | 'condition' | 'reusable';
export interface SemanticReference {
  kind: ReferenceKind;
  definitionId: string;
  categoryId?: string;
  nodeId: string | null;
}
export interface ReferenceScope {
  workspaceId: string;
  projectId: string;
}
export type ConditionPair = { categoryId: string; valueId: string };
export const conditionAssignableNodes = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'horizontalRule',
  'table',
  'callout',
  'reusableReference',
];
export const referenceId = (v: unknown): v is string => typeof v === 'string' && /^[\w.:-]{1,200}$/.test(v);
export const jsonObject = (v: JSONValue | undefined): v is Record<string, JSONValue> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function validConditions(v: JSONValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (
    !jsonObject(v) ||
    v.version !== 1 ||
    Object.keys(v).some((k) => !['version', 'values'].includes(k)) ||
    !Array.isArray(v.values) ||
    v.values.length > 100
  )
    return false;
  const seen = new Set<string>();
  return v.values.every((pair) => {
    if (
      !jsonObject(pair) ||
      Object.keys(pair).length !== 2 ||
      !referenceId(pair.categoryId) ||
      !referenceId(pair.valueId)
    )
      return false;
    const key = JSON.stringify([pair.categoryId, pair.valueId]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
/** Walk only persisted node content, never labels/settings or arbitrary root metadata. */
export function collectSemanticReferences(content: TopicContent): SemanticReference[] {
  const refs: SemanticReference[] = [];
  const walk = (v: JSONValue) => {
    if (!jsonObject(v)) return;
    const a = jsonObject(v.attrs) ? v.attrs : {};
    const nodeId = referenceId(a.id) ? a.id : null;
    if (a.referenceVersion === 1 && v.type === 'variableReference' && referenceId(a.variableId))
      refs.push({ kind: 'variable', definitionId: a.variableId, nodeId });
    if (a.referenceVersion === 1 && v.type === 'reusableReference' && referenceId(a.reusableId))
      refs.push({ kind: 'reusable', definitionId: a.reusableId, nodeId });
    if (
      conditionAssignableNodes.includes(String(v.type)) &&
      jsonObject(a.conditions) &&
      a.conditions.version === 1 &&
      Array.isArray(a.conditions.values)
    ) {
      for (const pair of a.conditions.values)
        if (jsonObject(pair) && referenceId(pair.categoryId) && referenceId(pair.valueId))
          refs.push({ kind: 'condition', definitionId: pair.valueId, categoryId: pair.categoryId, nodeId });
    }
    if (Array.isArray(v.content)) v.content.forEach(walk);
  };
  if (Array.isArray(content.content)) content.content.forEach(walk);
  return refs;
}
export function hasSemanticReferences(content: TopicContent): boolean {
  // Also recognize unsupported versions/malformed references for safe fallback display.
  const visit = (v: JSONValue): boolean =>
    jsonObject(v) &&
    (['variableReference', 'reusableReference'].includes(String(v.type)) ||
      (jsonObject(v.attrs) && v.attrs.conditions != null) ||
      (Array.isArray(v.content) && v.content.some(visit)));
  return Array.isArray(content.content) && content.content.some(visit);
}
