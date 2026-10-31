# SPEXTAR Studio — Current Engineering State

Recorded: 2026-10-30. Refresh this document when code, backend provenance, staging or validation changes. Durable operating rules live in root `AGENTS.md`.

## Evidence and authority

- Issue #29 resumed staging acceptance (2026-10-31): PR #30 is merged; accepted main is `3c8ed5dde8cc5ff99f6f4da611369f3185731156`, verified clean locally before testing, with a tree identical to accepted PR head `c7bc7a2`. Hosted quality run `41166254379` remains successful. Replit prepared that exact SHA with a clean checkout and republished the SAME private deployment `44b9136b-383c-4b9d-b9c8-39b9efae34fe` successfully at `https://spextar-studio.replit.app`. No new deployment/settings/cost/visibility/Auth/domain changes. Local and Replit backend builds agree on `index-DEzyNANC.js` SHA256 `d4136a395fd8605358475e7e823ed18db11b58b8f5fde95d27404ffaca61094c`; authenticated browser observes that filename and matching lazy chunk names. Exported deployed CSS matches the accepted build SHA256 `2ed124fe62b0576a75fba45a0be09370206c68f71cd93ce8229a99d4287ff990`. Platform metadata exposes no source SHA; direct deployed-JavaScript byte comparison remains unavailable. Both obsolete PR #30 messages are absent in the tested live UI.
- Exact accepted candidate: workspace typecheck/both backend-configured production builds, 964,952/975,000-byte bundle guard, client exposure scan, 19 targeted units, 20 migration-contract tests and four controlled workflow browser profiles pass. All 26 migration files match accepted Git raw bytes. Fresh Supabase status is ACTIVE_HEALTHY; Issue #26 remains closed/completed. Its accepted ledger-26 certification was reused rather than repeated.
- Real staging coverage reused all six existing disposable personas, with no new identities or membership changes. Browser work covered workspace/project navigation, refresh/session restoration, sign-out/Back closure, a handled incorrect password and retry, foreign-workspace not-found, Variables/Reusable screens, and one new disposable document/topic. Unicode/bold text, variable/condition/reusable references, unsafe-link rejection, table Undo/Redo and refresh persistence passed. Draft → In Review → Changes Requested → Draft → resubmission → Approved → explicit Admin Publish produced Releases 1/2; Approved and Published require explicit new Draft. A competing review decision retained its note and showed a refresh conflict. Two editors reproduced revision-safe body conflict, blocked submission, reload/recovery offer and discard, preserving the winning save. The new fixture ends Draft at body revision 10 with its immutable releases retained; earlier fixture evidence was not edited.
- All six personas passed fresh real Auth/getUser/scoped reads; tested parent-only/Reviewer/Viewer submission denials and all non-Admin publication denials returned 403/42501. Foreign nonmember reads were hidden; direct Review/Release updates were denied. Independent package/manifest digests and approved frozen-source comparisons pass for both new releases; Release 1 excludes later Draft edits. Same-key retry returned the existing Release 2; one stale submit returned 409/PT409 in 161 ms with no extra release. Live UI additionally confirmed Viewer Draft read-only, owner/workspace-admin no inherited authoring, Viewer read-only Settings, and workspace-admin shared-reusable controls.
- Acceptance is **BLOCKED by source accessibility defects**, not ready for product-owner manual UAT. Captured-live-DOM axe audits flagged manual-review items confirmed against source: metadata and conditional-tag containers use author-supplied names on generic elements; the release renderer has the same tag-label defect. A computed-color browser regression independently reproduces selected topic-number contrast of 3.84:1 dark / 3.90:1 light. Branch `codex/fix-author-accessibility-groups-29` adds named group semantics and uses the existing full primary foreground for selected numbers, retaining exact violet fill and geometry. Three unit regressions fail before the semantic fix and 38 focused tests pass afterward. No new visual pattern, branding/vector/font/token system, permission/lifecycle/body/schema change; the fix remains unmerged and undeployed. Final browser/build/hosted results are recorded with the linked fix PR in Issue #29.
- Live presentation checked dark Author/Publish at desktop 1440/1280, tablet 768 and mobile 390, with no inspected page overflow; Review 1280, keyboard dialog trapping, mobile submission and sign-out were exercised. Light tokens were checked by controlled browsers; the product has no live theme preference control. Inspected connected-browser logs contained no errors/warnings. Captured-live-DOM axe scans are isolated static audits using matching accepted CSS/fonts, not instrumented live runtime scans; incomplete results required manual follow-up. A separate headless browser was blocked by Replit's private access gate, which was preserved. Comprehensive live request/5xx/CORS/cache/service-worker/secret telemetry, network-loss-after-commit recovery, role revocation, every role/route/viewport combination, full CRUD/long-content/foreign-reference permutations and broader manual keyboard/assistive-technology checks remain incomplete after the source-defect stop. No full live matrix, production acceptance or deployment of the fix is claimed. No database/schema/RLS/Auth configuration, production, DNS/domain or billing change.

- Issue #29 staging checkpoint (2026-10-31): clean local and Replit checkouts verified at accepted `c6588f933ea67f978ebaaf30de7a63731015d4eb`. Issue #26 is independently confirmed closed/completed; its final hosted evidence records ledger 26 and accepted Auth/PostgREST/RLS smoke. Fresh Supabase project status is `ACTIVE_HEALTHY`; that health lookup is not a new ledger/security certification. Existing private Replit deployment `44b9136b-383c-4b9d-b9c8-39b9efae34fe` was republished successfully at `https://spextar-studio.replit.app`; no second deployment or settings/domain/billing/Auth/database change. Authenticated browser observes accepted-build JS/CSS filenames; deployed CSS SHA-256 matches the local accepted build (`2ed124fe62b0576a75fba45a0be09370206c68f71cd93ce8229a99d4287ff990`). Deployment metadata does not expose a source SHA; a deployed JavaScript byte/hash comparison remains unverified.
- Issue #29 browser acceptance is **BLOCKED** on a source presentation defect: Author incorrectly says review submission is unavailable, and Project Home incorrectly labels its lifecycle actions unavailable. Existing Author persona sign-in, workspace/project/home navigation, published read-only Author/semantic rendering and Review navigation were exercised at desktop width against the real backend; no lifecycle writes or duplicate identities/fixtures. No errors/warnings were captured in the inspected browser log. This is partial coverage, not full six-persona/responsive/accessibility/runtime acceptance or product UAT. Branch `codex/fix-staging-workflow-guidance-29` corrects the two obsolete messages using existing markup/classes; no new visual pattern, branding/token/font/layout or permission/lifecycle change. Per Issue #29, leave the fix PR unmerged and resume the full acceptance gate only after external review.
- Issue #29 fix validation: Node 24.22.1 / pnpm 10.34.9, targeted application units **19/19**, focused controlled browsers **8/8** across desktop 1440/1280 and mobile 390 dark/light profiles, with lifecycle links, enabled saved-Draft submission, Review navigation, axe and overflow checks. Workspace typecheck and both production builds pass; backend initial bundle **964,952 / 975,000** bytes with lazy boundaries preserved; client exposure scan and whitespace checks pass. Existing build annotation/sourcemap/chunk warnings remain. Initial sandbox browser attempt stalled before results and was interrupted; first prepared attempt stopped on a new test helper import error, corrected before the complete green run. No product assertion/skip/retry weakened. Full CI results belong to the unmerged fix PR; no full-suite local or full live acceptance pass is claimed. Existing Author signed out successfully after the limited live check; no test session data committed.

- Issue #24 validation base: GitHub main `3197174fc3d80ad0e3df1b4d3f653a55ec33a532`, fetched on 2026-10-30; branch `codex/private-beta-backend-validation`, clean initial checkout. PR #23 is merged; older unmerged/placeholder statements below describe historical checkpoints. The current source has 25 SQL migrations (21 recovered plus four accepted forward migrations) and implemented Review/frozen dependencies/Publishing. No fresh live ledger was inspected. Native PostgreSQL 17.11 disposable replay and new true multi-session checks supersede the older unavailable-native/single-session limitations only for the covered cases. See [Private Beta backend validation](PRIVATE_BETA_BACKEND_VALIDATION.md) and [executable UAT plan](PRIVATE_BETA_UAT.md) for current evidence, scope, gaps and pending external rollout gates. No live Supabase/Replit/deployment/domain/DNS changes.

- Issue #20 implementation base: GitHub `main` verified at `0bc97737a027af45ef28aa42a22a06160a1fa0bf`, including accepted Review, explicit Project Admin management and Issue #19 dependency packages. Branch `codex/feature-publishing-releases`; [PR #23](https://github.com/Gypsysystems/Spextar-Studio/pull/23) remains unmerged. Source-only immutable Publishing is implemented; no live migration/deployment changes. See final evidence below.

- Issue #19 implementation base: GitHub `main` verified at `3529a9cc2f802e3c91e75d4ad23a654fd8d9863b`, including merged Review and explicit Project Admin RLS correction. Fresh branch `codex/review-publishing-dependency-freeze`; no worktree or live-service changes. See the package implementation/verification entry below. Older pending/merge statements describe their historical checkpoints.
- Issue #17 implementation base: current GitHub `main` verified at `078a10b8f565fc311a5500a6a7dd5fa19e4ffea0`; branch `codex/fix-project-admin-rls`. This supersedes older implementation checkpoints for this task only. Review PR #18 is present, including `20261029140601_review_lifecycle_foundation.sql`. See the Issue #17 evidence below; neither pending migration was applied.
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

### Issue #10 — independent PR quality gates

The `codex/ci-quality-gates` branch starts from accepted main
`70ffe3be130164e8d5ac42fa9adc17355ca538e3`, independently of Issue #9.
Workflow `quality` adds `unit-type-build` and `migration-integrity` jobs for PRs
to main, with read-only permissions, cancellation of superseded runs and bounded
timeouts. [CI documentation](CI.md) records automatic commands, historical
manifest coverage and separate browser/live acceptance gates. No package scripts,
test configuration, product code, historical SQL, live services or deployment
settings are changed. Hosted execution and acceptance must be established from
the PR's actual run results; this entry alone does not claim green CI or UAT.

Local verification on Windows with Node 24.22.1 / pnpm 10.34.9: frozen install,
typecheck, both demo production builds, bundle guard (729,475 / 975,000 initial
bytes), actionlint 1.7.7 syntax validation, all 21 manifest checks and diff checks
passed. The full unit run was **not green**: 46 files passed / 6 failed;
1,023 tests passed / 8 failed / 54 skipped. Failures include Windows symlink
`EPERM`, a Windows path-format assertion and UI timeout/lookup failures; the
readiness-server setup failure caused the 54 skips. Local native Windows modules
were supplied through machine-only `NODE_PATH` because the lockfile excludes
those binaries; no dependency files were changed. No assertions, skips, retries
or timeouts were altered. Browser/live checks were not run for this CI-only task.

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

Executable source: `5ac00a5d6247aca0cacb35ea51bcda89c49d739e` (the final evidence update changes docs
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
  remains unapplied. Git whitespace/staged-scope check: `Passed; staged scope excludes historical SQL, lockfiles, generated output and the unrelated publishing drafts`.

Technical validation is **not fully green**. Keep the PR draft and unmerged.
Supported-environment regression/branding verification, authorized disposable
SQL/RLS/concurrency execution and independent product-owner acceptance remain
external gates. No tests were skipped or assertions/timeouts weakened to obtain
passing results. No live backend, Replit or production/staging infrastructure
change was performed.

### Concurrent accepted-main reconciliation

While Issue #9 was being validated, main advanced through accepted documentation
PR #11 and CI PR #12 to `64c292c6653f87903e32e55d954f2d15f20e4ce8`.
The feature branch merges those accepted main changes without altering application
or test source. Its project-state conflict preserves both the CI evidence and the
Issue #9 implementation/validation record. The existing hosted quality workflow
can now check this PR; any hosted results are independent evidence, not Codex-run
local tests. No workflow or publishing-design changes are authored by Issue #9.

The two colliding local publishing draft copies were preserved byte-for-byte
under ignored `generated-artifacts/preserved-publishing-drafts/` before bringing
in main's tracked versions. Those local copies are not part of this PR.

### Independent hosted quality result — not a Codex-local run

The existing GitHub-hosted [quality run 40911708209](https://github.com/Gypsysystems/Spextar-Studio/actions/runs/40911708209)
completed successfully for feature head `bf98464649158f2ceb8fdfdadb61cd761597c774`.
On Ubuntu 24.04 / Node 24 / pnpm 10.34.9, `unit-type-build` passed **54 files,
1,095 tests**, typecheck, both production builds, bundle guard and tracked-file
integrity. The separate `migration-integrity` job passed the recovered manifest
checks without executing SQL. The log reports **734,058 / 975,000** initial JS bytes.
These are independently observed GitHub CI results, not additional Codex-local
runs. Application/test source is unchanged by the subsequent evidence-only commit.

This resolves the missing supported-environment full-unit evidence. The Windows
failures above remain accurately recorded. Linux browser/visual verification,
authorized database/function/RLS/race execution and product acceptance remain
unrun; no migration was applied and no live/backend/deployment action occurred.
The PR remains draft and unmerged.

## Issue #17 — explicit project-management authority

Source-only forward migration
`20261029172250_enforce_explicit_project_admin_management.sql` narrows
`app_private.is_project_admin(uuid)` to the signed-in identity's current explicit
`project_members.role = 'admin'` in the exact project. Audited every consumer:
only projects UPDATE/DELETE and project_members INSERT/UPDATE/DELETE policies
use it. A shared-helper correction therefore avoids five parallel policy
rewrites. Parent administration, inherited project reads, explicit Admin/Author
content writes and Review submit/decide/start-Draft roles are separate and
unchanged. The four existing UPDATE/DELETE policies retain their definitions;
UPDATE checks both source and destination project authority.

The membership INSERT policy retains creator self-Admin bootstrap only while
the project has no memberships, using the new private
`can_bootstrap_project_admin(uuid)` definer lookup. This preserves the atomic
invoker create_project RPC but prevents removed/demoted creators from regaining
Admin through the historical creator exception. The existing last-admin trigger
still serializes Admin removal and handles project-delete cascades; organization
owner protections and Review evidence restrictions remain unchanged.
Both management helpers have empty search_path, postgres ownership and only
authenticated EXECUTE beyond their owner. No new table grants or backend-adapter
changes. Adapter/domain source-review digests are intentionally unchanged;
the reviewed application contract records the pending source correction.

The 21 recovered originals/manifest and merged Review migration are byte-for-byte
unchanged. There are now 23 source SQL migrations: 21 recovered applied entries
and two pending source migrations. No fresh ledger/schema inspection was made.
Tests are offline source assertions and adapter doubles, not PostgreSQL/RLS
execution. Committed revocations are read from membership rather than JWT/client
roles; no new claim of concurrent revocation serialization is made. Existing
parent-delete cascades and target-user eligibility rules are not redesigned.
Disposable database role/tenant/direct-write/bootstrap/last-admin concurrency
acceptance, live parity and final product acceptance remain external gates.

No project-management UI/branding changes. No live Supabase, Replit, deployment, domain or DNS
changes. No Publishing, History, Style Guide, Brand Outputs or AI implementation.
The PR must remain unmerged for product-owner/security review.

Issue #17 local verification (Windows, Node 24.22.1 / pnpm 10.34.9): focused
Settings/lifecycle/backend-contract/migration suite **138 passed**; additional
Review lifecycle, Settings-wire and Supabase adapter regression **99 passed**.
Workspace typecheck and both demo production builds passed. Bundle guard passed
at **734,058 / 975,000** initial JavaScript bytes, with lazy boundaries intact.
All 21 historical MD5s and Git blobs, the provenance manifest and merged Review
SQL match the verified main base. Build emitted existing non-failing sourcemap
notices. No local full-unit/browser sweep or PostgreSQL execution was performed;
hosted CI results must be read separately from the actual PR/head checks.

The initial hosted run [40921597741](https://github.com/Gypsysystems/Spextar-Studio/actions/runs/40921597741)
passed all 1,109 assertions across 55 files and migration integrity, but failed
on an unhandled Tiptap error in topic-search: a queued keyboard-shortcut focus
callback accessed the editor view after unmount. Hosted build/bundle steps were
therefore skipped; local build results above remain separate evidence.
A deterministic cancellation test reproduced the missing cleanup (29 passed,
one failed). The bounded follow-up cancels pending focus frames on shortcut
replacement/unmount and captures the existing DOM root before scheduling, so
the callback never reads a destroyed editor view. No assertion/timeout/retry
policy was weakened. This is the sole incidental runtime fix required by the
CI failure, outside the SQL correction itself.

The Author find panel continues to use its existing Toolbar, controls, focus
ring and semantic tokens, local Inter and approved brand assets; no visual
pattern, styling or permission behavior was introduced. Keyboard/open/close,
read-only search and editor/Review behavior are covered by focused jsdom tests.
Desktop/mobile browser and visual/accessibility sweeps were not repeated for
this cancellation-only change and are not claimed as executed.
After the cleanup fix: **69 focused editor/search/Review tests passed**;
workspace typecheck, both production builds and bundle guard passed again
(734,058 / 975,000 initial JS bytes). Existing sourcemap/large-chunk notices
remain non-failing. Hosted results on the updated head remain separate evidence.

## Issue #19 — immutable semantic dependency packages — 2026-10-30

Scope: [Issue #19](https://github.com/Gypsysystems/Spextar-Studio/issues/19), based
on accepted main `3529a9cc2f802e3c91e75d4ad23a654fd8d9863b`; fresh branch
`codex/review-publishing-dependency-freeze`. Issue #20 Publishing execution is
not implemented. No historical/accepted SQL or provenance manifest was changed.

New forward-only source migration:
`20261029184603_freeze_review_dependency_packages.sql` (created with Supabase CLI
2.122.0, source file only). It adds nullable `document_reviews.dependency_package`
and private invoker helpers/INSERT capture trigger. Existing immutable evidence
and parent-review RLS cover the new column. No new definer, public RPC, grants,
release table or lifecycle authority. Three source migrations now follow the 21
recovered originals; no fresh live ledger inspection or application is claimed.

A single STABLE traversal invocation captures only reachable variable defaults/
metadata/output overrides, condition category/value metadata/policy and exact
nested reusable bodies/revisions in one statement snapshot. Existing document/
membership locks and expected timestamps remain; capture errors roll back the
submission. Source JSON and semantic/node identities remain unflattened. Approval
and Start New Draft leave the package unchanged; resubmission captures current
saved dependencies. Same-workspace shared reusable references are accepted;
foreign-project/project-owned and foreign-tenant dependencies are rejected.

Schema/resolver version 1, `spextar-json-v1`, neutral conditions/default variable
values/no selected output. Arrays sort by canonical UUID; canonical JSON sorts
object keys by UTF-16 code units and retains array/string order. Safe integers
only, JSON depth <100; no final digest implementation. Reusable ancestor cycles
and paths beyond eight entries fail; repeated acyclic references are allowed.
Bounds: 256 reusable IDs, 4096 body visits, 30000 nodes/body, 100000 nodes overall,
16 MiB dependency JSONB text. See the complete [package contract](../artifacts/spextar-studio/REVIEW_DEPENDENCY_PACKAGES.md).

Review now uses a frozen provider without mutable catalog/body reads. Legacy NULL
packages are not backfilled: ordinary bodies remain inspectable, semantic bodies
show an explicit unavailable notice and cannot be used for deterministic future
Publishing. Author/demo retain current-catalog behavior. New submit validation
errors identify content/dependency capture instead of misleading tree/note errors.
Only three changed/new adapter/domain digests were deliberately reviewed and
updated after extending the documented application contract.

Executed local validation (Windows, Node 24.22.1, pnpm 10.34.9):

- Initial focused package/lifecycle/viewer/migration tests: **48 passed / 4 files**.
- Final focused package/lifecycle/viewer/migration/backend-contract regression after
  envelope-depth follow-up: **105 passed / 6 files**.
- Disposable PGlite 0.5.13: **55 PostgreSQL assertions passed**. Includes real SQL
  function/RLS/grant execution with synthetic Auth, transitive closure, same-
  workspace sharing, foreign-project/tenant denial, atomic failure rollback,
  unsupported/missing dependency failures, eight/nine-level and cycle behavior,
  approval/catalog-change/New Draft/resubmission and fixed statement snapshots.
  All source migrations compile in memory; the unused pgcrypto install is omitted
  from that in-memory input because UUID generation is built in. Historical file
  bytes remain untouched. This is not Supabase Auth/replay/live certification or
  a concurrent-session race test.
- Full unit run: **1077 passed, 4 failed, 54 blocked/skipped / 1135**, 54 passed
  files / 3 failed. All failures are unchanged Windows symlink EPERM cases in
  predeploy-cli/readiness; predeploy-server setup blocks its 54 assertions. An
  earlier sandboxed attempt was interrupted after the same setup failures; the
  complete prepared-toolchain run is the result above. No assertion/timeout/skip
  or retry policy was changed. Hosted Linux results are separate evidence.
- Workspace typecheck and both demo production builds: **passed**.
- Bundle guard: **736794 / 975000** initial JS bytes; lazy management, Author/
  editor and Review viewer boundaries **passed**. Existing chunk-size/sourcemap
  and color-environment notices remain non-failing. The build's incidental sandbox
  generated-file line-ending rewrite was restored, outside this task's scope.

Four-profile Chromium sweep (`review-lifecycle.spec.ts` and
`semantic-references.spec.ts`, one worker): **55 passed, 1 failed / 56**.
All new dependency-freeze and legacy-evidence cases passed on desktop/mobile,
dark/light. The existing full lifecycle scenario failed one mobile-light axe
contrast check while opening Start New Draft: reported 4.28:1 on an intermediate
button color; the saved settled screenshot shows the normal approved colors.
Dialog/button/theme/action source is byte-unchanged from accepted main. A
transition-state capture is the supported inference, not a certified root cause.
The unchanged scenario was rechecked on all four profiles: **4 passed**, with
identical assertions/timeouts and no configured retry. No broad 56-case rerun or
manual UAT is claimed. The initial failure remains recorded, not erased.

Hosted [quality run 40956580053](https://github.com/Gypsysystems/Spextar-Studio/actions/runs/40956580053)
passed on implementation head `5ff31e915017a2ddfd48245f4d616ba14ed4839c`:
**57 files / 1135 unit tests**, locked install, typecheck, both production builds,
bundle guard (736794/975000), PR whitespace/tracked-file integrity and recovered
migration integrity. This is independently observed Linux CI, not a Codex-local
run. The final follow-up aligns JSON depth validation with the complete canonical
package envelope and adds a passing PostgreSQL rollback regression (55 SQL
assertions); application/editor source is unchanged. Final-head hosted checks
must be read from [PR #22](https://github.com/Gypsysystems/Spextar-Studio/pull/22).
The draft PR remains unmerged, titled exactly
`feat: freeze review dependency packages for publishing`, and links Issue #19.

UI reuses StructuredEditor,
ReferenceBody, VariableValue, ConditionLabels, BrandedText and existing border/
muted/destructive tokens; the linked label identifies its submitted revision.
No new visual pattern/layout, logo/font/vector/color changes. Manual UAT, actual
multi-session races, live Supabase schema/Auth/RLS and product-owner acceptance
remain external gates. The PR must remain unmerged.

**Zero live Supabase changes, zero Replit changes, zero deployment/publication,
zero domain/DNS/production changes.** No migration was applied/replayed/reset/
repaired/rolled back against live Supabase. No AI, History, Style Guide or unrelated
refactor was implemented.

## Issue #20 — immutable Publishing & Releases — 2026-10-30

Authorized scope: [Issue #20](https://github.com/Gypsysystems/Spextar-Studio/issues/20),
accepted design D1–D3 and explicit implementation request. Fresh branch
`codex/feature-publishing-releases` starts from verified GitHub main
`0bc97737a027af45ef28aa42a22a06160a1fa0bf`. Initial checkout was clean.

Source adds the unapplied CLI-generated forward migration
`20261030001220_immutable_document_releases.sql`: immutable numbered release rows,
SELECT-only current-project RLS, restrictive retention, frozen-only validation,
canonical SHA-256 package/manifest digests and one authenticated exact signature:
`publish_document_release(uuid,uuid,uuid,timestamptz,uuid) -> uuid`.
Explicit Project Admin only; membership/document locking, latest Approved review,
expected timestamp, stable request key and approval uniqueness serialize publication
and idempotent retries. The forward migration extends the existing checked new-Draft
transition to Published without editing accepted SQL. All 21 recovered originals,
three accepted migrations and provenance manifest remain unchanged.

The lazy Publish route provides confirmation/progress/blocked/stale/uncertain/error,
numbered success, immutable release list and read-only inspector. Pure resolver and
pinned React renderer v1 use only frozen default variables, neutral conditions and
nested frozen reusable bodies; missing/unsupported/cyclic/deep/excessive expansion
fails closed. The canonical package boundary, manifest fields, fixed UTC timestamp
encoding, vectors, grants, retention and exact request contract are documented in
[Publishing contract](../artifacts/spextar-studio/PUBLISHING_RELEASES.md).
Source-review inventory changes are intentional new/changed consumed adapters and
validators, after reviewing the extended application contract.

UI reuses ProjectScope/PageHeader, Button, Dialog, ErrorState/ListSkeleton,
UserIdentity, BrandedText, existing editor CSS and semantic card/border/muted/focus
tokens. New composition is release history/inspection and frozen reusable provenance
grouping. No branding/vector/font/color changes or exact Figma-fidelity claim.
Keyboard Escape/focus restoration, responsive overflow, dark/light and axe are in
the controlled browser suite. Product UAT remains external.

Initial focused regression: **105 passed / 4 files**. First publishing browser run:
**24 passed, 4 failed / 28**, duplicate success status during Dialog closing; the UI
was corrected without weakening assertions/timeouts/skips. Combined Publishing/Review lifecycle rerun: **60 passed / 60**, all four
profiles on installed Chrome, including keyboard/focus, axe and responsive overflow.
The later nonvisual resource-budget hardening is separately covered by unit/SQL checks.
Disposable PGlite uses synthetic Auth and memory only; final **75 SQL assertions**
passed, including atomic rollback, exact frozen source after mutable catalog edits,
roles, RLS/grants, immutability, retention, idempotency across later cycles, sequence
1/2 and independent cross-language canonical SHA vectors. Resource-bound, Unicode-required-value, cyclic-outline and invalid-order checks
also pass. Queued competing calls are not
actual concurrent-session evidence. Native PostgreSQL/Docker was unavailable.
Typecheck passed; final unit/build/bundle/hosted results follow separately.

**Zero live Supabase, Replit, deployment, production, domain or DNS changes.** No
live migration application/replay/reset/repair/rollback; no AI, History, Style Guide,
Brand Outputs, PDF/Word or public portal work. No live Auth/RLS/parity certification,
actual multi-session race certification, merge, release acceptance or deployment is
claimed. Keep the PR unmerged for independent product-owner/security acceptance.

### Issue #20 final validation and remaining boundaries

Final focused application regression: **140 passed / 8 files**. A subsequent
exact-review recovery/read-only renderer/backend-contract check passed **72 tests /
3 files**, including exact request/review scoping and retained approval-sequence assertions. The complete
prepared-Windows unit run finished **1101 passed, 4 failed, 54 setup-blocked/skipped /
1159**, 57 passed files / 3 failed files. Failures are the unchanged symlink EPERM
cases in predeploy-cli/readiness and predeploy-server setup. No skip/timeout/retry
or assertion policy was weakened. An earlier sandboxed run was stopped after the
same setup failures and an obsolete Publish-placeholder assertion; the latter now
asserts the authorized demo-unavailable Publish behavior. Windows full-suite
results predate the final bounded accessibility/read-query follow-up; focused,
browser and hosted checks cover that follow-up separately.

Final four-profile Publish browser run: **36 passed / 36** on installed Chrome,
including frozen defaults, optional-empty warnings, neutral conditions, nested
reusable groups, no mutable catalog/body reads, confirmation/progress/success,
role denial, legacy blocking, request-key recovery, stale/errors, keyboard/focus,
axe and responsive overflow. The earlier combined Publish/Review lifecycle run
passed **60 / 60**. The intervening expanded Publish run was **31 passed, 5 failed**:
four duplicate reusable landmark labels were corrected to accessible groups; one
closed navigation tooltip contrast failure was corrected by honoring reduced
motion on the shared tooltip. Existing colors/geometry and normal-motion styling
are preserved. No assertions/timeouts/skips were weakened to obtain the final pass.

Final workspace typecheck, both demo production builds and strengthened bundle
guard passed. Initial JS **740804 / 975000 bytes**; Publish and its read-only
inspector now have explicit lazy-boundary assertions alongside existing Author,
editor, management and Review guards. Existing non-failing sourcemap/chunk notices
remain. The incidental sandbox generated-file line-ending rewrite was restored.
Git whitespace and accepted historical-source integrity checks pass.

Disposable PGlite final **75 assertions** include all source migration compilation,
explicit Project Admin publication, inherited Workspace Admin and other-role denial,
current Author/Reviewer/Viewer historical reads, current-access revocation/outsider
and anon denial, immutable rows, retained parents, rollback, frozen closure after
catalog edits, required/optional semantics, malformed/legacy/future packages,
cycles/outline/resource limits, canonical SHA vectors, later-cycle sequences and
old-request idempotency. Queued competing requests are explicitly not multi-session
race evidence; no native PostgreSQL/Docker runtime was available to this session.

Hosted quality on `8f99af6aa4c00acd2575910ee2255ae364b1877e` passed both
[unit-type-build and migration-integrity](https://github.com/Gypsysystems/Spextar-Studio/actions/runs/40982516563).
Earlier hosted runs stopped at two newly added test-fixture typing/syntax errors;
both were corrected. The final accessibility/recovery follow-up is checked on the
current [unmerged draft PR #23](https://github.com/Gypsysystems/Spextar-Studio/pull/23);
its live checks and PR description retain final-head evidence. Hosted results are
independent Linux CI, not Codex-local execution.

Known limits: v1/default/neutral/internal inspection only; pending request UI is
mounted-screen state (server uniqueness still prevents duplicate publication after
reload); eager verification of paginated complete histories can be expensive.
Actual multi-session races, live Supabase Auth/RLS/schema parity, external product
UAT and migration rollout remain separate gates. Zero live Supabase/Replit,
deployment/production/domain/DNS changes; no merge or product acceptance is claimed.

### Final handoff follow-up

Inspection uses the retained audit review sequence, and Cancel returns focus to
Publish even while an older release is selected. The strengthened cancellation
regression first reproduced the fault in all four profiles, then passed **4 / 4**
after the narrow focus fix. Recovery outside a dialog explicitly focuses its
confirmed status. Final audit-reader/backend-contract/renderer regression:
**72 passed / 3 files**. No source schema/RPC or historical SQL changes follow the
75-assertion disposable verification.

Hosted [quality run 40983908631](https://github.com/Gypsysystems/Spextar-Studio/actions/runs/40983908631)
on `21df6fdf37f9c423dc72f5b5a7cd03326080df5b` passed **60 files / 1160 tests**,
locked install, typecheck, both builds, 740709/975000 bundle guard and migration/
tracked-file integrity. The final inspection/focus follow-up and current-head
checks are retained on PR #23. These are independent hosted Linux results; the
Windows symlink limitations above remain recorded. No live or deployment action.

Executable handoff source: `6fbe11a415003dbe549978f1c89b45832d11e5b6`.
Final four-profile Publish run including strengthened cancellation and immutable
approval numbering: **36 / 36 passed**. Final local typecheck, both production
builds and bundle guard pass at **740804 / 975000 initial JS bytes**. Hosted
[quality run 40992470631](https://github.com/Gypsysystems/Spextar-Studio/actions/runs/40992470631)
passed both required jobs on that source. The subsequent commit records evidence
only; current-head checks remain available on PR #23. All 24 accepted SQL raw Git
blobs, 21 recovered MD5/length pairs and the provenance manifest Git blob remain
unchanged. The PR remains draft and unmerged; no live/deployment changes.

## Issue #24 — pre-rollout Private Beta validation — 2026-10-30

[PR #25](https://github.com/Gypsysystems/Spextar-Studio/pull/25) remains draft and
unmerged. Base is GitHub main `3197174fc3d80ad0e3df1b4d3f653a55ec33a532`;
branch `codex/private-beta-backend-validation`. See the linked validation report
for reproduction and exact operational gates; the UAT matrix is a plan, not
completed product acceptance.

Native portable PostgreSQL 17.11 (x86_64 Windows, msvc-19.44.35229), pgcrypto 1.3,
replayed all 25 unchanged SQL files from empty local clusters with synthetic Auth.
Repeated schema-contract SHA256:
`f5e48af6401fcdfc2dc694ec7292c9758e79edb32b74557e6bb787aee718abe6`.
All 15 inventoried RPC names/argument lists match without overloads. Native release
75 + dependency 55 + additional persona/concurrency 138 assertions passed. The
last native release/matrix run also passed with invalid synthetic PG environment
settings, using only its own loopback cluster. All local PostgreSQL processes
stopped. PGlite compatibility remains 75+55 passed. All 21 recovered lengths/MD5s,
25 raw accepted SQL files and provenance manifest tracked blob remain unchanged.

Distinct backend sessions and observed lock waits cover idempotent retry, competing
publication/numbering, Publish versus New Draft, stale submission, membership
revocation and last-admin demotions. A concurrent catalog commit preserves the
STABLE dependency statement snapshot. Synthetic Auth is not Supabase Auth/JWT,
PostgREST/pooler, live parity or every possible race certification. Accepted
organization/workspace membership can retain reads after project-role revocation;
explicit authoring/publication closes, and full membership revocation closes reads.

Prepared Windows units: 1103 passed, 4 symlink EPERM failures, 54 setup-blocked /
1161. Earlier sandbox run also had two UI timing failures, both passing unchanged
in the complete prepared run. Final inventory regression 55/55 and workspace
typecheck passed. Both demo builds and bundle guard passed, 740804/975000 initial
JS bytes. Existing non-failing sourcemap/chunk notices remain.

Seven controlled browser suites on all four profiles: 212 passed, four failures
in one unsupported Review fixture scenario (21.4m). The fixture incorrectly mixed
unknown content with a non-null frozen package. It now additionally asserts frozen
rejection, then explicitly uses legacy NULL for the original lossless raw-content
assertions; all four profile follow-ups passed (1.1m). No assertions/timeouts/skips/
retries were weakened. No full 216-case rerun is claimed. No application/UI/brand
or migration change; only validation assets/test fixture and evidence corrections.

Hosted quality run 41002756458 on validation commit
`23534acac7b8a0c9717d8d1d1162bae8a2faa654` passed both jobs, 60 files/1161 tests,
locked install, typecheck, both builds, bundle and tracked-file/migration integrity.
Final-head checks are reported on PR #25 and must be distinguished from that run.

Technical recommendation: ready to request a gated staging rollout authorization;
no accepted source/database defect identified. Actual rollout still requires fresh
live ledger/schema/platform parity, backup/change approval, Auth warning resolution
or owner decision, real six-persona/foreign/anon API smoke, backend candidate/session/
origin/bindings checks, and separate deployment/UAT/security/product acceptance.
No live Supabase reads/writes, Auth/secrets/infrastructure changes, Replit action,
deployment, production, domain or DNS change occurred. Do not merge this PR.

## Issue #27 — deterministic RPC conflict transport — 2026-10-31

Accepted base `a307c8afebcfc9310c9de162834842e1a2ec6bc8`; clean separate branch
`codex/fix-rpc-conflict-27`. [Issue #27](https://github.com/Gypsysystems/Spextar-Studio/issues/27)
fixes the PostgREST 14 retry defect blocking [Issue #26](https://github.com/Gypsysystems/Spextar-Studio/issues/26).
See [exact audit, current-doc check, test evidence and rollout plan](RPC_CONFLICT_TRANSPORT.md).
All 25 accepted migration files and provenance manifest remain unchanged. New CLI-generated
`20261030213342_non_retryable_rpc_conflicts.sql` replaces nine deterministic 40001
RAISEs in three current private functions with PT409/HTTP 409; historical superseded
occurrences remain intact. No genuine authored serialization/deadlock handling found.
Adapters add PT409 recognition with legacy compatibility; no retries/fallbacks added.
Native 17.11 clean replay/catalog delta, 16 conflict, 75 release, 55 dependency and
138 persona/concurrency checks pass. Actual PostgREST 14 stale HTTP request returns
409/PT409 in 20 ms, one measured server execution and no evidence/state change.
Security advisor output matches baseline (pgcrypto in public warning only); portable
Windows database lint lacks plpgsql_check. Full validation/CI evidence follows in the report.
No live Supabase, Auth, Replit, deployment/domain/production change, merge or UAT approval.
Issue #26 remains open and rollout/UAT blocked pending independent review and explicit authorization.

Issue #27 local completion: full prepared Windows units 1112 passed / 4 known
symlink EPERM failures / 54 setup-blocked (1170 total); all workspace typechecks,
both production builds and 740820/975000 bundle guard pass. Review/Publishing
controlled browsers pass 64/64 across all four profiles. No UI/brand changes.
Final hosted checks/head are retained on unmerged PR #28; technical evidence is
separate from independent product-owner acceptance and live rollout authorization.

Issue #29 accessibility-fix checkpoint completion: retained focused units pass 38/38; controlled Author/Review/Publish regressions pass 12/12 across desktop 1440/1280 and mobile 390 dark/light, including named groups, selected-number computed contrast >=4.5, axe and overflow. Workspace typechecks and both backend-configured production builds pass; initial bundle 964,965/975,000 bytes with lazy boundaries retained. These pre-stop results were inspected and reused because the tested source is unchanged; no duplicate expensive run or live backend certification was performed. Full hosted CI is required on the fix PR. Existing build warnings remain; full live runtime/network and remaining manual acceptance stay incomplete. The resumed checkout was already dirty on the fix branch at accepted-main HEAD; existing changes/evidence were preserved and reviewed, rather than claiming a clean initial working tree.
