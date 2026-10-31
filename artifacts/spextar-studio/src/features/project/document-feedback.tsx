import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';

// Changes Recommended is a retained review decision; the working document is Draft.
export function DocumentFeedback({ projectId, documentId, draft }: { projectId: string; documentId: string; draft: boolean }) {
  const { reviews } = useServices();
  const query = useQuery({ queryKey: ['document-review', projectId, documentId],
    queryFn: () => reviews!.latest(projectId, documentId), enabled: draft && !!reviews, retry: false });
  if (!draft || !reviews) return null;
  if (query.isError) return <span className="text-xs text-muted-foreground">Review feedback unavailable</span>;
  return query.data?.status === 'changes_requested' ? <span className="rounded border px-2 py-1 text-xs">Changes Recommended</span> : null;
}
