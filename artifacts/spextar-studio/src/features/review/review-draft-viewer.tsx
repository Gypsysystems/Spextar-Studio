import { useParams } from 'wouter';
import { StructuredEditor } from '@/features/editor/structured-editor';
import type { TopicContent } from '@/domain/topic-content';
import type { ReviewPackage } from '@/domain/review-package';

const noop = () => {};

/** Read-only inspection wrapper. Lazy-loaded so the editor engine stays out of the initial bundle. */
export default function ReviewDraftViewer({ content, frozenPackage }: { content: TopicContent; frozenPackage?: ReviewPackage | null }) {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  return (
    <div data-testid="review-draft-viewer">
      <StructuredEditor content={content} editable={false} onChange={noop} frozenPackage={frozenPackage} referenceContext={workspaceId && projectId ? { workspaceId, projectId } : undefined} deferRender />
    </div>
  );
}
