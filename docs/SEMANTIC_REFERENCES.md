# Semantic references (Issue #4)

This feature is implemented on `codex/feature-semantic-references`, independently of live deployment. There is **no new table, RPC, grant or migration**: Topic drafts already persist structured JSON and authorize only explicit Project Admin/Author writes. The recovered 21 migrations remain unchanged. Existing RLS is the final read/write authority. No live tenant-isolation or migration replay was performed for this feature.

## Owned version-1 JSON

The existing SPEXTAR Topic root remains `{ "type": "doc", "version": 1, "content": [...] }`. Unrecognized root metadata survives ordinary edits. New nodes have `attrs.id` (Topic-local durable identity), `attrs.refVersion: 1`, and `attrs.targetId` (stable definition UUID, *never* a display label):

- `variableReference` is an inline atom inside supported text blocks.
- `reusableReference` is a selectable block atom that links the current saved reusable draft. Topic JSON never contains the linked body's copied/resolved text.
- Supported paragraph, heading, callout, quote, list-item and table-cell nodes may have `attrs.conditions: [{version:1, categoryId, valueIds:[...]}]`. Untagged blocks follow the existing Include default; values within a category are OR, categories are AND. This records assignments, not a publishing/output-filtering engine. Removing the last value removes the assignment.

The model and serializer live in `src/domain/semantic-references.ts` and `src/domain/structured-content.ts`; Tiptap is only the editing engine. Unsupported node types, attributes, versions or malformed assignments keep the **entire original draft read-only**, never silently normalized back to plain text. A clipboard carrying semantic markers is rejected instead of silently flattening its references. Recovery, expected-revision saves, role gates and document/topic duplication remain the established F3 mechanisms. No migration is required for nested JSON (the live constraints check the root shape).

## Preview and usage

The editor and read-only Review viewer resolve Text variables using the existing Web Help/default rule. Linked reusable content displays the **current accessible saved draft** and its revision; cycles, unsupported bodies, missing definitions and inaccessible drafts display explicit non-destructive states. Changes to reusable content affect the preview on reload/refetch, not the saved Topic JSON; update-policy metadata does not imply notifications, propagation, snapshots or publishing. Condition labels/values are inspectable but no output filtering is performed.

Where-used requests explicitly scan saved Topic drafts through the existing scoped Services boundary (or opened session-only demo drafts). For linked content, nested references are followed with cycle/depth protection. A malformed, inaccessible or cyclical saved body fails the *whole* scan instead of returning a false zero. Results show readable project/document/topic locations and draft revisions for **accessible projects only**, and are point-in-time read-through results, not an atomic workspace-wide index or a permission to delete. Project-scoped definitions inspect only their project; workspace-shared reusable definitions inspect projects the signed-in user can access in that workspace. The app still exposes **no permanent deletion of these definitions**. Authenticated definition tables have no DELETE grant in the recovered migrations; this feature neither adds one nor changes an RLS policy.

The reference catalog reuses existing variable, condition and reusable read adapters. It never falls back from backend to demo data and rejects foreign or malformed rows. Demo drafts and query results are held only by the existing identity-scoped in-memory QueryClient, not browser storage. Reference affordances are Author-only for existing explicit Project Admin/Author content-edit roles; Viewer/Reviewer and Review remain read-only. Root route and editor/viewer lazy boundaries remain intact.

**Not implemented:** automatic propagation, persisted cross-reference graph/index, global delete certification, document-to-document references, conditional output filtering, comments/approval/releases, publishing and AI.
