import { contentKey, type TopicContent } from '@/domain/topic-content';
import { reusableContent, type ReusableContext } from '@/domain/reusable-content';
import type { DraftRecovery, DraftRecoveryPort } from '@/features/content/topic-draft-controller';

const prefix = 'spextar.backend.luyyxblmtupmugtazgbr.reusable-recovery.v1.';
const userPrefix = (userId: string) => prefix + encodeURIComponent(userId) + '/';
let tab: string | undefined;
const keys = (start: string) => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
  .filter((key): key is string => !!key?.startsWith(start));
export function reusableRecovery(c: ReusableContext & { userId: string }, id: string, backend: boolean): DraftRecoveryPort {
  // Demo bodies and recovery remain session memory only, including when storage is available.
  if (!backend) return { read: () => [], remember() {}, clearMatching() {}, remove() {} };
  const start = userPrefix(c.userId) + [c.workspaceId, c.projectId, id].map(encodeURIComponent).join('/') + '/';
  const scope = JSON.stringify([c.userId, c.workspaceId, c.projectId, id]);
  function read(): DraftRecovery[] {
    try {
      return keys(start).flatMap(key => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return [];
          const copy = JSON.parse(raw);
          if (copy.version !== 1 || copy.scope !== scope || !Number.isFinite(copy.editedAt)
            || typeof copy.nonce !== 'string' || (copy.baseRevision !== null && (!Number.isSafeInteger(copy.baseRevision) || copy.baseRevision < 1))) return [];
          reusableContent(copy.content);
          return [{ key, raw, copy }];
        } catch { return []; }
      }).sort((a, b) => b.copy.editedAt - a.copy.editedAt);
    } catch { throw new Error('Browser recovery is unavailable. Keep this tab open until the server save succeeds.'); }
  }
  function remove(records: DraftRecovery[]) {
    for (const r of records) if (localStorage.getItem(r.key) === r.raw) localStorage.removeItem(r.key);
  }
  return {
    read, remove,
    remember(content: TopicContent, baseRevision: number | null) {
      tab ??= crypto.randomUUID();
      try { localStorage.setItem(start + tab, JSON.stringify({ version: 1, scope, content, baseRevision, editedAt: Date.now(), nonce: crypto.randomUUID() })); }
      catch { throw new Error('Recovery could not be stored. Keep this tab open until the server save succeeds.'); }
    },
    clearMatching(content) { const key = contentKey(content); remove(read().filter(r => contentKey(r.copy.content) === key)); },
  };
}
export function clearReusableIdentityRecovery(userId: string) {
  try { for (const key of keys(userPrefix(userId))) localStorage.removeItem(key); } catch { /* Identity keys still prevent cross-account reads. */ }
}
