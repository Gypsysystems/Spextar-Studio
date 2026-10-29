import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from './use-studio-data';

export async function invalidateContent(client: QueryClient, projectId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['reference-usage'] }),
    client.invalidateQueries({ queryKey: qk.documents(projectId) }),
    client.invalidateQueries({ queryKey: ['document', projectId] }),
    client.invalidateQueries({ queryKey: ['project'] }),
    client.invalidateQueries({ queryKey: ['projects'] }),
  ]);
}

/** Serializes structural actions for a project; metadata autosave has its own scoped queue. */
export function useContentMutation(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    scope: { id: `content-${projectId}` },
    retry: false,
    onSuccess: () => invalidateContent(client, projectId),
    // Permissions may have changed even when a write fails.
    onError: () => invalidateContent(client, projectId),
  });
}
