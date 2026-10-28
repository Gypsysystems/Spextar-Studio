import type { Topic } from './types';
import { ServiceError } from '@/services/contracts';

/** Preorder is derived from the actual parent graph, never from response order or stored depth. */
export function orderTopics(topics: Topic[]): Topic[] {
  const ids = new Set(topics.map((t) => t.id));
  const byId = new Map(topics.map((t) => [t.id, t]));
  if (ids.size !== topics.length) throw new ServiceError('The topic outline contains duplicate topics. Refresh and try again.', 'unavailable');
  const children = new Map<string | null, Topic[]>();
  for (const topic of topics) {
    const parent = topic.parentTopicId ?? null;
    if (parent !== null && !ids.has(parent)) throw new ServiceError('A topic parent is missing from this document.', 'unavailable');
    children.set(parent, [...(children.get(parent) ?? []), topic]);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
  // Check cycles iteratively first, including disconnected cycles.
  const complete = new Set<string>();
  for (const topic of topics) {
    const seen = new Set<string>();
    let current: Topic | undefined = topic;
    while (current && !complete.has(current.id)) {
      if (seen.has(current.id)) throw new ServiceError('The topic outline contains an invalid loop. Refresh and try again.', 'unavailable');
      seen.add(current.id);
      current = current.parentTopicId ? byId.get(current.parentTopicId) : undefined;
    }
    seen.forEach((id) => complete.add(id));
  }
  const result: Topic[] = [];
  const stack = (children.get(null) ?? []).toReversed().map((topic) => ({ topic, level: 1 }));
  while (stack.length) {
    const { topic, level } = stack.pop()!;
    result.push({ ...topic, level });
    for (const child of (children.get(topic.id) ?? []).toReversed()) stack.push({ topic: child, level: level + 1 });
  }
  return result;
}

export function topicDescendants(topics: Topic[], id: string): Set<string> {
  const found = new Set([id]);
  const children = new Map<string, string[]>();
  for (const topic of topics) if (topic.parentTopicId) children.set(topic.parentTopicId, [...(children.get(topic.parentTopicId) ?? []), topic.id]);
  const stack = [id];
  while (stack.length) {
    for (const child of children.get(stack.pop()!) ?? []) if (!found.has(child)) { found.add(child); stack.push(child); }
  }
  return found;
}
