import { z } from 'zod';
import { ServiceError } from '@/services/contracts';

export const settingsRole = z.enum(['admin', 'author', 'reviewer', 'viewer']);
export type SettingsRole = z.infer<typeof settingsRole>;
export const projectMetadataSchema = z.object({
  name: z.string().trim().min(2, 'Name must contain 2–160 characters.').max(160, 'Name must contain 2–160 characters.'),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters and digits separated by single hyphens.'),
  description: z.string().trim().nullable(),
  status: z.enum(['active', 'archived']),
}).strict();
export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;
export interface SettingsScope { workspaceId: string; projectId: string }
export interface ProjectMember { userId: string; role: SettingsRole }
export interface ProjectSettings extends ProjectMetadata {
  id: string; workspaceId: string; updatedAt: string; currentUserId: string;
  canAdminister: boolean; members: ProjectMember[]; candidates: string[];
}
export interface ProjectSettingsService {
  get(scope: SettingsScope): Promise<ProjectSettings>;
  update(scope: SettingsScope, metadata: ProjectMetadata, expectedUpdatedAt: string): Promise<void>;
  addMember(scope: SettingsScope, userId: string, role: SettingsRole): Promise<void>;
  changeRole(scope: SettingsScope, userId: string, role: SettingsRole, expectedRole: SettingsRole): Promise<void>;
  removeMember(scope: SettingsScope, userId: string, expectedRole: SettingsRole): Promise<void>;
}
export function settingsInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ServiceError(parsed.error.issues.map(i => i.message).join(' '), 'validation');
  return parsed.data;
}
export function requireSettingsAdmin(settings: ProjectSettings) {
  if (!settings.canAdminister) throw new ServiceError('Only an explicit Project Admin may administer this project.', 'forbidden');
}
/** Defensive client checks, not a replacement for a transactional database invariant. */
export function checkMemberChange(settings: ProjectSettings, userId: string, nextRole: SettingsRole | null) {
  requireSettingsAdmin(settings);
  const target = settings.members.find(m => m.userId === userId);
  if (!target) throw new ServiceError('Membership changed or is no longer accessible. Reload members.', 'conflict');
  if (userId === settings.currentUserId && nextRole !== 'admin')
    throw new ServiceError('Ask another Project Admin to change or remove your membership. You cannot remove your own administration access here.', 'validation');
  if (target.role === 'admin' && nextRole !== 'admin' && settings.members.filter(m => m.role === 'admin').length <= 1)
    throw new ServiceError('Keep at least one Project Admin.', 'validation');
}
