# Frozen review dependency packages — Issue #19

Source implementation on accepted main `3529a9c`. Migration
`20261029184603_freeze_review_dependency_packages.sql` is forward-only and
**unapplied**. No live Supabase, Replit, deployment, DNS or domain action is part
of this work. Publishing/Release execution remains Issue #20.

## Single immutable publishing input

`document_reviews` is the package identity: its existing `id`, project/document,
sequence, submission and decision fields bind the unchanged `document_snapshot`,
`topics_snapshot` and new `dependency_package`. A future publisher must require
an Approved row with a validated version-1 dependency package. It must use only
that row for release content, never current authoring tables. Profile labels in
the Review audit header remain authorized display-only reads, not release content.

`dependency_package` has `schemaVersion: 1`, `resolverVersion: 1`,
`canonicalization: "spextar-json-v1"`, organization/workspace/project IDs,
`outputContext: {variableValues: "default", conditions: "neutral", outputId: null}`
and ID-ordered arrays `variables`, `categories`, `values`, `reusable`.

Variables retain identity/name/key/description, text value, required flag, output
overrides and source timestamps. Categories retain identity/name/key/description,
settings, unassigned behavior, match mode and timestamps; only referenced values
are retained with identity/category/name/key/order/timestamps. A reusable entry
contains `item` (authorized same-project or same-workspace-shared metadata,
including settings/version metadata if present) and `draft` (exact structured
body, positive revision, saved timestamp/user). Unavailable version fields are
not invented. Source-only audit fields not consumed by definition parsers are
excluded. No entire catalog, private credentials or unsaved browser data enters
the package. References/node IDs/root metadata remain structured and unflattened.

First-scope values are defaults, conditions are visible/neutral, and there is no
selected output or evaluator. Existing output overrides and category policy are
frozen for future deterministic interpretation, not activated as filtered output.

## Capture, concurrency and security

The accepted checked `submit_document_review` transition still locks the explicit
membership and document, rejects stale expected document timestamps, copies
persisted topics/bodies and inserts evidence in one transaction. A new private
BEFORE INSERT trigger computes the dependency package before that insert can
commit. Any capture error rolls back evidence and working lifecycle changes.
Existing working-write locks exclude concurrent topic/body writes.

The entire dependency traversal is a **single STABLE function invocation**; its
STABLE recursive walker uses the same statement MVCC snapshot for all catalog
reads. Concurrent catalog commits after that snapshot cannot appear midway
through capture, even under READ COMMITTED. This is snapshot consistency, not a
catalog-wide edit lock or an assertion that the submitter previously saw exactly
those dependency values. Reviewers inspect the captured values before approval.
Existing stale-document checks remain; no preview digest argument is added.

This uses PostgreSQL's documented [function snapshot behavior](https://www.postgresql.org/docs/current/xfunc-volatility.html), not client fetch timing.

No new SECURITY DEFINER function is added. Private helpers use invoker rights,
empty search paths, qualified application identifiers and no PUBLIC/anon/
authenticated EXECUTE. Only the existing postgres-owned checked transition can
insert evidence; capture also requires auth.uid(), matching submitter and explicit
Admin/Author membership. Variables/categories must belong to the exact project;
values must belong to the referenced category. Reusables must be project-owned
in that project/workspace, or shared with null project in the same workspace.
Another project's reusable is rejected even when the caller can read it. Nested
project references inside shared reusable bodies must satisfy the submitting
project boundary. No cross-tenant dependency is allowed.

The new column inherits parent-review SELECT RLS and immutable evidence guards.
Approval changes decision fields only. Start New Draft restores authored bodies,
never package data. Later resubmission inserts a new package from current saved
dependencies. Missing topic body remains explicit null revision/content; missing
reusable body fails submission.

## Traversal and supported domain

Walk persisted node `content` arrays only, collecting version-1 variable/reusable
references and supported block condition pairs. Do not interpret arbitrary root
metadata/settings as references. Deduplicate by definition UUID, but traverse
every reusable occurrence path to detect depth/cycles even after deduplication.
An acyclic reusable path can contain eight entries; the ninth and any ancestor
cycle fail. Repeated references/diamonds are allowed. Bounds: 256 distinct
reusables, 4,096 body visits, 30,000 nodes per body, 100,000 total visited nodes,
JSON nesting less than 100 and 16 MiB dependency JSONB text. Limits fail closed.

Server validation rejects unknown structures/versions/attributes, bad placements,
marks/links, invalid conditions, invalid table grids, missing/inaccessible
definitions, unsupported variables and noncanonical reference UUID strings.
The client validates frozen definitions, closure completeness/scope/order and
structured bodies again before displaying Review. Errors do not fall back to
mutable catalogs or demo. Existing authoring remains lossless/read-only for
unsupported content; new submission of unsupported content is rejected.

`spextar-json-v1` permits null, booleans, strings, safe integer numbers, arrays and
plain objects; rejects fractions, unsafe numbers/non-JSON values and excessive
depth rather than silently losing numeric precision. This restricts new review
capture, including opaque metadata/settings. Arrays retain original order.
Definition arrays sort by lowercase canonical UUID (database C collation).
Canonical encoding recursively sorts object keys by UTF-16 code units, emits
ECMAScript JSON string escapes and base-10 integer representation with no
whitespace, preserves Unicode without normalization, and encodes UTF-8. Negative
zero encodes as zero. This is not PostgreSQL `jsonb::text` or a claim of original
JSON whitespace identity. Unit vectors pin key order, nested arrays, Unicode and
numbers. No SHA-256 package/release digest is implemented here.

## Legacy evidence and UI

Existing rows retain NULL packages; no historical review is backfilled from
today's mutable catalogs. Legacy ordinary bodies remain inspectable; semantic
bodies show an explicit unavailable notice instead of current values. Legacy
evidence is not a deterministic publishing source and needs a new submission.
Review's frozen provider performs no current Variables/Conditions/Reusable reads,
including linked-body queries; Author and demo previews keep their current
catalog behavior. The lazy viewer/editor boundaries remain intact.

Review reuses StructuredEditor, ReferenceBody, VariableValue, ConditionLabels,
BrandedText and existing muted/destructive/border tokens. The linked preview
identifies its submitted revision. No new layout/design system/assets/fonts or
branding geometry is introduced. Existing focus, decisions, loading/error/missing
body, read-only controls and neutral tag display remain.

## Verification and limits

Unit/source-contract tests run in the normal suite. The optional executable
`supabase/tests/review-dependency-packages.mjs` uses installed PGlite 0.5.13 in
memory only: `PGLITE_MODULE_PATH` can point to its `dist/index.js`. It creates a
synthetic auth schema/identities, compiles source migrations and exercises real
PostgreSQL functions, RLS, grants, failure rollback, closure and lifecycle.
PGlite's built-in UUID generator replaces the unused pgcrypto extension install
in the in-memory input only; historical source bytes are untouched. No new
application/package dependency is required. It is not Supabase Auth, live RLS,
multi-session race execution, full migration replay certification or UAT.

Executed validation and hosted CI results belong in `docs/PROJECT_STATE.md`.
Actual concurrent-session races, real Supabase policies/roles/environment and
product-owner acceptance remain external gates. No release or deployment is
authorized by passing these checks.
