create or replace function public.move_topic(
  p_topic_id uuid,
  p_new_parent_topic_id uuid,
  p_new_sort_order integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document_id uuid;
  v_old_parent uuid;
  v_old_sort integer;
  v_target_document_id uuid;
  v_target_count integer;
  v_new_sort integer;
  v_cycle boolean;
begin
  select t.document_id, t.parent_topic_id, t.sort_order
    into v_document_id, v_old_parent, v_old_sort
  from public.topics t
  where t.id = p_topic_id;

  if v_document_id is null then
    raise exception 'Topic not found' using errcode = 'P0002';
  end if;

  if not app_private.can_author_document(v_document_id) then
    raise exception 'Insufficient permission to modify topic' using errcode = '42501';
  end if;

  if p_new_parent_topic_id = p_topic_id then
    raise exception 'A topic cannot be its own parent' using errcode = '23514';
  end if;

  if p_new_parent_topic_id is not null then
    select t.document_id into v_target_document_id
    from public.topics t
    where t.id = p_new_parent_topic_id;

    if v_target_document_id is null then
      raise exception 'Target parent topic not found' using errcode = 'P0002';
    end if;

    if v_target_document_id <> v_document_id then
      raise exception 'Target parent must belong to the same document' using errcode = '23514';
    end if;

    with recursive descendants(id) as (
      select t.id from public.topics t where t.parent_topic_id = p_topic_id
      union all
      select child.id
      from public.topics child
      join descendants d on child.parent_topic_id = d.id
    )
    select exists(select 1 from descendants where id = p_new_parent_topic_id)
      into v_cycle;

    if v_cycle then
      raise exception 'Moving the topic would create a cycle' using errcode = '23514';
    end if;
  end if;

  select count(*)::integer
    into v_target_count
  from public.topics t
  where t.document_id = v_document_id
    and t.parent_topic_id is not distinct from p_new_parent_topic_id
    and t.id <> p_topic_id;

  v_new_sort := least(greatest(coalesce(p_new_sort_order, v_target_count), 0), v_target_count);

  if v_old_parent is not distinct from p_new_parent_topic_id then
    if v_new_sort > v_old_sort then
      update public.topics
      set sort_order = sort_order - 1
      where document_id = v_document_id
        and parent_topic_id is not distinct from v_old_parent
        and id <> p_topic_id
        and sort_order > v_old_sort
        and sort_order <= v_new_sort;
    elsif v_new_sort < v_old_sort then
      update public.topics
      set sort_order = sort_order + 1
      where document_id = v_document_id
        and parent_topic_id is not distinct from v_old_parent
        and id <> p_topic_id
        and sort_order >= v_new_sort
        and sort_order < v_old_sort;
    end if;
  else
    update public.topics
    set sort_order = sort_order - 1
    where document_id = v_document_id
      and parent_topic_id is not distinct from v_old_parent
      and id <> p_topic_id
      and sort_order > v_old_sort;

    update public.topics
    set sort_order = sort_order + 1
    where document_id = v_document_id
      and parent_topic_id is not distinct from p_new_parent_topic_id
      and id <> p_topic_id
      and sort_order >= v_new_sort;
  end if;

  update public.topics
  set parent_topic_id = p_new_parent_topic_id,
      sort_order = v_new_sort
  where id = p_topic_id;
end;
$$;

create or replace function public.promote_topic(p_topic_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent_id uuid;
  v_grandparent_id uuid;
  v_parent_sort integer;
begin
  select t.parent_topic_id into v_parent_id
  from public.topics t where t.id = p_topic_id;

  if v_parent_id is null then
    return;
  end if;

  select t.parent_topic_id, t.sort_order
    into v_grandparent_id, v_parent_sort
  from public.topics t
  where t.id = v_parent_id;

  perform public.move_topic(p_topic_id, v_grandparent_id, v_parent_sort + 1);
end;
$$;

create or replace function public.demote_topic(p_topic_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document_id uuid;
  v_parent_id uuid;
  v_sort integer;
  v_previous_sibling uuid;
  v_child_count integer;
begin
  select t.document_id, t.parent_topic_id, t.sort_order
    into v_document_id, v_parent_id, v_sort
  from public.topics t
  where t.id = p_topic_id;

  if v_document_id is null then
    raise exception 'Topic not found' using errcode = 'P0002';
  end if;

  select t.id into v_previous_sibling
  from public.topics t
  where t.document_id = v_document_id
    and t.parent_topic_id is not distinct from v_parent_id
    and t.sort_order < v_sort
  order by t.sort_order desc, t.created_at desc, t.id desc
  limit 1;

  if v_previous_sibling is null then
    return;
  end if;

  select count(*)::integer into v_child_count
  from public.topics t
  where t.document_id = v_document_id
    and t.parent_topic_id = v_previous_sibling;

  perform public.move_topic(p_topic_id, v_previous_sibling, v_child_count);
end;
$$;

revoke execute on function public.move_topic(uuid,uuid,integer) from public, anon;
revoke execute on function public.promote_topic(uuid) from public, anon;
revoke execute on function public.demote_topic(uuid) from public, anon;
grant execute on function public.move_topic(uuid,uuid,integer) to authenticated;
grant execute on function public.promote_topic(uuid) to authenticated;
grant execute on function public.demote_topic(uuid) to authenticated;