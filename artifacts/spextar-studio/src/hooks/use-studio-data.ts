import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';
import { useStudioSession } from '@/providers/session-provider';
import type { CreateProjectInput, CreateWorkspaceInput } from '@/domain/types';

export const qk = {
  session: ['session'] as const,
  org: ['organization'] as const,
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  projects: (ws: string) => ['projects', ws] as const,
  project: (ws: string, id: string) => ['project', ws, id] as const,
  activity: (id: string) => ['activity', id] as const,
  documents: (pid: string) => ['documents', pid] as const,
  document: (pid: string, id: string) => ['document', pid, id] as const,
  variables: (pid: string) => ['variables', pid] as const,
  conditionCategories: (pid: string) => ['condition-categories', pid] as const,
  conditionValues: (pid: string, cid: string) => ['condition-values', pid, cid] as const,
};

export function useSession() {
  return useStudioSession();
}

export function useEnterDemo() {
  const session = useStudioSession();
  return useMutation({
    mutationFn: session.enterDemo,
  });
}

export function useSignOut() {
  const session = useStudioSession();
  return useMutation({
    mutationFn: session.signOut,
  });
}

export function useOrganization() {
  const { organizations } = useServices();
  return useQuery({ queryKey: qk.org, queryFn: () => organizations.getOrganization(), staleTime: 15_000 });
}

export function useWorkspaces() {
  const { workspaces } = useServices();
  return useQuery({ queryKey: qk.workspaces, queryFn: () => workspaces.listWorkspaces() });
}

export function useWorkspace(id: string) {
  const { workspaces } = useServices();
  return useQuery({ queryKey: qk.workspace(id), queryFn: () => workspaces.getWorkspace(id) });
}

export function useCreateWorkspace() {
  const { workspaces } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => workspaces.createWorkspace(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workspaces }),
  });
}

export function useProjects(workspaceId: string) {
  const { projects } = useServices();
  return useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => projects.listProjects(workspaceId) });
}

export function useProject(workspaceId: string, projectId: string) {
  const { projects } = useServices();
  return useQuery({
    queryKey: qk.project(workspaceId, projectId),
    queryFn: () => projects.getProject(workspaceId, projectId),
  });
}

export function useActivity(projectId: string) {
  const { projects } = useServices();
  return useQuery({ queryKey: qk.activity(projectId), queryFn: () => projects.listActivity(projectId) });
}

export function useCreateProject(workspaceId: string) {
  const { projects } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => projects.createProject(workspaceId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects(workspaceId) });
      qc.invalidateQueries({ queryKey: qk.workspaces });
    },
  });
}

export function useImportProject(workspaceId: string) {
  const { projects } = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) => projects.importProject(workspaceId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects(workspaceId) });
      qc.invalidateQueries({ queryKey: qk.workspaces });
    },
  });
}

export function useDocuments(projectId: string) {
  const { documents } = useServices();
  return useQuery({ queryKey: qk.documents(projectId), queryFn: () => documents.listDocuments(projectId) });
}

export function useDocument(projectId: string, documentId: string) {
  const { documents } = useServices();
  return useQuery({
    queryKey: qk.document(projectId, documentId),
    queryFn: () => documents.getDocument(projectId, documentId),
    enabled: Boolean(projectId && documentId),
  });
}

export function usePageTitle(title: string | undefined, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} · SPEXTAR Studio` : 'SPEXTAR Studio';
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    }
  }, [title, description]);
}
