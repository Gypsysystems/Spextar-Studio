create table public.topic_drafts (
  topic_id uuid primary key references public.topics(id) on delete cascade,
  content jsonb not null default '{"type":"doc","version":1,"content":[]}'::jsonb,
  revision bigint not null default 1 check (revision >= 1),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topic_drafts_content_shape check (
    jsonb_typeof(content) = 'object'
    and content ->> 'type' = 'doc'
    and content -> 'version' = '1'::jsonb
    and jsonb_typeof(content -> 'content') = 'array'
  )
);

alter table public.topic_drafts enable row level security;

create policy topic_drafts_select_document_member
on public.topic_drafts
for select
to authenticated
using (
  exists (
    select 1
    from public.topics t
    where t.id = topic_drafts.topic_id
      and app_private.is_document_member(t.document_id)
  )
);

create policy topic_drafts_insert_author
on public.topic_drafts
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1
    from public.topics t
    where t.id = topic_drafts.topic_id
      and app_private.can_author_document(t.document_id)
  )
);

create policy topic_drafts_update_author
on public.topic_drafts
for update
to authenticated
using (
  exists (
    select 1
    from public.topics t
    where t.id = topic_drafts.topic_id
      and app_private.can_author_document(t.document_id)
  )
)
with check (
  exists (
    select 1
    from public.topics t
    where t.id = topic_drafts.topic_id
      and app_private.can_author_document(t.document_id)
  )
);

revoke all on table public.topic_drafts from anon, authenticated;
grant select on table public.topic_drafts to authenticated;
grant insert (topic_id, content) on table public.topic_drafts to authenticated;
grant update (content) on table public.topic_drafts to authenticated;

create or replace function app_private.prepare_topic_draft_write()
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
    if new.topic_id <> old.topic_id then
      raise exception 'Topic draft identity cannot change' using errcode = '23514';
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

create trigger topic_drafts_prepare_write
before insert or update on public.topic_drafts
for each row execute function app_private.prepare_topic_draft_write();

create or replace function app_private.touch_topic_draft_parents()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_document_id uuid;
begin
  select t.document_id into v_document_id
  from public.topics t
  where t.id = new.topic_id;

  update public.topics
  set updated_at = now()
  where id = new.topic_id;

  if v_document_id is not null then
    update public.documents
    set updated_at = now()
    where id = v_document_id;
  end if;

  return null;
end;
$$;

create trigger topic_drafts_touch_parents
after insert or update on public.topic_drafts
for each row execute function app_private.touch_topic_draft_parents();

create or replace function public.duplicate_document(p_document_id uuid, p_new_title text, p_new_slug text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_source public.documents%rowtype;
  v_new_document_id uuid := gen_random_uuid();
  v_row record;
  v_new_topic_id uuid;
  v_new_parent_id uuid;
  v_map jsonb := '{}'::jsonb;
begin
  select * into v_source
  from public.documents
  where id = p_document_id;

  if v_source.id is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  if not app_private.can_author_project(v_source.project_id) then
    raise exception 'Insufficient permission to duplicate document' using errcode = '42501';
  end if;

  insert into public.documents (
    id, project_id, title, slug, description, status, settings, created_by
  ) values (
    v_new_document_id,
    v_source.project_id,
    p_new_title,
    p_new_slug,
    v_source.description,
    'draft',
    v_source.settings,
    auth.uid()
  );

  for v_row in
    with recursive tree as (
      select t.*, 0 as depth
      from public.topics t
      where t.document_id = p_document_id
        and t.parent_topic_id is null
      union all
      select c.*, tree.depth + 1
      from public.topics c
      join tree on c.parent_topic_id = tree.id
    )
    select * from tree
    order by depth, parent_topic_id nulls first, sort_order, created_at, id
  loop
    v_new_topic_id := gen_random_uuid();
    v_new_parent_id := case
      when v_row.parent_topic_id is null then null
      else (v_map ->> v_row.parent_topic_id::text)::uuid
    end;

    insert into public.topics (
      id, document_id, parent_topic_id, title, slug, status, sort_order, settings, created_by
    ) values (
      v_new_topic_id,
      v_new_document_id,
      v_new_parent_id,
      v_row.title,
      v_row.slug,
      'draft',
      v_row.sort_order,
      v_row.settings,
      auth.uid()
    );

    insert into public.topic_drafts (topic_id, content)
    select v_new_topic_id, td.content
    from public.topic_drafts td
    where td.topic_id = v_row.id;

    v_map := v_map || jsonb_build_object(v_row.id::text, v_new_topic_id::text);
  end loop;

  return v_new_document_id;
end;
$$;

create or replace function public.duplicate_topic_subtree(p_topic_id uuid, p_new_title text, p_new_slug text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_source public.topics%rowtype;
  v_new_root_id uuid := gen_random_uuid();
  v_row record;
  v_new_topic_id uuid;
  v_new_parent_id uuid;
  v_suffix text := substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8);
  v_map jsonb := '{}'::jsonb;
begin
  select * into v_source
  from public.topics
  where id = p_topic_id;

  if v_source.id is null then
    raise exception 'Topic not found' using errcode = 'P0002';
  end if;

  if not app_private.can_author_document(v_source.document_id) then
    raise exception 'Insufficient permission to duplicate topic' using errcode = '42501';
  end if;

  update public.topics
  set sort_order = sort_order + 1
  where document_id = v_source.document_id
    and parent_topic_id is not distinct from v_source.parent_topic_id
    and sort_order > v_source.sort_order;

  insert into public.topics (
    id, document_id, parent_topic_id, title, slug, status, sort_order, settings, created_by
  ) values (
    v_new_root_id,
    v_source.document_id,
    v_source.parent_topic_id,
    p_new_title,
    p_new_slug,
    'draft',
    v_source.sort_order + 1,
    v_source.settings,
    auth.uid()
  );

  insert into public.topic_drafts (topic_id, content)
  select v_new_root_id, td.content
  from public.topic_drafts td
  where td.topic_id = v_source.id;

  v_map := jsonb_build_object(v_source.id::text, v_new_root_id::text);

  for v_row in
    with recursive tree as (
      select t.*, 1 as depth
      from public.topics t
      where t.parent_topic_id = p_topic_id
      union all
      select c.*, tree.depth + 1
      from public.topics c
      join tree on c.parent_topic_id = tree.id
    )
    select * from tree
    order by depth, parent_topic_id, sort_order, created_at, id
  loop
    v_new_topic_id := gen_random_uuid();
    v_new_parent_id := (v_map ->> v_row.parent_topic_id::text)::uuid;

    insert into public.topics (
      id, document_id, parent_topic_id, title, slug, status, sort_order, settings, created_by
    ) values (
      v_new_topic_id,
      v_source.document_id,
      v_new_parent_id,
      v_row.title,
      left(v_row.slug, 220) || '-copy-' || v_suffix,
      'draft',
      v_row.sort_order,
      v_row.settings,
      auth.uid()
    );

    insert into public.topic_drafts (topic_id, content)
    select v_new_topic_id, td.content
    from public.topic_drafts td
    where td.topic_id = v_row.id;

    v_map := v_map || jsonb_build_object(v_row.id::text, v_new_topic_id::text);
  end loop;

  return v_new_root_id;
end;
$$;