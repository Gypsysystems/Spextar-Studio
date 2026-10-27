import { emptyContent } from '@/domain/topic-content';
import { supportsStructuredEditing } from '@/domain/structured-content';
import { reusableContent, reusableEditSchema, reusableIdentitySchema, reusableInput, reusableInputSchema,
  type ReusableContext, type ReusableDraft, type ReusableItem, type ReusableService } from '@/domain/reusable-content';
import { ServiceError } from './contracts';

/** Session-only adapter-owned memory. No browser storage or backend client. */
export function demoReusable(authorize: (c: ReusableContext) => Promise<{ userId: string; workspace: boolean; project: boolean }>) {
  const libraries = new Map<string, ReusableItem[]>();
  const drafts = new Map<string, ReusableDraft>();
  let clock = 0;
  const time = () => new Date(clock = Math.max(Date.now(), clock + 1)).toISOString();
  async function access(c: ReusableContext) {
    const a = await authorize(c);
    if (c.userId && c.userId !== a.userId) throw new ServiceError('The demo identity changed.', 'unauthorized');
    return a;
  }
  function library(c: ReusableContext) {
    if (!libraries.has(c.workspaceId)) {
      const at = time();
      const samples: ReusableItem[] = [
        { id: crypto.randomUUID(), workspaceId: c.workspaceId, projectId: null, scope: 'workspace', name: 'Safety notice', slug: 'safety-notice',
          description: 'Shared technical safety guidance.', settings: {}, status: 'draft', updatePolicy: 'notify', tags: ['safety'],
          createdBy: 'demo', createdAt: at, updatedAt: at, canEdit: true },
        { id: crypto.randomUUID(), workspaceId: c.workspaceId, projectId: c.projectId, scope: 'project', name: 'Product introduction', slug: 'product-introduction',
          description: 'An introduction for this project.', settings: {}, status: 'draft', updatePolicy: 'manual', tags: ['introduction'],
          createdBy: 'demo', createdAt: at, updatedAt: at, canEdit: true },
      ];
      libraries.set(c.workspaceId, samples);
      for (const item of samples) drafts.set(item.id, { reusableContentId: item.id, revision: 1, updatedAt: at, updatedBy: 'demo',
        content: { ...emptyContent(), content: [{ type: 'paragraph', attrs: { id: crypto.randomUUID() },
          content: [{ type: 'text', text: item.scope === 'workspace' ? 'Read the safety guidance before operating the equipment.' : 'Welcome to this technical documentation.' }] }] } });
    }
    return libraries.get(c.workspaceId)!;
  }
  async function item(c: ReusableContext, id: string, mutate = false) {
    const a = await access(c);
    const value = library(c).find(v => v.id === id && (v.scope === 'workspace' ? v.projectId === null : v.projectId === c.projectId));
    if (!value) throw new ServiceError('Reusable content is not accessible in this scope.', 'not-found');
    if (mutate && !a[value.scope]) throw new ServiceError('This reusable-content scope is read-only for your role.', 'forbidden');
    return { value, actor: a };
  }
  const clone = (v: ReusableItem, a: { workspace: boolean; project: boolean }) => structuredClone({ ...v, canEdit: a[v.scope] });
  const service: ReusableService = {
    async permissions(c) { const a = await access(c); return { workspace: a.workspace, project: a.project }; },
    async list(c) {
      const a = await access(c);
      return library(c).filter(v => v.scope === 'workspace' || v.projectId === c.projectId)
        .map(v => clone(v, a)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },
    async create(c, input) {
      const a = await access(c), data = reusableInput(reusableInputSchema, input);
      if (!a[data.scope]) throw new ServiceError('This scope is read-only.', 'forbidden');
      if (library(c).some(v => v.slug === data.slug && v.scope === data.scope && v.projectId === (data.scope === 'project' ? c.projectId : null)))
        throw new ServiceError('This slug is already used in this scope.', 'conflict');
      const at = time(); const value: ReusableItem = { ...data, id: crypto.randomUUID(), workspaceId: c.workspaceId,
        projectId: data.scope === 'project' ? c.projectId : null, createdBy: a.userId, createdAt: at, updatedAt: at, canEdit: true };
      library(c).push(structuredClone(value)); return clone(value, a);
    },
    async update(c, id, input, expected) {
      const { value, actor } = await item(c, id, true), data = reusableInput(reusableEditSchema, input);
      if (value.updatedAt !== expected) throw new ServiceError('Metadata changed. Reload the library before retrying.', 'conflict');
      Object.assign(value, structuredClone(data), { updatedAt: time() }); return clone(value, actor);
    },
    async rename(c, id, name, expected) {
      const { value } = await item(c, id, true);
      return service.update(c, id, { ...value, name }, expected);
    },
    async getDraft(c, id) { await item(c, id); return structuredClone(drafts.get(id) ?? null); },
    async saveDraft(c, id, content, expected) {
      const { actor } = await item(c, id, true), body = reusableContent(content);
      if (!supportsStructuredEditing(body)) throw new ServiceError('Unsupported structured content is read-only.', 'validation');
      if (expected !== null && (!Number.isSafeInteger(expected) || expected < 1)) throw new ServiceError('A valid last-read revision is required.', 'validation');
      const original = drafts.get(id);
      if ((original?.revision ?? null) !== expected) throw new ServiceError('The saved revision changed. Reload; nothing was overwritten.', 'conflict');
      const saved = { reusableContentId: id, content: structuredClone(body), revision: (expected ?? 0) + 1, updatedAt: time(), updatedBy: actor.userId };
      drafts.set(id, saved); return structuredClone(saved);
    },
    async duplicate(c, id, input) {
      const identity = reusableInput(reusableIdentitySchema, input);
      const { value } = await item(c, id, true);
      const body = await service.getDraft(c, id);
      if (body && !supportsStructuredEditing(body.content)) throw new ServiceError('Unsupported content cannot be copied safely.', 'validation');
      const copy = await service.create(c, { ...value, ...identity, status: 'draft' });
      if (body) await service.saveDraft(c, copy.id, body.content, null);
      return { item: copy, ...(!body ? { warning: 'Metadata copied. The source has no persisted draft body to copy.' } : {}) };
    },
  };
  return { service, clear() { libraries.clear(); drafts.clear(); } };
}
