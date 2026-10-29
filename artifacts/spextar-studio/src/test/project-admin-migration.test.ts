import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './backend-contract-inspector';

const directory = resolve(repositoryRoot, 'supabase/migrations');
const filename = '20261029172250_enforce_explicit_project_admin_management.sql';
const read = (file: string) => readFileSync(resolve(directory, file), 'utf8');
const sql = read(filename).replace(/--[^\n]*/g, '');
const compact = (text: string) => text.replace(/\s+/g, ' ').trim();
const foundation = read('20261026235245_f0_f1_identity_workspace_project_foundation.sql');

// Source assertions only: these do not execute PostgreSQL or simulate its RLS.
describe('Issue #17 forward project-management RLS source contract', () => {
  it('limits every existing helper consumer to the five management policies', () => {
    const consumers: string[] = [];
    for (const file of readdirSync(directory).filter(f => f.endsWith('.sql') && f !== filename)) {
      const text = read(file);
      for (const match of text.matchAll(/create policy ([\s\S]*?);/g)) {
        if (match[0].includes('app_private.is_project_admin(')) consumers.push(match[1].split(/\s/)[0]);
      }
      // No function body (including Review/authoring/read helpers) calls it.
      for (const match of text.matchAll(/as \$\$([\s\S]*?)\$\$/g)) {
        expect(match[1], file).not.toContain('app_private.is_project_admin(');
      }
    }
    expect([...new Set(consumers)].sort()).toEqual([
      'project_members_delete_admin', 'project_members_insert_admin_or_bootstrap',
      'project_members_update_admin', 'projects_delete_admin', 'projects_update_admin',
    ]);
    for (const name of ['projects_update_admin', 'project_members_update_admin']) {
      const policy = foundation.match(new RegExp(`create policy ${name} [\\s\\S]*?;`))![0];
      expect(policy).toMatch(/using \(app_private.is_project_admin\(.+\)\)/);
      expect(policy).toMatch(/with check \(app_private.is_project_admin\(.+\)\)/);
    }
  });

  it('requires current identity, exact project and explicit admin; no parent/JWT/creator bypass', () => {
    const body = sql.match(/function app_private.is_project_admin\(p_project_id uuid\)[\s\S]*?as \$\$([\s\S]*?)\$\$/)![1];
    expect(compact(body)).toBe(compact(`
      select exists (
        select 1 from public.project_members pm
        where pm.project_id = p_project_id
          and pm.user_id = auth.uid()
          and pm.role = 'admin'
      );
    `));
  });

  it('permits only initial creator self-admin bootstrap, never revoked creator re-entry', () => {
    expect(compact(sql)).toContain(compact(`
      select exists (
        select 1 from public.projects p
        where p.id = p_project_id and p.created_by = auth.uid()
      ) and not exists (
        select 1 from public.project_members pm
        where pm.project_id = p_project_id
      );
    `));
    const policy = sql.match(/create policy project_members_insert_admin_or_bootstrap[\s\S]*?;/)![0];
    expect(compact(policy)).toBe(compact(`
      create policy project_members_insert_admin_or_bootstrap
      on public.project_members for insert to authenticated
      with check (
        app_private.is_project_admin(project_id)
        or (
          user_id = (select auth.uid())
          and role = 'admin'
          and app_private.can_bootstrap_project_admin(project_id)
        )
      );
    `));
    const bootstrap = read('20261026235541_harden_membership_bootstrap_and_create_flows.sql');
    expect(bootstrap).toContain("values (v_id, auth.uid(), 'admin')");
    expect(bootstrap).toContain('security invoker');
  });

  it('retains private fixed-path functions, postgres ownership and minimum execute grants', () => {
    expect(sql.match(/security definer set search_path = ''/g)).toHaveLength(2);
    for (const helper of ['is_project_admin', 'can_bootstrap_project_admin']) {
      expect(sql).toContain(`alter function app_private.${helper}(uuid) owner to postgres;`);
      expect(sql).toContain(`revoke all on function app_private.${helper}(uuid) from public, anon;`);
      expect(sql).toContain(`grant execute on function app_private.${helper}(uuid) to authenticated;`);
    }
    expect(sql).not.toMatch(/grant .*on (table|schema)|create function public\.|auth.jwt|service_role/i);
  });

  it('leaves last-admin serialization, owner safeguards, inherited reads, authoring and Review unchanged', () => {
    expect(sql).not.toMatch(/create (?:or replace )?function (?!app_private\.(?:is_project_admin|can_bootstrap_project_admin)\()/);
    expect(sql.match(/(?:create|drop) policy/g)).toHaveLength(2);
    expect(sql).not.toMatch(/(?:alter table|create trigger|drop trigger|delete from|update public\.)/i);
    const lastAdmin = read('20261028120753_protect_last_project_admin.sql');
    expect(lastAdmin).toContain('for update;');
    expect(lastAdmin).toContain('if v_admin_count <= 1 then');
    expect(lastAdmin).toContain('before delete or update of role, project_id');
    expect(read('20261027003321_protect_organization_owner_membership.sql')).toContain("and role <> 'owner'");
    expect(read('20261027083130_allow_project_members_select_project.sql')).toContain('app_private.is_workspace_member(workspace_id)');
    expect(read('20261027153832_restrict_content_authoring_to_explicit_project_roles.sql')).toContain("pm.role in ('admin', 'author')");
    const review = read('20261029140601_review_lifecycle_foundation.sql');
    expect(review).toContain("p_action in ('submit','draft') and v_role in ('admin','author')");
    expect(review).toContain("p_action in ('approved','changes_requested') and v_role in ('admin','reviewer')");
    expect(review).toContain('user_id = auth.uid() for share');
  });
});
