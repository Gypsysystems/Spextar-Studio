import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ReusableContext, ReusableItem } from '@/domain/reusable-content';
import { useServices } from '@/providers/services-provider';
import { useStudioSession } from '@/providers/session-provider';
import { StructuredDraftController } from '@/features/content/topic-draft-controller';
import { draftEntry } from '@/features/content/topic-draft-registry';
import { reusableRecovery } from '@/services/reusable-recovery';
import { reusableKeys } from './use-reusable-content';

export function useReusableDraft(c: ReusableContext, item: ReusableItem) {
  const { reusable, mode } = useServices();
  const { data: session } = useStudioSession();
  const userId = session?.userId ?? '';
  const client = useQueryClient();
  const entry = useMemo(() => {
    const scoped = { workspaceId: c.workspaceId, projectId: c.projectId, userId };
    return draftEntry(client, JSON.stringify(['reusable', userId, c.workspaceId, c.projectId, item.id, item.canEdit]), () =>
      new StructuredDraftController({
        get: () => reusable.getDraft(scoped, item.id),
        save: (content, revision) => reusable.saveDraft(scoped, item.id, content, revision),
      }, !!userId && item.canEdit, reusableRecovery(scoped, item.id, mode === 'backend'),
      () => { void client.invalidateQueries({ queryKey: reusableKeys.all }); }), 'reusable');
  }, [client, reusable, mode, userId, c.workspaceId, c.projectId, item.id, item.canEdit]);
  const controller = entry.controller;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => entry.mount(), [entry]);
  useEffect(() => {
    const refresh = () => controller.refreshIfClean();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [controller]);
  return { state, controller, sessionOnly: mode === 'demo' };
}
