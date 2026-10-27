import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { DocumentRecord } from '@/domain/types';
import { useServices } from '@/providers/services-provider';
import { invalidateContent } from './use-content-mutation';
import { toast } from './use-toast';

export interface DeleteTarget { documentId: string; topicId?: string; expectedUpdatedAt: string }
// Query clients are identity-scoped. Keep tombstones beyond mutation GC so a suspended
// tab cannot flush a deleted item's draft later; discard them with that client's lifetime.
const deletedTargets = new WeakMap<QueryClient, Set<string>>();
const targetKey = (projectId: string, target: Pick<DeleteTarget, 'documentId' | 'topicId'>) => JSON.stringify([projectId, target.documentId, target.topicId ?? null]);
function rememberDeleted(client: QueryClient, projectId: string, target: DeleteTarget) {
  if (!deletedTargets.has(client)) deletedTargets.set(client, new Set());
  deletedTargets.get(client)!.add(targetKey(projectId, target));
}
export function metadataDeletionState(client: QueryClient, projectId: string, target: Pick<DeleteTarget, 'documentId' | 'topicId'>) {
  const remembered = deletedTargets.get(client);
  if (remembered?.has(targetKey(projectId, target)) || remembered?.has(targetKey(projectId, { documentId: target.documentId }))) return 'deleted';
  const matches = client.getMutationCache().findAll({ mutationKey: ['delete-content', projectId] }).filter((mutation) => {
    const value = mutation.state.variables as DeleteTarget | undefined;
    return value?.documentId === target.documentId && (!value.topicId || value.topicId === target.topicId);
  });
  if (matches.some((mutation) => mutation.state.status === 'success')) return 'deleted';
  if (matches.some((mutation) => mutation.state.status === 'pending')) return 'pending';
  return null;
}

/** Remove stale deleted records before refetch; unrelated local body drafts live outside this cache. */
export function pruneDeletedContent(client: QueryClient, projectId: string, target: DeleteTarget) {
  rememberDeleted(client, projectId, target);
  const prune = (doc: DocumentRecord): DocumentRecord | null => doc.id !== target.documentId ? doc
    : target.topicId ? { ...doc, topics: doc.topics.filter((topic) => topic.id !== target.topicId) } : null;
  client.setQueriesData<DocumentRecord[]>({ queryKey: ['documents', projectId] }, (docs) =>
    docs?.map(prune).filter((doc): doc is DocumentRecord => doc !== null));
  client.setQueriesData<DocumentRecord | null>({ queryKey: ['document', projectId] }, (doc) => doc ? prune(doc) : doc);
}

export function useContentDeletion(projectId: string, onDeleted: (target: DeleteTarget) => void) {
  const { documents } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['delete-content', projectId],
    scope: { id: `content-${projectId}` },
    retry: false,
    mutationFn: (target: DeleteTarget) => target.topicId
      ? documents.deleteTopic(projectId, target.documentId, target.topicId, target.expectedUpdatedAt)
      : documents.deleteDocument(projectId, target.documentId, target.expectedUpdatedAt),
    onSuccess: async (_result, target) => {
      rememberDeleted(client, projectId, target);
      await Promise.all([
        client.cancelQueries({ queryKey: ['documents', projectId] }),
        client.cancelQueries({ queryKey: ['document', projectId] }),
      ]);
      // Hook-level callback survives observer unmount. Navigate before refetch can render a deleted Author document.
      onDeleted(target);
      pruneDeletedContent(client, projectId, target);
      await invalidateContent(client, projectId);
    },
    onError: (error) => {
      toast({ title: 'Deletion was not confirmed', description: error.message, variant: 'destructive' });
      return invalidateContent(client, projectId);
    },
  });
}
