# Immutable document releases — Issue #20

Source-only implementation. Migration `20261030001220_immutable_document_releases.sql`
is **unapplied**. No live Supabase, Replit, deployment, domain or DNS action.

## Authority and transaction

Only an explicit current `project_members.role = admin` may publish. Organization
or workspace administration and Author/Reviewer/Viewer do not confer publication.
One authenticated call, with no discovery or alternate write path:

```text
publish_document_release(
  p_project_id uuid,
  p_document_id uuid,
  p_review_id uuid,
  p_expected_updated_at timestamptz,
  p_request_key uuid
) -> uuid
```

The public invoker delegates to a private postgres-owned definer, required because
authenticated users have no release writes or lifecycle writes. Both revoke
PUBLIC/anon execution. The implementation fixes an empty search_path and checks
identity, exact scope and explicit membership. Helpers have no authenticated grant.
Membership SHARE then document UPDATE locking matches Review lock order. It checks
Approved status, expected document time and the latest immutable Approved review,
validates only that row's frozen outline/bodies/dependency closure, allocates
`max(sequence)+1`, inserts evidence and changes document/topics to Published in the
same transaction. Exceptions roll everything back; no partial release is visible.

A committed `(project_id,request_key)` is bound to document/review/publisher. A
matching retry returns its original release even after later Draft/approval cycles;
a mismatched reuse conflicts. Unique document/review prevents republishing one
approval; unique document/sequence protects allocation. Competing different keys
for one approval yield one release and one stale/conflict outcome, not two releases.
Concurrent Start new Draft shares the document lock. Published documents can start
a new Draft through the existing checked transition with the same expected-time
and latest-review guards; restoring bodies advances revisions and retains recovery
and all evidence. No historical migration is edited.

## Stored release and retention

`document_releases` stores server UUID, project/document/review IDs, positive per-
document sequence, fixed Published state, package/resolver/renderer versions 1,
`spextar-json-v1`, complete frozen_source, SHA-256 package_digest/manifest_digest,
auth.uid publisher, server timestamp, request UUID and audit JSON. Audit binds
publish action, review identity/sequence, approval actor/time, package digest and
canonical publication time. Source identities/root metadata/node IDs remain intact.

SELECT is authenticated and governed by current project read access, including
frozen shared dependencies. No anon read, no authenticated INSERT/UPDATE/DELETE.
An immutable trigger also rejects privileged normal UPDATE/DELETE. Restrictive
project/document/review/publisher FKs retain history; parent deletion can be blocked.
This is retention protection, not a privacy/export/retraction policy or protection
against a database owner deliberately disabling constraints/triggers.

## Exact digest contracts

SHA-256 over UTF-8 canonical JSON. Canonical keys sort recursively by UTF-16 code
units, arrays retain order, strings retain Unicode without normalization and use
ECMAScript JSON escapes; booleans/null are JSON literals; numbers are safe integers
in base 10, with negative zero encoded as zero. No whitespace. Reject fractions,
unsafe/non-JSON values and nesting >=100. PostgreSQL JSONB Unicode restrictions
(no NUL or isolated surrogates) also apply. This is not jsonb::text hashing.

`package_digest = SHA256(canonical(frozen_source))`, where frozen_source is exactly:

```text
{ schemaVersion:1, rendererVersion:1, reviewId, projectId, documentId,
  submittedBy, submittedAt, approvedBy, approvedAt,
  document:<exact document_snapshot>, topics:<exact topics_snapshot>,
  dependencies:<exact dependency_package> }
```

Submission/approval timestamps in this envelope are explicit UTC strings with six
fractional digits. UUID/sequence/publication time are outside this package digest.
The independent manifest hash is SHA256(canonical({...})) over exactly:

```text
{ schemaVersion:1, releaseId, projectId, documentId, reviewId, sequence,
  packageDigest, publishedBy, publishedAt, requestKey, audit }
```

Here publishedAt is the canonical UTC string retained in audit.publishedAt, avoiding
session timezone and HTTP timestamp formatting dependence. The client verifies
both hashes before inspection, and checks publication time against the audit instant.
Neither digest is a signature or proof of authorization.

Pinned vectors include:

| JSON / canonical bytes | SHA-256 |
| --- | --- |
| `{}` | `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a` |
| `null` | `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b` |

Unit and disposable SQL vectors also compare independent Node SHA-256 with nested
arrays, signed safe-integer limits, escaping, combining Unicode and astral/BMP key
ordering. Canonical astral keys precede U+FFFF according to UTF-16, rather than
PostgreSQL UTF-8/codepoint order. `release_utf16_key` pins the server ordering.

## Pinned first-scope rendering

`renderReleaseV1` is a pure frozen-input resolver. It validates the Approved package,
orders the frozen parent graph, resolves frozen default text variables, includes
all neutrally tagged content and expands exact frozen reusable bodies. Empty
required values block publication; optional empty values render empty with one
human-readable warning per variable. Frozen reusable groups show names/revisions.
Source is never overwritten by the derived rendering. Repeated acyclic references
are allowed; ancestor cycles, ninth reusable level, missing definitions/bodies,
unsupported nodes/marks/versions, unsafe links and excessive traversal fail closed.
Limits mirror Review: 256 reusable IDs, 4096 body visits, 30000 nodes/body and
100000 node visits, 4096 topics, a 32 MiB release-source envelope limit and a
32 MiB conservative render-work budget. Render work counts UTF-8 canonical bytes
of every visited node subtree plus resolved variable values and frozen condition/
reusable labels, including repeated occurrences. This bounds expansion before
publication; the client enforces the same budget.

The separate lazy `ReleaseBodyV1` uses safe React elements and existing editor CSS,
without Tiptap normalization, raw HTML, remote fetching or Services catalog calls.
It retains marks, callouts, ordered-list settings, table spans/widths/alignment and
neutral labels. Unsupported release versions fail closed with retained source.
No portal, PDF/Word, condition evaluator, AI or global History is introduced.

## UI and verification boundary

Publish reuses ProjectScope/PageHeader, Button, Radix Dialog, ErrorState/ListSkeleton,
UserIdentity, BrandedText, semantic card/border/muted/focus tokens and editor styles.
Only the release list/inspector and frozen reusable grouping are new composition;
they provide immutable selection and provenance. No brand/font/vector/color changes.
Confirmation captures review identity/time and a request key. Pending prevents
repeat clicks; success announces Release number and moves focus to status. A stale
or blocked response requires refreshed eligibility. An uncertain result preserves
the request key and offers scoped re-query before an explicit same-key retry.
The key lives in the mounted screen; reload loses the pending request UI, but the
release list and server approval uniqueness still prevent duplicate publication.
Backend errors never fall back to demo. Demo reports publishing unavailable.

Executable checks: domain/service/migration contracts, four-profile controlled
browser scenarios and optional `supabase/tests/document-releases.mjs` with PGlite
0.5.13 (`PGLITE_MODULE_PATH` selects an already-installed module). It uses synthetic
Auth and memory only; accepted SQL is compiled without changing its source bytes.
The unused pgcrypto extension install is omitted only from in-memory input because
UUID generation is built in. Queued competing requests are **not** multi-session
race evidence. Native PostgreSQL/Docker was unavailable in this session. No live
Supabase Auth/RLS/parity, production rollout or external UAT is certified.

Actual executed counts, failures, builds and hosted results belong in
[PROJECT_STATE.md](../../docs/PROJECT_STATE.md).
