import type { Services } from './contracts';
import { ServiceError } from './contracts';
import { referencesIn, type ReferenceKind, type SemanticContext, type SemanticCatalog } from '@/domain/semantic-references';
import type { TopicContent } from '@/domain/topic-content';
import { structuredContentIssue } from '@/domain/structured-content';

export async function readSemanticCatalog(services: Services, context: SemanticContext): Promise<SemanticCatalog> {
  const before = await services.auth.getSession();
  if (!before) throw new ServiceError('Sign in again to load reference definitions.', 'unauthorized');
  const [variables, categories, items] = await Promise.all([
    services.variables.list(context.projectId),
    services.conditions.listCategories(context.projectId), services.reusable.list(context),
  ]);
  const values = (await Promise.all(categories.map(category => services.conditions.listValues(context.projectId, category.id)))).flat();
  if (variables.some(v => v.projectId !== context.projectId) || categories.some(c => c.projectId !== context.projectId)
    || values.some(v => !categories.some(c => c.id === v.categoryId))
    || items.some(i => i.workspaceId !== context.workspaceId || (i.scope === 'project' && i.projectId !== context.projectId))) {
    throw new ServiceError('Reference definitions could not be verified in this project.', 'unavailable');
  }
  const reusable = await Promise.all(items.map(async item => ({ item, draft: await services.reusable.getDraft(context, item.id) })));
  if ([variables, categories, values, items].some(rows => new Set(rows.map(row => row.id)).size !== rows.length)
    || reusable.some(row => row.draft && row.draft.reusableContentId !== row.item.id))
    throw new ServiceError('Reference definitions have an inconsistent identity.', 'unavailable');
  const after = await services.auth.getSession();
  if (!after || before.userId !== after.userId || before.organizationId !== after.organizationId)
    throw new ServiceError('The active identity changed. Reopen this project.', 'unauthorized');
  return { variables, categories, values, reusable };
}
export interface ReferenceLocation {
  projectId: string; projectName: string; documentId: string; documentTitle: string;
  topicId: string; topicTitle: string; nodeId: string | null; revision: number | null;
  viaLinkedContent?: boolean;
}
export interface DemoReferenceDraft { projectId: string; documentId: string; topicId: string; content: TopicContent }

/** Read-through, not a pretend synchronized index. Errors/unsupported bodies prevent a complete count. */
export async function readReferenceUsage(services: Services, context: SemanticContext, target: { kind: ReferenceKind; id: string },
  demoDrafts: DemoReferenceDraft[] = []): Promise<ReferenceLocation[]> {
  const session = await services.auth.getSession();
  if (!session) throw new ServiceError('Sign in again to inspect saved references.', 'unauthorized');
  const projects = await services.projects.listProjects(context.workspaceId);
  const locations: ReferenceLocation[] = [];
  // Workspace-shared reusable definitions can be linked from any accessible project.
  for (const project of projects.filter(p => target.kind === 'reusable' || p.id === context.projectId)) {
    const linked = new Map<string, Promise<TopicContent>>();
    const linkedBody = (id: string) => {
      if (!linked.has(id)) linked.set(id, (async () => {
        const scope = { workspaceId: context.workspaceId, projectId: project.id };
        const items = await services.reusable.list(scope);
        if (!items.some(item => item.id === id)) throw new ServiceError('A linked definition is unavailable. A complete usage count cannot be established.', 'unavailable');
        const draft = await services.reusable.getDraft(scope, id);
        if (!draft) throw new ServiceError('A linked draft is unavailable. A complete usage count cannot be established.', 'unavailable');
        return draft.content;
      })());
      return linked.get(id)!;
    };
    for (const doc of await services.documents.listDocuments(project.id)) {
      for (const topic of doc.topics) {
        const draft = services.mode === 'backend'
          ? await services.topicDrafts.get({ userId: session.userId, projectId: project.id, documentId: doc.id, topicId: topic.id })
          : null;
        const content = draft?.content ?? demoDrafts.find(d => d.projectId === project.id && d.documentId === doc.id && d.topicId === topic.id)?.content;
        if (!content) continue;
        const scan = async (body: TopicContent, path: string[]) => {
          if (path.length > 8 || structuredContentIssue(body)) throw new ServiceError('Saved content cannot be fully inspected. A complete usage count is unavailable.', 'unavailable');
          for (const ref of referencesIn(body)) {
            if (ref.kind === target.kind && ref.targetId === target.id) locations.push({
              projectId: project.id, projectName: project.name, documentId: doc.id, documentTitle: doc.title,
              topicId: topic.id, topicTitle: topic.title, nodeId: ref.nodeId, revision: draft?.revision ?? null,
              ...(path.length ? { viaLinkedContent: true } : {}),
            });
            if (ref.kind === 'reusable') {
              if (path.includes(ref.targetId)) throw new ServiceError('A circular linked reference prevents a complete usage scan.', 'unavailable');
              await scan(await linkedBody(ref.targetId), [...path, ref.targetId]);
            }
          }
        };
        await scan(content, []);
      }
    }
  }
  const latest = await services.auth.getSession();
  if (!latest || latest.userId !== session.userId || latest.organizationId !== session.organizationId)
    throw new ServiceError('The active identity changed. Reopen reference usage.', 'unauthorized');
  return locations;
}
