import { StructuredEditor } from '@/features/editor/structured-editor';
import type { TopicContent } from '@/domain/topic-content';
import { useParams } from 'wouter';

const noop = () => {};

/** Read-only inspection wrapper. Lazy-loaded so the editor engine stays out of the initial bundle. */
export default function ReviewDraftViewer({ content }: { content: TopicContent }) {
  const { workspaceId, projectId } = useParams<{ workspaceId?: string; projectId?: string }>();
  return (
    <div data-testid="review-draft-viewer">
      <StructuredEditor content={content} editable={false} onChange={noop} deferRender
        semanticContext={workspaceId && projectId ? { workspaceId, projectId } : undefined} />
    </div>
  );
}
