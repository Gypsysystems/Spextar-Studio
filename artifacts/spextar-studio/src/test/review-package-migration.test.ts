import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './backend-contract-inspector';
const migration = '20261029184603_freeze_review_dependency_packages.sql';
const read = (name: string) => readFileSync(resolve(repositoryRoot, 'supabase/migrations', name));
const sql = read(migration).toString('utf8');

describe('review package source contract (execution is separately covered by the disposable SQL runner)', () => {
  it.each([
    ['20261029140601_review_lifecycle_foundation.sql','26236450a9a8da8f34eb76b371639559e418066d42929b8bfc4add3b29087918'],
    ['20261029172250_enforce_explicit_project_admin_management.sql','16e2eeaa95163288b85e2092e28e970a13233f5fb1d8855ea84d74ec47082074'],
  ])('preserves accepted migration bytes: %s', (file, sha) => {
    expect(createHash('sha256').update(read(file)).digest('hex')).toBe(sha);
  });
  it('captures in the same INSERT without modifying accepted lifecycle functions or historical evidence', () => {
    expect(sql).toContain('before insert on public.document_reviews');
    expect(sql).toContain('new.dependency_package := v_result');
    expect(sql).not.toMatch(/update public.document_reviews|create or replace|security definer|commit;|exception when|set_config/);
    const guard = read('20261029140601_review_lifecycle_foundation.sql').toString();
    expect(guard).toContain("to_jsonb(new) - array['status','decided_by','decided_at','decision_note']");
  });
  it('captures all closure reads in a single STABLE statement snapshot with private invoker helpers', () => {
    expect(sql.match(/returns jsonb language plpgsql stable security invoker set search_path = ''/g)).toHaveLength(2);
    expect(sql).toContain('app_private.review_dependency_package(new.project_id');
    expect(sql).toContain('from public,anon,authenticated');
    expect(sql).toContain("current_user <> 'postgres' or auth.uid() is null");
    expect(sql).toContain("m.role in ('admin','author')");
  });
  it('pins exact scope, bounded recursion, order and output policy without flattening source bodies', () => {
    for (const fragment of ['v.project_id = p_project','c.project_id = p_project','r.workspace_id = p_workspace','r.project_id = p_project',
      "r.scope = 'workspace' and r.project_id is null",'cardinality(p_trail) >= 8','v_id = any(p_trail)',
      "order by key collate \"C\"","'schemaVersion',1,'resolverVersion',1","'canonicalization','spextar-json-v1'",
      "'variableValues','default','conditions','neutral'",'16777216','100000','4096','30000','> 256']) expect(sql).toContain(fragment);
    expect(sql).toContain("'content',d.content");
    expect(sql).toContain("v_topic->'content' <> 'null'::jsonb");
  });
});
