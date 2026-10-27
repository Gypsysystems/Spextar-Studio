import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';
import { checkMemberChange, projectMetadataSchema, requireSettingsAdmin, settingsInput, settingsRole,
  type ProjectSettings, type ProjectSettingsService, type SettingsScope } from '@/domain/project-settings';

const projectShape = projectMetadataSchema.extend({
  id: z.string().min(1), workspace_id: z.string().min(1), updated_at: z.string().min(1),
}).strip();
const memberShape = z.object({ project_id: z.string().min(1), user_id: z.string().min(1), role: settingsRole });
const columns = 'id,workspace_id,name,slug,description,status,updated_at';
const check = (error: unknown) => { if (error) throw backendError(error); };
function row<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success) throw new ServiceError('Project settings returned malformed or unsupported data. Reload or contact your administrator.', 'unavailable');
  return p.data;
}
export function supabaseProjectSettings(client: SupabaseClient,
  authorize: (scope: SettingsScope) => Promise<string>): ProjectSettingsService {
  async function allRows(table: string, fields: string, column: string, value: string) {
    const data: unknown[] = [];
    for (let start = 0; ; start += 1000) {
      const r = await client.from(table).select(fields).eq(column, value).order('user_id').range(start, start + 999);
      check(r.error);
      if (!Array.isArray(r.data)) throw new ServiceError('Membership data is unavailable.', 'unavailable');
      data.push(...r.data);
      if (r.data.length < 1000) return data;
    }
  }
  async function get(s: SettingsScope): Promise<ProjectSettings> {
    const userId = await authorize(s);
    const r = await client.from('projects').select(columns).eq('workspace_id', s.workspaceId).eq('id', s.projectId).maybeSingle();
    check(r.error);
    if (!r.data) throw new ServiceError('Project is no longer accessible.', 'not-found');
    const p = row(projectShape, r.data);
    if (p.id !== s.projectId || p.workspace_id !== s.workspaceId) throw new ServiceError('Foreign project scope.', 'forbidden');
    const members = row(z.array(memberShape), await allRows('project_members', 'project_id,user_id,role', 'project_id', s.projectId));
    if (members.some(m => m.project_id !== s.projectId) || new Set(members.map(m => m.user_id)).size !== members.length)
      throw new ServiceError('Invalid or foreign project membership data.', 'forbidden');
    const canAdminister = members.some(m => m.user_id === userId && m.role === 'admin');
    let candidates: string[] = [];
    if (canAdminister) {
      const ws = row(z.array(z.object({ workspace_id: z.string(), user_id: z.string().min(1) })),
        await allRows('workspace_members', 'workspace_id,user_id', 'workspace_id', s.workspaceId));
      if (ws.some(m => m.workspace_id !== s.workspaceId) || new Set(ws.map(m => m.user_id)).size !== ws.length)
        throw new ServiceError('Invalid or foreign workspace membership data.', 'forbidden');
      candidates = ws.map(m => m.user_id).filter(id => !members.some(m => m.user_id === id));
    }
    if (await authorize(s) !== userId) throw new ServiceError('The signed-in identity changed. Reload.', 'unauthorized');
    return { id: p.id, workspaceId: p.workspace_id, name: p.name, slug: p.slug, description: p.description,
      status: p.status, updatedAt: p.updated_at, currentUserId: userId, canAdminister,
      members: members.map(m => ({ userId: m.user_id, role: m.role })), candidates };
  }
  async function confirmed(s: SettingsScope, actor: string, result: { data: unknown; error: unknown }) {
    check(result.error);
    if (!result.data) throw new ServiceError('Nothing was changed. Permissions or the record changed. Reload before retrying.', 'conflict');
    if (await authorize(s) !== actor) throw new ServiceError('The signed-in identity changed. Reload.', 'unauthorized');
  }
  return {
    get,
    async update(s, input, expected) {
      const metadata = settingsInput(projectMetadataSchema, input);
      const state = await get(s); requireSettingsAdmin(state);
      if (!expected || expected !== state.updatedAt) throw new ServiceError('Project details changed. Reload before saving.', 'conflict');
      const r = await client.from('projects').update(metadata).eq('workspace_id', s.workspaceId).eq('id', s.projectId)
        .eq('updated_at', expected).select(columns).maybeSingle();
      await confirmed(s, state.currentUserId, r);
      const saved = row(projectShape, r.data);
      if (saved.id !== s.projectId || saved.workspace_id !== s.workspaceId) throw new ServiceError('Unexpected project identity.', 'forbidden');
    },
    async addMember(s, userId, value) {
      const role = settingsInput(settingsRole, value);
      const state = await get(s); requireSettingsAdmin(state);
      if (!state.candidates.includes(userId)) throw new ServiceError('Choose an existing, accessible workspace member who is not already in this project.', 'validation');
      const r = await client.from('project_members').insert({ project_id: s.projectId, user_id: userId, role })
        .select('project_id,user_id,role').maybeSingle();
      await confirmed(s, state.currentUserId, r);
      const saved = row(memberShape, r.data);
      if (saved.project_id !== s.projectId || saved.user_id !== userId || saved.role !== role)
        throw new ServiceError('Unexpected saved membership. Reload members.', 'unavailable');
    },
    async changeRole(s, userId, value, expectedRole) {
      const role = settingsInput(settingsRole, value); settingsInput(settingsRole, expectedRole);
      const state = await get(s); checkMemberChange(state, userId, role);
      if (state.members.find(m => m.userId === userId)?.role !== expectedRole) throw new ServiceError('Membership changed. Reload members.', 'conflict');
      const r = await client.from('project_members').update({ role }).eq('project_id', s.projectId)
        .eq('user_id', userId).eq('role', expectedRole).select('project_id,user_id,role').maybeSingle();
      await confirmed(s, state.currentUserId, r);
      const saved = row(memberShape, r.data);
      if (saved.project_id !== s.projectId || saved.user_id !== userId || saved.role !== role)
        throw new ServiceError('Unexpected saved membership. Reload members.', 'unavailable');
    },
    async removeMember(s, userId, expectedRole) {
      settingsInput(settingsRole, expectedRole);
      const state = await get(s); checkMemberChange(state, userId, null);
      if (state.members.find(m => m.userId === userId)?.role !== expectedRole) throw new ServiceError('Membership changed. Reload members.', 'conflict');
      const r = await client.from('project_members').delete().eq('project_id', s.projectId)
        .eq('user_id', userId).eq('role', expectedRole).select('project_id,user_id,role').maybeSingle();
      await confirmed(s, state.currentUserId, r);
      const saved = row(memberShape, r.data);
      if (saved.project_id !== s.projectId || saved.user_id !== userId)
        throw new ServiceError('Unexpected deleted membership. Reload members.', 'unavailable');
    },
  };
}
