import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';
import { ServiceError } from '@/services/contracts';
import type { CategoryInput, CategoryEdit, ConditionValueInput, ConditionValueEdit, ConditionRename } from '@/domain/project-conditions';
import { qk } from './use-studio-data';

export function useConditionCategories(projectId: string) {
  const { conditions } = useServices();
  return useQuery({ queryKey: qk.conditionCategories(projectId), queryFn: () => conditions.listCategories(projectId), enabled: !!projectId });
}
export function useConditionValues(projectId: string, categoryId: string | null) {
  const { conditions } = useServices();
  return useQuery({ queryKey: qk.conditionValues(projectId, categoryId ?? ''), queryFn: () => conditions.listValues(projectId, categoryId!), enabled: !!projectId && !!categoryId });
}
export type ConditionMutation =
  | { action: 'createCategory'; input: CategoryInput }
  | { action: 'updateCategory'; categoryId: string; input: CategoryEdit }
  | { action: 'renameCategory'; categoryId: string; input: ConditionRename }
  | { action: 'createValue'; categoryId: string; input: ConditionValueInput }
  | { action: 'updateValue'; categoryId: string; valueId: string; input: ConditionValueEdit }
  | { action: 'renameValue'; categoryId: string; valueId: string; input: ConditionRename };
export function useConditionMutation(projectId: string, canEdit: boolean) {
  const { conditions } = useServices();
  const client = useQueryClient();
  return useMutation({
    scope: { id: `conditions-${projectId}` }, retry: false,
    mutationFn: async (op: ConditionMutation) => {
      if (!canEdit) throw new ServiceError('Only explicit Project Admins and Authors may change conditions.', 'forbidden');
      switch (op.action) {
        case 'createCategory': return conditions.createCategory(projectId, op.input);
        case 'updateCategory': return conditions.updateCategory(projectId, op.categoryId, op.input);
        case 'renameCategory': return conditions.renameCategory(projectId, op.categoryId, op.input);
        case 'createValue': return conditions.createValue(projectId, op.categoryId, op.input);
        case 'updateValue': return conditions.updateValue(projectId, op.categoryId, op.valueId, op.input);
        case 'renameValue': return conditions.renameValue(projectId, op.categoryId, op.valueId, op.input);
      }
    },
    onSuccess: async (_saved, op) => {
      if (op.action === 'createCategory' || op.action === 'updateCategory' || op.action === 'renameCategory')
        await client.invalidateQueries({ queryKey: qk.conditionCategories(projectId) });
      else await client.invalidateQueries({ queryKey: qk.conditionValues(projectId, op.categoryId) });
    },
  });
}
