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
