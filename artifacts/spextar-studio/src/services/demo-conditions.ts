import { categoryInputSchema, categoryEditSchema, conditionNameSchema, conditionValueInputSchema, conditionValueEditSchema,
  conditionInput, sortCategories, sortConditionValues, suggestConditionKey,
  type ConditionCategory, type ConditionValue, type ProjectConditionService } from '@/domain/project-conditions';
import { ServiceError } from './contracts';

/** Adapter-owned memory only. Never imports a backend client or accesses browser storage. */
export function demoConditions(authorize: (projectId: string, mutate: boolean) => Promise<void>) {
  const projects = new Map<string, { categories: ConditionCategory[]; values: ConditionValue[] }>();
  function data(pid: string) {
    if (!projects.has(pid)) {
      const at = new Date().toISOString();
      const categories = ['Audience', 'Platform', 'Edition', 'Region', 'Release channel'].map((name) => ({
        id: crypto.randomUUID(), projectId: pid, name, key: suggestConditionKey(name), description: null, settings: {},
        unassignedBehavior: 'include' as const, valueMatchMode: 'any' as const, createdAt: at, updatedAt: at,
      }));
      const samples = [['Administrator', 'Developer', 'End user'], ['Web', 'Windows', 'Linux'], ['Standard', 'Enterprise'], ['Global', 'Europe'], ['Stable', 'Beta']];
      projects.set(pid, { categories, values: categories.flatMap((category, i) => samples[i].map((name, sortOrder) => ({
        id: crypto.randomUUID(), categoryId: category.id, name, key: suggestConditionKey(name), sortOrder, createdAt: at, updatedAt: at,
      }))) });
    }
    return projects.get(pid)!;
  }
  function category(pid: string, cid: string) {
    const item = data(pid).categories.find((c) => c.id === cid);
    if (!item) throw new ServiceError('Category not found in this project.', 'not-found');
    return item;
  }
  function value(pid: string, cid: string, id: string) {
    category(pid, cid);
    const item = data(pid).values.find((v) => v.categoryId === cid && v.id === id);
    if (!item) throw new ServiceError('Value not found in this category.', 'not-found');
    return item;
  }
  function unique(items: { key: string; name: string }[], key: string) {
    if (items.some((r) => r.key === key)) throw new ServiceError('This key is already in use. Choose a unique key.', 'conflict');
  }
  const service: ProjectConditionService = {
    async listCategories(pid) { await authorize(pid, false); return structuredClone(sortCategories(data(pid).categories)); },
    async listValues(pid, cid) { await authorize(pid, false); category(pid, cid); return structuredClone(sortConditionValues(data(pid).values.filter((v) => v.categoryId === cid))); },
    async createCategory(pid, input) {
      await authorize(pid, true); const valid = conditionInput(categoryInputSchema, input);
      unique(data(pid).categories, valid.key);
      const at = new Date().toISOString();
      const item = { ...valid, id: crypto.randomUUID(), projectId: pid, settings: {}, createdAt: at, updatedAt: at };
      data(pid).categories.push(item); return structuredClone(item);
    },
    async updateCategory(pid, cid, input) {
      await authorize(pid, true); const valid = conditionInput(categoryEditSchema, input); const item = category(pid, cid);
      Object.assign(item, valid, { updatedAt: new Date().toISOString() }); return structuredClone(item);
    },
    async renameCategory(pid, cid, input) {
      await authorize(pid, true); const valid = conditionInput(conditionNameSchema, input); const item = category(pid, cid);
      Object.assign(item, valid, { updatedAt: new Date().toISOString() }); return structuredClone(item);
    },
    async createValue(pid, cid, input) {
      await authorize(pid, true); const valid = conditionInput(conditionValueInputSchema, input); category(pid, cid);
      unique(data(pid).values.filter((v) => v.categoryId === cid), valid.key);
      const at = new Date().toISOString(); const item = { ...valid, id: crypto.randomUUID(), categoryId: cid, createdAt: at, updatedAt: at };
      data(pid).values.push(item); return structuredClone(item);
    },
    async updateValue(pid, cid, id, input) {
      await authorize(pid, true); const valid = conditionInput(conditionValueEditSchema, input); const item = value(pid, cid, id);
      Object.assign(item, valid, { updatedAt: new Date().toISOString() }); return structuredClone(item);
    },
    async renameValue(pid, cid, id, input) {
      await authorize(pid, true); const valid = conditionInput(conditionNameSchema, input); const item = value(pid, cid, id);
      Object.assign(item, valid, { updatedAt: new Date().toISOString() }); return structuredClone(item);
    },
  };
  return { service, clear: () => projects.clear() };
}
