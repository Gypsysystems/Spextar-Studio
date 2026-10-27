import type { ProjectVariable, ProjectVariableService } from '@/domain/project-variables';
import { validateVariableInput, validateVariableIdentity, validateVariableRows, variableWrite } from '@/domain/project-variables';
import { ServiceError } from './contracts';

/** Memory owned by one demo adapter. No backend client or browser storage. */
export function demoVariables(authorize: (projectId: string, mutate: boolean) => Promise<void>) {
  const projects = new Map<string, ProjectVariable[]>();
  function items(projectId: string) {
    if (!projects.has(projectId)) projects.set(projectId, [
      ['ProductName', 'Meridian X4'], ['ProductVersion', '1.0'], ['CompanyName', 'SPEXTAR'],
      ['SupportEmail', 'support@example.test'], ['DocsBaseUrl', 'https://docs.example.test'],
    ].map(([name, value]) => ({ id: crypto.randomUUID(), projectId, name, key: name, valueType: 'text',
      value, required: false, description: null, outputValues: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })));
    return projects.get(projectId)!;
  }
  const unique = (projectId: string, key: string, except?: string) => {
    if (items(projectId).some((item) => item.key === key && item.id !== except))
      throw new ServiceError('This variable key is already in use in this project.', 'conflict');
  };
  const find = (projectId: string, id: string) => {
    const value = items(projectId).find((item) => item.id === id);
    if (!value) throw new ServiceError('Variable not found in this project.', 'not-found');
    return value;
  };
  const service: ProjectVariableService = {
    async list(pid) { await authorize(pid, false); return structuredClone(items(pid)); },
    async validate(pid) {
      await authorize(pid, false);
      return validateVariableRows(items(pid).map((item) => ({ ...variableWrite(item), id: item.id,
        project_id: pid, created_at: item.createdAt, updated_at: item.updatedAt })), pid);
    },
    async create(pid, input) {
      await authorize(pid, true);
      const data = validateVariableInput(input); unique(pid, data.key);
      const value: ProjectVariable = { ...structuredClone(data), id: crypto.randomUUID(), projectId: pid, valueType: 'text',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      items(pid).push(value); return structuredClone(value);
    },
    async update(pid, id, input) {
      await authorize(pid, true);
      const data = validateVariableInput(input); const value = find(pid, id); unique(pid, data.key, id);
      Object.assign(value, structuredClone(data), { updatedAt: new Date().toISOString() }); return structuredClone(value);
    },
    async rename(pid, id, input) {
      await authorize(pid, true); const data = validateVariableIdentity(input); const value = find(pid, id); unique(pid, data.key, id);
      Object.assign(value, data, { updatedAt: new Date().toISOString() }); return structuredClone(value);
    },
    async duplicate(pid, id, input) {
      await authorize(pid, true); const data = validateVariableIdentity(input); const original = find(pid, id);
      return service.create(pid, { ...data, value: original.value, description: original.description, required: original.required, outputValues: original.outputValues });
    },
  };
  return { service, clear: () => projects.clear() };
}
