import { checkMemberChange, projectMetadataSchema, requireSettingsAdmin, settingsInput, settingsRole,
  type ProjectSettings, type ProjectSettingsService, type SettingsScope } from '@/domain/project-settings';
import { ServiceError } from './contracts';
import type { Project } from '@/domain/types';

/** This slice's demo mutations live in adapter memory only. No Supabase or browser-storage writes. */
export function demoProjectSettings(authorize: (s: SettingsScope) => Promise<{ userId: string; project: Project }>,
  changed: (id: string, patch: Partial<Project>) => void,
  slugTaken: (scope: SettingsScope, slug: string) => boolean) {
  const states = new Map<string, ProjectSettings>();
  async function get(s: SettingsScope): Promise<ProjectSettings> {
    const a = await authorize(s);
    let state = states.get(s.projectId);
    if (!state) {
      state = { id: a.project.id, workspaceId: s.workspaceId, name: a.project.name,
        slug: a.project.key.toLowerCase(), description: a.project.description, status: a.project.status === 'archived' ? 'archived' : 'active',
        updatedAt: a.project.updatedAt, currentUserId: a.userId, canAdminister: !a.project.role || a.project.role === 'admin',
        members: [{ userId: a.userId, role: a.project.role ?? 'admin' }], candidates: ['demo-workspace-member'] };
      states.set(s.projectId, state);
    }
    if (state.currentUserId !== a.userId || state.workspaceId !== s.workspaceId)
      throw new ServiceError('Demo identity or project scope changed.', 'forbidden');
    return structuredClone(state);
  }
  const service: ProjectSettingsService = {
    get,
    async update(s, input, expected) {
      const metadata = settingsInput(projectMetadataSchema, input); const st = await get(s); requireSettingsAdmin(st);
      if (st.updatedAt !== expected) throw new ServiceError('Project details changed. Reload before saving.', 'conflict');
      if (slugTaken(s, metadata.slug))
        throw new ServiceError('This project slug is already used in the workspace.', 'conflict');
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(st.updatedAt) + 1)).toISOString();
      states.set(s.projectId, { ...st, ...metadata, updatedAt });
      changed(s.projectId, { name: metadata.name, key: metadata.slug.toUpperCase(), description: metadata.description ?? '', status: metadata.status, updatedAt });
    },
    async addMember(s, userId, value) {
      const role = settingsInput(settingsRole, value); const st = await get(s); requireSettingsAdmin(st);
      if (!st.candidates.includes(userId)) throw new ServiceError('Choose an existing workspace member.', 'validation');
      states.set(s.projectId, { ...st, members: [...st.members, { userId, role }], candidates: st.candidates.filter(id => id !== userId) });
    },
    async changeRole(s, userId, value, expected) {
      const role = settingsInput(settingsRole, value); settingsInput(settingsRole, expected);
      const st = await get(s); checkMemberChange(st, userId, role);
      if (st.members.find(m => m.userId === userId)?.role !== expected) throw new ServiceError('Membership changed. Reload members.', 'conflict');
      states.set(s.projectId, { ...st, members: st.members.map(m => m.userId === userId ? { ...m, role } : m) });
    },
    async removeMember(s, userId, expected) {
      settingsInput(settingsRole, expected); const st = await get(s); checkMemberChange(st, userId, null);
      if (st.members.find(m => m.userId === userId)?.role !== expected) throw new ServiceError('Membership changed. Reload members.', 'conflict');
      states.set(s.projectId, { ...st, members: st.members.filter(m => m.userId !== userId),
        candidates: [...st.candidates, userId] });
    },
  };
  return { service, clear: () => states.clear() };
}
