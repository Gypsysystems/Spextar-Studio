import { z } from 'zod';
import { variableKeySchema, suggestVariableKey } from './project-variables';
import { ServiceError } from '@/services/contracts';

export const suggestConditionKey = suggestVariableKey;
const name = z.string().min(1, 'Name is required.').max(120, 'Name must be at most 120 characters.')
  .refine((s) => !!s.trim(), 'Name is required.')
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Name must be a single line.');
const identity = z.object({ name: name.transform((s) => s.trim()) }).strict();
const metadata = identity.extend({
  description: z.string().nullable(),
  unassignedBehavior: z.enum(['include', 'exclude']),
  valueMatchMode: z.enum(['any', 'all']),
}).strict();
export const categoryInputSchema = metadata.extend({ key: variableKeySchema }).strict();
export const categoryEditSchema = metadata;
export const conditionNameSchema = identity;
export const conditionValueEditSchema = identity.extend({
  sortOrder: z.number().int().min(0).max(2147483647),
}).strict();
export const conditionValueInputSchema = conditionValueEditSchema.extend({ key: variableKeySchema }).strict();
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryEdit = z.infer<typeof categoryEditSchema>;
export type ConditionValueInput = z.infer<typeof conditionValueInputSchema>;
export type ConditionValueEdit = z.infer<typeof conditionValueEditSchema>;
export type ConditionRename = z.infer<typeof identity>;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const json: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(z.string(), json),
]));
const categoryRow = z.object({
  id: z.string().min(1), project_id: z.string().min(1), name, key: variableKeySchema,
  description: z.string().nullable(), settings: z.record(z.string(), json).nullable(),
  unassigned_behavior: z.enum(['include', 'exclude']), value_match_mode: z.enum(['any', 'all']),
  created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
}).strict();
const valueRow = z.object({
  id: z.string().min(1), category_id: z.string().min(1), name, key: variableKeySchema,
  sort_order: z.number().int().min(0).max(2147483647),
  created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
}).strict();
export interface ConditionCategory extends CategoryInput {
  id: string; projectId: string; settings: Record<string, JsonValue> | null; createdAt: string; updatedAt: string;
}
export interface ConditionValue extends ConditionValueInput {
  id: string; categoryId: string; createdAt: string; updatedAt: string;
}
export interface ProjectConditionService {
  listCategories(projectId: string): Promise<ConditionCategory[]>;
  createCategory(projectId: string, input: CategoryInput): Promise<ConditionCategory>;
  updateCategory(projectId: string, categoryId: string, input: CategoryEdit): Promise<ConditionCategory>;
  renameCategory(projectId: string, categoryId: string, input: ConditionRename): Promise<ConditionCategory>;
  listValues(projectId: string, categoryId: string): Promise<ConditionValue[]>;
  createValue(projectId: string, categoryId: string, input: ConditionValueInput): Promise<ConditionValue>;
  updateValue(projectId: string, categoryId: string, valueId: string, input: ConditionValueEdit): Promise<ConditionValue>;
  renameValue(projectId: string, categoryId: string, valueId: string, input: ConditionRename): Promise<ConditionValue>;
}
export function conditionInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError('Check the condition fields.', 'validation',
    result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  return result.data;
}
export function parseCategory(raw: unknown, projectId: string): ConditionCategory {
  const result = categoryRow.safeParse(raw);
  if (!result.success) throw new ServiceError('Supabase returned an unsupported or malformed condition category. No data was coerced.', 'unavailable',
    result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  const r = result.data;
  if (r.project_id !== projectId) throw new ServiceError('Condition category does not belong to this project.', 'forbidden');
  return { id: r.id, projectId: r.project_id, name: r.name, key: r.key, description: r.description, settings: r.settings,
    unassignedBehavior: r.unassigned_behavior, valueMatchMode: r.value_match_mode, createdAt: r.created_at, updatedAt: r.updated_at };
}
export function parseConditionValue(raw: unknown, categoryId: string): ConditionValue {
  const result = valueRow.safeParse(raw);
  if (!result.success) throw new ServiceError('Supabase returned an unsupported or malformed condition value. No data was coerced.', 'unavailable',
    result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  const r = result.data;
  if (r.category_id !== categoryId) throw new ServiceError('Condition value does not belong to this category.', 'forbidden');
  return { id: r.id, categoryId: r.category_id, name: r.name, key: r.key, sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at };
}
export function categoryWrite(input: CategoryEdit) {
  return { name: input.name, description: input.description, unassigned_behavior: input.unassignedBehavior, value_match_mode: input.valueMatchMode };
}
export const sortConditionValues = (items: ConditionValue[]) => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
export const sortCategories = (items: ConditionCategory[]) => [...items].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
