import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';

type Entity = 'organization' | 'workspace' | 'project';
type AtomicValues = { name: string; slug: string; description?: string; organizationId?: string; workspaceId?: string };
type Signature = { name: string; parameters: string[] };
const candidates: Record<Entity, string[]> = {
  organization: ['create_organization_with_owner', 'create_organization'],
  workspace: ['create_workspace_with_admin', 'create_workspace'],
  project: ['create_project_with_admin', 'create_project'],
};

/** Discover accessible signatures without ever executing a create function as a probe.
 * GET requests run in a read-only transaction; unmatched named arguments request metadata.
 * If metadata is unavailable, fail closed instead of guessing or inserting membership rows.
 */
export function atomicOperations(client: SupabaseClient) {
  const signatures = new Map<Entity, Signature>();
  async function resolve(entity: Entity): Promise<Signature> {
    const cached = signatures.get(entity);
    if (cached) return cached;
    for (const name of candidates[entity]) {
      const { error } = await client.rpc(name, { __spextar_signature_probe__: true }, { get: true });
      if (!error) throw new ServiceError('Unexpected database signature-probe response. Creation was stopped.', 'unavailable');
      if (error.code !== 'PGRST202') throw backendError(error);
      const match = error.hint?.match(/public\.(\w+)\(([^)]*)\)/);
      if (match && match[1] === name) {
        const parameters = match[2].split(',').map((s) => s.trim()).filter(Boolean);
        const signature = { name, parameters };
        signatures.set(entity, signature);
        return signature;
      }
    }
    throw new ServiceError(`The existing atomic ${entity} creation function is not discoverable for this account. Its exact callable name and parameters are required. No direct inserts were attempted.`, 'unavailable');
  }
  return async (entity: Entity, values: AtomicValues): Promise<string> => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) {
      throw new ServiceError('A URL-safe resource slug is required. Use a name containing letters or numbers.', 'validation');
    }
    const signature = await resolve(entity);
    const parameterNames = signature.parameters.map((p) => p.replace(/^p_/, ''));
    if (!parameterNames.some((p) => p === 'slug' || p === `${entity}_slug`)) {
      throw new ServiceError('The database function cannot accept the requested slug. Creation was stopped.', 'unavailable');
    }
    const requiredParent = entity === 'workspace' ? ['organization_id', 'org_id'] : entity === 'project' ? ['workspace_id'] : [];
    if (requiredParent.length && !parameterNames.some((p) => requiredParent.includes(p))) {
      throw new ServiceError('The database function cannot accept the selected tenant context. Creation was stopped.', 'unavailable');
    }
    if (values.description && !parameterNames.includes('description')) {
      throw new ServiceError('This creation function does not support a description. Leave it blank or confirm the database contract.', 'validation');
    }
    const args: Record<string, string | null> = {};
    const aliases: Record<string, string | null | undefined> = {
      name: values.name, [`${entity}_name`]: values.name,
      slug: values.slug, [`${entity}_slug`]: values.slug,
      description: values.description ?? null,
      organization_id: values.organizationId, org_id: values.organizationId,
      workspace_id: values.workspaceId,
    };
    for (const parameter of signature.parameters) {
      const alias = parameter.replace(/^p_/, '');
      if (!(alias in aliases) || aliases[alias] === undefined) {
        throw new ServiceError(`Unsupported atomic creation parameter "${parameter}". Confirm the database function contract before creating this resource.`, 'unavailable');
      }
      args[parameter] = aliases[alias] ?? null;
    }
    if (!signature.parameters.some((p) => /^(p_)?(name|organization_name|workspace_name|project_name)$/.test(p))) {
      throw new ServiceError('The database function must accept a resource name. Creation was stopped.', 'unavailable');
    }
    const { data, error } = await client.rpc(signature.name, args);
    if (error) throw backendError(error);
    const result: unknown = Array.isArray(data) ? data[0] : data;
    const id = typeof result === 'string' ? result
      : result && typeof result === 'object' ? ((result as Record<string, unknown>).id ?? (result as Record<string, unknown>)[`${entity}_id`]) : null;
    if (typeof id !== 'string' || !id) throw new ServiceError('The creation operation returned no resource identifier. Refresh before trying again.', 'unavailable');
    return id;
  };
}
