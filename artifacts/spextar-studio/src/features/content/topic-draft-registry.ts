import type { QueryClient } from '@tanstack/react-query';
import type { StructuredDraftController } from './topic-draft-controller';

interface Entry { controller: StructuredDraftController; mounts: number; unsubscribe: () => void; kind: 'topic' | 'reusable' }
interface Registry { entries: Map<string, Entry>; guard: (event: BeforeUnloadEvent) => void }
const registries = new WeakMap<QueryClient, Registry>();

/** Pending saves survive ordinary topic/route changes, but not an identity-cache teardown.
 * Clean, unobserved controllers are evicted instead of retaining whole bodies indefinitely.
 */
export function draftEntry(client: QueryClient, key: string, create: () => StructuredDraftController, kind: 'topic' | 'reusable' = 'topic') {
  let registry = registries.get(client);
  if (!registry) {
    const entries = new Map<string, Entry>();
    const guard = (event: BeforeUnloadEvent) => {
      if ([...entries.values()].some((entry) => entry.controller.hasUnsaved())) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    registry = { entries, guard };
    registries.set(client, registry);
    window.addEventListener('beforeunload', guard);
  }
  const owner = registry;
  let entry = owner.entries.get(key);
  if (!entry) {
    entry = { controller: create(), mounts: 0, unsubscribe: () => {}, kind };
    owner.entries.set(key, entry);
    const captured = entry;
    entry.unsubscribe = entry.controller.subscribe(() => {
      if (!captured.mounts && captured.controller.getSnapshot().status === 'saved') evict();
    });
  }
  const captured = entry;
  function evict() {
    captured.unsubscribe();
    captured.controller.stop();
    if (owner.entries.get(key) === captured) owner.entries.delete(key);
  }
  return {
    controller: captured.controller,
    mount() {
      captured.mounts++;
      captured.controller.start();
      return () => {
        captured.mounts--;
        if (!captured.mounts && captured.controller.getSnapshot().status === 'saved') evict();
      };
    },
  };
}
export function disposeTopicDrafts(client: QueryClient) {
  const registry = registries.get(client);
  if (!registry) return;
  registry.entries.forEach((entry) => { entry.unsubscribe(); entry.controller.stop(); });
  registry.entries.clear();
  window.removeEventListener('beforeunload', registry.guard);
  registries.delete(client);
}
export function disposeDeletedDrafts(client: QueryClient, projectId: string, documentId: string, topicId?: string) {
  const registry = registries.get(client);
  if (!registry) return;
  for (const [key, entry] of registry.entries) {
    if (entry.kind !== 'topic') continue;
    const [, project, document, topic] = JSON.parse(key) as string[];
    if (project === projectId && document === documentId && (!topicId || topicId === topic)) {
      entry.unsubscribe(); entry.controller.stop(); registry.entries.delete(key);
    }
  }
}

/** Stop only removed-scope editors. Unrelated unsaved controllers must remain recoverable. */
export function disposeLifecycleDrafts(client: QueryClient, kind: 'organization' | 'workspace' | 'project', id: string, projectIds: string[]) {
  const registry = registries.get(client);
  if (!registry) return;
  if (kind === 'organization') { disposeTopicDrafts(client); return; }
  const projects = new Set(projectIds);
  for (const [key, entry] of registry.entries) {
    const parts = JSON.parse(key) as (string | boolean)[];
    const matches = entry.kind === 'topic' ? projects.has(String(parts[1]))
      : kind === 'workspace' ? parts[2] === id : parts[3] === id;
    if (matches) {
      entry.unsubscribe(); entry.controller.stop(); registry.entries.delete(key);
    }
  }
}

export function hasUnsavedDrafts(client: QueryClient) {
  return [...registries.get(client)?.entries.values() ?? []].some(entry => entry.controller.hasUnsaved());
}
