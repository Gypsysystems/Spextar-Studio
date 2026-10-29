# Publishing & Releases: design and readiness

Status: proposed specification for product-owner review, 2026-10-29. No implementation authorization is implied. Companion: [future implementation issue](PUBLISHING_RELEASES_ISSUE_DRAFT.md).

## 1. Evidence, scope and readiness

Analysis baseline: GitHub main `70ffe3be130164e8d5ac42fa9adc17355ca538e3`, independently verified on 2026-10-29. Only committed baseline source was used. The shared working checkout contains another stream's uncommitted Issue #9 work; none of it is a design authority or part of this branch. This branch is documentation only and independent of the Review and CI branches.

Read [AGENTS.md](../AGENTS.md) and [current engineering state](PROJECT_STATE.md) first. The following paths are repository-relative evidence, not proposed functionality:

| Evidence | Finding at baseline |
| --- | --- |
| `artifacts/spextar-studio/src/App.tsx`, `src/features/project/sections.ts`, `src/pages/section-placeholder.tsx` | Project-scoped Publish lists approved documents with disabled actions. History, Style guide and Brand outputs remain placeholders. Planned PDF/portal/rollback labels are not implemented contracts. |
| `artifacts/spextar-studio/src/domain/types.ts`, `src/services/contracts.ts` | Documents own topics; four document statuses exist, but no release service/entity or immutable review contract exists. Document metadata currently accepts status updates; status alone cannot prove approval. |
| `artifacts/spextar-studio/src/pages/review.tsx`, `src/services/supabase-topic-drafts.ts` | Review reads current saved drafts; draft revision CAS does not establish an approved immutable snapshot. |
| [Semantic reference contract](../artifacts/spextar-studio/SEMANTIC_REFERENCES.md), `src/domain/structured-content.ts`, `src/features/editor/semantic-reference-preview.tsx` | Versioned semantic references, lossless unsupported-content preservation, neutral condition display, current accessible reusable resolution, depth/cycle limits. This is not deterministic historical publishing. |
| `artifacts/spextar-studio/src/domain/project-variables.ts`, `src/domain/project-conditions.ts` | Text variables have default/output overrides; existing output IDs are `web-help`, `pdf-manual`, `word-review`. Conditions have unassigned behavior and any/all metadata, without an implemented publishing evaluator. |
| [Application contract](../supabase/readiness/application-contract.json), [source review](../supabase/readiness/source-review.json) | Fifteen consumed tables; no release or approval RPC contract. Some older limitation prose is stale relative to semantic-reference source. Do not treat it as schema SQL or regenerate digests for this spike. |
| [Migration provenance](../supabase/migrations/README.md), [lifecycle](../artifacts/spextar-studio/LIFECYCLE.md) | Twenty-one recovered original migrations, with replay/live parity still separate. Historical lifecycle prose saying SQL is unavailable is superseded by recovery evidence. Existing parent deletion requires impact analysis before adding release FKs. |

Paths prefixed `src/` inside the evidence table belong to `artifacts/spextar-studio/`. Source review does not certify live RLS, current deployment, database replay or UAT. Style checks, templates, targets and external delivery must not become implicit release dependencies simply because navigation mentions them.

Required lifecycle: **Draft → In Review → Approved → Published**, with **Changes Requested → Draft**. Editing approved content creates a new Draft. Publishing creates a Release. No direct Draft-to-Published transition, mutable-source shortcut or approval inferred from a label is acceptable.

Issue #9 is a prerequisite for implementation, not a source dependency of this spike. Its final accepted snapshot schema, membership authority, lifecycle generation and fork mechanism are unknown here. All references below to an approved snapshot, approval token or lifecycle generation are required interfaces to reconcile after #9 lands, not claims about its unmerged code.

## 2. Publishing unit and release identity

Proposed first publishing unit: **one complete document within one project**, including its ordered topic tree and dependency closure. This follows the existing document workflow and approved-document Publish list. The project is the permission/navigation boundary and aggregates release history; it is not an atomic all-documents publishing unit. No topic-only publishing, partial approved-topic mix, project baseline or cross-project release is proposed. Workspace-shared reusable content may be captured only through existing authorized same-workspace references; this does not publish another project's documents.

A release has a server-created UUID identity and a monotonic positive integer sequence scoped to its document. Display `Release 1`, `Release 2`, etc.; do not invent semantic-version meaning or derive identity from mutable title, slug, document `version` text or timestamps. Unique `(document_id, sequence)` prevents collisions; never reuse an allocated committed sequence. Suggested optional human labels are deferred until approved. Copies/duplicates of a document start their own identity/sequence and do not inherit release provenance.

Prior releases and their source bytes never change. A successful later publish inserts a new release, even when approved content happens to match an earlier content hash after a new approval cycle. A release begins and remains `published` in the first scope. In-progress is request/UI state, not a visible partially constructed release. Retraction, supersession flags, rollback and deletion are separate future product policies, not UPDATE paths to immutable content.

## 3. Approval-to-release invariant

The release source must equal the selected **server-verified approved snapshot package**, not the current document/topic draft rows. The approved package must freeze:

1. Document identity, title/metadata and complete ordered topic outline.
2. Every topic's structured JSON, root metadata, stable content-scoped node IDs and source revision provenance, including an explicit empty body if valid. A missing/unreadable draft cannot silently become empty.
3. Transitive referenced variable definitions, conditional categories/values, reusable metadata and exact reusable body revisions, including nested references.
4. Approved output policy/context, resolver/manifest format versions and the dependency/content digest.
5. Review submission identity, approval decision identity, approver/time and lifecycle generation bound to that exact package digest.

Prefer capturing the package at submission so reviewers inspect precisely what they approve. If #9 freezes only topic bodies, publishing must remain blocked until a separately reviewed extension freezes dependencies and binds them to approval; never silently fetch today's values at publish time. Capture must be a consistent database snapshot, not independent browser reads. Existing metadata timestamps and draft revisions alone do not cover every variable/condition write. A server transaction can read a consistent MVCC snapshot and bind its complete captured package hash to submission. If submission must assert equality with an already displayed preview, compare its expected package digest and reject mismatch rather than approving unseen dependency edits.

After capture, current dependency edits do not change the package. To use new values or linked reusable content, create a new Draft, submit and approve again. Mutable reusable `notify`/`manual`/`auto` metadata never authorizes changing an approved package. Do not rely on current where-used scans, which are neither global nor transactionally consistent.

## 4. Immutable manifest and artifacts

Suggested logical fields below are design vocabulary, not existing table/column/RPC names. Store the canonical source package as authoritative immutable data, with normalized indexing only where useful.

| Component | Required fields and invariants |
| --- | --- |
| Release envelope | Manifest format version; release UUID; tenant/workspace/project/document scope; sequence; `published` status; database publisher ID/time; source snapshot ID/hash; approval decision ID; lifecycle generation; idempotency request identity. |
| Document and outline | Captured title, slug, summary/settings needed for rendering; ordered topics with topic ID, parent ID, explicit stable order, title/slug/kind and source body revision. Reject cycles, duplicate IDs, missing parents, cross-document parents or ambiguous ordering. |
| Bodies | Exact structured JSON values with root metadata and node IDs preserved. Node addresses are `(source content scope, node ID)`; identical IDs in separate reusable/topic bodies must not collide. No editor round-trip to normalize data. |
| Dependency catalog | Definition IDs and scope; frozen human names/keys; variables' default/required/output values; category/value metadata and assignments; reusable exact JSON/revision/hash and provenance. Only reachable dependencies; deduplicate catalog entries without losing occurrence locations. |
| Output context | Explicit neutral or selected supported output ID; condition policy/version and selected values if approved; locale/timezone only when used; renderer/resolver version; template/style identifiers only if an actual versioned implementation later exists. No live template pointer. |
| Integrity | Canonicalization version and algorithm; per-body and dependency hashes; approved package hash; release manifest hash; optional derived-output hash, media type and byte length. No secrets, session token, recovery state or private profile fields. |

Proposed canonical hashing: SHA-256 over UTF-8 canonical JSON, using a pinned implementation of RFC 8785-compatible canonicalization restricted to the validated JSON contract. Specify test vectors for key ordering, arrays, Unicode and numbers before implementation; reject values outside that contract rather than normalize them silently. Array/outline order is significant. Preserve original JSON values separately; a canonical hash is semantic byte identity under this scheme, not a claim to recover original database JSONB whitespace. Hash the approved package independently of release UUID/time/sequence. Hash the release envelope plus package digest with the manifest-hash field omitted to avoid self-reference. Hash output bytes separately. Hashes detect drift; they are not signatures or proof of authorization.

## 5. Semantic source and deterministic rendering

Retain SPEXTAR semantic references in immutable release source **and freeze their entire authorized dependency catalog**. Derive resolved render content as a pure, versioned function of that package and approved context. Resolved materialization may be cached or stored as a derived artifact with its own digest, but never replaces source or reads current Services catalogs. Historical inspection uses release-scoped data exclusively. An unavailable renderer version must show an explicit read-only unsupported state; never reinterpret the release silently with a newer policy.

Proposed first scope is an authenticated internal read-only release inspector with neutral conditions and default variables. This is a recommendation requiring product confirmation (D2 below); it does not promise an HTML portal, PDF/Word download or external publication. A release is a durable approved baseline, not evidence of deployed content. If other contexts are chosen, review must approve each context; changing context after approval requires new review. No auto-fallback from an unknown output ID to a different target.

| Content case | Required publish/render treatment |
| --- | --- |
| Text variable | Resolve frozen nonempty override for the approved known output ID, otherwise frozen default, matching current fallback. Neutral context uses default. Missing definition blocks publish. A referenced required value resolving empty blocks; optional empty renders empty with a review-visible warning. Validate referenced dependencies even inside neutral tagged blocks. |
| Conditions | Preserve all assignments and frozen definitions. Neutral mode includes content and presents readable tags consistently with current previews; it must say it is neutral. No silent audience filtering. |
| Future filtered mode | Requires explicit product choice. Suggested evaluator: group assignments by category; any/all controls matching within a category, AND across categories; unassigned behavior applies to blocks with no assignment for a configured category; ancestor exclusion suppresses descendants. Exact empty-selection and nesting examples must be approved and versioned before enabling this mode. Current metadata alone does not establish those semantics. |
| Linked reusable | Expand only frozen captured body, with content-scope addresses and occurrence paths. Repeated references are valid. Cycles, excessive depth (retain current eight-level maximum as initial bound), inaccessible or absent definitions/bodies block publish with a human location. No copied text/demo/live fallback. |
| Unsupported/future nodes, marks, root/reference versions | Preserve original source for read-only inspection; block a new release if the pinned renderer cannot faithfully represent it. No dropping nodes, text-only fallback, or warning-only publish of incomplete content. Existing historical releases remain intact. |
| Malformed/unsafe content | Block server validation, including unsafe links, invalid tables, reference attributes, broken outline, oversize or excessive expansion. Do not execute embedded HTML or fetch external URLs while resolving. |

Maintain valid list/table DOM, ordered-list start/type, callouts and safe links. Excluded containers in a later filtered mode must not leave invalid empty list/table structures; test the agreed transformation. Server validation is authoritative; the browser may provide faster diagnostics. TypeScript validation alone cannot protect an authenticated RPC from arbitrary clients. If equivalent bounded validation cannot be implemented safely within Postgres, revisit architecture with the product owner before introducing another runtime; do not ship client-only validation.

Determinism means same frozen package/context and renderer version produce the same logical output and canonical render hash. It does not imply byte-identical PDF across unspecified engines/fonts or local date formatting. Never bake local clock, random IDs, current profile names, locale defaults or network content into derived output. Capture any required locale explicitly. Render known profile display names using authorized identity lookups outside the content digest, with `Unknown user` fallback; provenance actor IDs and server timestamps stay immutable.

## 6. Permissions and transactional publication

No source at baseline defines a publisher role. **Recommendation pending D1: explicit Project Admin publishes; Author does not publish solely because they can edit.** Reviewer and Viewer remain read-only for publishing. Organization/workspace administration alone grants no publishing authority. Approval authority and any separation-of-duty rule must match accepted #9/product decisions, never be inferred here. Release reads follow existing authorized project-read access with current tenant checks, not public URLs; do not broaden project access or expose another workspace's library through forged IDs.

Eligibility requires active accessible scope, approved snapshot with valid approval, exact current lifecycle token, complete supported dependency package, approved output context, approved publisher role and no release already committed for that snapshot/context. Metadata `status='approved'` by itself is insufficient. Legacy status-only approved documents require the real review workflow, not a synthesized approval/backfill. Client UI eligibility is advisory.

Proposed one authenticated publish RPC transaction (working name `publish_document_release`; final name/parameters must be reviewed with migration and bound exactly):

1. Accept scoped document ID, approved snapshot ID, expected approval/generation token, expected package/context digest and UUID request key. Never accept arbitrary bodies, publisher/time, release sequence or trusted role from the browser.
2. Resolve `auth.uid()` and authoritative tenant chain; check current membership, explicit publisher role, active scope and snapshot ownership. Lock membership/ancestor rows as necessary so role revocation/archive and publish have a defined serial order. Use the same deterministic lock order as lifecycle writers to avoid deadlocks.
3. Lock the document/lifecycle row. Revalidate its approved snapshot, generation, decision and digest, and require the approved state. New-Draft, approval revocation/replacement and publish must share this lock/CAS discipline; a client timestamp preflight cannot serialize them.
4. Validate immutable package/context completeness, limits and hashes on the server. Do not resolve live drafts. Allocate the next document sequence under this lock, insert release and complete package/index rows, audit event and idempotency binding, then atomically transition the relevant approved generation to Published and set its latest-release pointer.
5. Commit once and return validated release identity/sequence and source linkage. Any failure rolls everything back: no partial release, orphan artifact, sequence collision, status-only publish or success toast after zero rows.

Use unique `(document_id, approved_snapshot_id, context_digest)` to prevent a second release of the same approved source/context even with another request key, plus unique scoped request key and document sequence. First scope has one approved context. Same key and same input returns the original result after fresh authorization; same key/different input is conflict. The already-committed same request may be read after lifecycle advances, but cannot mutate it. Distinct repeat request for already published source reports already published with authorized navigation. Idempotency records live as long as the release, not a short cache. Revoked callers cannot use a key as a capability to read release data.

After a timeout, perform an authorized request-result lookup; do not blindly replay a write or create a new request key. User-initiated reconciliation/retry uses the original key after the result is known. Disable TanStack automatic mutation retries. Concurrent new Draft versus publish has one winner: if Draft wins, publish fails stale; if publish wins, a later permitted Draft starts from the published approved source. Concurrent publishers produce exactly one release; losing clients navigate to the committed release after authorized reload.

## 7. New Draft and repeated cycles

Approved and Published source generations are read-only. A separately authorized new-Draft operation clones the accepted immutable source into a new editable generation and keeps approvals/releases unchanged. It must not share mutable JSON storage or reuse approval identity. How dependency refresh is presented during this clone belongs to #9 integration; any refreshed dependencies must be included in the next review package.

Draft edits → submission → approval → publish creates the next document release. Changes Requested returns to Draft and cannot publish. Creating Draft after Approved invalidates eligibility for the old generation by the shared lifecycle token, while historical approval evidence remains readable. The current document can show Draft while history still contains Published releases; never make a historical release appear Draft or imply that a draft is the last released content. Do not claim #9 already supports editing after Published; verify and extend through an approved task if needed.

## 8. Service and backend design only

Extend the existing injected `Services` boundary with a typed release service and a separate Supabase implementation. Suggested asynchronous operations: paginated document/project release summaries, scoped release detail/source, eligibility, publish and authorized request-result lookup. Eligibility/read methods do not write. Domain validators map supported rows to stable release models; use established `ServiceError` categories with safe issues, not raw SQL/RPC errors. Recheck identity after awaited work and retain existing identity/organization/permission cache teardown. Query keys include identity scope, project/document and immutable release ID; no shared draft/preview query key.

Backend capability absence is unavailable and blocked; no signature discovery, alias RPCs, direct INSERT fallback, alternate backend or demo fallback. Keep demo fixtures/state explicitly isolated and labelled; any simulated publish must obey immutability/conflict semantics and never be presented as durable backend publication. Do not require a separate application API or credentials in browser code. Errors invalidate only relevant eligibility/document/release queries, not unrelated local recovery.

Suggested schema and grants, **not SQL and not existing objects**:

| Object | Purpose and constraints |
| --- | --- |
| Accepted review snapshot/approval entities from #9 | Reuse exact merged entities; require immutable approved package, decision linkage and generation. Add missing dependency/context capture only through reviewed forward migrations, not edits to recovered originals. |
| `document_releases` | Scoped immutable identity/envelope/source-package JSONB, sequence, snapshot/decision FKs, source/context/manifest hashes, publisher/time and request key. Composite scope constraints prevent cross-project linkage. Required unique keys as above. |
| Optional `release_topics` / `release_dependencies` | Only if size/query measurements justify normalized indexing; immutable children with release FK and scope/order uniqueness. Entire source package committed together, no browser child inserts. |
| Lifecycle pointer/counter | Authoritative generation, approved snapshot pointer, latest release pointer and next-sequence state attached to the existing document lifecycle. Reconcile ownership with #9 rather than create a second state machine. |
| Publish RPC and result read | Transaction and typed result described above; exact names/signature documented in readiness contract only after implementation review. No broad JSON execute dispatcher. |

RLS: authenticated SELECT on authorized project releases and their children only; tenant chain and current access checked for every detail/source read. No anon SELECT and no authenticated INSERT/UPDATE/DELETE table grants or write policies on release/audit records. Deny rewriting/deleting immutable rows through ordinary lifecycle functions as well as direct table access. Use database-owned audit values; browser-supplied audit claims are rejected.

A narrowly scoped SECURITY DEFINER publish function may be necessary to insert into otherwise unwritable tables. Its owner must be a dedicated minimum-privilege non-login role, with safe fixed search path, qualified identifiers, no dynamic SQL, no broad service-role dependency and explicit `auth.uid()`/membership checks (definer execution can bypass caller RLS). Revoke default PUBLIC/anon execute and grant only the exact callable to authenticated. Helper functions stay private. Review function grants, owner privileges, row_security behavior and JSON validation together; a definer wrapper is not automatically safe.

Retention/deletion is unresolved D3: recommend restrictive parent FKs so existing project/workspace/organization deletion cannot cascade away releases. This changes established destructive lifecycle behavior and requires explicit product approval plus clear dependency errors/confirmation copy. Do not silently change deletion semantics or implement an orphaned cross-tenant archive. Auth user removal must not cascade release loss; retain stable actor provenance under approved privacy policy without depending on continued profile availability. No release edit/rename/archive/delete/restore control is included until policy is chosen. With restrictive retention, parent deletion becomes blocked, not falsely successful.

## 9. UI, accessibility and performance specification

Use the existing project Publish route for eligibility and project-scoped document release summaries, with a lazy release detail route underneath it. Keep the general History placeholder unchanged initially; do not promise topic revision history, diff or restore. Final route details are engineering choices consistent with Wouter/project scope. Do not add a global publishing console.

| State | Expected interaction |
| --- | --- |
| Loading / empty | Stable skeleton and accessible busy state; distinguish no approved documents from no releases. Never fabricate sample backend releases. |
| Eligible | Human document title, approval time/authorized approver label, selected context and next release indication; Publish enabled only for selected verified source. |
| Blocked | Explain permission, not approved, stale review, archived scope, unsupported content, missing dependency or unconfigured backend with safe human locations and an appropriate Review/Author/reload action. Hidden inaccessible targets must not leak names/IDs. |
| Confirm | Existing Dialog/AlertDialog pattern states document, approved snapshot date, output context, immutable-release consequence and any warnings. Cancel performs no write and restores focus. |
| In progress | One request key per attempt, disabled duplicate submission, status announcement and stable layout. Closing/navigating cannot imply server cancellation. |
| Success | Announce `Release N published`, show read-only release link and update current document/list. Reload returns the same persisted release. |
| Conflict / uncertain outcome | Keep useful selection, show source changed/already published or checking result; reconcile request outcome before offering another attempt. Never silently publish another generation. |
| Error / access loss | Safe error/retry; no optimistic Published state. Close inaccessible content immediately on sign-out/role/scope loss, clear scoped caches and preserve unrelated permitted recovery rules. |
| Release list / detail | Cursor-paginated summaries by document/sequence, captured title, publisher label/time, approval provenance, context and status; lazy read-only outline/body/source inspection. No editable fields or mutable reference fetches. Unsupported historical source gets a lossless read-only notice. |

Reuse `ProjectScope`, `PageHeader`, state components, `Button`, dialogs, `StatusPill`, identity/format helpers and shared shell. Use semantic `bg-card`, `text-muted-foreground`, primary/destructive/focus tokens, exact action violet `#6236FF`, local Inter and approved brand components with Signature X/purple dot. Keep 240px/72px navigation and established responsive spacing. No new visual pattern is required beyond composing these controls; screenshots/Figma fidelity are not claimed by this document.

All actions keyboard reachable; dialog labels, focus trap/initial focus/return and Escape behavior preserved. Use polite status announcements and alert errors, explicit disabled reasons available without hover, semantic headings/lists/table structure, visible focus, contrast and touch target sizing. Preserve list badges outside ul/ol. Human copy says document/release/approval, not RPC/CAS/JSONB/generation tokens. No raw UUIDs in labels, errors, toasts, breadcrumbs or empty states. Technical manifests may retain IDs internally; user-facing provenance uses titles/labels and `Unknown user`. Unreleased documents continue to say `Unversioned`.

Lazy-load Publish and release viewer/resolver; do not import Tiptap/editor or bulk release packages into the initial graph, nor prefetch around existing Author/Review/management boundaries. Keep bundle budgets unchanged. Fetch paginated summary projections without full JSON, then one release/detail as needed. Server capture/validation bounds document topics, total bytes, node count, dependency count, depth and expanded output size; proposed depth eight and existing structured node bound are starting constraints, while aggregate numeric budgets require measured fixtures before implementation acceptance. Oversize fails atomically with an actionable message, not truncated output. Immutable release cache entries remain identity scoped; immutable does not mean permanently authorized.

## 10. Threats and required controls

| Threat | Control and evidence required before release |
| --- | --- |
| Tenant or workspace escape via IDs | Composite scope/FKs, server tenant-chain checks, current read RLS; adversarial same-workspace other-project and other-organization fixtures. Shared reusable capture only if allowed in the snapshot's project context. |
| Forged privilege / revoked membership | Explicit chosen publisher role, fresh auth and serialized membership/lifecycle checks; arbitrary authenticated RPC calls tested, not only disabled buttons. |
| Mutable source confusion / forged approval | Load only immutable approved package and verified decision; deny status-only publish and caller bodies; direct status UPDATE cannot bypass approval link. |
| Stale publish / race with Draft or archive | Shared locks and expected generation/digest, rollback on conflict; deterministic two-session tests of both lock orders. |
| Double click, replay, timeout | Durable scoped idempotency and source/context uniqueness, no automatic retry, result reconciliation and fresh read authorization. |
| Reference drift or unauthorized closure | Freeze transitive catalog before approval, no publish-time live resolution; consistency/hash validation; failed/inaccessible dependency blocks capture. |
| XSS, malicious links, resource exhaustion | Strict bounded structural server validation, escaped renderer, safe link policy, cycle/depth/size limits; no URL fetch/SSRF or embedded HTML execution. |
| Audit tampering / destructive cascade | Server actor/time and immutable rows, restricted function grants and parent-retention policy; no actor/body supplied by browser or ordinary table writes. |
| Cache/token disclosure | Existing identity/organization teardown; no release source in analytics/logs/URL query strings, no secrets or auth state in manifests; result keys are not access tokens. |

Approval of shared reusable content in the containing document is not authority to publish other library content. Capture the minimum dependency closure. A later release read exposes only what the document's approved package contains, under document release access; the product owner must approve this retention/access policy if shared-library access can later be revoked independently (D3).

## 11. Automated verification matrix for implementation

These are required future cases, not checks run by this spike. New test filenames below are suggested and do not exist as part of this change.

| Layer / proposed cases | Exact expected assertions |
| --- | --- |
| Domain `releases.test.ts` | Stable canonical hashes across object-key order; array reorder/body/root metadata/context/version change changes digest; Unicode/number vectors; null/empty distinction; malformed JSON/unsafe nodes/links/table rejected; no mutation of input. |
| Resolution `release-resolution.test.ts` | Default/nonempty override/blank override; required empty blocked, optional empty warning; neutral tagged content retained; nested reusable/repeated IDs scoped correctly; missing/forbidden/cyclic/depth-9/oversize/unknown reference fails; live dependency edit has zero effect on old package/output hash. |
| Lifecycle/service `release-services.test.ts` | Draft/In Review/Changes Requested/status-only Approved cannot publish; valid approval publishes once; approved edit starts new Draft; Published edit/new review makes next sequence; old release unchanged; demo/backend isolation; missing capability, malformed row, identity switch and network errors fail closed. |
| Wire/backend contract | Exactly one expected authenticated publish POST with named parameters; no body/audit/sequence inputs, aliases/fallback/auto-retry; scope/digest/token/request key validated; list/detail pagination and no bulk bodies in summaries; source-review digests updated only after reviewed code/schema changes. |
| Disposable DB integration, separately authorized | Real migrations and authenticated sessions: explicit Admin vs Author/Reviewer/Viewer and inherited admins under chosen D1; anon denial; cross-project/workspace/tenant forged IDs; direct insert/update/delete denial; protected approval/status paths; immutable audit and safe function grants/search path; parent deletion under chosen D3. No service-role substitute for actor RLS tests. |
| DB two-session concurrency | Same-key same-input returns identical release; same-key changed input conflicts; different-key same approved source yields one release; simultaneous publishers one sequence; publish versus new Draft/revocation/archive in both lock orders; injected failure after child insertion leaves zero release/children/status changes; timeout reconciliation; sequence uniqueness over subsequent approved cycles. |
| UI `publish.test.tsx` | Loading/empty/eligible/each blocked reason/confirmation cancel/progress/success/conflict/error/uncertain result; no false success, no inaccessible IDs/names; read-only outline/body; no live catalogs; identity revocation closes viewer; `Unknown user`/`Unversioned` preserved. |
| Controlled browser `e2e/publishing-releases.spec.ts` | Real compiled UI and intercepted synthetic backend across desktop-dark, desktop-light, mobile-dark, mobile-light; approve-source fixture → confirm → release detail → reload; blocked roles, stale source, timeout and double click; keyboard dialog/focus, axe, no overflow, native mobile taps, branded names. Zero unexpected writes during inspection. |
| Existing regressions / build | Draft revision/recovery, review, semantic references, roles, lifecycle/delete and identity cache tests; Node 24/pnpm 10 typecheck, unit suite, sequential production demo build, unchanged bundle guard and relevant browser suite per repository policy. Backend readiness separately on an explicitly backend-configured candidate. |

Database integration must prove the transaction/RLS guarantees that wire doubles cannot prove. Run only in an explicitly authorized disposable environment with safe synthetic identities/data. Current production/live Supabase is never an implicit integration target. Full product UAT remains external acceptance even if every test passes.

## 12. Manual UAT matrix for product acceptance

| Persona / scenario | Acceptance evidence |
| --- | --- |
| Chosen publisher, active project | Publish the displayed approved package; confirmation and resulting release show same document/context/approval; reload/deep link preserves it. |
| Author, Reviewer, Viewer, inherited admins | Chosen D1 behavior is accurate; forbidden actors cannot publish through UI or direct call; authorized read-only inspection works without writes. |
| New document and requested changes | Unversioned label; no publish shortcut; empty/no-approved/no-release states accurate; Changes Requested → Draft review cycle required. |
| Approved or Published edit | Explicit new Draft, no old-source mutation; approval/release history remains; subsequent approved publish gets next sequence. |
| Two publishers / second browser edits or revokes role | One release, intelligible stale/already-published feedback; fresh authority enforced; never publish another source automatically. |
| Network interruption / uncertain completion | Reload/result reconciliation finds committed release or permits safe original-key retry; no duplicates/false success. |
| Variables, tags, linked reusable | Check frozen defaults/context, neutral label, nested content and missing/unsupported blockers; edit live definitions afterward and verify historical view unchanged. |
| Large/unsupported release and inaccessible detail | Bounded response/error, original source preserved, no partial publication, safe not-found/access messaging and no raw IDs. |
| Desktop/mobile, dark/light, keyboard/screen reader | Reused shell/brand/Inter/violet; responsive outline/detail, no overflow; focus/announcements/contrast; dialogs cancel safely; lists/tables retain semantics. |
| Parent archival/deletion and role removal | Chosen D3 retention works, correct actionable blocker/confirmation; current access closure works with cache teardown; release cannot be renamed, overwritten or deleted through incidental controls. |

Record persona, safe fixture, browser/profile, observed result and product-owner acceptance. No release UAT, live migration application or deployment is authorized by this specification.

## 13. Ordering and integration gates

1. Product owner reviews D1-D3 and proposed document boundary; freeze first-scope acceptance criteria. This spike can merge independently as proposed design, with decisions visibly pending.
2. Issue #9 lands and is accepted. Inspect merged schema/functions/roles/new-Draft semantics, not branch names or a historical handoff. Map exact approval/snapshot IDs and generation locking. Ensure approval cannot be bypassed through existing document status writes.
3. Close the snapshot dependency/context capture gap before publish implementation. If #9 does not contain it, write a reviewed forward-migration design and extend submission/review so approvers inspect the frozen package. Do not retrofit an approval to unseen live dependencies.
4. Verify recovered migration provenance and actual accepted ordering; review new additive schema/RLS/grants, retention impact and exact RPC. Never modify the 21 recovered originals, guess #9 migration versions or create SQL from the readiness JSON. Disposable replay/application needs separate explicit authorization; live migration application is not part of ordinary feature coding authority.
5. Implement schema/service/domain first behind fail-closed capability checks; then isolated demo behavior and lazy Publish/viewer UI. Old deployments must not obtain direct release writes; new clients against absent schema show unavailable. Update reviewed application contract/digests only for intentional consumed changes. Preserve old releases if resolver formats advance.
6. Run domain/wire/UI/browser/build/bundle checks; perform authorized disposable real-DB concurrency/RLS verification and external UAT. Application/deployment rollout and any production domain work remain separately approved. Do not equate merged code with applied migration or deployed SHA.

## 14. Product decisions versus engineering choices

All proposals remain reviewable; these specific choices require product-owner acceptance before implementation proceeds with them:

| Decision | Recommendation | Alternatives and consequence |
| --- | --- | --- |
| D1: Who publishes; self-publish/separation of duty | Explicit Project Admin only initially, no new implied approval authority. Confirm whether approver may also publish. | Admin+Author expands authority; a separation rule adds server checks tied to accepted #9 approver identities. Existing editing roles do not settle this. |
| D2: First output/context and filtering policy | One internal authenticated release inspector, default variables and neutral conditions; no external deliverable. Confirm document-level boundary. | PDF/portal or filtered outputs require explicit channel requirements, context-specific review, versioned rendering/templates and approved condition truth table. Existing output-preview IDs do not authorize channels. |
| D3: Retention and current access | Retain immutable releases; restrict destructive parent deletion; current project access governs release reads including frozen authorized shared dependencies. | Cascading deletion undermines durable release history; archival/access-revocation/privacy requirements need an explicit separate policy. Changes affect established deletion UX and shared-content access semantics. |

Engineering recommendations within approved scope: server UUID plus document sequence, immutable semantic source with frozen dependency closure, canonical hashes, single transactional RPC, durable idempotency, bounded validation, fail-closed service adapter, lazy viewer and reused controls/tokens. These do not require repeated product approval once scope/policies are accepted. Dependency capture is a correctness prerequisite, not an optional product shortcut. Optional labels, release management actions, filtered conditions and channels remain deferred rather than silently chosen.

## 15. Explicit exclusions and spike verification boundary

No application implementation, executable migration SQL, runtime/config/package/script changes, live Supabase queries/writes, migration replay, Replit action, deployment/domain/infrastructure change or merge occurs in this spike. No AI, email/notifications, external hosting/CDN/storage pipeline, public portal, PDF/Word exporter, advanced channels, arbitrary template/style system, project-wide atomic baseline, cross-project publishing, topic history/diff/restore, release rollback/retraction, signing or automatic version-label scheme is authorized.

Documentation verification: whitespace/diff checks, repository-local Markdown link existence and documentation-only PR path inspection. Full unit/browser/build/readiness suites are intentionally not run for this specification. The future automated/manual matrices above are requirements, not executed results. Final acceptance belongs to the product owner; live security, migration parity, UAT and deployment remain unverified by this spike.
