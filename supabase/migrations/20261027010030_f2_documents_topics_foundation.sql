create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  status text not null default 'draft' check (status in ('draft','in_review','approved','published')),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  parent_topic_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 240),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft','in_review','approved','published')),
  sort_order integer not null default 0 check (sort_order >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, slug),
  unique (id, document_id),
  constraint topics_parent_same_document_fk
    foreign key (parent_topic_id, document_id)
    references public.topics(id, document_id)
    on delete cascade
);

create index documents_project_id_idx on public.documents(project_id);
create index documents_created_by_idx on public.documents(created_by);
create index topics_document_parent_sort_idx on public.topics(document_id, parent_topic_id, sort_order);
create index topics_parent_topic_id_idx on public.topics(parent_topic_id);
create index topics_created_by_idx on public.topics(created_by);

create trigger documents_set_updated_at before update on public.documents
for each row execute function app_private.set_updated_at();
create trigger topics_set_updated_at before update on public.topics
for each row execute function app_private.set_updated_at();

create or replace function app_private.can_author_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin','author')
    )
    or exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and app_private.is_workspace_admin(p.workspace_id)
    );
$$;

create or replace function app_private.is_document_member(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and app_private.is_project_member(d.project_id)
  );
$$;

create or replace function app_private.can_author_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and app_private.can_author_project(d.project_id)
  );
$$;

revoke all on function app_private.can_author_project(uuid) from public;
revoke all on function app_private.is_document_member(uuid) from public;
revoke all on function app_private.can_author_document(uuid) from public;
grant execute on function app_private.can_author_project(uuid) to authenticated;
grant execute on function app_private.is_document_member(uuid) to authenticated;
grant execute on function app_private.can_author_document(uuid) to authenticated;

alter table public.documents enable row level security;
alter table public.topics enable row level security;

revoke all on table public.documents, public.topics from anon, authenticated;
grant select, insert, update, delete on table public.documents to authenticated;
grant select, insert, update, delete on table public.topics to authenticated;

create policy documents_select_project_member
on public.documents for select to authenticated
using (app_private.is_project_member(project_id));

create policy documents_insert_author
on public.documents for insert to authenticated
with check (
  created_by = (select auth.uid())
  and app_private.can_author_project(project_id)
);

create policy documents_update_author
on public.documents for update to authenticated
using (app_private.can_author_project(project_id))
with check (app_private.can_author_project(project_id));

create policy documents_delete_author
on public.documents for delete to authenticated
using (app_private.can_author_project(project_id));

create policy topics_select_document_member
on public.topics for select to authenticated
using (app_private.is_document_member(document_id));

create policy topics_insert_author
on public.topics for insert to authenticated
with check (
  created_by = (select auth.uid())
  and app_private.can_author_document(document_id)
);

create policy topics_update_author
on public.topics for update to authenticated
using (app_private.can_author_document(document_id))
with check (app_private.can_author_document(document_id));

create policy topics_delete_author
on public.topics for delete to authenticated
using (app_private.can_author_document(document_id));

create or replace function public.create_document(
  p_project_id uuid,
  p_title text,
  p_slug text,
  p_description text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.documents (id, project_id, title, slug, description, created_by)
  values (v_id, p_project_id, p_title, p_slug, p_description, auth.uid());
  return v_id;
end;
$$;

create or replace function public.create_topic(
  p_document_id uuid,
  p_parent_topic_id uuid,
  p_title text,
  p_slug text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_sort_order integer;
begin
  if p_parent_topic_id is not null and not exists (
    select 1 from public.topics t
    where t.id = p_parent_topic_id
      and t.document_id = p_document_id
  ) then
    raise exception 'Parent topic must belong to the same document' using errcode = '23514';
  end if;

  select coalesce(max(t.sort_order), -1) + 1
    into v_sort_order
  from public.topics t
  where t.document_id = p_document_id
    and t.parent_topic_id is not distinct from p_parent_topic_id;

  insert into public.topics (
    id, document_id, parent_topic_id, title, slug, sort_order, created_by
  )
  values (
    v_id, p_document_id, p_parent_topic_id, p_title, p_slug, v_sort_order, auth.uid()
  );

  return v_id;
end;
$$;

revoke execute on function public.create_document(uuid,text,text,text) from public, anon;
revoke execute on function public.create_topic(uuid,uuid,text,text) from public, anon;
grant execute on function public.create_document(uuid,text,text,text) to authenticated;
grant execute on function public.create_topic(uuid,uuid,text,text) to authenticated;