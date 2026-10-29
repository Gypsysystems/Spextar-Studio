import { useParams } from 'wouter';
import { StructuredEditor } from '@/features/editor/structured-editor';
import type { TopicContent } from '@/domain/topic-content';

const noop = () => {};

/** Read-only inspection wrapper. Lazy-loaded so the editor engine stays out of the initial bundle. */
export default function ReviewDraftViewer({ content }: { content: TopicContent }) {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  return (
    <div data-testid="review-draft-viewer">
      <StructuredEditor content={content} editable={false} onChange={noop} referenceContext={workspaceId && projectId ? { workspaceId, projectId } : undefined} deferRender />
    </div>
  );
}
