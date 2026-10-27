import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useMetadataAutosave } from '@/hooks/use-metadata-autosave';

it('serializes autosave and coalesces edits made while a prior write is pending', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const first = new Promise<void>((resolve) => { release = resolve; });
  const save = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(undefined);
  const client = new QueryClient();
  const { result } = renderHook(() => useMetadataAutosave({ title: 'Original' }, save, 'project-a'), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  act(() => result.current.change({ title: 'First' }));
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(save).toHaveBeenCalledTimes(1);
  act(() => result.current.change({ title: 'Intermediate' }));
  act(() => result.current.change({ title: 'Latest' }));
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => { release(); await first; });
  expect(save.mock.calls.map(([value]) => value.title)).toEqual(['First', 'Latest']);
  expect(result.current.state).toBe('saved');
  expect(result.current.draft.title).toBe('Latest');
});

it.each(['success', 'failure'])('pauses queued metadata while deleting and handles deletion %s without resurrecting a deleted item', async (outcome) => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  const client = new QueryClient();
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const response = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  const mutation = client.getMutationCache().build(client, { mutationKey: ['delete-content', 'project-a'], mutationFn: () => response });
  const { result, unmount } = renderHook(() => useMetadataAutosave({ title: 'Original' }, save, 'project-a', { documentId: 'doc-a', topicId: 'topic-a' }), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  act(() => result.current.change({ title: 'Queued draft' }));
  const operation = mutation.execute({ documentId: 'doc-a', topicId: 'topic-a', expectedUpdatedAt: 'now' }).catch(() => undefined);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(save).not.toHaveBeenCalled();
  await act(async () => { if (outcome === 'success') resolve(); else reject(new Error('Delete denied')); await operation; });
  await act(() => vi.advanceTimersByTimeAsync(300));
  if (outcome === 'success') expect(save).not.toHaveBeenCalled();
  else { expect(save).toHaveBeenCalledWith({ title: 'Queued draft' }); expect(result.current.state).toBe('saved'); }
  unmount();
});
