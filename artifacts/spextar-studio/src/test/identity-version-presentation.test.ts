import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudioSession } from '@/domain/types';
import { documentVersionLabel, identityLabel } from '@/lib/presentation';
import { supabaseIdentities } from '@/services/supabase-identities';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const session: StudioSession = { mode: 'backend', userId: id, name: 'Current Writer', email: 'writer@example.test',
  initials: 'CW', role: 'author', organizationId: 'org-a', startedAt: '2026-10-28T00:00:00Z' };

describe('identity and version presentation', () => {
  it.each([undefined, null, '', ' ', '—', '–', '-', 'Unversioned'])('labels missing version %s without inventing a release', value => {
    expect(documentVersionLabel(value)).toBe('Unversioned');
    expect(documentVersionLabel(value, true)).toBe('Unversioned');
  });
  it('preserves genuine version labels and adds at most one display prefix', () => {
    expect(documentVersionLabel(' 1.2 ')).toBe('1.2');
    expect(documentVersionLabel('1.2', true)).toBe('v1.2');
    expect(documentVersionLabel('v1.2', true)).toBe('v1.2');
  });
  it('prefers readable names, otherwise email, and never renders a UUID', () => {
    expect(identityLabel(' Editor ', 'writer@example.test')).toBe('Editor');
    expect(identityLabel(null, 'writer@example.test')).toBe('writer@example.test');
    expect(identityLabel(id, 'writer@example.test')).toBe('writer@example.test');
    expect(identityLabel(id)).toBe('Unknown user');
    expect(identityLabel()).toBe('Unknown user');
  });

  function resolver(rows: unknown, error: unknown = null, authorize = vi.fn(async () => session)) {
    const inside = vi.fn(async () => ({ data: rows, error }));
    const select = vi.fn(() => ({ in: inside }));
    const from = vi.fn(() => ({ select }));
    return { service: supabaseIdentities({ from } as unknown as SupabaseClient, authorize), from, select, inside, authorize };
  }
  it('reads only authorized profile labels, deduplicates IDs and falls back to current email', async () => {
    const f = resolver([{ id, display_name: null }, { id: other, display_name: 'Harper Editor' }]);
    expect(await f.service.resolve([id, other, id])).toEqual({ [id]: session.email, [other]: 'Harper Editor' });
    expect(f.from).toHaveBeenCalledExactlyOnceWith('profiles');
    expect(f.select).toHaveBeenCalledExactlyOnceWith('id,display_name');
    expect(f.inside).toHaveBeenCalledExactlyOnceWith('id', [id, other]);
    expect(f.authorize).toHaveBeenCalledTimes(2);
  });
  it('does not invent another member email or expose IDs when RLS withholds profiles', async () => {
    const f = resolver([]);
    expect(await f.service.resolve([other])).toEqual({ [other]: 'Unknown user' });
  });
  it.each([
    { rows: [{ id: 'foreign', display_name: 'Foreign user' }] },
    { rows: [{ id, display_name: 'One' }, { id, display_name: 'Two' }] },
    { rows: [{ id, display_name: 2 }] },
  ])('rejects foreign, duplicate or malformed profile rows', async ({ rows }) => {
    const f = resolver(rows);
    await expect(f.service.resolve([id])).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('propagates permission errors without a directory or admin-Auth fallback', async () => {
    const f = resolver(null, { code: '42501', message: 'Denied' });
    await expect(f.service.resolve([id])).rejects.toMatchObject({ code: 'forbidden' });
    expect(f.from).toHaveBeenCalledTimes(1);
  });
  it('rejects a result if the authenticated identity changes during lookup', async () => {
    const authorize = vi.fn().mockResolvedValueOnce(session).mockResolvedValueOnce({ ...session, userId: other });
    const f = resolver([{ id, display_name: 'Prior identity' }], null, authorize);
    await expect(f.service.resolve([id])).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
