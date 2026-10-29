create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin','author','reviewer','viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members(user_id);
create index workspaces_organization_id_idx on public.workspaces(organization_id);
create index workspace_members_user_id_idx on public.workspace_members(user_id);
create index projects_workspace_id_idx on public.projects(workspace_id);
create index project_members_user_id_idx on public.project_members(user_id);

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function app_private.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
for each row execute function app_private.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces
for each row execute function app_private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function app_private.set_updated_at();

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function app_private.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

create or replace function app_private.is_org_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid()
  );
$$;

create or replace function app_private.is_org_admin(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role in ('owner','admin')
  );
$$;

create or replace function app_private.is_org_owner(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function app_private.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
  ) or exists (
    select 1 from public.workspaces w
    join public.organization_members om on om.organization_id = w.organization_id
    where w.id = p_workspace_id and om.user_id = auth.uid()
  );
$$;

create or replace function app_private.is_workspace_admin(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid() and wm.role = 'admin'
  ) or exists (
    select 1 from public.workspaces w
    join public.organization_members om on om.organization_id = w.organization_id
    where w.id = p_workspace_id and om.user_id = auth.uid() and om.role in ('owner','admin')
  );
$$;

create or replace function app_private.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = auth.uid()
  ) or exists (
    select 1 from public.projects p
    where p.id = p_project_id and app_private.is_workspace_member(p.workspace_id)
  );
$$;

create or replace function app_private.is_project_admin(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.role = 'admin'
  ) or exists (
    select 1 from public.projects p
    where p.id = p_project_id and app_private.is_workspace_admin(p.workspace_id)
  );
$$;

revoke all on function app_private.set_updated_at() from public;
revoke all on function app_private.is_org_member(uuid) from public;
revoke all on function app_private.is_org_admin(uuid) from public;
revoke all on function app_private.is_org_owner(uuid) from public;
revoke all on function app_private.is_workspace_member(uuid) from public;
revoke all on function app_private.is_workspace_admin(uuid) from public;
revoke all on function app_private.is_project_member(uuid) from public;
revoke all on function app_private.is_project_admin(uuid) from public;

grant usage on schema app_private to authenticated;
grant execute on function app_private.is_org_member(uuid) to authenticated;
grant execute on function app_private.is_org_admin(uuid) to authenticated;
grant execute on function app_private.is_org_owner(uuid) to authenticated;
grant execute on function app_private.is_workspace_member(uuid) to authenticated;
grant execute on function app_private.is_workspace_admin(uuid) to authenticated;
grant execute on function app_private.is_project_member(uuid) to authenticated;
grant execute on function app_private.is_project_admin(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;

revoke all on public.profiles, public.organizations, public.organization_members, public.workspaces, public.workspace_members, public.projects, public.project_members from anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;

create policy profiles_select_self on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy profiles_update_self on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy organizations_select_member on public.organizations for select to authenticated
using (app_private.is_org_member(id));
create policy organizations_insert_creator on public.organizations for insert to authenticated
with check ((select auth.uid()) = created_by);
create policy organizations_update_admin on public.organizations for update to authenticated
using (app_private.is_org_admin(id))
with check (app_private.is_org_admin(id));
create policy organizations_delete_owner on public.organizations for delete to authenticated
using (app_private.is_org_owner(id));

create policy organization_members_select_member on public.organization_members for select to authenticated
using (app_private.is_org_member(organization_id));
create policy organization_members_insert_admin_or_bootstrap on public.organization_members for insert to authenticated
with check (
  app_private.is_org_admin(organization_id)
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.created_by = (select auth.uid())
    )
  )
);
create policy organization_members_update_admin on public.organization_members for update to authenticated
using (app_private.is_org_admin(organization_id))
with check (app_private.is_org_admin(organization_id));
create policy organization_members_delete_admin on public.organization_members for delete to authenticated
using (app_private.is_org_admin(organization_id));

create policy workspaces_select_org_member on public.workspaces for select to authenticated
using (app_private.is_org_member(organization_id));
create policy workspaces_insert_org_admin on public.workspaces for insert to authenticated
with check (app_private.is_org_admin(organization_id) and created_by = (select auth.uid()));
create policy workspaces_update_admin on public.workspaces for update to authenticated
using (app_private.is_workspace_admin(id))
with check (app_private.is_workspace_admin(id));
create policy workspaces_delete_admin on public.workspaces for delete to authenticated
using (app_private.is_workspace_admin(id));

create policy workspace_members_select_member on public.workspace_members for select to authenticated
using (app_private.is_workspace_member(workspace_id));
create policy workspace_members_insert_admin_or_bootstrap on public.workspace_members for insert to authenticated
with check (
  app_private.is_workspace_admin(workspace_id)
  or (
    user_id = (select auth.uid())
    and role = 'admin'
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.created_by = (select auth.uid())
    )
  )
);
create policy workspace_members_update_admin on public.workspace_members for update to authenticated
using (app_private.is_workspace_admin(workspace_id))
with check (app_private.is_workspace_admin(workspace_id));
create policy workspace_members_delete_admin on public.workspace_members for delete to authenticated
using (app_private.is_workspace_admin(workspace_id));

create policy projects_select_workspace_member on public.projects for select to authenticated
using (app_private.is_workspace_member(workspace_id));
create policy projects_insert_workspace_admin on public.projects for insert to authenticated
with check (app_private.is_workspace_admin(workspace_id) and created_by = (select auth.uid()));
create policy projects_update_admin on public.projects for update to authenticated
using (app_private.is_project_admin(id))
with check (app_private.is_project_admin(id));
create policy projects_delete_admin on public.projects for delete to authenticated
using (app_private.is_project_admin(id));

create policy project_members_select_member on public.project_members for select to authenticated
using (app_private.is_project_member(project_id));
create policy project_members_insert_admin_or_bootstrap on public.project_members for insert to authenticated
with check (
  app_private.is_project_admin(project_id)
  or (
    user_id = (select auth.uid())
    and role = 'admin'
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.created_by = (select auth.uid())
    )
  )
);
create policy project_members_update_admin on public.project_members for update to authenticated
using (app_private.is_project_admin(project_id))
with check (app_private.is_project_admin(project_id));
create policy project_members_delete_admin on public.project_members for delete to authenticated
using (app_private.is_project_admin(project_id));