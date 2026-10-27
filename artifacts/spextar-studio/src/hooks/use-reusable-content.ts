import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';
import { useStudioSession } from '@/providers/session-provider';
import type { ReusableContext, ReusableEdit, ReusableInput, ReusableResult } from '@/domain/reusable-content';

export const reusableKeys = {
  all: ['reusable-content'] as const,
  list: (c: ReusableContext) => ['reusable-content', c.workspaceId, c.projectId] as const,
  permissions: (c: ReusableContext) => ['reusable-permissions', c.workspaceId, c.projectId] as const,
};
export function useReusableContent(c: ReusableContext) {
  const { reusable } = useServices();
  return useQuery({ queryKey: reusableKeys.list(c), queryFn: () => reusable.list(c), enabled: !!c.workspaceId && !!c.projectId, retry: false });
}
export function useReusablePermissions(c: ReusableContext) {
  const { reusable } = useServices();
  return useQuery({ queryKey: reusableKeys.permissions(c), queryFn: () => reusable.permissions(c), enabled: !!c.workspaceId && !!c.projectId, retry: false });
}
export type ReusableMutation =
  | { action: 'create'; input: ReusableInput }
  | { action: 'update'; id: string; input: ReusableEdit; expectedUpdatedAt: string }
  | { action: 'rename'; id: string; name: string; expectedUpdatedAt: string }
  | { action: 'duplicate'; id: string; input: { name: string; slug: string } };
export function useReusableMutation(c: ReusableContext) {
  const { reusable } = useServices();
  const { data: session } = useStudioSession();
  const scoped = { ...c, userId: session?.userId ?? '' };
  const client = useQueryClient();
  return useMutation({
    scope: { id: `reusable-${c.workspaceId}` }, retry: false,
    mutationFn: async (op: ReusableMutation): Promise<ReusableResult> => {
      switch (op.action) {
        case 'create': return { item: await reusable.create(scoped, op.input) };
        case 'update': return { item: await reusable.update(scoped, op.id, op.input, op.expectedUpdatedAt) };
        case 'rename': return { item: await reusable.rename(scoped, op.id, op.name, op.expectedUpdatedAt) };
        case 'duplicate': return reusable.duplicate(scoped, op.id, op.input);
      }
    },
    // Workspace-shared edits must refresh lists reached through other projects too.
    onSuccess: () => client.invalidateQueries({ queryKey: reusableKeys.all }),
  });
}
