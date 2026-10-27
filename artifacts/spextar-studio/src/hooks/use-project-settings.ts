import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';
import type { ProjectMetadata, SettingsRole, SettingsScope } from '@/domain/project-settings';

export const projectSettingsKey = (s: SettingsScope) => ['project-settings', s.workspaceId, s.projectId] as const;
export function useProjectSettings(s: SettingsScope) {
  const { projectSettings } = useServices();
  return useQuery({ queryKey: projectSettingsKey(s), queryFn: () => projectSettings.get(s), retry: false, staleTime: 0 });
}
export type SettingsAction =
  | { kind: 'metadata'; value: ProjectMetadata; expectedUpdatedAt: string }
  | { kind: 'add'; userId: string; role: SettingsRole }
  | { kind: 'role'; userId: string; role: SettingsRole; expectedRole: SettingsRole }
  | { kind: 'remove'; userId: string; expectedRole: SettingsRole };
export function useProjectSettingsMutation(s: SettingsScope) {
  const { projectSettings } = useServices();
  const cache = useQueryClient();
  return useMutation({
    retry: false,
    scope: { id: `project-settings:${s.projectId}` },
    mutationFn: (a: SettingsAction) => {
      if (a.kind === 'metadata') return projectSettings.update(s, a.value, a.expectedUpdatedAt);
      if (a.kind === 'add') return projectSettings.addMember(s, a.userId, a.role);
      if (a.kind === 'role') return projectSettings.changeRole(s, a.userId, a.role, a.expectedRole);
      return projectSettings.removeMember(s, a.userId, a.expectedRole);
    },
    // Membership changes affect more than settings: permissions, content controls, lists and counts.
    // Identity transitions replace this entire cache in SessionProvider.
    onSuccess: () => cache.invalidateQueries(),
  });
}
