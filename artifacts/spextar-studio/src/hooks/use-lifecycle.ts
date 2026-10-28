import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeleteConfirmation, LifecycleDetails, LifecycleMetadata, LifecycleScope } from '@/domain/lifecycle';
import { useServices } from '@/providers/services-provider';
import { ServiceError } from '@/services/contracts';
import { disposeLifecycleDrafts, hasUnsavedDrafts } from '@/features/content/topic-draft-registry';

export const lifecycleKey = (s: LifecycleScope) => ['lifecycle', s.kind, s.parentId ?? '', s.id] as const;
export function useLifecycle(s: LifecycleScope) {
  const { lifecycle, mode } = useServices();
  return useQuery({
    queryKey: lifecycleKey(s), enabled: mode === 'backend' && !!lifecycle, retry: false, staleTime: 0,
    queryFn: () => {
      if (!lifecycle) throw new ServiceError('Management is unavailable in this session.', 'unavailable');
      return lifecycle.get(s);
    },
  });
}
export type LifecycleAction =
  | { kind: 'update'; value: LifecycleMetadata; expected: LifecycleDetails }
  | { kind: 'archive'; archived: boolean; expected: LifecycleDetails }
  | { kind: 'delete'; confirmation: DeleteConfirmation; expected: LifecycleDetails };
export function useLifecycleMutation(s: LifecycleScope) {
  const { lifecycle } = useServices();
  const cache = useQueryClient();
  return useMutation({
    retry: false, scope: { id: `lifecycle:${s.kind}:${s.id}` },
    mutationFn: async (action: LifecycleAction) => {
      if (!lifecycle) throw new ServiceError('Management is unavailable in this session.', 'unavailable');
      if (action.kind === 'update') return lifecycle.update(s, action.value, action.expected);
      if (action.kind === 'archive') return lifecycle.setArchived(s, action.archived, action.expected);
      if (hasUnsavedDrafts(cache)) throw new ServiceError('Save or resolve your unsaved drafts before permanently deleting this item. No data was deleted.', 'conflict');
      return lifecycle.remove(s, action.confirmation, action.expected);
    },
    onSuccess: async (result, action) => {
      if (action.kind === 'delete') {
        // Drop obsolete descendant data rather than leaving an inaccessible entity in cache.
        // Stopping queued editors retains their recovery copies; it never flushes deleted drafts.
        disposeLifecycleDrafts(cache, s.kind, s.id, result?.projectIds ?? []);
        await cache.cancelQueries();
        cache.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      } else await cache.invalidateQueries();
    },
  });
}
