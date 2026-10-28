import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectSummary } from '@/domain/types';
import { VARIABLE_KEY_RULE, parseVariableRow, validateVariableIdentity, validateVariableInput, validateVariableRows, variableWrite,
  type ProjectVariableService } from '@/domain/project-variables';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';

const columns = 'id,project_id,name,key,value_type,value,description,required,output_values,created_at,updated_at';
export function supabaseVariables(client: SupabaseClient, requireProject: (id: string) => Promise<ProjectSummary>): ProjectVariableService {
  async function scope(projectId: string, mutate = false) {
    const project = await requireProject(projectId);
    if (mutate && project.canEditContent !== true) throw new ServiceError('Only explicit Project Admins and Authors may change variables.', 'forbidden');
  }
  function check(error: unknown) {
    if ((error as { code?: string } | null)?.code === '23505') throw new ServiceError('This variable key is already in use in this project. Choose another key.', 'conflict');
    if ((error as { code?: string } | null)?.code === '23514') throw new ServiceError('These variable values could not be saved. Check the fields and key rule.', 'validation', [VARIABLE_KEY_RULE]);
    if (error) throw backendError(error);
  }
  async function rows(projectId: string) {
    await scope(projectId);
    const result: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const page = await client.from('project_variables').select(columns).eq('project_id', projectId)
        .order('name').order('id').range(from, from + 999);
      check(page.error);
      if (!Array.isArray(page.data)) throw new ServiceError('The variable list could not be read. Refresh and try again.', 'unavailable');
      result.push(...page.data);
      if (page.data.length < 1000) return result;
    }
  }
  async function existing(projectId: string, id: string) {
    const row = await client.from('project_variables').select(columns).eq('project_id', projectId).eq('id', id).maybeSingle();
    check(row.error);
    if (!row.data) throw new ServiceError('Variable was removed or is not accessible in this project.', 'not-found');
    return parseVariableRow(row.data, projectId);
  }
  async function save(projectId: string, id: string | null, patch: Record<string, unknown>) {
    const query = id === null ? client.from('project_variables').insert({ ...patch, project_id: projectId })
      : client.from('project_variables').update(patch).eq('project_id', projectId).eq('id', id);
    const result = await query.select(columns).maybeSingle();
    check(result.error);
    if (!result.data) throw new ServiceError('Variable could not be saved. Access may have changed; reload and retry.', 'forbidden');
    return parseVariableRow(result.data, projectId);
  }
  return {
    async list(projectId) { return (await rows(projectId)).map((row) => parseVariableRow(row, projectId)); },
    async validate(projectId) { return validateVariableRows(await rows(projectId), projectId); },
    async create(projectId, input) {
      await scope(projectId, true);
      return save(projectId, null, variableWrite(validateVariableInput(input)));
    },
    async update(projectId, id, input) {
      await scope(projectId, true);
      await existing(projectId, id); // Refuse edits to unsupported saved shapes.
      return save(projectId, id, variableWrite(validateVariableInput(input)));
    },
    async rename(projectId, id, input) {
      await scope(projectId, true); await existing(projectId, id);
      return save(projectId, id, { ...validateVariableIdentity(input) });
    },
    async duplicate(projectId, id, input) {
      await scope(projectId, true);
      const original = await existing(projectId, id);
      const copy = { ...validateVariableIdentity(input), value: original.value, description: original.description,
        required: original.required, outputValues: original.outputValues };
      return save(projectId, null, variableWrite(validateVariableInput(copy)));
    },
  };
}
