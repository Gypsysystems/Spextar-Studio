import { checkedContent, contentKey, type DraftScope, type TopicContent } from '@/domain/topic-content';

const prefix = 'spextar.backend.luyyxblmtupmugtazgbr.topic-recovery.v1.';
const userPrefix = (id: string) => prefix + encodeURIComponent(id) + '/';
const scopePrefix = (scope: DraftScope) => userPrefix(scope.userId)
  + [scope.projectId, scope.documentId, scope.topicId].map(encodeURIComponent).join('/') + '/';
export interface RecoveryCopy {
  version: 1;
  scope: DraftScope;
  content: TopicContent;
  baseRevision: number | null;
  editedAt: number;
  nonce: string;
}
export interface StoredRecovery { key: string; raw: string; copy: RecoveryCopy }
let fallbackTab: string | undefined;
function tabId() {
  fallbackTab ??= crypto.randomUUID();
  try {
    const key = 'spextar.topic-recovery.tab';
    let id = sessionStorage.getItem(key);
    if (!id) { id = fallbackTab; sessionStorage.setItem(key, id); }
    return id;
  } catch { return fallbackTab; }
}
function keys(start: string): string[] {
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    .filter((key): key is string => !!key?.startsWith(start));
}
export function readRecovery(scope: DraftScope): StoredRecovery[] {
  try {
    return keys(scopePrefix(scope)).flatMap((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const copy = JSON.parse(raw) as RecoveryCopy;
        if (copy.version !== 1 || !Number.isFinite(copy.editedAt) || typeof copy.nonce !== 'string'
          || (copy.baseRevision !== null && (!Number.isSafeInteger(copy.baseRevision) || copy.baseRevision < 1))
          || ['userId', 'projectId', 'documentId', 'topicId'].some((field) =>
            copy.scope?.[field as keyof DraftScope] !== scope[field as keyof DraftScope])) return [];
        checkedContent(copy.content);
        return [{ key, raw, copy }];
      } catch { return []; } // Untrusted/corrupt browser storage is never submitted to Supabase.
    }).sort((a, b) => b.copy.editedAt - a.copy.editedAt);
  } catch { throw new Error('Browser recovery is unavailable. Keep this tab open until the server save succeeds.'); }
}
export function rememberRecovery(scope: DraftScope, content: TopicContent, baseRevision: number | null) {
  const copy: RecoveryCopy = { version: 1, scope, content, baseRevision, editedAt: Date.now(), nonce: crypto.randomUUID() };
  try {
    localStorage.setItem(scopePrefix(scope) + tabId(), JSON.stringify(copy));
  } catch { throw new Error('Browser recovery could not be stored. Keep this tab open until the server save succeeds.'); }
}
export function removeRecovery(records: Pick<StoredRecovery, 'key' | 'raw'>[]) {
  for (const record of records) {
    // Never remove an intervening/newer edit from another tab.
    if (localStorage.getItem(record.key) === record.raw) localStorage.removeItem(record.key);
  }
}
export function clearMatchingRecovery(scope: DraftScope, content: TopicContent) {
  const key = contentKey(content);
  removeRecovery(readRecovery(scope).filter((record) => contentKey(record.copy.content) === key));
}
export function clearIdentityRecovery(userId: string) {
  try { for (const key of keys(userPrefix(userId))) localStorage.removeItem(key); } catch { /* Identity scoping still prevents cross-account reads. */ }
}
export function clearDeletedRecovery(userId: string, projectId: string, documentId: string, topicId?: string) {
  const start = userPrefix(userId) + [projectId, documentId, ...(topicId ? [topicId] : [])].map(encodeURIComponent).join('/') + '/';
  try { for (const key of keys(start)) localStorage.removeItem(key); } catch { /* Never convert a successful server deletion to a failure. */ }
}
