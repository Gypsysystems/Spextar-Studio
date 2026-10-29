import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { StudioSession } from '@/domain/types';
import { identityLabel } from '@/lib/presentation';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';

/** Optional presentation metadata only. No directory/admin Auth access or retained identity cache. */
export function supabaseIdentities(client: SupabaseClient, authorize: () => Promise<StudioSession>) {
  return {
    async resolve(ids: string[]): Promise<Record<string, string>> {
      const before = await authorize();
      const requested = [...new Set(ids)];
      const labels: Record<string, string> = Object.create(null);
      for (let start = 0; start < requested.length; start += 200) {
        const batch = requested.slice(start, start + 200);
        const result = await client.from('profiles').select('id,display_name').in('id', batch);
        if (result.error) throw backendError(result.error);
        const parsed = z.array(z.object({ id: z.string(), display_name: z.string().nullable() })).safeParse(result.data);
        if (!parsed.success || parsed.data.some(row => !batch.includes(row.id)) || new Set(parsed.data.map(row => row.id)).size !== parsed.data.length)
          throw new ServiceError('User details are unavailable. Refresh and try again.', 'unavailable');
        for (const row of parsed.data) labels[row.id] = identityLabel(row.display_name, row.id === before.userId ? before.email : undefined);
      }
      for (const id of requested) labels[id] ??= id === before.userId ? identityLabel(before.name, before.email) : 'Unknown user';
      if ((await authorize()).userId !== before.userId) throw new ServiceError('The signed-in account changed. Reload.', 'unauthorized');
      return labels;
    },
  };
}
