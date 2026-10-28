import { beforeEach, describe, expect, it } from 'vitest';
import { ManagementWire } from '../../e2e/management-wire';
import type { Row } from '../../e2e/settings-wire';

describe('isolated browser management responses fail closed', () => {
  let wire: ManagementWire;
  let db: Record<string, Row[]>;
  const content = { type: 'doc', version: 1, content: [] };
  const time = '2026-10-27T10:00:00Z';
  beforeEach(() => {
    wire = new ManagementWire(); wire.enabled = true;
    db = {
      project_members: [{ project_id: 'project-a', user_id: 'user-a', role: 'author' }],
      workspace_members: [{ workspace_id: 'ws-a', user_id: 'user-a', role: 'member' }],
      documents: [{ id: 'doc-a', project_id: 'project-a', updated_at: time }],
      topics: [{ id: 'topic-a', document_id: 'doc-a', parent_topic_id: null }],
      condition_categories: [{ id: 'cat-a', project_id: 'project-a' }], condition_values: [], project_variables: [],
      reusable_contents: [{ id: 'reuse-a', workspace_id: 'ws-a', project_id: 'project-a', scope: 'project', updated_at: time }],
      reusable_content_drafts: [{ reusable_content_id: 'reuse-a', content, revision: 2, updated_at: time }],
      topic_drafts: [],
    };
  });
  const call = (table: string, body: Row, query = '', method = 'POST') =>
    wire.handle({ table, body, url: new URL(`https://example.invalid/rest/v1/${table}?${query}`), method, db, identity: 'user-a' });
  it('requires scenario opt-in', () => {
    wire.enabled = false;
    expect(call('project_variables', { project_id: 'project-a' }).violation).toBeTruthy();
  });
  it.each(['reviewer', 'viewer', 'inherited-admin'])('never grants project writes to %s', role => {
    db.project_members = role === 'inherited-admin' ? [] : [{ project_id: 'project-a', user_id: 'user-a', role }];
    db.workspace_members[0].role = 'admin';
    expect(call('project_variables', { project_id: 'project-a' }).violation).toMatch(/read-only/);
    expect(call('reusable_contents', { name: 'Unapproved' }, 'workspace_id=eq.ws-a&project_id=eq.project-a&id=eq.reuse-a&updated_at=eq.' + time, 'PATCH').violation).toMatch(/read-only/);
  });
  it('rejects a foreign membership identity', () => {
    db.project_members[0].user_id = 'other-user';
    expect(call('rpc/create_document', { p_project_id: 'project-a', p_title: 'X', p_slug: 'x', p_description: null }).violation).toMatch(/read-only/);
  });
  it.each(['id', 'created_at', 'created_by', 'updated_at'])('rejects client-controlled audit/identity field %s', field => {
    expect(call('project_variables', { project_id: 'project-a', [field]: 'illegal' }).violation).toMatch(/payload/);
  });
  it('rejects foreign project/category/parent scope', () => {
    expect(call('project_variables', { project_id: 'foreign' }).violation).toMatch(/scope/);
    expect(call('condition_values', { category_id: 'foreign' }).violation).toMatch(/scope/);
    expect(call('rpc/create_topic', { p_document_id: 'doc-a', p_parent_topic_id: 'foreign', p_title: 'X', p_slug: 'x' }).violation).toMatch(/parent/);
  });
  it.each(['create_document', 'create_topic', 'move_topic', 'promote_topic', 'demote_topic', 'duplicate_document', 'duplicate_topic_subtree'])(
    'rejects discovery GETs for %s without mutation or signature hints', name => {
      const before = structuredClone(db);
      const result = call(`rpc/${name}`, {}, '__spextar_signature_probe__=true', 'GET');
      expect(result.status).toBe(400);
      expect(result.violation).toMatch(/discovery is prohibited/);
      expect(result.data).not.toHaveProperty('hint');
      expect(db).toEqual(before);
      expect(wire.probes).toEqual([name]);
    },
  );
  it('rejects missing or alternate arguments and unconfirmed RPCs', () => {
    expect(call('rpc/create_topic', { document_id: 'doc-a', title: 'X', slug: 'x' }).violation).toMatch(/arguments/);
    expect(call('rpc/unconfirmed_operation', {}).violation).toBeTruthy();
  });
  it('does not fabricate successful writes after an explicit server failure', () => {
    wire.failNext = 'condition_categories';
    expect(call('condition_categories', { project_id: 'project-a', name: 'New', key: 'new' }).status).toBe(503);
    expect(db.condition_categories).toHaveLength(1);
  });
  it('requires expected revisions and preserves a newer reusable draft', () => {
    expect(call('reusable_content_drafts', { content }, 'reusable_content_id=eq.reuse-a', 'PATCH').violation).toMatch(/revision/);
    expect(call('reusable_content_drafts', { content: { ...content, version: 99 } }, 'reusable_content_id=eq.reuse-a&revision=eq.1', 'PATCH').data).toEqual([]);
    expect(db.reusable_content_drafts[0]).toMatchObject({ revision: 2, content });
  });
  it('requires scoped expected timestamps for conservative deletes and metadata updates', () => {
    expect(call('documents', {}, 'project_id=eq.project-a&id=eq.doc-a', 'DELETE').violation).toMatch(/timestamp/);
    expect(call('reusable_contents', { name: 'New' }, 'workspace_id=eq.ws-a&id=eq.reuse-a', 'PATCH').violation).toMatch(/timestamp/);
    expect(call('documents', {}, 'project_id=eq.project-a&id=eq.doc-a&updated_at=eq.' + time, 'DELETE').status).toBe(409);
  });
  it('blocks deletion of semantic-management entities', () => {
    expect(call('project_variables', {}, 'project_id=eq.project-a&id=eq.var-a', 'DELETE').violation).toMatch(/destructive/);
  });
  it('requires project scope on project reusable metadata and preserves stable condition keys', () => {
    expect(call('reusable_contents', { name: 'New' }, 'workspace_id=eq.ws-a&id=eq.reuse-a&updated_at=eq.' + time, 'PATCH').violation).toMatch(/project scope/);
    expect(call('condition_categories', { key: 'changed' }, 'project_id=eq.project-a&id=eq.cat-a', 'PATCH').violation).toMatch(/Immutable/);
  });
  it('rejects cyclic and invalid-order topic moves', () => {
    expect(call('rpc/move_topic', { p_topic_id: 'topic-a', p_new_parent_topic_id: 'topic-a', p_new_sort_order: 0 }).violation).toMatch(/Cyclic/);
    expect(call('rpc/move_topic', { p_topic_id: 'topic-a', p_new_parent_topic_id: null, p_new_sort_order: -1 }).violation).toMatch(/order/);
  });
  it('allows workspace administration only on workspace-shared reusable scope', () => {
    db.project_members = []; db.workspace_members[0].role = 'admin';
    db.reusable_contents[0].scope = 'workspace'; db.reusable_contents[0].project_id = null;
    const r = call('reusable_contents', { name: 'Shared title' }, 'workspace_id=eq.ws-a&id=eq.reuse-a&scope=eq.workspace&updated_at=eq.' + time, 'PATCH');
    expect(r.status).toBe(200);
    expect(db.reusable_contents[0].name).toBe('Shared title');
  });
});
