import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateContent } from './use-content-mutation';
import { toast } from './use-toast';
import { metadataDeletionState, type DeleteTarget } from './use-content-deletion';
import { markMetadataPending } from '@/features/content/topic-draft-registry';

/** Debounced and serialized per mounted entity. A failed write is never labelled saved. */
export function useMetadataAutosave<T extends object>(server: T, save: (value: T) => Promise<void>, projectId: string, target?: Pick<DeleteTarget, 'documentId' | 'topicId'>) {
  const [draft, setDraft] = useState(server);
  const [state, setState] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const [error, setError] = useState<Error | null>(null);
  const pending = useRef<T | null>(null);
  const failed = useRef<T | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const client = useQueryClient();
  const pendingKey = JSON.stringify([projectId, target?.documentId, target?.topicId]);
  const serverJSON = JSON.stringify(server);

  useEffect(() => {
    if (!pending.current && !running.current && !failed.current) setDraft(JSON.parse(serverJSON));
  }, [serverJSON]);

  function suspendForDeletion() {
    const deleting = target && metadataDeletionState(client, projectId, target);
    if (deleting === 'deleted') { pending.current = null; failed.current = null; markMetadataPending(client, pendingKey, false); return true; }
    if (deleting === 'pending') { timer.current = setTimeout(() => void flush(), 100); return true; }
    return false;
  }
  async function flush() {
    clearTimeout(timer.current);
    if (running.current || suspendForDeletion()) return;
    running.current = true;
    try {
      while (pending.current) {
        if (suspendForDeletion()) return;
        const value = pending.current;
        pending.current = null;
        if (mounted.current) { setState('saving'); setError(null); }
        try {
          await saveRef.current(value);
          failed.current = null;
          await invalidateContent(client, projectId);
        } catch (e) {
          if (target && metadataDeletionState(client, projectId, target)) {
            pending.current ??= value;
            timer.current = setTimeout(() => void flush(), 100);
            return;
          }
          failed.current = pending.current ?? value;
          pending.current = null;
          if (mounted.current) { setError(e instanceof Error ? e : new Error('Metadata could not be saved.')); setState('error'); }
          else toast({ title: 'Metadata was not saved', description: 'Reopen the item and re-enter any unsaved metadata changes.', variant: 'destructive' });
          return;
        }
      }
      markMetadataPending(client, pendingKey, false);
      if (mounted.current) setState('saved');
    } finally { running.current = false; }
  }

  function change(value: T) {
    markMetadataPending(client, pendingKey, true);
    setDraft(value); pending.current = value; failed.current = null;
    setState('pending'); setError(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  }
  function retry() {
    pending.current = failed.current;
    void flush();
  }
  useEffect(() => {
    mounted.current = true;
    const guard = (event: BeforeUnloadEvent) => {
      if (pending.current || running.current || failed.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', guard);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      // Field blur normally flushes before route/dialog changes. Flush any remaining
      // captured entity draft; never redirect it into another selected topic.
      void flush();
      window.removeEventListener('beforeunload', guard);
    };
  }, []);
  return { draft, change, flush, retry, state, error };
}
