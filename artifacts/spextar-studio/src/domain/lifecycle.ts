/** Backend-only lifecycle management. Creation continues to use the atomic creator services. */
export type LifecycleKind = 'organization' | 'workspace' | 'project';
export interface LifecycleScope {
  kind: LifecycleKind;
  id: string;
  /** Organization for a workspace; workspace for a project. */
  parentId?: string;
}
export interface LifecycleDetails {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'archived' | null;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
  userId: string;
  organizationId: string;
}
export interface LifecycleMetadata { name: string; slug?: string; description?: string }
export interface DeleteConfirmation { name: string; acknowledged: boolean }
export interface LifecycleService {
  get(scope: LifecycleScope): Promise<LifecycleDetails>;
  update(scope: LifecycleScope, value: LifecycleMetadata, expected: LifecycleDetails): Promise<void>;
  setArchived(scope: LifecycleScope, archived: boolean, expected: LifecycleDetails): Promise<void>;
  remove(scope: LifecycleScope, confirmation: DeleteConfirmation, expected: LifecycleDetails): Promise<{ projectIds: string[] }>;
}
