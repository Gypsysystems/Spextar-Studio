import type {
  ActivityEvent,
  CreateProjectInput,
  CreateWorkspaceInput,
  DemoSession,
  StudioSession,
  StudioMode,
  DocumentRecord,
  ID,
  ImportResult,
  Organization,
  Project,
  ProjectSummary,
  Workspace,
  WorkspaceSummary,
} from '@/domain/types';

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
}

export interface Services {
  readonly mode: StudioMode;
  auth: AuthService;
  organizations: OrganizationService;
  workspaces: WorkspaceService;
  projects: ProjectService;
  documents: DocumentService;
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
