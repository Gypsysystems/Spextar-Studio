/**
 * Safe localStorage access. Every read tolerates missing storage (private mode, SSR),
 * corrupt JSON and wrong shapes by returning the fallback.
 */

export const STORAGE_KEYS = {
  // Legacy v1 keys are reserved exclusively for the local DEMO adapter.
  // Backend adapters must never read or migrate them as authenticated data.
  session: 'spextar.v1.session',
  workspaces: 'spextar.v1.workspaces',
  projects: 'spextar.v1.projects',
  documents: 'spextar.v1.documents',
  navCollapsed: 'spextar.v1.nav-collapsed',
} as const;

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__spextar_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJSON<T>(key: string, fallback: T, guard?: (value: unknown) => value is T): T {
  const s = storage();
  if (!s) return fallback;
  try {
    const raw = s.getItem(key);
    if (raw == null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (guard && !guard(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Returns false when storage is unavailable or full; callers decide whether to surface it. */
export function writeJSON(key: string, value: unknown): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

