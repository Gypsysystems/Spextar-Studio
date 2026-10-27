import type {
  ActivityEvent,
  CreateProjectInput,
  CreateWorkspaceInput,
  DemoSession,
  StudioSession,
  StudioMode,
  DocumentRecord,
  DocumentStatus,
  ID,
  ImportResult,
  Organization,
  Project,
  ProjectSummary,
  Workspace,
  WorkspaceSummary,
} from '@/domain/types';
import type { DraftScope, TopicContent, TopicDraft } from '@/domain/topic-content';
import type { ProjectVariableService } from '@/domain/project-variables';
import type { ProjectConditionService } from '@/domain/project-conditions';
import type { ReusableService } from '@/domain/reusable-content';
import type { ProjectSettingsService } from '@/domain/project-settings';

/**
 * Service seams. The UI only talks to these interfaces through `useServices()`.
 * F0/F1 ships a local demo adapter; a Supabase adapter can implement the same contracts later.
 * Every method is async so swapping to a network adapter does not change call sites.
 */

export interface AuthService {
  /** Returns the active session or null. Never validates credentials in the demo. */
  getSession(): Promise<StudioSession | null>;
  /** Starts a clearly-labelled demo session. No password is accepted or stored. */
  enterDemo(): Promise<DemoSession>;
  signOut(): Promise<void>;
  signInWithPassword?(email: string, password: string): Promise<StudioSession>;
  /** Future adapters must notify on refresh, expiry, sign-out and identity changes. */
  onSessionChange?(listener: (session: StudioSession | null) => void): () => void;
}

export interface OrganizationService {
  getOrganization(): Promise<Organization | null>;
  listOrganizations?(): Promise<Organization[]>;
  createOrganization?(input: { name: string; slug: string }): Promise<Organization>;
  selectOrganization?(id: ID): Promise<void>;
}

export interface WorkspaceService {
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  /** Resolves null when the workspace does not exist. */
  getWorkspace(workspaceId: ID): Promise<Workspace | null>;
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>;
}

export interface ProjectService {
  listProjects(workspaceId: ID): Promise<ProjectSummary[]>;
  getProject(workspaceId: ID, projectId: ID): Promise<ProjectSummary | null>;
  createProject(workspaceId: ID, input: CreateProjectInput): Promise<Project>;
  /** Accepts an untrusted parsed JSON value and validates it against the import contract. */
  importProject(workspaceId: ID, payload: unknown): Promise<ImportResult>;
  listActivity(projectId: ID): Promise<ActivityEvent[]>;
}

export interface DocumentService {
  listDocuments(projectId: ID): Promise<DocumentRecord[]>;
  getDocument(projectId: ID, documentId: ID): Promise<DocumentRecord | null>;
  createDocument(projectId: ID, input: NewDocument): Promise<ID>;
  updateDocument(projectId: ID, documentId: ID, patch: DocumentMetadata): Promise<void>;
  createTopic(projectId: ID, documentId: ID, input: NewTopic): Promise<ID>;
  updateTopic(projectId: ID, documentId: ID, topicId: ID, patch: TopicMetadata): Promise<void>;
  moveTopic(projectId: ID, documentId: ID, topicId: ID, parentId: ID | null, sortOrder: number): Promise<void>;
  promoteTopic(projectId: ID, documentId: ID, topicId: ID): Promise<void>;
  demoteTopic(projectId: ID, documentId: ID, topicId: ID): Promise<void>;
  duplicateDocument(projectId: ID, documentId: ID, input: { title: string; slug: string }): Promise<ID>;
  duplicateTopicSubtree(projectId: ID, documentId: ID, topicId: ID, input: { title: string; slug: string }): Promise<ID>;
  /** Conservative deletes: empty documents and leaf topics only; never assume a cascade. */
  deleteDocument(projectId: ID, documentId: ID, expectedUpdatedAt: string): Promise<void>;
  deleteTopic(projectId: ID, documentId: ID, topicId: ID, expectedUpdatedAt: string): Promise<void>;
}

export interface NewDocument { title: string; slug: string; description: string | null }
export interface NewTopic { title: string; slug: string; parentTopicId: ID | null }
export interface DocumentMetadata { title?: string; slug?: string; description?: string | null; status?: DocumentStatus; settings?: Record<string, unknown> }
export interface TopicMetadata { title?: string; slug?: string; status?: DocumentStatus; settings?: Record<string, unknown> }

export interface Services {
  readonly mode: StudioMode;
  auth: AuthService;
  organizations: OrganizationService;
  workspaces: WorkspaceService;
  projects: ProjectService;
  documents: DocumentService;
  topicDrafts: TopicDraftService;
  variables: ProjectVariableService;
  conditions: ProjectConditionService;
  reusable: ReusableService;
  projectSettings: ProjectSettingsService;
}

export interface TopicDraftService {
  get(scope: DraftScope): Promise<TopicDraft | null>;
  /** null means first insert, never upsert. Revision advancement belongs to the database. */
  save(scope: DraftScope, content: TopicContent, expectedRevision: number | null): Promise<TopicDraft>;
}

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'not-found' | 'conflict' | 'validation' | 'storage' | 'unavailable' | 'unauthorized' | 'forbidden' | 'network',
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
