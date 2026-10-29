# Issue draft: implement Publishing & Releases after Review acceptance

Status: proposed engineering issue text, not an opened/approved implementation task.

Suggested title: `Implement immutable document publishing and release inspection`.
Suggested branch: `codex/feature-publishing-releases` (clean numbered suffix if occupied).
Suggested PR title: `feat: publish approved documents as immutable releases`.

## Problem and required outcome

At main `70ffe3be130164e8d5ac42fa9adc17355ca538e3`, Publish is a disabled project placeholder and no immutable release exists. Implement one document-level release transaction from a verified approved package, with authenticated release list/detail inspection. Follow [the architecture specification](PUBLISHING_RELEASES_DESIGN.md); this issue draft does not authorize implementation, live database work or deployment.

## Prerequisites and scope freeze

- Issue #9 must be merged and externally accepted; inspect its final snapshot, approval, permission, lifecycle generation and new-Draft behavior. No unmerged branch dependency.
- Product owner must resolve design D1 publisher/separation rules, D2 first output/context/document boundary and D3 retention/access/deletion implications. Recommended first scope is explicit Project Admin publishing a single document to internal read-only release inspection, default variables and neutral conditions.
- The approved package must capture transitive semantic dependencies and approved context before approval. If #9 lacks this, extend submission/review through reviewed additive design/migrations before enabling publish. Never materialize mutable dependencies at publish time.
- Review migration provenance/order and obtain separate authorization for any disposable replay/application or live migration work. Do not alter recovered original migrations or infrastructure.

## Acceptance criteria

1. Draft → In Review → Approved → Published and Changes Requested → Draft are authoritative. Status-only approval, Draft/current-topic publishing and direct status-write bypass are denied by the server.
2. One complete approved document outline/body/dependency package becomes one new immutable release with server UUID, document sequence, publisher/time, snapshot/decision/generation linkage and versioned checksums/manifest. No partial release is observable.
3. Semantic source/root metadata/node identities remain lossless. Frozen variables, conditions and nested reusable bodies determine historical output; later live edits cannot affect it. Unsupported content, missing/inaccessible references, unsafe structures and bounded expansion failures block publication.
4. A single authenticated exact-signature RPC owns authorization, CAS/locks, immutable inserts/audit, sequence allocation, request identity and Published transition. No browser release writes, privileged key, fallback adapter, RPC alias discovery or automatic mutation retry.
5. Server-enforced chosen publisher role and tenant boundaries apply to arbitrary requests. Inherited administration does not imply publishing. Release detail/list/source reads honor current access and identity teardown.
6. Same request/input returns the committed result after fresh authorization; changed input conflicts. Different keys cannot double-publish the same approved snapshot/context. Timeout reconciles through an authorized result read. Concurrent new Draft/archive/revocation and publish serialize safely.
7. Approved/Published edits create a new Draft without changing old approval/releases; next accepted review cycle produces Release N+1. No destructive overwrite or sequence reuse. Legacy status-only Approved records require genuine review.
8. Additive reviewed schema/RLS/grants enforce immutable release/audit rows, scoped FK/unique constraints and chosen retention policy. No cascade loss or broadened read access may be introduced silently. Exact function ownership/search path/execute privileges are reviewed.
9. Reuse injected Services and separate backend/demo adapters. Backend absence/errors fail closed; simulated demo publication is clearly labelled and isolated. Update intentional consumed contracts/source-review digests and relevant documentation after code review.
10. Publish supports loading, empty, eligible, every blocked reason, confirmation/cancel, in-progress, success, conflict, uncertain outcome and error states. Read-only list/detail inspection uses release data exclusively and human labels, no raw IDs/internal terminology. Preserve `Unknown user` and `Unversioned` semantics.
11. Preserve ProjectScope/shell/shared controls, semantic tokens, local Inter, action violet, Signature X branding and responsive navigation. Keyboard/focus/dialog announcements, contrast, list/table semantics, dark/light and desktop/mobile checks pass. No exact Figma-fidelity claim without source frames.
12. Lazy Publish/viewer keeps existing Author/Review/management boundaries and unchanged bundle budgets. Paginated summaries omit bulk source JSON; resource bounds reject atomically without truncation.
13. Execute every applicable automated case in design section 11, including real two-session transaction/RLS tests in a separately authorized disposable environment. Controlled browser doubles alone do not prove DB enforcement. Run relevant regressions, typecheck/build/bundle and browser profiles sequentially under repository policy; report unrun/blocked checks accurately.
14. Product owner conducts manual matrix in design section 12 and accepts chosen scope. Engineering completion is not UAT, release/deployment approval or evidence of applied migrations.

## Implementation sequencing

Reinspect accepted main/#9 → resolve D1-D3 → close approved-package dependency capture → review additive migration/RLS/function design → domain/service and transaction implementation → isolated demo and lazy UI → intentional contract/docs updates → automated gates and authorized disposable DB verification → external product UAT → unmerged implementation PR for review. Live migration application and deployment are separate explicitly authorized steps.

## Exclusions

No external publishing infrastructure/CDN, public portal, PDF/Word exporter, AI, email/notifications, general Style Guide/Brand outputs implementation, topic diff/restore, release rollback/retraction/deletion, cross-project or atomic project-wide publishing, advanced channels or production domain/deployment changes. Future context filtering requires an approved truth table, versioned evaluator and review binding.

## Required PR evidence

Describe accepted product policies and exact merged #9 dependency; list source/schema/service/UI/docs changes, executed checks and failures/limitations, transaction/RLS evidence, desktop/mobile and accessibility/branding results, migration/application status, security/deletion impacts and commit SHA. Keep the PR unmerged pending product-owner review; do not claim runtime deployment or UAT from tests alone.
