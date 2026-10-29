/**
 * SPEXTAR domain model (F0/F1).
 * Pure types only — no runtime imports — so services, fixtures and UI can share them
 * and a future Supabase adapter can map rows onto the same shapes.
 */

export type ID = string;
export type ISODate = string;

/** Where a record came from. Fixtures ship with the demo; the rest live in localStorage. */
export type RecordSource = 'fixture' | 'created' | 'imported' | 'backend';
export type OrganizationRole = 'owner' | 'admin' | 'member';
export type WorkspaceRole = 'admin' | 'member' | 'viewer';
export type ProjectRole = 'admin' | 'author' | 'reviewer' | 'viewer';

export interface Organization {
  id: ID;
  name: string;
  slug: string;
  plan: string;
  region: string;
  role?: OrganizationRole;
}

export interface Workspace {
  id: ID;
  organizationId: ID;
  name: string;
  description: string;
  memberCount: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  source: RecordSource;
  role?: WorkspaceRole;
  status?: 'active' | 'archived';
}

export interface WorkspaceSummary extends Workspace {
  projectCount: number;
}

export type ProjectStatus = 'active' | 'in-review' | 'archived';

export interface Project {
  id: ID;
  workspaceId: ID;
  name: string;
  /** Short uppercase identifier used in document IDs, e.g. MX4. */
  key: string;
  description: string;
  product: string;
  owner: string;
  ownerId?: ID;
  status: ProjectStatus;
  createdAt: ISODate;
  updatedAt: ISODate;
  source: RecordSource;
  role?: ProjectRole;
}

export interface ProjectSummary extends Project {
  documentCount: number;
  topicCount: number;
  /** Explicit project membership, not inherited workspace administration. */
  canEditContent?: boolean;
}

export type DocumentStatus = 'draft' | 'in-review' | 'approved' | 'published';
export type DocumentType = 'guide' | 'procedure' | 'reference' | 'release-notes';
export type TopicKind = 'concept' | 'task' | 'reference';

export interface Topic {
  id: ID;
  title: string;
  kind: TopicKind;
  /** Outline depth, 1 (top) to 4. Changed with Promote / Demote. */
  level: number;
  body: string[];
  slug?: string;
  parentTopicId?: ID | null;
  sortOrder?: number;
  status?: DocumentStatus;
  settings?: Record<string, unknown>;
  updatedAt?: ISODate;
}

export interface DocumentRecord {
  id: ID;
  projectId: ID;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  owner: string;
  ownerId?: ID;
  version: string;
  summary: string;
  updatedAt: ISODate;
  topics: Topic[];
  slug?: string;
  settings?: Record<string, unknown>;
  canEdit?: boolean;
}

export interface ActivityEvent {
  id: ID;
  projectId: ID;
  actor: string;
  action: string;
  target: string;
  at: ISODate;
}

export interface DemoSession {
  mode: 'demo';
  userId: ID;
  name: string;
  email: string;
  initials: string;
  role: string;
  organizationId: ID;
  startedAt: ISODate;
}

/** Backend sessions are supplied by a trusted auth adapter, never by demo storage. */
export interface BackendSession extends Omit<DemoSession, 'mode'> {
  mode: 'backend';
}

export type StudioSession = DemoSession | BackendSession;
export type StudioMode = StudioSession['mode'];

export interface CreateWorkspaceInput {
  name: string;
  description: string;
}

export interface CreateProjectInput {
  name: string;
  key: string;
  description: string;
  product: string;
}

export interface ImportResult {
  project: Project;
  documentCount: number;
  topicCount: number;
}
