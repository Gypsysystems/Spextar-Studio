import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';

type Entity = 'organization' | 'workspace' | 'project';
type AtomicValues = { name: string; slug: string; description?: string; organizationId?: string; workspaceId?: string };
const rpcNames: Record<Entity, string> = {
  organization: 'create_organization',
  workspace: 'create_workspace',
  project: 'create_project',
};

/** Authoritative F0/F1 RPC contract: one atomic write, never metadata discovery,
 * alternate function names, direct entity inserts, or client-created memberships.
 */
export function atomicOperations(client: SupabaseClient) {
  return async (entity: Entity, values: AtomicValues): Promise<string> => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) {
      throw new ServiceError('A URL-safe resource slug is required. Use a name containing letters or numbers.', 'validation');
    }
    const args: Record<string, string | null> = { p_name: values.name, p_slug: values.slug };
    if (entity === 'organization') {
      if (values.description) throw new ServiceError('Organization creation does not support a description.', 'validation');
    } else {
      const parent = entity === 'workspace' ? values.organizationId : values.workspaceId;
      if (!parent?.trim()) throw new ServiceError('The selected tenant context is required. No write was attempted.', 'validation');
      args[entity === 'workspace' ? 'p_organization_id' : 'p_workspace_id'] = parent;
      args.p_description = values.description ?? null;
    }
    const { data, error } = await client.rpc(rpcNames[entity], args);
    if (error) throw backendError(error);
    const result: unknown = Array.isArray(data) ? data[0] : data;
    const id = typeof result === 'string' ? result
      : result && typeof result === 'object' ? ((result as Record<string, unknown>).id ?? (result as Record<string, unknown>)[`${entity}_id`]) : null;
    if (typeof id !== 'string' || !id) throw new ServiceError('The creation operation returned no resource identifier. Refresh before trying again.', 'unavailable');
    return id;
  };
}
