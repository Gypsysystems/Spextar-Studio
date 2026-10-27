import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectSummary } from '@/domain/types';
import { categoryInputSchema, categoryEditSchema, conditionNameSchema, conditionValueInputSchema, conditionValueEditSchema,
  conditionInput, parseCategory, parseConditionValue, categoryWrite, sortCategories, sortConditionValues,
  type ProjectConditionService } from '@/domain/project-conditions';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';

const categories = 'id,project_id,name,key,description,settings,unassigned_behavior,value_match_mode,created_at,updated_at';
const values = 'id,category_id,name,key,sort_order,created_at,updated_at';
export function supabaseConditions(client: SupabaseClient, requireProject: (id: string) => Promise<ProjectSummary>): ProjectConditionService {
  async function scope(pid: string, mutate = false) {
    const project = await requireProject(pid);
    if (mutate && project.canEditContent !== true) throw new ServiceError('Only explicit Project Admins and Authors may change conditions.', 'forbidden');
  }
  function check(error: unknown) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '23505') throw new ServiceError('This name, key or order is already in use. Refresh and choose a unique value.', 'conflict');
    if (code === '23514') throw new ServiceError('The database rejected these condition fields. Check the name, lowercase key, order and behavior.', 'validation');
    if (error) throw backendError(error);
  }
  async function category(pid: string, cid: string) {
    const r = await client.from('condition_categories').select(categories).eq('project_id', pid).eq('id', cid).maybeSingle();
    check(r.error);
    if (!r.data) throw new ServiceError('Category was removed or is not accessible in this project. Refresh the list.', 'not-found');
    return parseCategory(r.data, pid);
  }
  async function value(cid: string, id: string) {
    const r = await client.from('condition_values').select(values).eq('category_id', cid).eq('id', id).maybeSingle();
    check(r.error);
    if (!r.data) throw new ServiceError('Value was removed or is not accessible in this category. Refresh the values.', 'not-found');
    return parseConditionValue(r.data, cid);
  }
  async function list(table: string, columns: string, field: string, id: string, order: string) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const r = await client.from(table).select(columns).eq(field, id).order(order).order('id').range(from, from + 999);
      check(r.error);
      if (!Array.isArray(r.data)) throw new ServiceError('Supabase returned an invalid condition list.', 'unavailable');
      rows.push(...r.data);
      if (r.data.length < 1000) return rows;
    }
  }
  function uniqueIds(rows: { id: string; key: string }[]) {
    if (new Set(rows.map((r) => r.id)).size !== rows.length || new Set(rows.map((r) => r.key)).size !== rows.length)
      throw new ServiceError('Supabase returned duplicate condition identities. Refresh or contact your project administrator.', 'unavailable');
  }
  async function saveCategory(pid: string, id: string | null, patch: Record<string, unknown>) {
    const q = id === null ? client.from('condition_categories').insert({ ...patch, project_id: pid })
      : client.from('condition_categories').update(patch).eq('project_id', pid).eq('id', id);
    const r = await q.select(categories).maybeSingle(); check(r.error);
    if (!r.data) throw new ServiceError('Category was not saved. Access may have changed; refresh and try again.', 'not-found');
    const saved = parseCategory(r.data, pid);
    if (id !== null && saved.id !== id) throw new ServiceError('Unexpected saved category identity.', 'unavailable');
    return saved;
  }
  async function saveValue(cid: string, id: string | null, patch: Record<string, unknown>) {
    const q = id === null ? client.from('condition_values').insert({ ...patch, category_id: cid })
      : client.from('condition_values').update(patch).eq('category_id', cid).eq('id', id);
    const r = await q.select(values).maybeSingle(); check(r.error);
    if (!r.data) throw new ServiceError('Value was not saved. Access may have changed; refresh and try again.', 'not-found');
    const saved = parseConditionValue(r.data, cid);
    if (id !== null && saved.id !== id) throw new ServiceError('Unexpected saved value identity.', 'unavailable');
    return saved;
  }
  return {
    async listCategories(pid) {
      await scope(pid); const rows = (await list('condition_categories', categories, 'project_id', pid, 'name')).map((r) => parseCategory(r, pid));
      uniqueIds(rows); return sortCategories(rows);
    },
    async listValues(pid, cid) {
      await scope(pid); await category(pid, cid);
      const rows = (await list('condition_values', values, 'category_id', cid, 'sort_order')).map((r) => parseConditionValue(r, cid));
      uniqueIds(rows); return sortConditionValues(rows);
    },
    async createCategory(pid, input) {
      await scope(pid, true); const data = conditionInput(categoryInputSchema, input);
      return saveCategory(pid, null, { ...categoryWrite(data), key: data.key });
    },
    async updateCategory(pid, cid, input) {
      await scope(pid, true); const data = conditionInput(categoryEditSchema, input); await category(pid, cid);
      return saveCategory(pid, cid, categoryWrite(data));
    },
    async renameCategory(pid, cid, input) {
      await scope(pid, true); const data = conditionInput(conditionNameSchema, input); await category(pid, cid);
      return saveCategory(pid, cid, { name: data.name });
    },
    async createValue(pid, cid, input) {
      await scope(pid, true); const data = conditionInput(conditionValueInputSchema, input); await category(pid, cid);
      return saveValue(cid, null, { name: data.name, key: data.key, sort_order: data.sortOrder });
    },
    async updateValue(pid, cid, id, input) {
      await scope(pid, true); const data = conditionInput(conditionValueEditSchema, input); await category(pid, cid); await value(cid, id);
      return saveValue(cid, id, { name: data.name, sort_order: data.sortOrder });
    },
    async renameValue(pid, cid, id, input) {
      await scope(pid, true); const data = conditionInput(conditionNameSchema, input); await category(pid, cid); await value(cid, id);
      return saveValue(cid, id, { name: data.name });
    },
  };
}
