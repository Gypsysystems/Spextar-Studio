create or replace function app_private.protect_last_project_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_count bigint;
begin
  -- Deleting a parent Project cascades its memberships. In that case the
  -- Project row is already gone, so the membership invariant no longer applies.
  if not exists (
    select 1
    from public.projects p
    where p.id = old.project_id
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Only operations that remove an admin from the current Project can reduce
  -- the explicit Project Admin count.
  if old.role <> 'admin'
     or (
       tg_op = 'UPDATE'
       and new.project_id = old.project_id
       and new.role = 'admin'
     ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Serialize admin-removal decisions per Project. This prevents two concurrent
  -- transactions from each observing another admin and jointly leaving zero.
  perform 1
  from public.projects p
  where p.id = old.project_id
  for update;

  select count(*)
    into v_admin_count
  from public.project_members pm
  where pm.project_id = old.project_id
    and pm.role = 'admin';

  if v_admin_count <= 1 then
    raise exception 'A project must retain at least one Project Admin'
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app_private.protect_last_project_admin() from public, anon, authenticated;

drop trigger if exists project_members_protect_last_admin on public.project_members;
create trigger project_members_protect_last_admin
before delete or update of role, project_id
on public.project_members
for each row
execute function app_private.protect_last_project_admin();