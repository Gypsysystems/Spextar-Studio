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
const key = z.string().min(1).max(80).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Key must start with a letter or underscore and contain only letters, numbers and underscores.');
const text = z.string().max(50000);
const outputs = z.object({ 'web-help': text.optional(), 'pdf-manual': text.optional(), 'word-review': text.optional() }).strict();
export const variableIdentitySchema = z.object({ name: name.transform((value) => value.trim()), key }).strict();
const inputSchema = variableIdentitySchema.extend({
  value: text, description: z.string().max(2000).nullable(), required: z.boolean(), outputValues: outputs,
}).strict();
const rowSchema = z.object({
  id: z.string().min(1), project_id: z.string().min(1), name, key, value_type: z.literal('text'),
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
  if (!parsed.success) throw new ServiceError('Supabase returned a malformed or unsupported Text variable. No values were coerced.', 'unavailable',
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
      issues.push({ variableId: id, message: `${id ?? 'Variable'}: malformed or unsupported value/overrides. ${error instanceof ServiceError ? error.issues.join(' ') : ''}` });
    }
  }
  return { variableCount: rows.length, issues };
}
export function variableWrite(input: VariableInput) {
  return { name: input.name, key: input.key, value_type: 'text' as const, value: input.value,
    description: input.description, required: input.required, output_values: { ...input.outputValues } };
}
