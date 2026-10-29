-- Variables remain project-owned. Add the frozen-screen fallback and output-override model.
alter table public.project_variables
  add column required boolean not null default true,
  add column output_values jsonb not null default '{}'::jsonb,
  add constraint project_variables_output_values_object check (jsonb_typeof(output_values) = 'object');

grant insert (required, output_values) on table public.project_variables to authenticated;
grant update (required, output_values) on table public.project_variables to authenticated;

-- Conditional tags are category/value based in the frozen UI, not free-form expressions.
alter table public.project_conditions rename to condition_categories;
alter table public.condition_categories rename column expression to settings;
alter table public.condition_categories drop constraint project_conditions_expression_shape;
alter table public.condition_categories alter column settings set default '{}'::jsonb;
update public.condition_categories set settings = '{}'::jsonb where settings = '{"version":1}'::jsonb;
alter table public.condition_categories
  add constraint condition_categories_settings_object check (jsonb_typeof(settings) = 'object'),
  add column unassigned_behavior text not null default 'include' check (unassigned_behavior in ('include','exclude')),
  add column value_match_mode text not null default 'any' check (value_match_mode in ('any','all'));

alter table public.condition_categories rename constraint project_conditions_pkey to condition_categories_pkey;
alter table public.condition_categories rename constraint project_conditions_created_by_fkey to condition_categories_created_by_fkey;
alter table public.condition_categories rename constraint project_conditions_updated_by_fkey to condition_categories_updated_by_fkey;
alter table public.condition_categories rename constraint project_conditions_project_id_fkey to condition_categories_project_id_fkey;
alter table public.condition_categories rename constraint project_conditions_project_id_key_key to condition_categories_project_id_key_key;
alter table public.condition_categories rename constraint project_conditions_key_check to condition_categories_key_check;
alter table public.condition_categories rename constraint project_conditions_name_check to condition_categories_name_check;
alter index public.project_conditions_created_by_idx rename to condition_categories_created_by_idx;
alter index public.project_conditions_updated_by_idx rename to condition_categories_updated_by_idx;
alter trigger project_conditions_set_updated_audit on public.condition_categories rename to condition_categories_set_updated_audit;
alter policy project_conditions_select_member on public.condition_categories rename to condition_categories_select_member;
alter policy project_conditions_insert_author on public.condition_categories rename to condition_categories_insert_author;
alter policy project_conditions_update_author on public.condition_categories rename to condition_categories_update_author;

grant insert (unassigned_behavior, value_match_mode) on table public.condition_categories to authenticated;
grant update (unassigned_behavior, value_match_mode) on table public.condition_categories to authenticated;

create table public.condition_values (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.condition_categories(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,79}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, key)
);
create index condition_values_created_by_idx on public.condition_values(created_by);
create index condition_values_updated_by_idx on public.condition_values(updated_by);

create trigger condition_values_set_updated_audit
before update on public.condition_values
for each row execute function app_private.set_project_definition_updated_audit();

alter table public.condition_values enable row level security;
revoke all on table public.condition_values from anon, authenticated;
grant select on table public.condition_values to authenticated;
grant insert (category_id, name, key, sort_order) on table public.condition_values to authenticated;
grant update (name, key, sort_order) on table public.condition_values to authenticated;

create policy condition_values_select_member
on public.condition_values for select to authenticated
using (
  exists (
    select 1 from public.condition_categories c
    where c.id = condition_values.category_id
      and app_private.is_project_member(c.project_id)
  )
);
create policy condition_values_insert_author
on public.condition_values for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1 from public.condition_categories c
    where c.id = condition_values.category_id
      and app_private.can_author_project(c.project_id)
  )
);
create policy condition_values_update_author
on public.condition_values for update to authenticated
using (
  exists (
    select 1 from public.condition_categories c
    where c.id = condition_values.category_id
      and app_private.can_author_project(c.project_id)
  )
)
with check (
  exists (
    select 1 from public.condition_categories c
    where c.id = condition_values.category_id
      and app_private.can_author_project(c.project_id)
  )
);

-- Reusable Content is a workspace library. An item is either Workspace-shared or Project-only.
alter table public.reusable_contents add column workspace_id uuid references public.workspaces(id) on delete cascade;
update public.reusable_contents rc set workspace_id = p.workspace_id from public.projects p where p.id = rc.project_id;
alter table public.reusable_contents alter column workspace_id set not null;
alter table public.reusable_contents alter column project_id drop not null;
alter table public.reusable_contents
  add column scope text not null default 'project' check (scope in ('workspace','project')),
  add column status text not null default 'draft' check (status in ('draft','in_review','approved','published')),
  add column update_policy text not null default 'notify' check (update_policy in ('notify','manual','auto')),
  add column tags text[] not null default '{}',
  add constraint reusable_contents_scope_owner_check check (
    (scope = 'workspace' and project_id is null)
    or (scope = 'project' and project_id is not null)
  );

alter table public.reusable_contents drop constraint reusable_contents_project_id_slug_key;
create unique index reusable_contents_workspace_slug_key on public.reusable_contents(workspace_id, slug) where scope = 'workspace';
create unique index reusable_contents_project_slug_key on public.reusable_contents(project_id, slug) where scope = 'project';
create index reusable_contents_workspace_id_idx on public.reusable_contents(workspace_id);
create index reusable_contents_project_id_idx on public.reusable_contents(project_id) where project_id is not null;

grant insert (workspace_id, scope, status, update_policy, tags) on table public.reusable_contents to authenticated;
grant update (status, update_policy, tags) on table public.reusable_contents to authenticated;

-- Replace Reusable Content policies with scope-aware access.
drop policy reusable_contents_select_member on public.reusable_contents;
drop policy reusable_contents_insert_author on public.reusable_contents;
drop policy reusable_contents_update_author on public.reusable_contents;

create policy reusable_contents_select_member
on public.reusable_contents for select to authenticated
using (
  (scope = 'workspace' and app_private.is_workspace_member(workspace_id))
  or (scope = 'project' and project_id is not null and app_private.is_project_member(project_id))
);

create policy reusable_contents_insert_editor
on public.reusable_contents for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (
    (scope = 'workspace' and project_id is null and app_private.is_workspace_admin(workspace_id))
    or (
      scope = 'project'
      and project_id is not null
      and app_private.can_author_project(project_id)
      and exists (
        select 1 from public.projects p
        where p.id = reusable_contents.project_id
          and p.workspace_id = reusable_contents.workspace_id
      )
    )
  )
);

create policy reusable_contents_update_editor
on public.reusable_contents for update to authenticated
using (
  (scope = 'workspace' and app_private.is_workspace_admin(workspace_id))
  or (scope = 'project' and project_id is not null and app_private.can_author_project(project_id))
)
with check (
  (scope = 'workspace' and project_id is null and app_private.is_workspace_admin(workspace_id))
  or (
    scope = 'project'
    and project_id is not null
    and app_private.can_author_project(project_id)
    and exists (
      select 1 from public.projects p
      where p.id = reusable_contents.project_id
        and p.workspace_id = reusable_contents.workspace_id
    )
  )
);

-- Reusable draft policies inherit the source item's Workspace-shared vs Project-only scope.
drop policy reusable_content_drafts_select_member on public.reusable_content_drafts;
drop policy reusable_content_drafts_insert_author on public.reusable_content_drafts;
drop policy reusable_content_drafts_update_author on public.reusable_content_drafts;

create policy reusable_content_drafts_select_member
on public.reusable_content_drafts for select to authenticated
using (
  exists (
    select 1 from public.reusable_contents rc
    where rc.id = reusable_content_drafts.reusable_content_id
      and (
        (rc.scope = 'workspace' and app_private.is_workspace_member(rc.workspace_id))
        or (rc.scope = 'project' and rc.project_id is not null and app_private.is_project_member(rc.project_id))
      )
  )
);

create policy reusable_content_drafts_insert_editor
on public.reusable_content_drafts for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1 from public.reusable_contents rc
    where rc.id = reusable_content_drafts.reusable_content_id
      and (
        (rc.scope = 'workspace' and app_private.is_workspace_admin(rc.workspace_id))
        or (rc.scope = 'project' and rc.project_id is not null and app_private.can_author_project(rc.project_id))
      )
  )
);

create policy reusable_content_drafts_update_editor
on public.reusable_content_drafts for update to authenticated
using (
  exists (
    select 1 from public.reusable_contents rc
    where rc.id = reusable_content_drafts.reusable_content_id
      and (
        (rc.scope = 'workspace' and app_private.is_workspace_admin(rc.workspace_id))
        or (rc.scope = 'project' and rc.project_id is not null and app_private.can_author_project(rc.project_id))
      )
  )
)
with check (
  exists (
    select 1 from public.reusable_contents rc
    where rc.id = reusable_content_drafts.reusable_content_id
      and (
        (rc.scope = 'workspace' and app_private.is_workspace_admin(rc.workspace_id))
        or (rc.scope = 'project' and rc.project_id is not null and app_private.can_author_project(rc.project_id))
      )
  )
);