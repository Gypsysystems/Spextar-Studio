import { z } from 'zod';
import { ServiceError } from '@/services/contracts';

export const variableOutputs = [
  { id: 'web-help', label: 'Web Help' },
  { id: 'pdf-manual', label: 'PDF Manual' },
  { id: 'word-review', label: 'Word Review' },
] as const;
export type VariableOutputId = typeof variableOutputs[number]['id'];
export type OutputValues = Partial<Record<VariableOutputId, string>>;
export interface VariableInput {
  name: string; key: string; value: string; description: string | null;
  required: boolean; outputValues: OutputValues;
}
export interface VariableIdentity { name: string; key: string }
export interface ProjectVariable extends VariableInput {
  id: string; projectId: string; valueType: 'text'; createdAt: string; updatedAt: string;
}
export interface VariableIssue { variableId: string | null; message: string }
export interface VariableValidation { variableCount: number; issues: VariableIssue[] }
export interface ProjectVariableService {
  list(projectId: string): Promise<ProjectVariable[]>;
  create(projectId: string, input: VariableInput): Promise<ProjectVariable>;
  update(projectId: string, variableId: string, input: VariableInput): Promise<ProjectVariable>;
  rename(projectId: string, variableId: string, input: VariableIdentity): Promise<ProjectVariable>;
  duplicate(projectId: string, variableId: string, input: VariableIdentity): Promise<ProjectVariable>;
  validate(projectId: string): Promise<VariableValidation>;
}
const name = z.string().min(1, 'Name is required.').max(120).refine((value) => !!value.trim(), 'Name is required.')
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Name must be a single line.');
export const VARIABLE_KEY_RULE = 'Key must start with a lowercase letter, use only lowercase letters, digits and underscores, and be at most 80 characters.';
/** Mirrors the live constraint exactly; never normalize manually entered or saved keys. */
// Absolute end assertion: JS `$` also accepts a position before a final newline.
export const variableKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,79}(?![\s\S])/, VARIABLE_KEY_RULE);
export function suggestVariableKey(name: string): string {
  if (!name.trim()) return '';
  const base = name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return (base ? /^[a-z]/.test(base) ? base : `var_${base}` : 'variable').slice(0, 80);
}
export function suggestDuplicateVariableKey(key: string, existingKeys: readonly string[]): string {
  const base = suggestVariableKey(key) || 'variable';
  const taken = new Set(existingKeys);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '_copy' : `_copy_${n}`;
    const candidate = base.slice(0, 80 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}
const text = z.string().max(50000);
const outputs = z.object({ 'web-help': text.optional(), 'pdf-manual': text.optional(), 'word-review': text.optional() }).strict();
export const variableIdentitySchema = z.object({ name: name.transform((value) => value.trim()), key: variableKeySchema }).strict();
const inputSchema = variableIdentitySchema.extend({
  value: text, description: z.string().max(2000).nullable(), required: z.boolean(), outputValues: outputs,
}).strict();
const rowSchema = z.object({
  id: z.string().min(1), project_id: z.string().min(1), name, key: variableKeySchema, value_type: z.literal('text'),
  value: text, description: z.string().max(2000).nullable(), required: z.boolean(), output_values: outputs,
  created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
}).strict();

export function validateVariableInput(input: unknown): VariableInput {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw new ServiceError('Check the variable fields.', 'validation', result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  if (result.data.required && !result.data.value.trim())
    throw new ServiceError('A required variable needs a default value.', 'validation');
  return result.data;
}
export function validateVariableIdentity(input: unknown): VariableIdentity {
  const result = variableIdentitySchema.safeParse(input);
  if (!result.success) throw new ServiceError('Check the variable name and key.', 'validation', result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  return result.data;
}
export function parseVariableRow(raw: unknown, projectId: string): ProjectVariable {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) throw new ServiceError('This Text variable has an unsupported format. Nothing was changed.', 'unavailable',
    parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  const row = parsed.data;
  if (row.project_id !== projectId) throw new ServiceError('Variable does not belong to this project.', 'forbidden');
  return { id: row.id, projectId: row.project_id, name: row.name, key: row.key, valueType: row.value_type,
    value: row.value, description: row.description, required: row.required, outputValues: row.output_values,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
export function resolveVariable(variable: ProjectVariable, output: VariableOutputId): string {
  const override = variable.outputValues[output];
  return override?.trim() ? override : variable.value;
}
export function validateVariableRows(rows: unknown[], projectId: string): VariableValidation {
  const issues: VariableIssue[] = [];
  for (const row of rows) {
    const id = typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string' ? row.id : null;
    try {
      const variable = parseVariableRow(row, projectId);
      if (variable.required && !variable.value.trim()) issues.push({ variableId: id, message: `${variable.name}: missing required default value.` });
    } catch (error) {
      if (error instanceof ServiceError && error.code === 'forbidden') throw error;
      issues.push({ variableId: id, message: `${id ?? 'Variable'}: invalid or unsupported variable definition. ${error instanceof ServiceError ? error.issues.join(' ') : ''}` });
    }
  }
  return { variableCount: rows.length, issues };
}
export function variableWrite(input: VariableInput) {
  return { name: input.name, key: input.key, value_type: 'text' as const, value: input.value,
    description: input.description, required: input.required, output_values: { ...input.outputValues } };
}
