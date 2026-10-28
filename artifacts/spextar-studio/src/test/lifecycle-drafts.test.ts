import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { draftEntry, disposeTopicDrafts, disposeLifecycleDrafts, hasUnsavedDrafts } from '@/features/content/topic-draft-registry';

type Controller = ReturnType<Parameters<typeof draftEntry>[2]>;
describe('lifecycle draft teardown', () => {
  it.each(['project', 'workspace', 'organization'] as const)('stops only affected %s controllers and retains unrelated work', (kind) => {
    const client = new QueryClient();
    const add = (key: unknown[], type: 'topic' | 'reusable') => {
      const controller = { subscribe: vi.fn(() => vi.fn()), stop: vi.fn(), start: vi.fn(),
        hasUnsaved: vi.fn(() => true), getSnapshot: () => ({ status: 'unsaved' }) };
      draftEntry(client, JSON.stringify(key), () => controller as unknown as Controller, type);
      return controller;
    };
    const topic = add(['user-a', 'project-a', 'doc-a', 'topic-a'], 'topic');
    const otherTopic = add(['user-a', 'project-b', 'doc-b', 'topic-b'], 'topic');
    const reusable = add(['reusable', 'user-a', 'ws-a', 'project-a', 'reuse-a', true], 'reusable');
    const otherReusable = add(['reusable', 'user-a', 'ws-b', 'project-b', 'reuse-b', true], 'reusable');
    expect(hasUnsavedDrafts(client)).toBe(true);
    disposeLifecycleDrafts(client, kind, kind === 'workspace' ? 'ws-a' : kind === 'organization' ? 'org-a' : 'project-a', ['project-a']);
    expect(topic.stop).toHaveBeenCalledOnce();
    expect(reusable.stop).toHaveBeenCalledOnce();
    expect(otherTopic.stop).toHaveBeenCalledTimes(kind === 'organization' ? 1 : 0);
    expect(otherReusable.stop).toHaveBeenCalledTimes(kind === 'organization' ? 1 : 0);
    expect(hasUnsavedDrafts(client)).toBe(kind !== 'organization');
    disposeTopicDrafts(client);
    expect(hasUnsavedDrafts(client)).toBe(false);
  });
});
