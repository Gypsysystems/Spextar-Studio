revoke execute on function public.create_organization(text, text) from public, anon;
revoke execute on function public.create_workspace(uuid, text, text, text) from public, anon;
revoke execute on function public.create_project(uuid, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.create_workspace(uuid, text, text, text) to authenticated;
grant execute on function public.create_project(uuid, text, text, text) to authenticated;