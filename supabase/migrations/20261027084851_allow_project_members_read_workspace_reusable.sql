drop policy reusable_contents_select_member on public.reusable_contents;
create policy reusable_contents_select_member
on public.reusable_contents for select to authenticated
using (
  (
    scope = 'workspace'
    and (
      app_private.is_workspace_member(workspace_id)
      or exists (
        select 1 from public.projects p
        where p.workspace_id = reusable_contents.workspace_id
          and app_private.is_project_member(p.id)
      )
    )
  )
  or (scope = 'project' and project_id is not null and app_private.is_project_member(project_id))
);

drop policy reusable_content_drafts_select_member on public.reusable_content_drafts;
create policy reusable_content_drafts_select_member
on public.reusable_content_drafts for select to authenticated
using (
  exists (
    select 1 from public.reusable_contents rc
    where rc.id = reusable_content_drafts.reusable_content_id
      and (
        (
          rc.scope = 'workspace'
          and (
            app_private.is_workspace_member(rc.workspace_id)
            or exists (
              select 1 from public.projects p
              where p.workspace_id = rc.workspace_id
                and app_private.is_project_member(p.id)
            )
          )
        )
        or (rc.scope = 'project' and rc.project_id is not null and app_private.is_project_member(rc.project_id))
      )
  )
);