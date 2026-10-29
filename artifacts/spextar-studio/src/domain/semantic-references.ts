import { z } from 'zod';
import type { JSONValue, TopicContent } from './topic-content';
import type { ProjectVariable } from './project-variables';
import type { ConditionCategory, ConditionValue } from './project-conditions';
import type { ReusableItem, ReusableDraft } from './reusable-content';

const id = z.string().min(1).max(200);
export const conditionAssignment = z.object({
  version: z.literal(1), categoryId: id, valueIds: z.array(id).min(1).max(500)
    .refine(ids => new Set(ids).size === ids.length),
}).strict();
export const conditionAssignments = z.array(conditionAssignment).max(100)
  .refine(rows => new Set(rows.map(r => r.categoryId)).size === rows.length);
export type ConditionAssignment = z.infer<typeof conditionAssignment>;
export type ReferenceKind = 'variable' | 'condition' | 'category' | 'reusable';
export interface SemanticReference { kind: ReferenceKind; targetId: string; nodeId: string | null }
export interface SemanticContext { workspaceId: string; projectId: string }
export interface SemanticCatalog {
  variables: ProjectVariable[];
  categories: ConditionCategory[];
  values: ConditionValue[];
  reusable: { item: ReusableItem; draft: ReusableDraft | null }[];
}
export const referenceNodeTypes = ['variableReference', 'reusableReference'] as const;
export const conditionedNodes = ['paragraph', 'heading', 'blockquote', 'callout', 'listItem', 'tableCell', 'tableHeader'] as const;
export function referenceAttributesIssue(type: string, attrs: Record<string, JSONValue>): string | null {
  if ((referenceNodeTypes as readonly string[]).includes(type)) {
    if (attrs.refVersion !== 1 || !id.safeParse(attrs.targetId).success) return 'Unsupported semantic reference. Original content is preserved.';
  }
  if (attrs.conditions !== undefined && attrs.conditions !== null
    && !conditionAssignments.safeParse(attrs.conditions).success) return 'Unsupported conditional assignment. Original content is preserved.';
  return null;
}

/** Extract identities, never labels or resolved/copy text. Unknown versions fail closed. */
export function referencesIn(content: TopicContent): SemanticReference[] {
  const result: SemanticReference[] = [];
  const walk = (value: JSONValue) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const attrs = value.attrs && typeof value.attrs === 'object' && !Array.isArray(value.attrs) ? value.attrs : {};
    const issue = referenceAttributesIssue(String(value.type), attrs);
    if (issue) throw new Error(issue);
    const nodeId = typeof attrs.id === 'string' ? attrs.id : null;
    if (value.type === 'variableReference' || value.type === 'reusableReference') {
      result.push({ kind: value.type === 'variableReference' ? 'variable' : 'reusable', targetId: attrs.targetId as string, nodeId });
    }
    if (attrs.conditions) for (const assignment of conditionAssignments.parse(attrs.conditions)) {
      result.push({ kind: 'category', targetId: assignment.categoryId, nodeId });
      assignment.valueIds.forEach(targetId => result.push({ kind: 'condition', targetId, nodeId }));
    }
    if (Array.isArray(value.content)) value.content.forEach(walk);
  };
  walk(content);
  return result;
}

export function changeCondition(existing: unknown, categoryId: string, valueId: string, remove = false): ConditionAssignment[] {
  const rows = existing == null ? [] : conditionAssignments.parse(existing);
  const values = new Set(rows.find(row => row.categoryId === categoryId)?.valueIds ?? []);
  remove ? values.delete(valueId) : values.add(valueId);
  return [...rows.filter(row => row.categoryId !== categoryId),
    ...(values.size ? [{ version: 1 as const, categoryId, valueIds: [...values] }] : [])];
}
