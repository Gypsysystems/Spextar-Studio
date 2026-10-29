-- Issue #17: source only; application/replay requires separate authorization.
-- Audited consumers: projects UPDATE/DELETE and project_members INSERT/UPDATE/
-- DELETE policies only. Reads, parent administration, authoring and Review use
-- separate helpers/explicit roles and intentionally retain their existing rules.
create or replace function app_private.is_project_admin(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
  );
$$;
alter function app_private.is_project_admin(uuid) owner to postgres;
revoke all on function app_private.is_project_admin(uuid) from public, anon;
grant execute on function app_private.is_project_admin(uuid) to authenticated;

-- Preserve the invoker create_project RPC's first self-admin insert, but do not
-- let a creator whose membership was revoked/demoted bootstrap back into an
-- established project. The last-admin trigger prevents an established project
-- from becoming empty. Definer lookup avoids recursive project_members RLS.
create function app_private.can_bootstrap_project_admin(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.created_by = auth.uid()
  ) and not exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
  );
$$;
alter function app_private.can_bootstrap_project_admin(uuid) owner to postgres;
revoke all on function app_private.can_bootstrap_project_admin(uuid) from public, anon;
grant execute on function app_private.can_bootstrap_project_admin(uuid) to authenticated;

drop policy project_members_insert_admin_or_bootstrap on public.project_members;
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
