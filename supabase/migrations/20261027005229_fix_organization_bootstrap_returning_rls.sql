create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.organizations (id, name, slug, created_by)
  values (v_id, p_name, p_slug, auth.uid());

  insert into public.organization_members (organization_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  return v_id;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;