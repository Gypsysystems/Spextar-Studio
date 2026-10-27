import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble, testUser } from './supabase-double';

export const reusableAt = '2026-10-27T10:00:00Z';
export const reusableContext = { workspaceId: 'ws-a', projectId: 'project-a', userId: testUser.id };
export const reusableRow = (patch: Record<string, unknown> = {}) => ({
  id: 'reuse-a', workspace_id: 'ws-a', project_id: 'project-a', scope: 'project', name: 'Product introduction', slug: 'product-introduction',
  description: null, settings: { future: { keep: ['all'] } }, status: 'draft', update_policy: 'notify', tags: ['intro'],
  created_by: 'original-creator', created_at: reusableAt, updated_at: reusableAt, ...patch,
});
export const reusableBody = { type: 'doc', version: 1, ownerMetadata: { keep: true }, content: [{ type: 'paragraph', attrs: { id: 'durable-p' }, content: [{ type: 'text', text: 'Original body' }] }] };
export const reusableDraftRow = (patch: Record<string, unknown> = {}) => ({
  reusable_content_id: 'reuse-a', content: reusableBody, revision: 2, updated_at: reusableAt, updated_by: 'original-creator', ...patch,
});
export function reusableDouble(projectRole: string | null = 'author', workspaceAdmin = false) {
  const f = supabaseDouble();
  f.db.organization_members[0].role = 'member';
  f.db.workspace_members[0].role = workspaceAdmin ? 'admin' : 'member';
  f.db.project_members = projectRole ? [{ project_id: 'project-a', user_id: testUser.id, role: projectRole }] : [];
  f.db.reusable_contents.push(reusableRow(), reusableRow({ id: 'reuse-shared', scope: 'workspace', project_id: null, name: 'Shared notice', slug: 'shared-notice' }));
  f.db.reusable_content_drafts.push(reusableDraftRow());
  const services = createSupabaseServices(f.client);
  return { ...f, services, reusable: services.reusable };
}
