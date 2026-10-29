create or replace function public.duplicate_document(
  p_document_id uuid,
  p_new_title text,
  p_new_slug text
)
returns uuid
language plpgsql
security invoker
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

    v_map := v_map || jsonb_build_object(v_row.id::text, v_new_topic_id::text);
  end loop;

  return v_new_document_id;
end;
$$;

create or replace function public.duplicate_topic_subtree(
  p_topic_id uuid,
  p_new_title text,
  p_new_slug text
)
returns uuid
language plpgsql
security invoker
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

    v_map := v_map || jsonb_build_object(v_row.id::text, v_new_topic_id::text);
  end loop;

  return v_new_root_id;
end;
$$;

revoke execute on function public.duplicate_document(uuid,text,text) from public, anon;
revoke execute on function public.duplicate_topic_subtree(uuid,text,text) from public, anon;
grant execute on function public.duplicate_document(uuid,text,text) to authenticated;
grant execute on function public.duplicate_topic_subtree(uuid,text,text) to authenticated;