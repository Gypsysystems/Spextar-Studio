import type {
  ActivityEvent,
  CreateProjectInput,
  CreateWorkspaceInput,
  DemoSession,
  DocumentRecord,
  ImportResult,
  Organization,
  Project,
  ProjectSummary,
  Workspace,
  WorkspaceSummary,
} from '@/domain/types';
import {
  DEMO_ACTIVITY,
  DEMO_DOCUMENTS,
  DEMO_ORGANIZATION,
  DEMO_PROJECTS,
  DEMO_USER,
  DEMO_WORKSPACES,
} from '@/fixtures/demo-data';
import { ServiceError, type Services } from './contracts';
import { formatIssues, importSchema } from './import-schema';
import { STORAGE_KEYS, readJSON, removeKey, writeJSON } from './storage';
import { isDemoSession, isWorkspaceArray, isProjectArray, isDocumentArray, workspaceInputSchema, projectInputSchema } from './validation';
import { slugify, suggestKey } from '@/domain/project-identifiers';

/**
 * Local demo adapter. Fixtures are read-only; anything the user creates or imports
 * is persisted to localStorage under versioned keys. Latency is simulated so loading
 * states are exercised exactly as they would be against a network adapter.
 */

const LATENCY_MS = 260;
const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const backendOnly = async (): Promise<never> => { throw new ServiceError('F2 backend mutations are available in backend mode only. Demo body and metadata edits remain local previews.', 'unavailable'); };

function persist(key: string, value: unknown) {
  if (!writeJSON(key, value)) {
    throw new ServiceError('Browser storage is unavailable or full. Demo changes could not be saved.', 'storage');
  }
}

export function createDemoServices(options: { latencyMs?: number } = {}): Services {
  const wait = (ms = LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, options.latencyMs ?? ms));
  const userWorkspaces = () => readJSON<Workspace[]>(STORAGE_KEYS.workspaces, [], isWorkspaceArray);
  const userProjects = () => readJSON<Project[]>(STORAGE_KEYS.projects, [], isProjectArray);
  const userDocuments = () => readJSON<DocumentRecord[]>(STORAGE_KEYS.documents, [], isDocumentArray);

  const allWorkspaces = () => [...DEMO_WORKSPACES, ...userWorkspaces()];
  const allProjects = () => [...DEMO_PROJECTS, ...userProjects()];
  const allDocuments = () => [...DEMO_DOCUMENTS, ...userDocuments()];

  const summarise = (p: Project, docs: DocumentRecord[]): ProjectSummary => {
    const own = docs.filter((d) => d.projectId === p.id);
    return { ...p, documentCount: own.length, topicCount: own.reduce((n, d) => n + d.topics.length, 0) };
  };

  const requireWorkspace = (workspaceId: string) => {
    const ws = allWorkspaces().find((w) => w.id === workspaceId);
    if (!ws) throw new ServiceError('Workspace not found', 'not-found');
    return ws;
  };

  const uniqueProjectId = (name: string) => {
    const base = slugify(name) || 'project';
    const taken = new Set(allProjects().map((p) => p.id));
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    return id;
  };

  const assertKeyFree = (workspaceId: string, key: string) => {
    if (allProjects().some((p) => p.workspaceId === workspaceId && p.key === key)) {
      throw new ServiceError(`Project key ${key} is already used in this workspace`, 'conflict');
    }
  };

  const owner = () => readJSON<DemoSession | null>(STORAGE_KEYS.session, null, isDemoSession)?.name ?? DEMO_USER.name;

  return {
    mode: 'demo',
    auth: {
      async getSession() {
        await wait(120);
        const s = readJSON<DemoSession | null>(STORAGE_KEYS.session, null, isDemoSession);
        return s && s.mode === 'demo' ? s : null;
      },
      async enterDemo() {
        await wait(420);
        const session: DemoSession = { ...DEMO_USER, startedAt: now() };
        persist(STORAGE_KEYS.session, session);
        return session;
      },
      async signOut() {
        await wait(160);
        if (!removeKey(STORAGE_KEYS.session)) {
          throw new ServiceError('Could not remove the stored demo session. Browser storage is unavailable.', 'storage');
        }
      },
    },

    organizations: {
      async getOrganization(): Promise<Organization> {
        await wait(120);
        return DEMO_ORGANIZATION;
      },
    },

    workspaces: {
      async listWorkspaces(): Promise<WorkspaceSummary[]> {
        await wait();
        const projects = allProjects();
        return allWorkspaces().map((w) => ({
          ...w,
          projectCount: projects.filter((p) => p.workspaceId === w.id).length,
        }));
      },
      async getWorkspace(workspaceId) {
        await wait(160);
        return allWorkspaces().find((w) => w.id === workspaceId) ?? null;
      },
      async createWorkspace(input: CreateWorkspaceInput) {
        await wait();
        const valid = workspaceInputSchema.safeParse(input);
        if (!valid.success) throw new ServiceError('Invalid workspace details', 'validation');
        input = valid.data;
        const name = input.name.trim();
        if (allWorkspaces().some((w) => w.name.toLowerCase() === name.toLowerCase())) {
          throw new ServiceError(`A workspace named "${name}" already exists`, 'conflict');
        }
        const base = slugify(name) || 'workspace';
        const taken = new Set(allWorkspaces().map((w) => w.id));
        let id = base;
        let n = 2;
        while (taken.has(id)) id = `${base}-${n++}`;
        const ws: Workspace = {
          id,
          organizationId: DEMO_ORGANIZATION.id,
          name,
          description: input.description.trim(),
          memberCount: 1,
          createdAt: now(),
          updatedAt: now(),
          source: 'created',
        };
        persist(STORAGE_KEYS.workspaces, [...userWorkspaces(), ws]);
        return ws;
      },
    },

    projects: {
      async listProjects(workspaceId) {
        await wait();
        requireWorkspace(workspaceId);
        const docs = allDocuments();
        return allProjects()
          .filter((p) => p.workspaceId === workspaceId)
          .map((p) => summarise(p, docs))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async getProject(workspaceId, projectId) {
        await wait(180);
        const p = allProjects().find((x) => x.id === projectId && x.workspaceId === workspaceId);
        return p ? summarise(p, allDocuments()) : null;
      },
      async createProject(workspaceId, input: CreateProjectInput) {
        await wait();
        const valid = projectInputSchema.safeParse(input);
        if (!valid.success) throw new ServiceError('Invalid project details', 'validation');
        input = valid.data;
        requireWorkspace(workspaceId);
        const key = input.key.trim().toUpperCase();
        assertKeyFree(workspaceId, key);
        const project: Project = {
          id: uniqueProjectId(input.name),
          workspaceId,
          name: input.name.trim(),
          key,
          description: input.description.trim(),
          product: input.product.trim(),
          owner: owner(),
          status: 'active',
          createdAt: now(),
          updatedAt: now(),
          source: 'created',
        };
        persist(STORAGE_KEYS.projects, [...userProjects(), project]);
        return project;
      },
      async importProject(workspaceId, payload): Promise<ImportResult> {
        await wait(380);
        requireWorkspace(workspaceId);
        const parsed = importSchema.safeParse(payload);
        if (!parsed.success) {
          throw new ServiceError('The file does not match the SPEXTAR import contract', 'validation', formatIssues(parsed.error));
        }
        const data = parsed.data.project;
        const key = (data.key ?? suggestKey(data.name)).toUpperCase();
        assertKeyFree(workspaceId, key);
        const project: Project = {
          id: uniqueProjectId(data.name),
          workspaceId,
          name: data.name,
          key,
          description: data.description,
          product: data.product,
          owner: owner(),
          status: 'active',
          createdAt: now(),
          updatedAt: now(),
          source: 'imported',
        };
        const documents: DocumentRecord[] = data.documents.map((d, di) => ({
          id: `${project.id}-doc-${di + 1}`,
          projectId: project.id,
          title: d.title,
          type: d.type,
          status: 'draft',
          owner: project.owner,
          version: '0.1',
          summary: d.summary ?? '',
          updatedAt: now(),
          topics: d.topics.map((tp, ti) => ({
            id: `${project.id}-t-${di + 1}-${ti + 1}`,
            title: tp.title,
            kind: tp.kind,
            level: tp.level,
            body: tp.body == null ? [] : Array.isArray(tp.body) ? tp.body : [tp.body],
          })),
        }));
        persist(STORAGE_KEYS.projects, [...userProjects(), project]);
        try {
          persist(STORAGE_KEYS.documents, [...userDocuments(), ...documents]);
        } catch (err) {
          persist(STORAGE_KEYS.projects, userProjects().filter((p) => p.id !== project.id));
          throw err;
        }
        return {
          project,
          documentCount: documents.length,
          topicCount: documents.reduce((n, d) => n + d.topics.length, 0),
        };
      },
      async listActivity(projectId): Promise<ActivityEvent[]> {
        await wait(200);
        const p = allProjects().find((x) => x.id === projectId);
        const events = DEMO_ACTIVITY.filter((a) => a.projectId === projectId);
        if (p && p.source !== 'fixture') {
          events.push({
            id: `${p.id}-origin`,
            projectId,
            actor: p.owner,
            action: p.source === 'imported' ? 'imported' : 'created',
            target: p.name,
            at: p.createdAt,
          });
        }
        return events.sort((a, b) => b.at.localeCompare(a.at));
      },
    },

    documents: {
      createDocument: backendOnly,
      updateDocument: backendOnly,
      createTopic: backendOnly,
      updateTopic: backendOnly,
      moveTopic: backendOnly,
      promoteTopic: backendOnly,
      demoteTopic: backendOnly,
      duplicateDocument: backendOnly,
      duplicateTopicSubtree: backendOnly,
      deleteDocument: backendOnly,
      deleteTopic: backendOnly,
      async listDocuments(projectId) {
        await wait();
        return allDocuments()
          .filter((d) => d.projectId === projectId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async getDocument(projectId, documentId) {
        await wait(180);
        return allDocuments().find((d) => d.projectId === projectId && d.id === documentId) ?? null;
      },
    },
  };
}
