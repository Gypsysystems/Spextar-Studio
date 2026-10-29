# Review and approval foundation — Issue #9

Source implementation only. No migration has been applied, no historical SQL
replayed, and no live Supabase/Auth/RLS/data, Replit, deployment or infrastructure
changes were made for this task. Product-owner acceptance remains external.

## Workflow and storage

Admin/Author submits a persisted Draft document. One transaction copies document
metadata and the complete topic graph into `document_reviews`: topic identity,
parent/order, title/slug/settings, nullable saved revision and structured JSONB.
Missing bodies remain explicit null/null pairs. Stable node IDs, variables,
conditions, linked reusable references and opaque future JSON are copied without
resolution or flattening. JSONB semantic fidelity, rather than object-key ordering,
is the storage contract. Topic IDs remain scoped to their original document.

Submission changes document/topics to `in_review`. Author content, metadata and
tree controls become read-only. Reviewer/Admin may Approve (optional note) or
Request changes (nonblank note). Author/Viewer cannot decide. Changes requested
returns working content to Draft; approval keeps Author locked. Admin/Author can
explicitly start a new Draft from the latest Approved snapshot. That operation
restores snapshot metadata/structure/bodies, preserves topic identities and uses
existing draft triggers to advance revisions. It never resets existing revisions
or alters review evidence. Unexpected privileged outline drift fails closed;
there is no destructive reconciliation of extra/missing topics.

Review reads only the latest immutable submission for the selected document,
including completed reviews while a new Draft is being edited. The submitted
outline/title/body/revision come from evidence, never mutable `topic_drafts`.
Existing lazy read-only semantic rendering may resolve current readable labels
and reusable previews. Those displayed resolutions can change as definitions
change; the stored references and submitted JSON remain immutable. No output
freeze, publishing, History browser, assignment, quorum, comments or notifications
are implied. Demo remains sample-only, with no simulated backend completion.

## Service and database boundary

`Services.reviews` is backend-only. `latest` reads scoped evidence; each action
makes exactly one authenticated RPC, with no discovery, aliases, direct-write
fallback, automatic retry or demo fallback:

| Operation | Parameters |
| --- | --- |
| `submit_document_review` | `p_project_id`, `p_document_id`, `p_expected_updated_at` |
| `approve_document_review` | `p_project_id`, `p_document_id`, `p_review_id`, `p_note` |
| `request_document_changes` | `p_project_id`, `p_document_id`, `p_review_id`, `p_note` |
| `start_document_draft` | `p_project_id`, `p_document_id`, `p_review_id`, `p_expected_updated_at` |

All return the review UUID. Invalid/unconfirmed responses fail closed; stale
transitions require refresh. Client errors show human-readable messages.

Migration `20261029140601_review_lifecycle_foundation.sql` follows the 21 recovered
originals. It adds one RLS-protected evidence table with authenticated SELECT
only, a unique active-review index, immutable-snapshot/completed-decision trigger,
working-content lock triggers, one private transition implementation, and four
public invoker wrappers. No historical SQL is edited. `.gitattributes` prevents
checkout line-ending conversion of SQL; historical bytes match the manifest.

The private implementation needs SECURITY DEFINER because reviewers have no
working-content write privileges and authors must never directly write evidence.
It has an empty search path, explicit postgres ownership, auth identity checks,
project/document scope checks, explicit project membership/role checks and narrow
authenticated EXECUTE. No organization/workspace administration elevates roles.
Membership is share-locked against concurrent role removal; the document row is
update-locked for the transaction. Working topic/body writes lock that same row.
Status changes and content writes outside Draft are rejected by invoker triggers
for ordinary callers. Privileged transition code runs as postgres; the migration
requires that owner. This is not a browser-settable bypass flag.

One-active-review and expected state/review/time checks reject duplicate/stale
transitions. Concurrent direct content/tree writes either serialize or fail/roll
back (including possible database deadlock victim rejection); the client never
silently retries a transition. Snapshot creation, outcomes and document/topic
status changes share the transaction. Evidence FKs use RESTRICT, so parent
deletion with review evidence can be rejected instead of erasing approvals.

## Save and recovery safeguards

Author confirmation checks all retained controllers for this document, including
pending/error/conflict/loading and offered recovery states, plus metadata saves.
Unsaved browser copies are never sent to the submission RPC. The server expected
timestamp rejects persisted changes since the confirmation's document read.
Ordinary revision conflicts and identity-scoped recovery remain the draft path.
The new Draft advances existing revisions, so pre-approval clients cannot blindly
overwrite it using old revisions. No recovery copy is promoted into evidence.

UI reuses Button, Dialog, Textarea, state components, existing Author/Review shells,
semantic background/border/accent/focus tokens, local Inter and approved branding.
Native labeled selects navigate Review; Radix dialogs provide focus trapping,
Escape/cancel and return focus. There is no new design system or Figma fidelity
claim. Controlled desktop/mobile light/dark checks are distinct from manual UAT.

## Remaining validation

Unit/service/source-contract tests and intercepted browser tests do not certify
Postgres execution, live RLS/Auth, actual multi-session lock scheduling, migration
parity or deployment. Migration application/replay is deliberately unrun and
requires separate authorization. Before release, validate the new source migration
in an authorized disposable database, then perform explicit multi-account tenant,
role, direct-write, race/rollback and recovery checks. Backend-candidate readiness,
live security review, product UAT, merge and deployment remain separate gates.
Exact command results for this engineering run are recorded in PROJECT_STATE.md.
