# Issue #9 engineering validation

Recorded 2026-10-29. This is source and controlled-test evidence, not product
acceptance, migration execution, live RLS certification or deployment approval.

Branch: `codex/feature-review-lifecycle-2`, created directly from accepted main
`70ffe3be130164e8d5ac42fa9adc17355ca538e3`. The unsuffixed branch already existed.
Executable source tested here was committed as `IMPLEMENTATION_SHA`; the final
PR also contains a documentation-only evidence update. No main commit was made.

**Validation remains incomplete.** New lifecycle checks pass, but the complete
unit/browser gates are not green on this Windows host. Keep the PR draft and
unmerged pending Engineering Handoff, supported-environment verification and
independent product-owner acceptance.

## Implementation and reviewed scope

- One new, unapplied migration:
  `supabase/migrations/20261029140601_review_lifecycle_foundation.sql`.
  All 21 recovered originals retain exact manifest bytes and MD5s. The manifest
  still describes recovered history only; it does not certify the new migration.
- `document_reviews` stores document metadata and complete topic snapshots as
  JSONB, with stable identities/outline, nullable saved revision/body, sequence,
  outcome, submitter/time and immutable decision evidence. Semantic references
  and opaque future content are not flattened or resolved into stored text.
- Four exact authenticated RPCs submit, approve, request changes and start a new
  Draft. Explicit project roles, membership/document locks, expected state/time/
  review, one-active-review uniqueness and immutable evidence guards fail closed.
  A private, checked postgres-owned definer implementation is needed to change
  statuses for Reviewers without granting them content writes. Public wrappers
  are invokers; search paths and EXECUTE grants are restricted.
- Working writes are guarded in the database source and client. Author is
  read-only In Review and Approved. New Draft restores the latest Approved
  baseline, advances existing revisions and preserves browser recovery. Dialogs
  retain their opening timestamp/status/review ID instead of silently accepting
  a background refresh as a new confirmation target.
- Review reads submitted evidence, not mutable topic drafts. Existing Services,
  JSON/editor architecture, safe semantic rendering, recovery/conflict engine,
  lazy boundaries, shared controls/tokens, local Inter and approved vectors are
  reused. Latest changes-requested notes are shown without adding History UI.
- Evidence has restrictive document/project FKs; parent deletion can fail rather
  than erase approvals. Unexpected privileged outline drift fails closed instead
  of destructively reconciling topics during new-Draft creation.

Changed areas: review domain/service/contracts/backend registration; document and
draft permission guards; Author actions, metadata locks, save readiness/registry;
submitted Review UI; focused tests and transport fixtures; F2/F3/lifecycle/semantic
reference docs, project state and backend contract/source-review inventory.
`.gitattributes` prevents SQL/SVG checkout conversion. No runtime dependency,
lockfile, historical SQL, vector geometry, font, theme or deployment configuration
change is included. See the PR file list for the complete paths.

## Environment and commands

Codex ran these checks locally on Windows with Node **24.22.1**, pnpm **10.34.9**,
Vitest/Playwright from the frozen lockfile, installed Chrome **155.0.8059.85** and
then Playwright-pinned Chromium headless shell **156.0.8078.4**, revision **1248**.

`pnpm` below was invoked through the ignored local toolchain wrapper
`& ./generated-artifacts/run-pnpm.ps1`, which forwards the listed arguments to
pnpm 10 using bundled Node and matching Windows native build binaries. Helpers,
downloads, logs, baseline archive, browser output and dependency links are ignored
local artifacts, not PR content. Frozen dependency installation completed with
`CI=true pnpm dlx pnpm@10.34.9 install --frozen-lockfile`; initial pnpm 11/sandbox/
missing-shell attempts failed and are not successful install/test evidence.

### Final focused Issue #9 checks

```sh
pnpm --filter @workspace/spextar-studio test src/test/review-lifecycle.test.tsx src/test/review.test.tsx src/test/review-migration.test.ts src/test/backend-contract.test.ts --maxWorkers=1
```

**Passed: 4 files, 80 tests.** Covers snapshot/semantic JSON preservation, explicit
missing bodies, submitted rendering instead of current drafts, no content writes,
role affordances and denials, exact RPC calls, mandatory notes, stale/unconfirmed
responses without fallback/retries, Author locks, submit/new-Draft confirmations,
source migration/contract rules and all 21 historical migration hashes.

```sh
pnpm test:browser e2e/review-lifecycle.spec.ts --workers=1
```

**Passed: 20 tests across desktop-dark, desktop-light, mobile-dark and mobile-light**
on pinned Chromium. Includes saved Draft submission, Author lock, approval,
explicit new Draft and subsequent edits, Approved snapshot preservation, request
changes/note validation, Author/Viewer decision denial, missing bodies, unsaved/
error submission blocking, failed reads, competing decisions and a frozen
confirmation timestamp after a stale response/background refresh. Native keyboard,
Escape/return focus, axe and overflow checks are included.

### Regression runs and unresolved failures

```sh
pnpm test --maxWorkers=1
```

Latest completed full run: **50 files passed, 4 files failed; 1,029 tests passed,
6 failed, 54 not executed after failed setup** (Vitest reports those 54 as skipped).
Four individual failures and the 54-test setup failure are Windows `EPERM` when
creating symlink fixtures in the predeploy suites. Two Conditions UI tests hit
load/overall timing limits. No skip, assertion relaxation or timeout increase was
added. An earlier completed full run reported 1,021 passed, 14 failed and the same
54 setup-blocked tests before fixture/checkout corrections; it is not a passing
baseline. Initial stalled sandbox attempts were interrupted, not counted as full
completed runs. The full run predates the final confirmation guard and six additional focused adapter cases; those were verified by the final 80-test and 20-browser checks, not by repeating the full suite.

```sh
pnpm --filter @workspace/spextar-studio test src/test/review-lifecycle.test.tsx src/test/review.test.tsx src/test/review-migration.test.ts src/test/backend-contract.test.ts src/test/f2.test.ts src/test/f2-ui.test.tsx src/test/f3-services.test.ts src/test/f3-controller.test.ts src/test/f3-ui.test.tsx src/test/lifecycle-drafts.test.ts src/test/reusable-recovery.test.ts src/test/semantic-references.test.tsx src/test/structured-content.test.ts --maxWorkers=1
```

**242 passed, 2 failed, 13 files.** The two existing UI cases timed out at their
unchanged five-second limits: F2 metadata/body autosave and F3 safe rich paste.
The service/controller/recovery, semantic, lifecycle and source-contract suites
passed. This combined regression command is not reported as green.

For a control, Codex exported accepted main to an ignored archive, without
switching branches or creating a worktree, and ran the same dependencies:

```sh
node artifacts/spextar-studio/node_modules/vitest/vitest.mjs run src/test/f2-ui.test.tsx src/test/f3-ui.test.tsx src/test/conditions-route.test.tsx --maxWorkers=1 --root generated-artifacts/baseline/artifacts/spextar-studio
```

**41 passed, 5 failed, 46 tests** on `70ffe3be…`. This reproduces the same autosave,
rich-paste and Conditions cold-load failures on accepted main, plus two other UI
timeouts. It supports a host-related limitation; it does not certify current
tests as passing or replace a supported-environment regression run.

```sh
pnpm test:browser --workers=2
```

Complete broad sweep on installed Chrome: **616 passed, 16 failed, 632 total**
across all four profiles. Each profile failed the old Draft-count fixture, the
Review missing-content download fixture, the changed document-read error heading
and the existing branding alignment assertion. The fixtures and heading were
corrected and their affected flows rechecked below. This entire broad sweep was
not repeated after those bounded changes.

```sh
pnpm test:browser e2e/review-lifecycle.spec.ts e2e/semantic-references.spec.ts --workers=1
```

Earlier focused sweep on installed Chrome: **40 passed** across all four profiles.

```sh
pnpm test:browser e2e/review-lifecycle.spec.ts e2e/semantic-references.spec.ts e2e/session-resilience.spec.ts e2e/management-download-recovery.spec.ts e2e/cross-route-freshness.spec.ts e2e/navigation.spec.ts --grep 'saved Draft|changes note|unsaved/error|competing decision|semantic references|linked previews|reference picker|loading a topic body|container conditions|Review rejected refresh|Review: missing chunk|create and conservative delete|sign-in contrast' --workers=1
```

Pinned-browser recheck: **56 passed, 4 failed, 60 total** across all four profiles.
All corrected count/download/session flows, semantic-reference cases and lifecycle
cases passed. Only the existing navigation branding metric failed: one pixel
versus its unchanged maximum of 0.5 pixels. Both installed Chrome and pinned
Chromium reproduce it on Windows. Brand source/assets are unchanged, and exact
asset checksum tests pass; the pixel assertion was not weakened and no visual
acceptance is claimed. The later **20/20** lifecycle run above verifies the final
frozen-confirmation change and its new regression test.

### Build and source integrity

```sh
pnpm typecheck
PORT=5173 BASE_PATH=/ VITE_STUDIO_MODE=demo pnpm run build
pnpm --filter @workspace/spextar-studio check:bundle
pnpm --filter @workspace/spextar-studio exec node scripts/readiness.ts scan
git diff --check
```

Typecheck, both workspace production builds, bundle guard and known-pattern asset
exposure scan **passed**. Initial JavaScript: **734,058 / 975,000 bytes**; management,
Author/editor and Review-viewer boundaries remain deferred. Existing sourcemap,
third-party annotation, large-chunk and color-environment warnings remain nonfatal.
The candidate intentionally uses demo build configuration; this does not pass or
substitute for the separate backend-candidate readiness gate.

Git whitespace/staged-scope check: `GIT_CHECK_RESULT`.

## Explicitly unrun and unchanged

No new or historical migration was applied/replayed, including in a disposable
database. SQL/RLS/function execution, real multi-account tenant/role checks,
multi-session lock scheduling/rollback, live schema parity, backend-candidate
readiness, manual UAT and product acceptance remain unrun. Controlled transport
fixtures and SQL source assertions are not a PostgreSQL/RLS simulator or proof.

**No live Supabase/schema/Auth/RLS/grants/functions/data, Replit, deployment,
publishing, domain/DNS or production/staging infrastructure changes occurred.**
No service/private credential entered browser source or reports. Publishing,
assignments/quorum, threaded comments, notifications, global History UI, Style
Guide enforcement and AI remain outside this PR.
