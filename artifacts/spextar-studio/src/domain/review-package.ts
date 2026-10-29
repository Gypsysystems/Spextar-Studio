import { z } from 'zod';
import { ServiceError } from '@/services/contracts';
import { checkedContent, type TopicContent } from './topic-content';
import { collectSemanticReferences } from './semantic-references';
import { structuredContentIssue } from './structured-content';
import { parseVariableRow } from './project-variables';
import { parseCategory, parseConditionValue } from './project-conditions';
import { parseReusable, parseReusableDraft } from './reusable-content';

const row = z.record(z.string(), z.unknown());
export const reviewPackageSchema = z.object({
  schemaVersion: z.literal(1), resolverVersion: z.literal(1),
  canonicalization: z.literal('spextar-json-v1'),
  projectId: z.string().min(1), workspaceId: z.string().min(1), organizationId: z.string().min(1),
  outputContext: z.object({ variableValues: z.literal('default'), conditions: z.literal('neutral'), outputId: z.null() }).strict(),
  variables: z.array(row), categories: z.array(row), values: z.array(row),
  reusable: z.array(z.object({ item: row, draft: row }).strict()),
}).strict();
export type ReviewPackage = z.infer<typeof reviewPackageSchema>;

const fail = (): never => { throw new ServiceError('The frozen review dependencies could not be verified. Submit a new review from Draft.', 'unavailable'); };

/** Validates only frozen evidence. Never reads current authoring records. */
export function checkedReviewPackage(raw: unknown, projectId: string, bodies: (TopicContent | null)[]): ReviewPackage {
  const parsed = reviewPackageSchema.safeParse(raw);
  if (!parsed.success || parsed.data.projectId !== projectId) return fail();
  const p = parsed.data;
  const scope = { projectId, workspaceId: p.workspaceId };
  const variables = p.variables.map(v => parseVariableRow(v, projectId));
  const categories = p.categories.map(c => parseCategory(c, projectId));
  const values = p.values.map(v => parseConditionValue(v, String(v.category_id)));
  const reusable = p.reusable.map(r => ({ item: parseReusable(r.item, scope, { workspace: false, project: false }), draft: parseReusableDraft(r.draft, String(r.item.id)) }));
  for (const list of [variables, categories, values, reusable.map(r => r.item)]) {
    if (list.some((v, i) => i > 0 && list[i - 1].id >= v.id)) return fail();
  }
  const seen = { variable: new Set<string>(), category: new Set<string>(), condition: new Set<string>(), reusable: new Set<string>() };
  let visits = 0;
  const walk = (body: TopicContent, trail: string[]) => {
    if (++visits > 4096 || structuredContentIssue(checkedContent(body))) return fail();
    for (const ref of collectSemanticReferences(body)) {
      seen[ref.kind].add(ref.definitionId);
      if (ref.kind === 'variable') {
        const v = variables.find(v => v.id === ref.definitionId);
        if (!v || (v.required && !v.value.trim())) return fail();
      } else if (ref.kind === 'condition') {
        seen.category.add(ref.categoryId!);
        if (!categories.some(c => c.id === ref.categoryId) || !values.some(v => v.id === ref.definitionId && v.categoryId === ref.categoryId)) return fail();
      } else {
        if (trail.length >= 8 || trail.includes(ref.definitionId)) return fail();
        const r = reusable.find(r => r.item.id === ref.definitionId);
        if (!r) return fail();
        walk(r.draft.content, [...trail, r.item.id]);
      }
    }
  };
  bodies.forEach(b => { if (b !== null) walk(b, []); });
  if (variables.length !== seen.variable.size || categories.length !== seen.category.size || values.length !== seen.condition.size || reusable.length !== seen.reusable.size || reusable.length > 256) return fail();
  return p;
}

/** UTF-8 JSON; keys sorted by UTF-16 code units, arrays significant, no whitespace.
 * JSON numbers must be safe integers. No Unicode normalization. Not JSONB::text.
 * Hashing itself belongs to Publishing. */
export function canonicalReviewJson(value: unknown): string {
  const encode = (v: unknown, depth: number): string => {
    if (depth >= 100) return fail();
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') { if (!Number.isSafeInteger(v)) return fail(); return JSON.stringify(v); }
    if (Array.isArray(v)) return `[${v.map(x => encode(x, depth + 1)).join(',')}]`;
    if (typeof v === 'object' && v && [Object.prototype, null].includes(Object.getPrototypeOf(v))) {
      return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${encode((v as Record<string, unknown>)[k], depth + 1)}`).join(',')}}`;
    }
    return fail();
  };
  return encode(value, 0);
}
