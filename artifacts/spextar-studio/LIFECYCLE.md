# Organization, workspace and project lifecycle

Backend mode exposes organization management from Workspaces, workspace management
from workspace cards and the Projects header, and project deletion exclusively in
the existing Project Settings page. Demo mode has no destructive lifecycle adapter.
Existing atomic creation RPCs are unchanged.

## Authority and supported fields

- Organization owner/admin: edit name and slug. Only the owner may delete.
  Organizations have no archive state.
- Workspace admin, including the existing inherited organization-admin authority:
  edit name/description, archive and restore. The lifecycle client reads
  `workspaces.status` as `active | archived`; absent/malformed state fails closed.
- Explicit project admin only: existing Project Settings handles name, slug,
  description, archive and restore. Project deletion does not grant authors or
  inherited workspace admins project administration.
- IDs, creation/audit fields and memberships are never written by these flows.

Every action refreshes authenticated identity, organization membership, applicable
workspace/project membership and the scoped entity. Writes include the ID, parent
scope where applicable, expected `updated_at`, and expected child status. Zero
returned rows is a conflict, never success. Database RLS remains authoritative
if permissions change between the preflight and the write.

## Permanent deletion

Workspaces/projects must first be archived. All deletes require the exact current
name plus a separate acknowledgement of irreversible data loss. Cancellation,
failed preflight, stale details or failed requests do not trigger child cleanup.

Only one scoped parent-row DELETE is sent. Existing database relationships and
triggers decide dependent deletion or rejection; the browser never loops through
documents, drafts, reusable content or memberships to work around a constraint.
Warnings explicitly include related content, including content not currently
visible. Organization owner-membership protection is never disabled or bypassed.

Deletion is blocked while this browser has unresolved unsaved draft controllers,
so deleting a container cannot silently discard unrelated authoring work.
After confirmed deletion, obsolete query data is removed and affected draft
controllers stop without flushing deleted bodies. Existing browser recovery
copies are not destroyed indiscriminately: unrelated work must not be lost.
Removed resources cannot be restored through their old routes. Organization
selection is refreshed; workspace deletion returns to Workspaces; project deletion
returns to its workspace's Projects list.

## Validation boundary

Regression tests use isolated synthetic identities and intercepted responses;
they are not live RLS, cascade, trigger or concurrency certification. No live
users/data are created or deleted for these tests. No migrations, grants, RLS or
Auth settings are changed. The authoritative applied migration SQL is still not
available in this repo; live role/cascade acceptance must use an approved disposable
environment before destructive actions are certified for production.

The readiness contract records the expected workspace status column and
parent-delete behavior rather than reconstructing or applying database SQL.
