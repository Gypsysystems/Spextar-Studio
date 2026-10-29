create table public.project_variables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,79}$'),
  value_type text not null default 'text' check (value_type in ('text','number','boolean','date')),
  value jsonb not null default '""'::jsonb,
  description text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key),
  constraint project_variables_value_type_matches_value check (
    (value_type = 'text' and jsonb_typeof(value) = 'string')
    or (value_type = 'number' and jsonb_typeof(value) = 'number')
    or (value_type = 'boolean' and jsonb_typeof(value) = 'boolean')
    or (value_type = 'date' and jsonb_typeof(value) = 'string')
  )
);

create table public.project_conditions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,79}$'),
  expression jsonb not null default '{"version":1}'::jsonb,
  description text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key),
  constraint project_conditions_expression_shape check (
    jsonb_typeof(expression) = 'object'
    and expression -> 'version' = '1'::jsonb
  )
);

create table public.reusable_contents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create table public.reusable_content_drafts (
  reusable_content_id uuid primary key references public.reusable_contents(id) on delete cascade,
  content jsonb not null default '{"type":"doc","version":1,"content":[]}'::jsonb,
  revision bigint not null default 1 check (revision >= 1),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reusable_content_drafts_content_shape check (
    jsonb_typeof(content) = 'object'
    and content ->> 'type' = 'doc'
    and content -> 'version' = '1'::jsonb
    and jsonb_typeof(content -> 'content') = 'array'
  )
);

create index project_variables_created_by_idx on public.project_variables(created_by);
create index project_variables_updated_by_idx on public.project_variables(updated_by);
create index project_conditions_created_by_idx on public.project_conditions(created_by);
create index project_conditions_updated_by_idx on public.project_conditions(updated_by);
create index reusable_contents_created_by_idx on public.reusable_contents(created_by);
create index reusable_contents_updated_by_idx on public.reusable_contents(updated_by);
create index reusable_content_drafts_created_by_idx on public.reusable_content_drafts(created_by);
create index reusable_content_drafts_updated_by_idx on public.reusable_content_drafts(updated_by);

create or replace function app_private.set_project_definition_updated_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function app_private.set_project_definition_updated_audit() from public;

create trigger project_variables_set_updated_audit
before update on public.project_variables
for each row execute function app_private.set_project_definition_updated_audit();
create trigger project_conditions_set_updated_audit
before update on public.project_conditions
for each row execute function app_private.set_project_definition_updated_audit();
create trigger reusable_contents_set_updated_audit
before update on public.reusable_contents
for each row execute function app_private.set_project_definition_updated_audit();

create or replace function app_private.prepare_reusable_content_draft_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
  else
    if new.reusable_content_id <> old.reusable_content_id then
      raise exception 'Reusable content draft identity cannot change' using errcode = '23514';
    end if;
    new.revision := old.revision + 1;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function app_private.prepare_reusable_content_draft_write() from public;

create trigger reusable_content_drafts_prepare_write
before insert or update on public.reusable_content_drafts
for each row execute function app_private.prepare_reusable_content_draft_write();

alter table public.project_variables enable row level security;
alter table public.project_conditions enable row level security;
alter table public.reusable_contents enable row level security;
alter table public.reusable_content_drafts enable row level security;

revoke all on table public.project_variables, public.project_conditions, public.reusable_contents, public.reusable_content_drafts from anon, authenticated;

grant select on table public.project_variables to authenticated;
grant insert (project_id, name, key, value_type, value, description) on table public.project_variables to authenticated;
grant update (name, key, value_type, value, description) on table public.project_variables to authenticated;

grant select on table public.project_conditions to authenticated;
grant insert (project_id, name, key, expression, description) on table public.project_conditions to authenticated;
grant update (name, key, expression, description) on table public.project_conditions to authenticated;

grant select on table public.reusable_contents to authenticated;
grant insert (project_id, name, slug, description, settings) on table public.reusable_contents to authenticated;
grant update (name, slug, description, settings) on table public.reusable_contents to authenticated;

grant select on table public.reusable_content_drafts to authenticated;
grant insert (reusable_content_id, content) on table public.reusable_content_drafts to authenticated;
grant update (content) on table public.reusable_content_drafts to authenticated;

create policy project_variables_select_member
on public.project_variables for select to authenticated
using (app_private.is_project_member(project_id));
create policy project_variables_insert_author
on public.project_variables for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and app_private.can_author_project(project_id)
);
create policy project_variables_update_author
on public.project_variables for update to authenticated
using (app_private.can_author_project(project_id))
with check (app_private.can_author_project(project_id));

create policy project_conditions_select_member
on public.project_conditions for select to authenticated
using (app_private.is_project_member(project_id));
create policy project_conditions_insert_author
on public.project_conditions for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and app_private.can_author_project(project_id)
);
create policy project_conditions_update_author
on public.project_conditions for update to authenticated
using (app_private.can_author_project(project_id))
with check (app_private.can_author_project(project_id));

create policy reusable_contents_select_member
on public.reusable_contents for select to authenticated
using (app_private.is_project_member(project_id));
create policy reusable_contents_insert_author
on public.reusable_contents for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and app_private.can_author_project(project_id)
);
create policy reusable_contents_update_author
on public.reusable_contents for update to authenticated
using (app_private.can_author_project(project_id))
with check (app_private.can_author_project(project_id));

create policy reusable_content_drafts_select_member
on public.reusable_content_drafts for select to authenticated
using (
  exists (
    select 1 from public.reusable_contents rc
    where rc.id = reusable_content_drafts.reusable_content_id
      and app_private.is_project_member(rc.project_id)
  )
);
create policy reusable_content_drafts_insert_author
on public.reusable_content_drafts for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1 from public.reusable_contents rc
    where rc.id = reusable_content_drafts.reusable_content_id
      and app_private.can_author_project(rc.project_id)
  )
);
create policy reusable_content_drafts_update_author
on public.reusable_content_drafts for update to authenticated
using (
  exists (
    select 1 from public.reusable_contents rc
    where rc.id = reusable_content_drafts.reusable_content_id
      and app_private.can_author_project(rc.project_id)
  )
)
with check (
  exists (
    select 1 from public.reusable_contents rc
    where rc.id = reusable_content_drafts.reusable_content_id
      and app_private.can_author_project(rc.project_id)
  )
);