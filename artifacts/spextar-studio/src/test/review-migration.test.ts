import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { repositoryRoot } from './backend-contract-inspector';
const root = resolve(repositoryRoot, 'supabase/migrations');
const sql = readFileSync(resolve(root, '20261029140601_review_lifecycle_foundation.sql'), 'utf8');
describe('Source-only review migration contract (no database replay)', () => {
  it('preserves all 21 recovered historical migrations byte for byte', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'migration-manifest.json'), 'utf8'));
    const entries = manifest.migrations;
    expect(entries).toHaveLength(21);
    for (const entry of entries) {
      const body = readFileSync(resolve(root, entry.file));
      expect(body.length).toBe(entry.byte_count);
      expect(createHash('md5').update(body).digest('hex')).toBe(entry.md5);
    }
    expect(readdirSync(root).filter(f => f.endsWith('.sql'))).toHaveLength(25);
  });
  it('enforces immutable evidence and one active review with restrictive evidence FKs', () => {
    expect(sql).toContain("where status = 'in_review'");
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('grant select on public.document_reviews to authenticated');
    expect(sql).toContain("old.status <> 'in_review'");
    expect(sql).toContain("to_jsonb(new) - array['status','decided_by','decided_at','decision_note']");
    expect(sql).not.toContain('on delete cascade');
  });
  it('checks identity, tenant, explicit project roles, state and expected active review under lock', () => {
    for (const fragment of ["auth.uid() is null", "v_role in ('admin','author')", "v_role in ('admin','reviewer')", 'user_id = auth.uid() for share', 'id = p_document_id and project_id = p_project_id for update', "v_doc.status <> 'draft'", 'v_doc.updated_at is distinct from p_expected_updated_at', "v_doc.status <> 'in_review' or v_review.status <> 'in_review'", "using errcode = '40001'", 'document_reviews_one_active']) expect(sql).toContain(fragment);
  });
  it('snapshots JSONB without resolution and explicitly represents missing drafts', () => {
    expect(sql).toContain('left join public.topic_drafts td');
    expect(sql).toContain("'revision',td.revision,'content',td.content");
    expect(sql).not.toMatch(/jsonb_strip_nulls|variableReference|reusableReference/);
  });
  it('keeps transitions atomic, requires changes note, and restores approved baseline with existing revision trigger', () => {
    expect(sql).toContain("coalesce(p_note !~ '[^[:space:]]',true)");
    expect(sql).toContain("v_doc.status <> 'approved'");
    expect(sql).toContain('v_review.sequence <> (select max(sequence)');
    expect(sql).toContain('v_review.topics_snapshot');
    expect(sql).toContain('on conflict(topic_id) do update set content = excluded.content');
    expect(sql).not.toMatch(/set revision|commit;|exception when|set_config/);
    for (const table of ['documents', 'topics', 'topic_drafts']) expect(sql).toContain(`create trigger ${table}_review_lock`);
    expect(sql).toContain('security definer set search_path = \'\'');
    expect(sql).toContain('owner to postgres');
    expect(sql).toContain('from public,anon');
  });
});
