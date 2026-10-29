drop policy if exists projects_select_workspace_member on public.projects;

create policy projects_select_workspace_or_project_member
on public.projects
for select
to authenticated
using (
  app_private.is_workspace_member(workspace_id)
  or app_private.is_project_member(id)
);