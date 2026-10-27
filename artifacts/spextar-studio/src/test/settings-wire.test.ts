import { describe, expect, it } from 'vitest';
import { SettingsWire, type Row } from '../../e2e/settings-wire';

/** Independently protect the opt-in wire guard: enabling admin scenarios must not enable arbitrary writes. */
function setup() {
  const wire = new SettingsWire();
  wire.enabled = true;
  const db: Record<string, Row[]> = {
    projects: [{ id: 'project-a', workspace_id: 'ws-a', name: 'Project A', slug: 'pa', description: null,
      status: 'active', updated_at: '2026-10-27T10:00:00Z', created_by: 'user-a' }],
    project_members: [{ project_id: 'project-a', user_id: 'user-a', role: 'admin' }],
    workspace_members: [{ workspace_id: 'ws-a', user_id: 'candidate', role: 'member' }],
  };
  const input = { table: 'projects', method: 'PATCH', identity: 'user-a', db,
    url: new URL('https://example.test/rest/v1/projects?id=eq.project-a&workspace_id=eq.ws-a&updated_at=eq.2026-10-27T10:00:00Z'),
    body: { name: 'Saved details', slug: 'saved-details', description: null, status: 'active' } as Row };
  return { wire, db, input };
}

describe('controlled Settings wire boundary', () => {
  it('is opt-in; a valid write is forbidden to other browser scenarios', () => {
    const { wire, db, input } = setup();
    wire.enabled = false;
    expect(wire.handle(input).violation).toMatch(/explicitly enabled/);
    expect(db.projects[0].name).toBe('Project A');
  });
  it.each(['id', 'workspace_id', 'updated_at'])('rejects absent or foreign %s scope/concurrency guards', key => {
    const { wire, db, input } = setup();
    input.url.searchParams.delete(key);
    expect(wire.handle(input).violation).toBeTruthy();
    expect(db.projects[0].name).toBe('Project A');
    input.url.searchParams.set(key, 'eq.foreign');
    expect(wire.handle(input).violation).toBeTruthy();
  });
  it.each(['id', 'workspace_id', 'created_by', 'updated_at'])('rejects server-controlled %s in project payloads', key => {
    const { wire, input } = setup();
    input.body[key] = 'forged';
    expect(wire.handle(input).violation).toBeTruthy();
  });
  it.each(['author', 'reviewer', 'viewer'])('denies %s project writes without modifying data', role => {
    const { wire, db, input } = setup();
    db.project_members[0].role = role;
    expect(wire.handle(input)).toMatchObject({ status: 403, data: { code: '42501' } });
    expect(db.projects[0].name).toBe('Project A');
  });
  it('models exact expected timestamp updates, preserves identity/audit fields, and rejects stale writes', () => {
    const { wire, db, input } = setup();
    expect(wire.handle(input).status).toBe(200);
    expect(db.projects[0]).toMatchObject({ name: 'Saved details', id: 'project-a', workspace_id: 'ws-a',
      created_by: 'user-a', updated_at: '2026-10-27T10:00:01.000Z' });
    input.body.name = 'Stale overwrite';
    expect(wire.handle(input)).toMatchObject({ status: 200, data: [] });
    expect(db.projects[0].name).toBe('Saved details');
  });
  it('simulates the read/write race only when requested, leaving the concurrent row intact', () => {
    const { wire, db, input } = setup();
    wire.raceProjectWrite = true;
    expect(wire.handle(input)).toMatchObject({ status: 200, data: [] });
    expect(db.projects[0].name).toBe('Other admin saved this');
  });
  it('supports only the existing membership insert, expected-role update and bodyless delete', () => {
    const { wire, db, input } = setup();
    const member = { ...input, table: 'project_members', method: 'POST',
      url: new URL('https://example.test/rest/v1/project_members'),
      body: { project_id: 'project-a', user_id: 'candidate', role: 'viewer' } };
    expect(wire.handle(member).status).toBe(201);
    expect(wire.handle(member)).toMatchObject({ status: 409, data: { code: '23505' } });
    const update = { ...member, method: 'PATCH', body: { role: 'author' },
      url: new URL('https://example.test/rest/v1/project_members?project_id=eq.project-a&user_id=eq.candidate&role=eq.viewer') };
    expect(wire.handle(update).status).toBe(200);
    expect(db.project_members[1].role).toBe('author');
    expect(wire.handle({ ...update, method: 'DELETE', body: {} }).data).toEqual([]);
    update.url.searchParams.set('role', 'eq.author');
    expect(wire.handle({ ...update, method: 'DELETE', body: {} }).status).toBe(200);
    expect(db.project_members).toHaveLength(1);
    expect(db.workspace_members).toHaveLength(1);
  });
  it('rejects foreign membership scope, missing expected role and payload audit fields', () => {
    const { wire, input } = setup();
    const member = { ...input, table: 'project_members', method: 'PATCH', body: { role: 'author' },
      url: new URL('https://example.test/rest/v1/project_members?project_id=eq.foreign&user_id=eq.candidate&role=eq.viewer') };
    expect(wire.handle(member).violation).toBeTruthy();
    member.url.searchParams.set('project_id', 'eq.project-a');
    member.url.searchParams.delete('role');
    expect(wire.handle(member).violation).toBeTruthy();
    member.url.searchParams.set('role', 'eq.viewer');
    expect(wire.handle({ ...member, body: { role: 'author', created_at: 'forged' } }).violation).toBeTruthy();
  });
  it('keeps schema-invalid operations, unrelated tables and project deletion forbidden', () => {
    const { wire, input } = setup();
    for (const patch of [{ status: 'deleted' }, { name: '' }, { slug: 'INVALID' }])
      expect(wire.handle({ ...input, body: { ...input.body, ...patch } }).violation).toBeTruthy();
    expect(wire.handle({ ...input, table: 'documents' }).violation).toBeTruthy();
    expect(wire.handle({ ...input, method: 'DELETE', body: {} }).violation).toBeTruthy();
  });
});
