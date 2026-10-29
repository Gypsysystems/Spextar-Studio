import { structuredContentIssue } from '@/domain/structured-content';
import type { TopicContent } from '@/domain/topic-content';
import type { Services } from './contracts';
import { ServiceError } from './contracts';
import {
  hasSemanticReferences,
  collectSemanticReferences,
  type ReferenceScope,
  type SemanticReference,
} from '@/domain/semantic-references';

export interface ReferenceUsage {
  projectId: string;
  projectName: string;
  documentId?: string;
  documentTitle?: string;
  topicId?: string;
  topicTitle?: string;
  reusableId?: string;
  reusableName?: string;
  nodeId: string | null;
}
export type ReferenceTarget = {
  kind: SemanticReference['kind'] | 'category';
  definitionId: string;
  categoryId?: string;
};
/** Compose existing RLS-backed reads; no speculative schema, mutations or synthetic counts.
 * Counts include directly persisted references in accessible locations, never expanded copies.
 */
function persistedReferences(content: TopicContent): SemanticReference[] {
  if (hasSemanticReferences(content) && structuredContentIssue(content)) {
    throw new ServiceError('A saved body contains unsupported references. Usage cannot be confirmed.', 'unavailable');
  }
  return collectSemanticReferences(content);
}
export async function whereUsed(
  services: Services,
  scope: ReferenceScope,
  target: ReferenceTarget,
): Promise<ReferenceUsage[]> {
  const session = await services.auth.getSession();
  if (!session) throw new ServiceError('Sign in to inspect saved references.', 'unauthorized');
  const project = await services.projects.getProject(scope.workspaceId, scope.projectId);
  if (!project) throw new ServiceError('This project is unavailable.', 'not-found');
  let projects = [project];
  if (target.kind === 'reusable') {
    const item = (await services.reusable.list(scope)).find((r) => r.id === target.definitionId);
    if (!item) throw new ServiceError('This reusable content is unavailable.', 'not-found');
    if (item.scope === 'workspace') projects = await services.projects.listProjects(scope.workspaceId);
  }
  const result: ReferenceUsage[] = [];
  const seenReusable = new Set<string>();
  const match = (r: SemanticReference) =>
    target.kind === 'category'
      ? r.kind === 'condition' && r.categoryId === target.definitionId
      : r.kind === target.kind &&
        r.definitionId === target.definitionId &&
        (!target.categoryId || r.categoryId === target.categoryId);
  for (const p of projects.sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.workspaceId !== scope.workspaceId)
      throw new ServiceError('Reference locations are outside this workspace.', 'forbidden');
    if (services.mode === 'backend') {
      const docs = await services.documents.listDocuments(p.id);
      for (const doc of docs)
        for (const topic of doc.topics) {
          const draft = await services.topicDrafts.get({
            userId: session.userId,
            projectId: p.id,
            documentId: doc.id,
            topicId: topic.id,
          });
          if (draft)
            for (const ref of persistedReferences(draft.content).filter(match))
              result.push({
                projectId: p.id,
                projectName: p.name,
                documentId: doc.id,
                documentTitle: doc.title,
                topicId: topic.id,
                topicTitle: topic.title,
                nodeId: ref.nodeId,
              });
        }
    }
    const context = { workspaceId: scope.workspaceId, projectId: p.id, userId: session.userId };
    for (const item of await services.reusable.list(context)) {
      if (seenReusable.has(item.id)) continue;
      seenReusable.add(item.id);
      const draft = await services.reusable.getDraft(context, item.id);
      if (draft)
        for (const ref of persistedReferences(draft.content).filter(match))
          result.push({
            projectId: p.id,
            projectName: item.scope === 'workspace' ? 'Workspace library' : p.name,
            reusableId: item.id,
            reusableName: item.name,
            nodeId: ref.nodeId,
          });
    }
  }
  const after = await services.auth.getSession();
  if (!after || after.userId !== session.userId || after.organizationId !== session.organizationId)
    throw new ServiceError('The signed-in identity changed. Refresh references.', 'unauthorized');
  return result;
}
