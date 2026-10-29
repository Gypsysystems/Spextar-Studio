# SPEXTAR Studio — Current Engineering State

Recorded: 2026-10-29. Refresh this document when code, backend provenance, staging or validation changes. Durable operating rules live in root `AGENTS.md`.

## Evidence and authority

- Repository inspected: `Gypsysystems/Spextar-Studio`, GitHub `main` at `cbe5b4dce31e5b03da5acbad489bb4609f3e41bd` (`Fix readable user identities and unversioned document labels`). The remote SHA was checked during onboarding; verify it again before future work.
- Onboarding documentation is prepared on `codex/setup`, based on that commit. No application functionality, dependency declarations, lockfiles, database state or deployment was changed.
- User-provided `SPEXTAR_Codex_Onboarding_Handoff_v2.md` governs onboarding. The later authoritative current-state addendum governs product lifecycle, operating/acceptance roles, migration recovery, staging restrictions and confirmed live state. It updates the earlier ZIP where stated.
- Source inspection and executed checks establish code/technical behavior. User-confirmed live state is accepted as handoff authority but was not independently re-audited against Supabase/Replit in this session. Historical reports and synthetic tests are labeled separately below.

## Handoff inventory and continuity

`SPEXTAR_Codex_Handoff.zip` contains exactly three files; no source tree, design pack or runnable application is included:

| Member | Content and use |
| --- | --- |
| `CODEX_HANDOFF.md` | Repository checkpoint, product gaps, recent branding/RPC/lifecycle work, reported live UAT/security findings and prior staging status |
| `supabase_migration_manifest.csv` | 21 unique ordered migration identities, stored-statement counts and MD5 metadata, reported exported from the live ledger |
| `20261028234310_align_authenticated_content_write_grants.sql` | Exact supplied latest SQL, granting authenticated INSERT/UPDATE on the six content/draft tables |

The latest SQL's exact-byte MD5 matches its manifest entry (`fa15d85d89ac2782b815ee55d5a628e4`). This proves internal bundle consistency, not current live parity. The prior 20 original SQL bodies are absent. The ZIP was inventoried/read without executing its SQL or scripts, and was not copied into Git.

Incorporated context: current implemented areas and pending references/workflows, exact migration-recovery constraints, reported rollback-based database UAT, brand continuity, merged identity/version presentation, and the Codex/GitHub/Replit/Supabase operating split. The addendum confirms the current handoff checkpoint and separates technical testing from product acceptance.

## Architecture and technology

Paths beginning `src/` or `public/`, and the application README, are relative to `artifacts/spextar-studio/`.

Studio is a browser React/TypeScript SPA under `artifacts/spextar-studio/`. `src/App.tsx`/`src/routes/` provide Wouter routing and lazy boundaries. `ServicesProvider` injects typed asynchronous `Services`; `src/services/supabase*.ts` and `demo*.ts` implement separate adapters. `SessionProvider` owns authentication outside identity-scoped TanStack Query caches. Supabase is accessed directly; `artifacts/api-server` registers no services.

Stack: Node 24, pnpm 10, TypeScript 5.9, React 19.1, Vite 7, Wouter, TanStack Query, Tailwind 4, shadcn/Radix, Lucide, Zod, Tiptap 3/ProseMirror, Supabase JS 2; Vitest/jsdom/Testing Library and Playwright/Chromium/axe. The lockfile/workspace catalog controls exact versions. `artifacts/mockup-sandbox` is optional component-preview tooling; root `scripts` contains workspace utilities.

Tenant hierarchy: organization → workspace → project → document → topic. The reviewed backend contract consumes profiles, organizations/memberships, workspaces/memberships, projects/memberships, documents, topics, topic drafts, variables, condition categories/values, reusable metadata and reusable drafts (15 tables). See `supabase/readiness/application-contract.json`; it is an application expectation, not authoritative SQL.

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

Supporting evidence: `src/App.tsx` and `src/features/project/sections.ts` contain no corresponding routes or placeholders; planned Style Guide checks explicitly say non-AI. The 15 tables in `supabase/readiness/application-contract.json` contain no corresponding AI/prompt models, and local migration source contains only a README. Manifests/lockfile contain no AI-provider/model-framework integration dependencies; runtime configuration selects demo/backend without an AI flag. No matching dormant implementation or tracked archive/legacy tree was found. A `generation` counter in `supabase-adapter.ts` cancels superseded authentication work; sample “reference settings” in `src/fixtures/demo-data.ts` describes spectrometer methods. Neither is AI functionality, and reusable content/output preview is not a prompt system.

The named capabilities appear in supplied `SPEXTAR_Codex_Onboarding_Handoff_v2.md` (product narrative around lines 53, 82–87 and AI guidance around 460–469), not in the ZIP's three files or the authoritative current-state addendum. Thus they are absent from the current implementation, including partial/UI-only forms; they are not merely hidden behind a flag. This conclusion is scoped to the inspected repository and supplied materials, not an assertion about another project or undocumented live database objects. No capability was created.

## Implementation status

These are source-confirmed capabilities, not a declaration of final UAT completion.

| Area | Current implementation |
| --- | --- |
| Organizations/workspaces/projects | Creation, navigation and lifecycle controls; scoped administration and archive/delete safeguards |
| Documents/topics | Metadata, hierarchy/order, creation, duplication, move/promote/demote and conservative deletion |
| Author | Structured editing, semantic callouts, advanced tables, find/replace, validated paste, heading navigation, revision saves/conflicts/recovery |
| Variables | Text definitions, output overrides, validation and read-only output preview; insertion/references are incomplete |
| Conditional tags | Category/value definitions; authored-content assignment/evaluation is incomplete |
| Reusable content | Scoped metadata and structured drafts, duplication and future update-policy intent; linked insertion/propagation/where-used are incomplete |
| Project settings | Explicit Project Admin metadata/member administration, archive/restore and lifecycle controls |
| Review | Read-only inspection of saved in-review content; submit/assign/comments/approve/request-changes workflow is incomplete |
| Publish/releases/history | Publish/History routes are placeholders; no completed release execution or immutable historical-version subsystem |
| Style Guide / Brand & Outputs | Placeholder routes; existing output-preview IDs do not define publishing/templates |
| Reference Safety & Cross-References | Pending |
| Identity/version presentation | Human-readable owners/creators/saved-by/member labels; “Unknown user” fallback and consistent “Unversioned” presentation; no invented release |

### Authoritative lifecycle versus implemented workflow

The addendum defines Draft → In Review → Approved → Published and Changes Requested → Draft. Editing approved content must create a new Draft; publishing must create a Release.

The source currently models four document statuses (`draft`, `in-review`, `approved`, `published`), with `in_review` in backend storage. It does not model Changes Requested or a Release entity/workflow. `supabase-topic-drafts.ts` updates the topic's current revision after role/scope checks; that path does not inspect approval status or create a separate approved-content Draft. A complete automatic fork-on-approved-edit mechanism was not found. Missing live SQL prevents any claim about additional database enforcement. These are implementation/verification gaps against the authoritative product rules, not permission to change the rules or implement them during onboarding.

## Supabase, authentication and security

The approved live backend is project `luyyxblmtupmugtazgbr`, region `ap-south-1`, as confirmed by the user. Email/password, verified session restoration, SDK refresh and protected routes are implemented; Microsoft/Google controls are inactive. Profile-label lookup reads only authorized `profiles.id,display_name`, not a user directory or admin Auth API. Only the signed-in user's existing email is a fallback.

Explicit Project Admin/Author may author; Reviewer/Viewer are read-only. Explicit Project Admin administers settings/members. Inherited organization/workspace administration does not grant project authoring; workspace-shared reusable writes use workspace administration. Preserve identity/cache teardown, isolated demo/backend storage, safe return URLs, content/link/paste validation and namespaced recovery. Explicit logout clears departing-user recovery; rejected refresh can retain it for the same identity's re-authentication.

**Authoritative user-confirmed state at handoff:** Last Project Admin protection is implemented; the authenticated grant/RLS mismatch was fixed and the audit was clean. The ZIP additionally reports authenticated rollback-based database UAT across tenant/document/topic/draft/variable/condition/reusable operations and Author/Reviewer/Viewer boundaries. Those results are distinct from this session's offline tests; no live SQL or database mutations were performed here.

**Verified current security warning — leaked-password protection:** The live Supabase security advisor independently reported `Leaked Password Protection Disabled` on 2026-10-29, as confirmed in the [product-owner review on PR #1](https://github.com/Gypsysystems/Spextar-Studio/pull/1#issuecomment-6485446888). This is a verified current warning and remains an open security follow-up. No Auth configuration was queried or changed during this documentation correction.

**Other security considerations:** Browser session tokens and local recovery content are sensitive; preserve account isolation and avoid logging/storage exports. Missing original migrations block independent review/replay of exact RLS/grants, security-definer/search-path details, triggers, constraints and foreign-key behavior. Client preflights alone do not prove transaction guarantees. No full manual UAT or current live multi-account audit was performed here.

### Migration recovery is the first housekeeping priority

User-confirmed handoff ledger: **21 migrations**, latest `20261028234310_align_authenticated_content_write_grants`. Git still contains only `supabase/migrations/README.md`, with a stale reported count of 18 and nine partial identities. The latest exact SQL is in the upload, not committed; the prior 20 exact bodies still need an authoritative export/original source.

After separate task approval, obtain original ordered SQL and compare identities, versions, names, ordering and available checksums before committing exact files. Live access must remain read-only. Do not replay, reset, repair, apply, rerun or roll back migrations, change the live database, weaken RLS or perform destructive SQL. If originals cannot be recovered, document available evidence and missing bodies, propose a safe reconstruction method, and wait for approval before making assumptions. Do not fabricate checksum equivalence. This task was recommended, not begun.

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
| Migration docs report 18 / partial identities | User confirms 21; ZIP has 21 metadata entries and only the latest SQL; source-control gap remains |
| Older docs leave last-admin protection/grant fixes unresolved | Addendum confirms protection implemented and clean audit at handoff; preserve controls, do not confuse historical documentation with current authority |
| ZIP's staging build predates the latest UI work | Addendum confirms GitHub/Replit synchronized at `cbe5b4d`; current running deployment not independently checked here |
| Old README slice prose says full member IDs/no project deletion | Current identity presentation and lifecycle code supersede those descriptions; documentation reconciliation remains follow-up work |
| Product lifecycle requires new Draft on approved edit and Release on publish | Complete workflow/fork/release implementation is absent from source; authoritative requirements remain unchanged |

## Technical baseline

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

The final integrity pass changed documentation only. It rechecked the AI classifications, warning provenance, credential patterns, operating/approval guardrails and commit file scope. Application tests/builds were not rerun because executable inputs were unchanged; the successful baseline above remains applicable. Migration recovery, live database/Auth changes, staging changes and deployment were not performed.

## Next step and unresolved matters

Recommend approving a small **Supabase migration source-control recovery** task first, using the read-only/exact-provenance restrictions above. Do not start feature development or database recovery until that task is approved.

No product decision blocks completion of this documentation-only onboarding. Future work needs authoritative access to the missing SQL, external UAT/release acceptance, relevant missing design frames when fidelity is required, and explicit approval for any lifecycle/AI/hosting/production work. Do not replace these decisions with assumptions or treat incomplete modules as permanent prohibitions.
