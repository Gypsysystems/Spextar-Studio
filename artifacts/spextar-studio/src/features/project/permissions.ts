import type { ProjectSummary } from '@/domain/types';

/** role may include inherited workspace administration. Only explicit Admin
 * has both content-authoring and review capabilities in the backend adapter. */
export function canManageProject(project: ProjectSummary): boolean {
  return project.source === 'backend'
    ? project.canEditContent === true && project.canReview === true
    : project.role === 'admin';
}
