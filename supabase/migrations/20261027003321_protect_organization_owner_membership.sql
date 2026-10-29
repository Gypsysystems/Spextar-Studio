drop policy if exists organization_members_insert_admin_or_bootstrap on public.organization_members;
create policy organization_members_insert_admin_or_bootstrap
on public.organization_members
for insert
to authenticated
with check (
  (
    user_id = (select auth.uid())
    and role = 'owner'
    and app_private.is_organization_creator(organization_id)
  )
  or (
    app_private.is_org_admin(organization_id)
    and role in ('admin','member')
  )
);

drop policy if exists organization_members_update_admin on public.organization_members;
create policy organization_members_update_admin
on public.organization_members
for update
to authenticated
using (
  app_private.is_org_admin(organization_id)
  and role <> 'owner'
)
with check (
  app_private.is_org_admin(organization_id)
  and role in ('admin','member')
);

drop policy if exists organization_members_delete_admin on public.organization_members;
create policy organization_members_delete_admin
on public.organization_members
for delete
to authenticated
using (
  app_private.is_org_admin(organization_id)
  and role <> 'owner'
);