create or replace function app_private.is_organization_creator(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.created_by = auth.uid()
  );
$$;

create or replace function app_private.is_workspace_creator(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.created_by = auth.uid()
  );
$$;

create or replace function app_private.is_project_creator(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.created_by = auth.uid()
  );
$$;

revoke all on function app_private.is_organization_creator(uuid) from public;
revoke all on function app_private.is_workspace_creator(uuid) from public;
revoke all on function app_private.is_project_creator(uuid) from public;
grant execute on function app_private.is_organization_creator(uuid) to authenticated;
grant execute on function app_private.is_workspace_creator(uuid) to authenticated;
grant execute on function app_private.is_project_creator(uuid) to authenticated;

drop policy if exists organization_members_insert_admin_or_bootstrap on public.organization_members;
create policy organization_members_insert_admin_or_bootstrap on public.organization_members for insert to authenticated
with check (
  app_private.is_org_admin(organization_id)
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and app_private.is_organization_creator(organization_id)
  )
);

drop policy if exists workspace_members_insert_admin_or_bootstrap on public.workspace_members;
create policy workspace_members_insert_admin_or_bootstrap on public.workspace_members for insert to authenticated
with check (
  app_private.is_workspace_admin(workspace_id)
  or (
    user_id = (select auth.uid())
    and role = 'admin'
    and app_private.is_workspace_creator(workspace_id)
  )
);

drop policy if exists project_members_insert_admin_or_bootstrap on public.project_members;
create policy project_members_insert_admin_or_bootstrap on public.project_members for insert to authenticated
with check (
  app_private.is_project_admin(project_id)
  or (
    user_id = (select auth.uid())
    and role = 'admin'
    and app_private.is_project_creator(project_id)
  )
);

create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.organizations (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning id into v_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  return v_id;
end;
$$;

create or replace function public.create_workspace(p_organization_id uuid, p_name text, p_slug text, p_description text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.workspaces (organization_id, name, slug, description, created_by)
  values (p_organization_id, p_name, p_slug, p_description, auth.uid())
  returning id into v_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_id, auth.uid(), 'admin');

  return v_id;
end;
$$;

create or replace function public.create_project(p_workspace_id uuid, p_name text, p_slug text, p_description text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.projects (workspace_id, name, slug, description, created_by)
  values (p_workspace_id, p_name, p_slug, p_description, auth.uid())
  returning id into v_id;

  insert into public.project_members (project_id, user_id, role)
  values (v_id, auth.uid(), 'admin');

  return v_id;
end;
$$;

revoke all on function public.create_organization(text,text) from public;
revoke all on function public.create_workspace(uuid,text,text,text) from public;
revoke all on function public.create_project(uuid,text,text,text) from public;
grant execute on function public.create_organization(text,text) to authenticated;
grant execute on function public.create_workspace(uuid,text,text,text) to authenticated;
grant execute on function public.create_project(uuid,text,text,text) to authenticated;