import { describe, expect, it, vi } from 'vitest';
import { createDemoServices } from '@/services/demo-adapter';
import { createRuntimeServices } from '@/services/runtime';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble } from './supabase-double';
import { STORAGE_KEYS } from '@/services/storage';
import { importSchema } from '@/services/import-schema';
import { suggestKey } from '@/domain/project-identifiers';

const demo = () => createDemoServices({ latencyMs: 0 });
const input = { name: 'New service guide', key: 'NSG', description: '', product: '' };

describe('demo service boundaries', () => {
  it('restores only a structurally valid demo session and removes it on sign-out', async () => {
    const services = demo();
    expect(await services.auth.getSession()).toBeNull();
    const session = await services.auth.enterDemo();
    expect(await demo().auth.getSession()).toEqual(session);
    expect(JSON.stringify(session)).not.toContain('password');
    await services.auth.signOut();
    expect(await services.auth.getSession()).toBeNull();
  });
  it.each(['{broken', '{"mode":"demo"}', '{"mode":"backend","userId":"real-user"}'])(
    'rejects corrupt or foreign session storage: %s', async (value) => {
      localStorage.setItem(STORAGE_KEYS.session, value);
      expect(await demo().auth.getSession()).toBeNull();
    },
  );
  it('reports storage failures rather than pretending to start a persistent session', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(demo().auth.enterDemo()).rejects.toMatchObject({ code: 'storage' });
  });
  it('ignores structurally corrupt local records without crashing fixture queries', async () => {
    localStorage.setItem(STORAGE_KEYS.workspaces, '[{"id":42}]');
    localStorage.setItem(STORAGE_KEYS.projects, '[null]');
    localStorage.setItem(STORAGE_KEYS.documents, '[{"topics":"not-an-array"}]');
    const services = demo();
    expect(await services.workspaces.listWorkspaces()).toHaveLength(3);
    expect(await services.projects.listProjects('product-docs')).toHaveLength(4);
    expect(await services.documents.listDocuments('meridian-x4-user-guide')).toHaveLength(4);
  });
  it('persists created workspaces/projects across adapter instances', async () => {
    const services = demo();
    const workspace = await services.workspaces.createWorkspace({ name: 'New workspace', description: '' });
    const project = await services.projects.createProject(workspace.id, input);
    expect(await demo().projects.getProject(workspace.id, project.id)).toMatchObject(input);
    expect(await demo().workspaces.getWorkspace(workspace.id)).toEqual(workspace);
  });
  it('checks project uniqueness in its workspace and validates direct service input', async () => {
    const services = demo();
    await services.projects.createProject('product-docs', input);
    await expect(services.projects.createProject('product-docs', input)).rejects.toMatchObject({ code: 'conflict' });
    await expect(services.projects.createProject('product-docs', { ...input, key: '' })).rejects.toMatchObject({ code: 'validation' });
    await expect(services.workspaces.createWorkspace({ name: '', description: '' })).rejects.toMatchObject({ code: 'validation' });
  });
  it('does not resolve a project/document through the wrong parent', async () => {
    const services = demo();
    expect(await services.projects.getProject('field-service', 'meridian-x4-user-guide')).toBeNull();
    expect(await services.documents.getDocument('telemetry-api', 'mx4-getting-started')).toBeNull();
    await expect(services.projects.createProject('missing', input)).rejects.toMatchObject({ code: 'not-found' });
  });
  it('validates imports before changing data and imports document/topic relationships', async () => {
    const services = demo();
    const before = await services.projects.listProjects('product-docs');
    await expect(services.projects.importProject('product-docs', { project: {} })).rejects.toMatchObject({ code: 'validation' });
    expect(await services.projects.listProjects('product-docs')).toEqual(before);
    const result = await services.projects.importProject('product-docs', {
      spextarImport: 1, project: { ...input, documents: [{ title: 'Installation', topics: [{ title: 'Unbox', body: 'Unpack carefully.' }] }] },
    });
    const docs = await services.documents.listDocuments(result.project.id);
    expect(result).toMatchObject({ documentCount: 1, topicCount: 1 });
    expect(docs[0]).toMatchObject({ projectId: result.project.id, status: 'draft', topics: [{ body: ['Unpack carefully.'] }] });
  });
  it('retains demo records and the navigation preference when signing out', async () => {
    const services = demo();
    const project = await services.projects.createProject('product-docs', input);
    localStorage.setItem(STORAGE_KEYS.navCollapsed, 'true');
    await services.auth.enterDemo();
    await services.auth.signOut();
    expect(await demo().projects.getProject('product-docs', project.id)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.navCollapsed)).toBe('true');
  });
  it('keeps import limits and suggested keys consistent with project contracts', () => {
    expect(suggestKey('A')).toMatch(/^[A-Z][A-Z0-9]{1,9}$/);
    expect(importSchema.safeParse({ spextarImport: 1, project: { ...input, documents: Array(51).fill({ title: 'Too many' }) } }).success).toBe(false);
  });
});

describe('backend isolation', () => {
  it('never trusts a stored demo session or returns demo data', async () => {
    await demo().auth.enterDemo();
    const backend = createSupabaseServices(supabaseDouble(null).client);
    expect(backend.mode).toBe('backend');
    expect(await backend.auth.getSession()).toBeNull();
    await expect(backend.auth.enterDemo()).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(backend.workspaces.listWorkspaces()).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(backend.organizations.getOrganization()).rejects.toMatchObject({ code: 'unauthorized' });
  });
  it('fails closed for an unknown runtime mode', () => {
    expect(() => createRuntimeServices('production-typo')).toThrow('Unsupported Studio mode');
    expect(createRuntimeServices('demo').mode).toBe('demo');
  });
});
