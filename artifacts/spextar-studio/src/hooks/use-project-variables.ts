import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProjectVariable, VariableInput, VariableIdentity } from '@/domain/project-variables';
import { useServices } from '@/providers/services-provider';
import { ServiceError } from '@/services/contracts';
import { qk } from './use-studio-data';

export function useProjectVariables(projectId: string) {
  const { variables } = useServices();
  return useQuery({ queryKey: qk.variables(projectId), queryFn: () => variables.list(projectId), enabled: !!projectId });
}
export type VariableMutation =
  | { action: 'create'; input: VariableInput }
  | { action: 'update'; id: string; input: VariableInput }
  | { action: 'rename' | 'duplicate'; id: string; input: VariableIdentity };

export function useVariableMutation(projectId: string, canEdit: boolean) {
  const { variables } = useServices();
  const client = useQueryClient();
  return useMutation({
    scope: { id: `variables-${projectId}` }, retry: false,
    mutationFn: (operation: VariableMutation) => {
      if (!canEdit) throw new ServiceError('Only explicit Project Admins and Authors may change variables.', 'forbidden');
      if (operation.action === 'create') return variables.create(projectId, operation.input);
      if (operation.action === 'update') return variables.update(projectId, operation.id, operation.input);
      return variables[operation.action](projectId, operation.id, operation.input);
    },
    onSuccess: async (saved) => {
      client.setQueryData<ProjectVariable[]>(qk.variables(projectId), (old) =>
        [...(old ?? []).filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      await client.invalidateQueries({ queryKey: qk.variables(projectId) });
    },
  });
}
export function useValidateVariables(projectId: string) {
  const { variables } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => variables.validate(projectId), retry: false,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.variables(projectId) }),
  });
}
