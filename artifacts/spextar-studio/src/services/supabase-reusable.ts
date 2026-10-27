import type { SupabaseClient } from '@supabase/supabase-js';
import { supportsStructuredEditing } from '@/domain/structured-content';
import { contentKey, emptyContent } from '@/domain/topic-content';
import { parseReusable, parseReusableDraft, reusableContent, reusableEditSchema, reusableIdentitySchema, reusableInput,
  reusableInputSchema, reusableWrite, type ReusableContext, type ReusableItem, type ReusableService } from '@/domain/reusable-content';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';

export const reusableColumns = 'id,workspace_id,project_id,scope,name,slug,description,settings,status,update_policy,tags,created_by,created_at,updated_at';
export const reusableDraftColumns = 'reusable_content_id,content,revision,updated_at,updated_by';
export type ReusableAuthority = { userId: string; workspace: boolean; project: boolean };

/** Only authenticated table operations; never imports demo data or writes server audits. */
export function supabaseReusable(client: SupabaseClient, authorize: (c: ReusableContext) => Promise<ReusableAuthority>): ReusableService {
  async function actor(c: ReusableContext) {
    const a = await authorize(c);
    if (c.userId && a.userId !== c.userId) throw new ServiceError('The signed-in identity changed. Reopen reusable content.', 'unauthorized');
    return a;
  }
  function check(error: unknown) { if (error) throw backendError(error); }
  async function item(c: ReusableContext, id: string, write = false) {
    const a = await actor(c);
    const r = await client.from('reusable_contents').select(reusableColumns).eq('workspace_id', c.workspaceId).eq('id', id).maybeSingle();
    check(r.error);
    if (!r.data) throw new ServiceError('Reusable content was removed or is not accessible.', 'not-found');
    const v = parseReusable(r.data, c, a);
    if (write && !v.canEdit) throw new ServiceError(v.scope === 'project'
      ? 'Only explicit Project Admins and Authors may change project reusable content.'
      : 'Workspace administration is required to change shared reusable content.', 'forbidden');
    return { value: v, actor: a };
  }
  async function update(c: ReusableContext, id: string, patch: Record<string, unknown>, expected: string) {
    const original = await item(c, id, true);
    if (!Number.isFinite(Date.parse(expected))) throw new ServiceError('A last-read timestamp is required.', 'validation');
    await actor({ ...c, userId: original.actor.userId });
    let q = client.from('reusable_contents').update(patch).eq('workspace_id', c.workspaceId).eq('id', id).eq('scope', original.value.scope).eq('updated_at', expected);
    if (original.value.scope === 'project') q = q.eq('project_id', c.projectId);
    const r = await q.select(reusableColumns).maybeSingle();
    check(r.error);
    if (!r.data) throw new ServiceError('This item changed or access was revoked. Refresh the library before editing again.', 'conflict');
    const saved = parseReusable(r.data, c, original.actor);
    if (saved.id !== id || saved.scope !== original.value.scope || saved.slug !== original.value.slug)
      throw new ServiceError('The database returned a changed reusable identity. Reload before continuing.', 'unavailable');
    return saved;
  }
  const service: ReusableService = {
    async permissions(c) { const a = await actor(c); return { workspace: a.workspace, project: a.project }; },
    async list(c) {
      const a = await actor(c);
      const records: ReusableItem[] = [];
      for (const scope of ['workspace', 'project'] as const) {
        for (let offset = 0; ; offset += 1000) {
          let q = client.from('reusable_contents').select(reusableColumns).eq('workspace_id', c.workspaceId).eq('scope', scope);
          if (scope === 'project') q = q.eq('project_id', c.projectId);
          const r = await q.order('id').range(offset, offset + 999);
          check(r.error);
          if (!Array.isArray(r.data)) throw new ServiceError('Supabase returned an invalid reusable library.', 'unavailable');
          for (const row of r.data) {
            const mapped = parseReusable(row, c, a);
            if (mapped.scope !== scope) throw new ServiceError('Supabase returned a foreign reusable scope.', 'forbidden');
            records.push(mapped);
          }
          if (r.data.length < 1000) break;
        }
      }
      if (new Set(records.map(r => r.id)).size !== records.length) throw new ServiceError('Duplicate reusable identities were returned.', 'unavailable');
      return records.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },
    async create(c, input) {
      const data = reusableInput(reusableInputSchema, input); const a = await actor(c);
      if (!a[data.scope]) throw new ServiceError('You cannot create reusable content in this scope.', 'forbidden');
      await actor({ ...c, userId: a.userId });
      const r = await client.from('reusable_contents').insert({ ...reusableWrite(data), slug: data.slug, scope: data.scope,
        workspace_id: c.workspaceId, project_id: data.scope === 'project' ? c.projectId : null }).select(reusableColumns).maybeSingle();
      check(r.error);
      if (!r.data) throw new ServiceError('The database did not confirm the new reusable item.', 'unavailable');
      const saved = parseReusable(r.data, c, a);
      if (saved.scope !== data.scope) throw new ServiceError('Unexpected created reusable scope.', 'unavailable');
      return saved;
    },
    update: (c, id, input, expected) => update(c, id, reusableWrite(reusableInput(reusableEditSchema, input)), expected),
    rename(c, id, name, expected) {
      const parsed = reusableInput(reusableEditSchema.pick({ name: true }), { name });
      return update(c, id, parsed, expected);
    },
    async getDraft(c, id) {
      await item(c, id);
      const r = await client.from('reusable_content_drafts').select(reusableDraftColumns).eq('reusable_content_id', id).maybeSingle();
      check(r.error); return r.data ? parseReusableDraft(r.data, id) : null;
    },
    async saveDraft(c, id, content, expected) {
      const body = reusableContent(content);
      if (!supportsStructuredEditing(body)) throw new ServiceError('Unsupported structured content is read-only and was not changed.', 'validation');
      if (expected !== null && (!Number.isSafeInteger(expected) || expected < 1)) throw new ServiceError('A valid last-read revision is required.', 'validation');
      const original = await item(c, id, true);
      await actor({ ...c, userId: original.actor.userId });
      // Creation audits, updater, timestamp and revision are all maintained by the database.
      const q = expected === null
        ? client.from('reusable_content_drafts').insert({ reusable_content_id: id, content: body })
        : client.from('reusable_content_drafts').update({ content: body }).eq('reusable_content_id', id).eq('revision', expected);
      const r = await q.select(reusableDraftColumns).maybeSingle();
      if (r.error?.code === '23505') throw new ServiceError('Another browser created the draft first. Reload; your local copy is retained.', 'conflict');
      check(r.error);
      if (!r.data) throw new ServiceError('The draft revision changed or access was revoked. Nothing was overwritten. Reload to continue.', 'conflict');
      const saved = parseReusableDraft(r.data, id);
      if (saved.revision !== (expected ?? 0) + 1) throw new ServiceError('The database did not confirm the expected revision advance. Reload before retrying.', 'unavailable');
      return saved;
    },
    async duplicate(c, id, input) {
      const identity = reusableInput(reusableIdentitySchema, input);
      const original = await item(c, id, true);
      const scoped = { ...c, userId: original.actor.userId };
      const body = await service.getDraft(scoped, id);
      if (body && !supportsStructuredEditing(body.content))
        throw new ServiceError('This draft requires a compatible editor before it can be copied safely. The original was not changed.', 'validation');
      const source = original.value;
      const copy = await service.create(scoped, { ...source, ...identity, status: 'draft' });
      if (!body) return { item: copy, warning: 'Metadata copied. The source has no persisted draft body to copy.' };
      try {
        // Accommodate an existing database-created empty draft without overwriting a concurrent editor.
        const initial = await service.getDraft(scoped, copy.id);
        if (initial && (initial.revision !== 1 || contentKey(initial.content) !== contentKey(emptyContent())))
          throw new ServiceError('The new copy already has an edited draft. It was not overwritten.', 'conflict');
        await service.saveDraft(scoped, copy.id, structuredClone(body.content), initial?.revision ?? null);
        return { item: copy };
      } catch {
        // No delete/rollback is invented. Keep the identifiable partial copy and report it honestly.
        return { item: copy, warning: 'The copy was created, but its body could not be copied. The original is unchanged. Open this copy and restore its content explicitly; do not repeat Duplicate to retry.' };
      }
    },
  };
  return service;
}
