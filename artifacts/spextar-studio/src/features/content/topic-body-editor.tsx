import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DocumentRecord, Topic } from '@/domain/types';
import { supportsStructuredEditing } from '@/domain/structured-content';
import { useServices } from '@/providers/services-provider';
import { useStudioSession } from '@/providers/session-provider';
import { Button } from '@/components/ui/button';
import { StructuredEditor } from '@/features/editor/structured-editor';
import { invalidateContent } from '@/hooks/use-content-mutation';
import { metadataDeletionState } from '@/hooks/use-content-deletion';
import { TopicDraftController } from './topic-draft-controller';
import { draftEntry } from './topic-draft-registry';

export function TopicBodyEditor({ doc, topic, onBody }: {
  doc: DocumentRecord; topic: Topic; onBody: (id: string, body: string[]) => void;
}) {
  const services = useServices();
  const { data: session } = useStudioSession();
  const client = useQueryClient();
  const canEdit = doc.canEdit === true;
  const userId = session?.mode === 'backend' ? session.userId : '';
  const entry = useMemo(() => draftEntry(client, JSON.stringify([userId, doc.projectId, doc.id, topic.id, canEdit]), () => new TopicDraftController(
    services.topicDrafts, { userId, projectId: doc.projectId, documentId: doc.id, topicId: topic.id }, canEdit,
    () => { void invalidateContent(client, doc.projectId); },
    () => metadataDeletionState(client, doc.projectId, { documentId: doc.id, topicId: topic.id }) ?? undefined,
  )), [services, userId, doc.projectId, doc.id, topic.id, canEdit, client]);
  const { controller } = entry;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const onBodyRef = useRef(onBody);
  onBodyRef.current = onBody;
  useEffect(() => {
    if (state.loaded) onBodyRef.current(topic.id, state.text ? state.text.split(/\n{2,}/) : []);
  }, [state.text, state.loaded, topic.id]);
  useEffect(() => {
    const release = entry.mount();
    window.addEventListener('focus', controller.refreshIfClean);
    return () => {
      release();
      window.removeEventListener('focus', controller.refreshIfClean);
    };
  }, [controller, entry]);
  const label = state.status === 'saved'
    ? state.revision === null ? 'No saved body yet' : `Saved · revision ${state.revision}`
    : ({ loading: 'Loading saved body…', unsaved: 'Unsaved changes', saving: 'Saving…', error: 'Body not saved', conflict: 'Concurrent-edit conflict' } as const)[state.status];
  return (
    <div className="mt-4 space-y-3">
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground" data-testid="body-save-status">
        {label}{!canEdit && ' · Read-only'}
      </p>
      {state.recoveryWarning && <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">{state.recoveryWarning}</p>}
      {!!state.recovery.length && <div role="region" aria-label="Recover topic body" className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
        <p className="font-medium">A browser recovery copy is available</p>
        <p className="mt-1 text-xs text-muted-foreground">The saved body is shown below. Restore replaces it with the local copy and autosaves against {state.revision === null ? 'the empty draft' : `revision ${state.revision}`}. A newer server revision will still block the save.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={!supportsStructuredEditing(state.content) || !supportsStructuredEditing(state.recovery[0].copy.content)} onClick={controller.restore}>Restore recovery</Button>
          <Button size="sm" variant="outline" onClick={controller.discard}>Discard recovery</Button>
        </div>
      </div>}
      {state.error && <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
        <p>{state.error}</p>
        <p className="mt-1 text-xs text-muted-foreground">Reload shows the saved body and offers any different local recovery copy. Retry never forces an overwrite.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void controller.retry()}>{state.loaded ? 'Retry body save' : 'Retry loading body'}</Button>
          {state.loaded && <Button size="sm" variant="outline" onClick={() => void controller.reload()}>Reload saved draft</Button>}
        </div>
      </div>}
      <StructuredEditor content={state.content} editable={controller.editable()} loading={!state.loaded || state.status === 'loading'}
        onChange={controller.changeDocument} />
    </div>
  );
}
