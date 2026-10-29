# Semantic references (Issue #4)

SPEXTAR owns this JSON contract. Tiptap remains the editing engine. Topic bodies
stay in `topic_drafts.content`; linked reusable drafts stay in
`reusable_content_drafts.content`. No new table, RPC, migration, permission or
service is required. The 21 recovered migrations are unchanged and were not run.

## Version 1 contract

- Inline `variableReference`: `attrs: {id, referenceVersion: 1, variableId}`.
- Block leaf `reusableReference`: `attrs: {id, referenceVersion: 1, reusableId}`.
- Supported blocks carry `attrs.conditions: {version: 1, values:
  [{categoryId, valueId}]}`. Null/absent means unassigned. Values are unique pairs.
  Paragraphs, headings, lists/items, blockquotes, code blocks, rules, tables,
  callouts and reusable references support assignments. Cells/rows do not.

IDs identify definitions, independent of their names, keys or slugs. Node IDs
remain content-scoped; duplication may copy a body into another content scope.
Legacy version-1 and unversioned bodies remain supported. Root metadata survives
editor serialization. Unknown versions/nodes, malformed attributes and unsafe
links remain read-only, with the original JSON preserved. Unsupported semantic
JSON is represented by an explanatory notice instead of showing internal IDs.
HTML paste cannot import reference identities or conditional assignments; the
existing explicit text-only fallback remains available.

## Author and previews

Author uses the existing Button/Dialog controls and editor styling/tokens. Pickers
keep the selection and document snapshot from opening; they reject a changed body
or lost editing authority. Variables require an inline position outside code.
Conditions apply/remove on the current supported block. Reusable insertion makes
a linked atom, without copying the draft into the topic body. Saves retain the
existing debounce, expected revision, conflict and identity-scoped recovery path.
Reviewer/Viewer and Review remain read-only. Demo topic edits remain local to the
mounted Author session and are explicitly excluded from saved usage counts.

Variables resolve their default value in Author/Review because neither surface
has an active publishing-output context. The resolver also supports the existing
explicit output IDs and non-empty override/default fallback. Conditions display
category/value labels and remain visible; list-container badges sit outside
`ul`/`ol` so only list items are direct children and ordered `start`/`type` are
retained. No publishing-target filtering is
invented. Linked reusable previews fetch the current saved accessible draft when
opened/refreshed, including recursive links, capped at eight levels with cycle
protection. Missing, inaccessible, unsupported or failed references are visible;
no unrelated definition, demo data or copied text substitutes for a missing link.
Renaming a definition preserves its ID and therefore its references.

Reusable `notify`/`manual`/`auto` metadata remains future policy intent. Current
linked previews read the saved draft for all three policies. This is a neutral
preview, not notification, retained-version/snapshot propagation, publishing or a
rewrite of authored topic bodies. Editing a reusable draft invalidates linked
preview queries. Reusable management continues to edit ordinary structured
content; this issue exposes new reference insertion in topic Author only.

## Where used and delete safety

`services/semantic-references.ts` composes existing `Services` reads. It scans saved
topic and reusable bodies and collects direct version-1 references, independently
of presentation labels. Variable/category/value/project-reusable scans are scoped
to the project. Workspace-shared reusable scans enumerate every accessible project
in that workspace, deduplicating workspace library drafts. Project enumeration,
document/topic enumeration and reusable lists use stable paginated backend reads.
No partial count is returned when a read fails, a saved body contains unsupported semantic references, or the identity/organization changes.

Management rails show occurrences and human-readable project/document/topic or
reusable locations, with refresh/retry. Conditional values have expandable usage
panels, in addition to category usage. Counts describe saved direct occurrences,
not unique topics, transitive expansion, unsaved edits, a transaction-wide database
snapshot, or inaccessible projects. The UI labels that scope; it never claims an
accessible count proves globally unused. Demo counts include saved session
reusable drafts only. Refreshed scans see saved changes; concurrent edits can
change results after the scan.

Definition deletion remains unavailable for all Variables, Conditional
categories/values and Reusable Content, including unreferenced definitions. The
Services contracts expose no delete operation. The recovered foundation SQL
revokes all privileges before granting SELECT/INSERT/UPDATE, and contains no
DELETE grant/policy for these four definition tables. This conservative existing
database boundary protects referenced definitions without a client-only preflight,
a partial-visibility delete decision or a race-prone replacement workflow. No
reference cascade deletion or replacement path is added. Existing confirmed
whole-tenant/document/topic deletion rules remain separate and unchanged.
A future definition-delete/replacement workflow needs an authoritative,
transactional server guard covering all uses before it can be enabled.

No live Supabase state or deployment was read or changed for this implementation.
Offline source/contract tests and controlled intercepted browser tests are not
live RLS, migration replay, manual UAT or release acceptance.
