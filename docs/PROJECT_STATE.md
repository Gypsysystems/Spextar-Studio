# SPEXTAR Studio — Current Engineering State

Recorded: 2026-10-29. Refresh this document when code, backend provenance, staging or validation changes. Durable operating rules live in root `AGENTS.md`.

## Evidence and authority

- Recovery base: `Gypsysystems/Spextar-Studio`, accepted GitHub `main` at `ee3788b6719adbc0a04269e8cafdeacccf60391d`, verified before work on `codex/migration-recovery-2`. The earlier onboarding application baseline was `cbe5b4dce31e5b03da5acbad489bb4609f3e41bd` (`Fix readable user identities and unversioned document labels`). Verify remote HEADs again before future work.
- [Issue #2](https://github.com/Gypsysystems/Spextar-Studio/issues/2) authorizes source-control recovery of the exact migration history. This branch adds original SQL and a provenance manifest and updates recovery documentation. No application functionality, dependency declarations, lockfiles, live database state or deployment was changed.
- User-provided `SPEXTAR_Codex_Onboarding_Handoff_v2.md` governs onboarding. The later authoritative current-state addendum governs product lifecycle, operating/acceptance roles, migration recovery, staging restrictions and confirmed live state. It updates the earlier ZIP where stated.
- Source inspection and executed checks establish code/technical behavior. The migration ledger and original stored SQL were independently read and checksum-verified on 2026-10-29; this was not a live schema/security audit or Replit inspection. Other user-confirmed live state remains handoff authority. Historical reports and synthetic tests are labeled separately below.

## Handoff inventory and continuity

`SPEXTAR_Codex_Handoff.zip` contains exactly three files; no source tree, design pack or runnable application is included:

| Member | Content and use |
| --- | --- |
| `CODEX_HANDOFF.md` | Repository checkpoint, product gaps, recent branding/RPC/lifecycle work, reported live UAT/security findings and prior staging status |
| `supabase_migration_manifest.csv` | 21 unique ordered migration identities, stored-statement counts and MD5 metadata, reported exported from the live ledger |
| `20261028234310_align_authenticated_content_write_grants.sql` | Exact supplied latest SQL, granting authenticated INSERT/UPDATE on the six content/draft tables |

The latest SQL's exact-byte MD5 matches its manifest entry (`fa15d85d89ac2782b815ee55d5a628e4`). The prior 20 original SQL bodies are absent from the ZIP. Issue #2 subsequently recovered all 21 bodies directly from the live ledger and verified the latest against this retained original. The ZIP was inventoried/read without executing its SQL or scripts, and was not copied into Git.

Incorporated context: current implemented areas and pending references/workflows, exact migration-recovery constraints, reported rollback-based database UAT, brand continuity, merged identity/version presentation, and the Codex/GitHub/Replit/Supabase operating split. The addendum confirms the current handoff checkpoint and separates technical testing from product acceptance.

## Architecture and technology

Paths beginning `src/` or `public/`, and the application README, are relative to `artifacts/spextar-studio/`.

Studio is a browser React/TypeScript SPA under `artifacts/spextar-studio/`. `src/App.tsx`/`src/routes/` provide Wouter routing and lazy boundaries. `ServicesProvider` injects typed asynchronous `Services`; `src/services/supabase*.ts` and `demo*.ts` implement separate adapters. `SessionProvider` owns authentication outside identity-scoped TanStack Query caches. Supabase is accessed directly; `artifacts/api-server` registers no services.

Stack: Node 24, pnpm 10, TypeScript 5.9, React 19.1, Vite 7, Wouter, TanStack Query, Tailwind 4, shadcn/Radix, Lucide, Zod, Tiptap 3/ProseMirror, Supabase JS 2; Vitest/jsdom/Testing Library and Playwright/Chromium/axe. The lockfile/workspace catalog controls exact versions. `artifacts/mockup-sandbox` is optional component-preview tooling; root `scripts` contains workspace utilities.

Tenant hierarchy: organization → workspace → project → document → topic. The reviewed backend contract consumes profiles, organizations/memberships, workspaces/memberships, projects/memberships, documents, topics, topic drafts, variables, condition categories/values, reusable metadata and reusable drafts (15 historical tables plus the new, unapplied `document_reviews` source contract). See `supabase/readiness/application-contract.json`; it is an application expectation, not authoritative SQL.

Persisted bodies use SPEXTAR-owned versioned structured JSON with stable content-scoped node IDs. Tiptap is the editing engine. Topic/reusable draft saves have expected-revision conflict handling and identity-scoped recovery; some metadata uses expected timestamps/roles. Other metadata/variable/condition writes do not have universal CAS. Reusable duplication is a two-step metadata/body copy with explicit partial-copy reporting.

No LLM provider integration, prompt management/model abstraction, Prompt Library, Reference Sets, Content Blueprints, source-ingestion/generation pipeline or AI rewrite system was found. Root `README.md` and `replit.md` explicitly describe the current foundation as non-AI and prohibit reuse of the old AI Content Studio backend/architecture. Broader AI/eLearning descriptions are product vision, not existing code.

### Focused AI / prompt architecture verification

The final integrity pass searched the inspected application tree, optional sandbox, routes/navigation, components, services/contracts, domain models, local Supabase contract/migration files, runtime modes/feature flags, configuration, manifests/lockfile, documentation and tracked archive/dead-code candidates. Mentions in onboarding documentation were distinguished from executable implementation.

| Capability | Classification in the inspected repository |
| --- | --- |
| Prompt Library | Historical onboarding context only; no implementation, partial service/model, route, dedicated UI placeholder or feature flag found |
| Reference Sets | Historical onboarding context only; no implementation, partial service/model, route, dedicated UI placeholder or feature flag found |
| Content Blueprints | Historical onboarding context only; no implementation, partial service/model, route, dedicated UI placeholder or feature flag found |
| AI-assisted content generation | Historical onboarding context only; no provider integration, model abstraction, prompt-template/generation/rewrite pipeline or disabled implementation found |

Supporting evidence: `src/App.tsx` and `src/features/project/sections.ts` contain no corresponding routes or placeholders; planned Style Guide checks explicitly say non-AI. The 15 tables in `supabase/readiness/application-contract.json` contain no corresponding AI/prompt models; local migration source contained only a README during onboarding, before the recovery below. Manifests/lockfile contain no AI-provider/model-framework integration dependencies; runtime configuration selects demo/backend without an AI flag. No matching dormant implementation or tracked archive/legacy tree was found. A `generation` counter in `supabase-adapter.ts` cancels superseded authentication work; sample “reference settings” in `src/fixtures/demo-data.ts` describes spectrometer methods. Neither is AI functionality, and reusable content/output preview is not a prompt system.

The named capabilities appear in supplied `SPEXTAR_Codex_Onboarding_Handoff_v2.md` (product narrative around lines 53, 82–87 and AI guidance around 460–469), not in the ZIP's three files or the authoritative current-state addendum. Thus they are absent from the current implementation, including partial/UI-only forms; they are not merely hidden behind a flag. This conclusion is scoped to the inspected repository and supplied materials, not an assertion about another project or undocumented live database objects. No capability was created.

## Implementation status

These are source-confirmed capabilities, not a declaration of final UAT completion.

| Area | Current implementation |
| --- | --- |
| Organizations/workspaces/projects | Creation, navigation and lifecycle controls; scoped administration and archive/delete safeguards |
| Documents/topics | Metadata, hierarchy/order, creation, duplication, move/promote/demote and conservative deletion |
| Author | Structured editing, semantic callouts, advanced tables, find/replace, validated paste, heading navigation, revision saves/conflicts/recovery |
| Variables | Text definitions/output overrides, semantic inline Author insertion, saved references, default-value/read-only resolution and saved where-used locations |
| Conditional tags | Category/value definitions, block apply/remove with saved assignments and category/value where-used; neutral preview preserves tagged content without publishing filters |
| Reusable content | Scoped metadata/drafts/duplication, linked Author insertion, current saved draft previews and accessible saved where-used; notification/snapshot policies remain future intent |
| Project settings | Explicit Project Admin metadata/member administration, archive/restore and lifecycle controls |
| Review | Source implements immutable submitted document snapshots, Admin/Author submit/new Draft and Reviewer/Admin approve/request changes; new source migration remains unapplied |
| Publish/releases/history | Publish/History routes are placeholders; no completed release execution or global History browser; Issue #9 adds scoped immutable review evidence |
| Style Guide / Brand & Outputs | Placeholder routes; existing output-preview IDs do not define publishing/templates |
| Reference Safety & Cross-References | Versioned semantic IDs, visible missing/unsupported reference states, rename integrity and conservative definition-delete blocking; general topic cross-links/replacement workflows remain outside Issue #4 |
| Identity/version presentation | Human-readable owners/creators/saved-by/member labels; “Unknown user” fallback and consistent “Unversioned” presentation; no invented release |

### Authoritative lifecycle versus implemented workflow

The addendum defines Draft → In Review → Approved → Published and Changes Requested → Draft. Editing approved content must create a new Draft; publishing must create a Release.

Document statuses remain `draft`, `in-review`, `approved`, `published` (`in_review` in storage). Issue #9 now adds review outcomes `in_review`, `approved`, `changes_requested` in immutable review evidence. Changes requested returns the working document/topics to Draft. Approved editing requires an explicit new Draft from the latest Approved snapshot. Both client controls and source migration guards enforce read-only In Review/Approved; existing revision/conflict/recovery remains the Draft save path. This is source-reviewed implementation, not deployed or replay-certified behavior. Publishing/releases remain absent. See `artifacts/spextar-studio/REVIEW_LIFECYCLE.md`.

## Supabase, authentication and security

The approved live backend is project `luyyxblmtupmugtazgbr`, region `ap-south-1`, as confirmed by the user. Email/password, verified session restoration, SDK refresh and protected routes are implemented; Microsoft/Google controls are inactive. Profile-label lookup reads only authorized `profiles.id,display_name`, not a user directory or admin Auth API. Only the signed-in user's existing email is a fallback.

Explicit Project Admin/Author may author; Reviewer/Viewer are read-only. Explicit Project Admin administers settings/members. Inherited organization/workspace administration does not grant project authoring; workspace-shared reusable writes use workspace administration. Preserve identity/cache teardown, isolated demo/backend storage, safe return URLs, content/link/paste validation and namespaced recovery. Explicit logout clears departing-user recovery; rejected refresh can retain it for the same identity's re-authentication.

**Authoritative user-confirmed state at handoff:** Last Project Admin protection is implemented; the authenticated grant/RLS mismatch was fixed and the audit was clean. The ZIP additionally reports authenticated rollback-based database UAT across tenant/document/topic/draft/variable/condition/reusable operations and Author/Reviewer/Viewer boundaries. Those results are distinct from this session's offline tests; no live SQL or database mutations were performed here.

**Verified current security warning — leaked-password protection:** The live Supabase security advisor independently reported `Leaked Password Protection Disabled` on 2026-10-29, as confirmed in the [product-owner review on PR #1](https://github.com/Gypsysystems/Spextar-Studio/pull/1#issuecomment-6485446888). This is a verified current warning and remains an open security follow-up. No Auth configuration was queried or changed during this documentation correction.

**Other security considerations:** Browser session tokens and local recovery content are sensitive; preserve account isolation and avoid logging/storage exports. The recovered originals make exact historical RLS/grants, security-definer/search-path details, triggers, constraints and foreign-key definitions available for review; source recovery alone does not certify current enforcement or replay. Client preflights alone do not prove transaction guarantees. No full manual UAT or current live multi-account audit was performed here.

### Migration source-control recovery

Issue #2 recovered **21 exact migrations**, latest `20261028234310_align_authenticated_content_write_grants`, into `supabase/migrations/` on `codex/migration-recovery-2`. Authorized read-only Supabase migration listing and `SELECT` queries read the original `supabase_migrations.schema_migrations` rows. Each row has one stored statement; its UTF-8 bytes were transported as base64 and written without formatting or newline changes. All 21 unique ordered versions/names, stored-statement counts and MD5s matched the live ledger, product-owner audit and retained handoff manifest. The latest file also matches the retained original byte for byte, with MD5 `fa15d85d89ac2782b815ee55d5a628e4`.

`supabase/migrations/migration-manifest.json` records source provenance, capture date, exact filenames, byte counts and checksums. The migration README provides an offline integrity check and supersedes the stale 18-entry/partial-history status in earlier readiness snapshots. Application-contract flags and semantic digests remain unchanged; those artifacts are application expectations, not the migration recovery authority.

No SQL was applied or reconstructed, and no live database write occurred. Schema, RLS, grants, Auth, functions, triggers, tables, data and migration-ledger entries were not modified. Do not replay, reset, repair, apply, rerun or roll back migrations on the live project. Replay and live schema/security validation remain separate tasks; any replay needs explicit authorization for an isolated disposable environment. Source recovery is complete for these 21 entries, subject to product-owner PR review; it does not establish replay certification or UAT.

## Environment and runtime/deployment

| Variable name | Requirement |
| --- | --- |
| `PORT`, `BASE_PATH` | Required by both Vite configurations, including builds |
| `VITE_STUDIO_MODE` | Explicit production `demo` or `backend`; invalid/missing production mode fails closed |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Backend public build-time configuration; approved URL and publishable browser key only |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Optional installed Chromium selection for controlled browser tests |
| `REPL_ID`, `NODE_ENV` | Tooling activation/environment, not application credentials |

Vite values enter client bundles; changing host settings requires a rebuild. Demo needs no credentials. `.env.local` is ignored and preserved. Readiness references to private canary/session/service-role names are synthetic exposure-test inputs, not runtime requirements. No secret values belong in documentation, source, logs or reports.

Replit remains current staging/runtime/hosting. `.replit` selects Node 24 tooling, application routing/autoscale and a post-build store prune. `artifacts/spextar-studio/.replit-artifact/artifact.toml` defines Vite development, static `dist/public` production and SPA rewrite to `index.html`, with managed port/base path. The post-merge hook only installs locked dependencies. Replit runtime-error overlay is a Vite dependency; cartographer/banner are conditional development tooling. No Replit Agent is needed for routine Codex engineering.

Private staging, confirmed by the user: `https://spextar-studio.replit.app`. The addendum confirms Replit/GitHub synchronized at `cbe5b4d` at handoff, superseding the ZIP's older publication caveat. This session did not inspect the running deployment or deploy anything. Do not publish/redeploy without approval or connect the production Studio domain before green staging acceptance and explicit approval.

## Branding and design-system sources

- Root `README.md` Presentation/local fonts, application `README.md` Approved branding and `replit.md` frozen preferences provide repository guidance.
- `src/index.css` contains semantic Tailwind v4 themes/tokens; approved action violet is `#6236FF`, with separate readable foreground tokens. Dark is the default; light tokens remain available.
- `src/fonts.css`, `src/assets/fonts/README.md`, bundled upright/italic Inter WOFF2 and OFL copies establish typography/provenance; no external font service is required.
- `public/brand/` contains the approved primary/reversed wordmarks and Signature X; `public/favicon.svg` and `src/components/brand/logo.tsx` supply shared rendering. Preserve the purple center dot, approved enlarged/bottom-aligned Studio suffix and compact-mark treatment.
- `src/components/ui/`, `AppShell`, `ProjectScope`, `PageHeader`, state components and structured-editor CSS establish shared controls/layouts. Sidebar widths remain 240px/72px; Lucide is established iconography.
- Branding/theme/logo tests, `e2e/brand-assertions.ts` and axe/keyboard checks protect these conventions. Every visually branded SPEXTAR name uses the approved Signature X treatment; no plain text X substitution.
- Figma references: approved vector asset IDs in the application README; current frozen nodes are Variables `37:276`, Conditional Tags `37:414`, and Reusable Content `33:252`. No complete standalone brand manual, actual `.fig` file, full approved screenshot pack or Figma URL was found in the repo or ZIP. Exact whole-screen Figma fidelity remains unverified; do not invent missing guidance.

## Reconciliation and discrepancies

| Earlier source/claim | Reconciled state |
| --- | --- |
| Onboarding narrative describes substantial AI/eLearning/prompt/blueprint/TOC/history systems | Current code is the non-AI structured-authoring foundation; treat broader claims as product context |
| ZIP calls Owner/Unversioned work pending | Source at `cbe5b4d` includes it; the addendum confirms it merged |
| Migration docs report 18 / partial identities | Issue #2 recovered all 21 original bodies from the live ledger with exact MD5 parity; the new migration manifest supersedes historical status |
| Older docs leave last-admin protection/grant fixes unresolved | Addendum confirms protection implemented and clean audit at handoff; preserve controls, do not confuse historical documentation with current authority |
| ZIP's staging build predates the latest UI work | Addendum confirms GitHub/Replit synchronized at `cbe5b4d`; current running deployment not independently checked here |
| Old README slice prose says full member IDs/no project deletion | Current identity presentation and lifecycle code supersede those descriptions; documentation reconciliation remains follow-up work |
| Product lifecycle requires new Draft on approved edit and Release on publish | Complete workflow/fork/release implementation is absent from source; authoritative requirements remain unchanged |

## Historical onboarding technical baseline

All commands were run on the inspected `cbe5b4d` source with Node 24.19.0, pnpm 10.34.9 and installed Chromium. No application fixes or assertion changes were made.

Prepared-cloud activation: source `/workspace/.spextar-tools/activate` in each shell to select the pinned pnpm, retained dependency store and installed Chromium. The retained install/start/smoke helpers serve environment setup. The two Markdown drafts formerly beside them were temporary generation files outside the repository, never included in the setup commit, and were deleted during the final integrity pass; no repository ignore rule was needed.

| Check | Result |
| --- | --- |
| `pnpm test --maxWorkers=1` | **Passed: 50 test files, 1,059 tests** |
| `PORT=5173 BASE_PATH=/ VITE_STUDIO_MODE=demo pnpm run build` | **Passed:** workspace type checks and both Studio/sandbox production builds |
| Studio `check:bundle` | **Passed:** initial JavaScript 950,898 / 975,000 bytes; management/Author/editor/Review-viewer boundaries preserved |
| `node scripts/readiness.ts scan` in Studio | **Passed:** production candidate known-pattern exposure scan, including lazy assets/maps; not an exhaustive security audit |
| `pnpm --filter @workspace/spextar-studio test:browser e2e/navigation.spec.ts e2e/identity-version.spec.ts --project=desktop-dark` | **Passed: 7 tests**; controlled production-browser navigation/session/error/identity/version coverage |
| Full browser suite/all four profiles | Not run in this onboarding session |
| Full `check:readiness` backend-candidate gate | Not run; baseline intentionally uses demo configuration |
| Live Supabase/Replit/manual UAT | Not run; separate authorized acceptance/runtime checks |

Non-failing build warnings include sourcemap/third-party annotation and large-entry notices. No dedicated lint command or GitHub Actions CI workflow is tracked. Frozen dependency installation and demo dev/browser smoke succeeded during the earlier environment setup at `1b767e4`; those earlier results are not substituted for this current-commit baseline. Run heavyweight gates sequentially: the earlier concurrent run hit two route-loading query timeouts; one-worker runs passed without changing assertions.

Technical checks do not establish final UAT. The user's applicable-entity create/view/edit/duplicate/archive/restore/delete, safeguards, permissions, validation, empty/error and navigation matrix remains an acceptance standard. The active draft configuration already records reusable installation and server startup; it has not been published by these analysis/documentation changes.

The onboarding final integrity pass changed documentation only. It rechecked the AI classifications, warning provenance, credential patterns, operating/approval guardrails and commit file scope. Application tests/builds were not rerun for that pass because executable inputs were unchanged. Migration recovery, live database/Auth changes, staging changes and deployment were not performed during onboarding; the later Issue #2 recovery is recorded separately above.

## Issue #2 recovery verification — 2026-10-29

Run on `codex/migration-recovery-2` from accepted `ee3788b` with Node 24.19.0 and pnpm 10.34.9. No application code, test assertions, dependency declarations or configuration were changed.

| Check | Result |
| --- | --- |
| Exact-source integrity | **Passed:** 21 unique ordered versions/names, exactly 21 SQL files, every stored-statement count/UTF-8 byte count/MD5 matches the live export and retained manifest; staged bytes also match. Latest SQL matches the retained original byte for byte. No missing entries. |
| Final read-only ledger comparison | **Passed:** all 21 identities, counts, byte counts and MD5s unchanged from the initial read |
| Migration README offline integrity recipe; `git diff --check` | **Passed** |
| `pnpm test --maxWorkers=1` | **Passed:** 50 files, 1,059 tests |
| `PORT=5173 BASE_PATH=/ VITE_STUDIO_MODE=demo pnpm run build` | **Passed:** workspace type checks and both production builds |
| `pnpm --filter @workspace/spextar-studio check:bundle` | **Passed:** initial JavaScript 950,898 / 975,000 bytes; lazy boundaries preserved |
| `pnpm --filter @workspace/spextar-studio test:browser e2e/navigation.spec.ts e2e/identity-version.spec.ts --project=desktop-dark --workers=1` | **Passed:** 7 controlled browser tests; synthetic credentials and intercepted backend requests |

The first unit-test attempt in the default execution sandbox exited before Vitest initialized; the same command passed with explicit execution network permission. No assertions, retries or configuration were changed to obtain the passing result. Non-failing build annotation/chunk-size and browser color-environment warnings remain. Full browser profiles, backend-candidate readiness, migration replay, live schema/security UAT and deployment were not run. Supabase access consisted only of migration listing and `SELECT` queries; no live database write occurred.

## Issue #4 semantic references — 2026-10-29

Implemented on existing `codex/feature-semantic-references-2` for PR #8, based on
`67f845e` main plus the bootstrap commit. See
`artifacts/spextar-studio/SEMANTIC_REFERENCES.md` for the persisted contract,
resolution behavior, usage visibility and delete boundaries.

The implementation adds inline variable and linked block reusable references,
block conditional assignments, accessible Author pickers, read-only resolution,
missing/unsupported notices, and saved direct where-used locations in management.
References use stable definition IDs and content-scoped node IDs; saves retain
the existing revision/conflict/recovery engine. Workspace-shared usage includes
all readable projects and labels its access limit; errors never display partial
counts. Project enumeration now paginates to avoid a 1,000-row omission.

Ordinary engineering decisions: use existing JSONB bodies and Services reads,
without a synchronized index/schema change; keep all definition deletion blocked
under existing service/grant/RLS boundaries; show default variables and neutral
conditional/current reusable previews rather than inventing output policies.
No new migration is required. The 21 historical SQL files are unchanged. No live
Supabase access, Auth/RLS/grant/function change, deployment, publication or Replit
configuration change was performed. Review/Publish lifecycle scope is unchanged.

UI reuses Button, Dialog, existing management rails, editor CSS, semantic
background/border/accent/focus tokens, local Inter and approved brand components.
The additional reference picker uses a native labeled select for keyboard access;
reference chips and linked-content borders distinguish semantic content. No
parallel design system or exact-Figma-fidelity claim is introduced.

Validation performed with Node 24.19.0 and pnpm 10.34.9:

| Check | Result |
| --- | --- |
| Full workspace unit suite, `pnpm test --maxWorkers=1` | Passed: 52 files, 1,083 tests |
| Final reference/delete/backend contract tests after the unsupported-reference scan guard | Passed: 3 files, 70 tests |
| `PORT=5173 BASE_PATH=/ VITE_STUDIO_MODE=demo pnpm run build` | Passed: all workspace type checks and both production builds |
| Studio `check:bundle` | Passed: 953,652 / 975,000 initial JavaScript bytes; lazy boundaries preserved |
| `node scripts/readiness.ts scan` in Studio | Passed: known-pattern production asset exposure scan |
| Full controlled browser sweep across desktop/mobile dark/light | 603 passed; one mobile-light duplication test exposed loading-height movement, corrected below |
| Final focused browser regressions across all four profiles, one worker | Passed: 28 tests, including both duplication roles, all semantic-reference scenarios and a new delayed-body-loading position check |

The initial broad run exposed legacy null-attribute serialization and obsolete
placeholder assertions, which were corrected. Browser coverage also found and
fixed selection/focus normalization causing an unintended save after picker
cancellation. Initial default-sandbox unit startup did not complete; the full
suite ran with execution network permission, as in the recorded environment
baseline. Build annotation/sourcemap/chunk-size and color-environment warnings
remain non-failing. No assertions were skipped or replaced with retries.

Browser execution: `pnpm test:browser --workers=1` completed all 151 desktop-dark
scenarios successfully, then was deliberately interrupted after that profile to
use the repository's default two workers for the remaining profiles.
`pnpm test:browser --project=desktop-light --project=mobile-dark
--project=mobile-light --workers=2` reported 452 passed and one failed: a tap on
Duplicate document during body loading did not open its dialog. The loading
skeleton now reserves the loaded editor's 340px minimum height, keeping controls
below it stationary. The test assertions and timeouts were unchanged.

After the fix, the full unit suite, workspace type checks/builds, bundle guard and
exposure scan were rerun and passed. The final browser command was
`pnpm test:browser e2e/semantic-references.spec.ts e2e/management.spec.ts --grep
'semantic references|linked previews|reference picker|loading a topic body|duplication, copied drafts'
--workers=1`: **28 passed** across all four profiles. The new loading check holds
the draft request, compares document-action positions before/after load, and
opens the dialog using native interaction. The previously failed scenario and
all semantic-reference scenarios passed. The complete 604-case sweep was not
repeated after this CSS-only fix; its affected flows were retested as above.

Desktop and responsive mobile checks cover the existing controls/tokens, local
Inter/approved brand treatment, contrast, keyboard focus/trapping/return, loading,
missing/error/retry, disabled and read-only states. These are controlled Chromium
checks with intercepted requests, not manual UAT or exact Figma pixel approval.

Product UAT, live multi-account RLS, migration replay and backend-candidate
readiness remain external to these controlled checks. No live DB validation is
claimed.

## PR #8 list-container acceptance correction — 2026-10-29

Addressed the [product-owner review](https://github.com/Gypsysystems/Spextar-Studio/pull/8#issuecomment-6489169622)
on base `67617fa` on the existing `codex/feature-semantic-references-2` branch.
`ReferenceBody` now places list-container condition badges in a surrounding div,
outside both bullet and ordered lists. Only list items remain direct children of
ul/ol; ordered start/type, saved assignments, neutral visibility, supported
condition nodes and the persisted JSON contract remain unchanged. The renderer
reuses existing ConditionLabels, tokens and branding without a new visual style.

New unit cases first reproduced both invalid structures (SPAN, LI, LI), then
passed after the fix. Linked reusable/read-only tests assert list DOM semantics,
visible human-readable badges, preserved start/type, unchanged saved bodies,
zero writes and no surfaced internal IDs. Browser cases additionally run axe and
responsive overflow checks on the read-only Review surface.

Sequential verification on the correction:

| Command | Result |
| --- | --- |
| `pnpm --filter @workspace/spextar-studio test src/test/semantic-references.test.tsx src/test/structured-content.test.ts --maxWorkers=1` | Passed: 2 files, 50 tests |
| `PORT=5173 BASE_PATH=/ VITE_STUDIO_MODE=demo pnpm run build` | Passed: workspace type checks and both production builds |
| `pnpm --filter @workspace/spextar-studio check:bundle` | Passed: 953,652 / 975,000 initial JavaScript bytes; lazy boundaries intact |
| `pnpm test:browser e2e/semantic-references.spec.ts --workers=1` | Passed: 28 tests across desktop-dark, desktop-light, mobile-dark and mobile-light, including both conditioned list types and axe |
| `git diff --check` | Passed |

The full unit/browser suites were not repeated for this bounded renderer change,
as permitted by the review; prior broad verification remains recorded above.
Non-failing existing build annotation/sourcemap/chunk and color-environment
warnings remain. No live Supabase access, schema/migration/security change,
Replit configuration change, merge, deployment or publication was performed.
Manual UAT and live RLS certification are not claimed.

## Next step and unresolved matters

PR #8 was merged to main as `70ffe3be130164e8d5ac42fa9adc17355ca538e3`. Issue #9 is the active Review & Approval engineering task; its PR must remain unmerged and undeployed for Engineering Handoff and product-owner acceptance. Exact historical SQL is available; migration replay and live schema/security validation remain separately authorized tasks.

Remaining matters include the verified leaked-password-protection warning, external UAT/release acceptance, relevant missing design frames when fidelity is required, and separate approval for migration application, AI, hosting and production work. Do not replace these decisions with assumptions or treat incomplete modules as permanent prohibitions.



## Issue #9 Review & Approval foundation — 2026-10-29

Authoritative scope: [Issue #9](https://github.com/Gypsysystems/Spextar-Studio/issues/9).
Fresh branch `codex/feature-review-lifecycle-2` starts at accepted main
`70ffe3be130164e8d5ac42fa9adc17355ca538e3`; the unsuffixed branch already existed.
No old semantic-reference branch was used and no implementation was committed to
main. The resulting PR remains unmerged for Engineering Handoff and independent
product-owner acceptance.

Source implements document-level immutable submitted metadata/outline/body JSONB,
explicit Admin/Author submission/new Draft, Reviewer/Admin approve/request changes,
mandatory changes notes, stale-state rejection, Author locks, and submitted-snapshot
Review rendering. Semantic references remain unflattened; existing read-only
resolution and lazy viewer/editor boundaries are reused. New Draft reloads the
approved baseline at newly advanced revisions while retaining browser recovery
for explicit restore. Submit checks pending/error/conflict/loading controllers,
metadata saves and document-scoped browser recovery before one expected-time RPC.

The new forward-only migration is
`20261029140601_review_lifecycle_foundation.sql`: one SELECT-only evidence table,
one-active-review uniqueness, immutable evidence trigger, working-write guards,
a private checked transition implementation and four authenticated invoker RPCs.
It follows the recovered 21 originals, whose exact bytes/checksums are unchanged.
The private definer function is required to change document/topic status for
Reviewers without granting content writes. It has an empty search path, explicit
postgres ownership and identity/scope/explicit-project-role checks. Document and
membership locks serialize transitions and concurrent content/role changes.
Restrictive evidence FKs may block parent deletion rather than destroy approvals.

See `artifacts/spextar-studio/REVIEW_LIFECYCLE.md`, backend readiness README,
application contract and source-review inventory for the consumed schema, exact
signatures, role/tenant/concurrency behavior and limitations. `.gitattributes`
protects exact SQL/SVG bytes against Windows checkout conversion. UI reuses
Button, Dialog, Textarea, existing shell/outline/read-only viewer, semantic tokens,
local Inter and approved Signature X assets; no parallel design system is added.
Native selection and Radix confirmations preserve keyboard/focus behavior.

No migration application/replay, live Supabase/Auth/RLS/data change, Replit change,
deployment, publication, domain/DNS or infrastructure action occurred. No live
security certification, migration parity, manual UAT or product acceptance is
claimed. Publishing/releases, assignments/quorum, comments, notifications, global
History, Style Guide and AI remain outside this implementation.

### Issue #9 executed validation and handoff status

Executable source: `IMPLEMENTATION_SHA` (the final evidence update changes docs
only). Full commands and results are retained in [ISSUE9_VALIDATION.md](ISSUE9_VALIDATION.md).

- Final Issue #9 unit/service/migration contracts: **80 passed, 4 files**.
- Final lifecycle browser checks, pinned Chromium, all four profiles: **20 passed**,
  including stale confirmations, keyboard/focus/axe and immutable Approved content.
- Final targeted regression: **242 passed, 2 existing five-second UI timeouts**.
- Latest full unit run: **1,029 passed, 6 failed; 54 blocked by symlink setup**.
  An accepted-main control reproduced five Windows UI failures, including the
  same autosave/paste cases. These are reported failures, not passing gates.
- Broad browser sweep: **616 passed, 16 failed / 632**. Corrected fixture/error
  flows were rechecked across all profiles. Pinned-browser recheck: **56 passed,
  4 unchanged branding metric failures** (one pixel versus maximum 0.5 pixels).
  Both browser versions reproduce the metric on Windows; vectors/brand code and
  assertions are unchanged. The full sweep was not repeated after bounded fixes.
- Workspace typecheck, both production builds, bundle guard and static asset scan:
  **passed**. Initial JS **734,058 / 975,000 bytes**; lazy boundaries preserved.
- Historical migration source integrity: **21 exact files passed**. New migration
  remains unapplied. Git whitespace/staged-scope check: `GIT_CHECK_RESULT`.

Technical validation is **not fully green**. Keep the PR draft and unmerged.
Supported-environment regression/branding verification, authorized disposable
SQL/RLS/concurrency execution and independent product-owner acceptance remain
external gates. No tests were skipped or assertions/timeouts weakened to obtain
passing results. No live backend, Replit or production/staging infrastructure
change was performed.
