import { z } from 'zod';
import { checkedContent, type TopicContent } from './topic-content';
import { ServiceError } from '@/services/contracts';

export interface ReusableContext { workspaceId: string; projectId: string; userId?: string }
export type ReusableScope = 'workspace' | 'project';
export type ReusableStatus = 'draft' | 'in_review' | 'approved' | 'published';
export type UpdatePolicy = 'notify' | 'manual' | 'auto';
export interface ReusableInput {
  scope: ReusableScope; name: string; slug: string; description: string | null;
  status: ReusableStatus; updatePolicy: UpdatePolicy; tags: string[]; settings: TopicContent;
}
export type ReusableEdit = Omit<ReusableInput, 'scope' | 'slug'>;
export interface ReusableItem extends ReusableInput {
  id: string; workspaceId: string; projectId: string | null;
  createdBy: string | null; createdAt: string; updatedAt: string; canEdit: boolean;
}
export interface ReusableDraft {
  reusableContentId: string; content: TopicContent; revision: number; updatedAt: string; updatedBy: string | null;
}
export interface ReusableResult { item: ReusableItem; warning?: string }
export interface ReusableService {
  list(context: ReusableContext): Promise<ReusableItem[]>;
  permissions(context: ReusableContext): Promise<{ workspace: boolean; project: boolean }>;
  create(context: ReusableContext, input: ReusableInput): Promise<ReusableItem>;
  update(context: ReusableContext, id: string, input: ReusableEdit, expectedUpdatedAt: string): Promise<ReusableItem>;
  rename(context: ReusableContext, id: string, name: string, expectedUpdatedAt: string): Promise<ReusableItem>;
  duplicate(context: ReusableContext, id: string, input: { name: string; slug: string }): Promise<ReusableResult>;
  getDraft(context: ReusableContext, id: string): Promise<ReusableDraft | null>;
  saveDraft(context: ReusableContext, id: string, content: TopicContent, expectedRevision: number | null): Promise<ReusableDraft>;
}

const name = z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.').refine(s => !/[\u0000-\u001f\u007f]/.test(s), 'Names cannot contain control characters.');
export const reusableIdentitySchema = z.object({
  name, slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and single hyphens for the slug.'),
});
const settings = z.custom<TopicContent>((v) => {
  try { checkedContent(v); return true; } catch { return false; }
}, 'Settings must be a JSON object.');
export const reusableEditSchema = z.object({
  name, description: z.string().trim().max(10000).nullable(), status: z.enum(['draft', 'in_review', 'approved', 'published']),
  updatePolicy: z.enum(['notify', 'manual', 'auto']),
  tags: z.array(z.string().trim().min(1).max(120)).max(100).refine(v => new Set(v).size === v.length, 'Use unique tags.'),
  settings,
});
export const reusableInputSchema = reusableEditSchema.extend({
  scope: z.enum(['workspace', 'project']), slug: reusableIdentitySchema.shape.slug,
});
export function reusableInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ServiceError('Check the reusable-content fields.', 'validation', r.error.issues.map(i => i.message));
  return r.data;
}
const at = z.string().refine(s => Number.isFinite(Date.parse(s)));
const row = z.object({
  id: z.string().min(1), workspace_id: z.string().min(1), project_id: z.string().min(1).nullable(),
  scope: z.enum(['workspace', 'project']), name: z.string().min(1), slug: z.string().min(1),
  description: z.string().nullable(), settings, status: z.enum(['draft', 'in_review', 'approved', 'published']),
  update_policy: z.enum(['notify', 'manual', 'auto']), tags: z.array(z.string()), created_by: z.string().nullable(),
  created_at: at, updated_at: at,
});
export function parseReusable(value: unknown, context: ReusableContext, permissions: { workspace: boolean; project: boolean }): ReusableItem {
  const r = row.safeParse(value);
  if (!r.success) throw new ServiceError('Supabase returned malformed or unsupported reusable content. Nothing was coerced.', 'unavailable');
  const v = r.data;
  if (v.workspace_id !== context.workspaceId || (v.scope === 'workspace' ? v.project_id !== null : v.project_id !== context.projectId))
    throw new ServiceError('Reusable content is outside this workspace/project scope.', 'forbidden');
  return { id: v.id, workspaceId: v.workspace_id, projectId: v.project_id, scope: v.scope, name: v.name, slug: v.slug,
    description: v.description, settings: v.settings, status: v.status, updatePolicy: v.update_policy, tags: v.tags,
    createdBy: v.created_by, createdAt: v.created_at, updatedAt: v.updated_at, canEdit: permissions[v.scope] };
}
export function reusableWrite(input: ReusableEdit) {
  return { name: input.name, description: input.description, settings: input.settings, status: input.status, update_policy: input.updatePolicy, tags: input.tags };
}
export function reusableContent(value: unknown): TopicContent {
  const v = checkedContent(value);
  if (v.type !== 'doc' || !Array.isArray(v.content) || (v.version !== undefined && (!Number.isSafeInteger(v.version) || Number(v.version) < 1)))
    throw new ServiceError('Reusable draft content must be a structured document JSON object. The original has not been changed.', 'validation');
  return v;
}
export function parseReusableDraft(raw: unknown, id: string): ReusableDraft {
  const r = z.object({ reusable_content_id: z.literal(id), content: z.unknown(), revision: z.number().int().positive().safe(), updated_at: at, updated_by: z.string().nullable() }).safeParse(raw);
  if (!r.success) throw new ServiceError('Supabase returned an invalid or incorrectly scoped reusable draft.', 'unavailable');
  return { reusableContentId: id, content: reusableContent(r.data.content), revision: r.data.revision, updatedAt: r.data.updated_at, updatedBy: r.data.updated_by };
}
