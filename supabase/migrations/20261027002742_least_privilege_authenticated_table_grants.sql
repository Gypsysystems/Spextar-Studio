revoke all on table public.profiles from authenticated;
grant select, update on table public.profiles to authenticated;

revoke all on table public.organizations from authenticated;
grant select, insert, update, delete on table public.organizations to authenticated;

revoke all on table public.organization_members from authenticated;
grant select, insert, update, delete on table public.organization_members to authenticated;

revoke all on table public.workspaces from authenticated;
grant select, insert, update, delete on table public.workspaces to authenticated;

revoke all on table public.workspace_members from authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;

revoke all on table public.projects from authenticated;
grant select, insert, update, delete on table public.projects to authenticated;

revoke all on table public.project_members from authenticated;
grant select, insert, update, delete on table public.project_members to authenticated;