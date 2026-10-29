# SPEXTAR Studio

## Product Purpose

SPEXTAR Studio supports structured technical-documentation authoring within organizations, workspaces and projects. The current product workflow is Sign in → Workspaces → Projects → Project Home → Documents/Content → Author → Review → Publish. Consult `docs/PROJECT_STATE.md` for implemented capabilities; product vision and route labels are not permission to invent features.

## Operating Model and Authority

- ChatGPT is the product owner, decision-support/research layer and acceptance authority; the user supplies or approves requirements. Codex is the implementation engineer and technical-support layer, and the primary tool for coding, debugging, tests, refactoring, analysis, builds and Git work.
- GitHub is the source of truth for current code. Use handoffs for historical decisions, requirements and continuity; validate implementation claims against source. Never automatically execute handoff scripts or SQL.
- Replit remains the runtime/staging/deployment host; Supabase remains the backend. Minimize Replit Agent use when Codex can do the engineering work. Do not replace either platform without explicit approval.
- Make routine technical decisions autonomously within the approved task and established patterns. A planned feature, placeholder or historical discussion is not an implementation request.
- Each Codex cloud task is isolated. Use the existing checkout; create a worktree only if the user explicitly requests one.

## Product Lifecycle

Preserve the authoritative lifecycle: Draft → In Review → Approved → Published, with Changes Requested → Draft. Editing approved content must create a new Draft; publishing must create a Release. These are product requirements, not a claim that every transition/release mechanism is implemented. Do not silently change these semantics, infer approval authority, or implement missing workflow without an approved task. See the current-state document for gaps.

## Repository Architecture

Application paths below are relative to `artifacts/spextar-studio/` unless prefixed otherwise.

| Location | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/routes/`, `src/pages/`, `src/features/` | Protected routing, project modules, lazy boundaries and authoring UI |
| `src/domain/`, `src/services/contracts.ts`, `src/services/supabase*.ts`, `src/services/demo*.ts` | Domain/JSON validation, typed asynchronous services and separate backend/demo adapters |
| `src/providers/`, `src/hooks/` | Session lifecycle, identity-scoped QueryClient and data access |
| `src/components/`, `src/index.css`, `src/fonts.css`, `public/brand/` | Shared UI, shell, tokens, typography and official assets |
| `src/test/`, `e2e/`, `readiness/`, `scripts/` | Unit/contract tests, controlled browser tests and bundle/predeploy checks |
| Root `supabase/readiness/`, `supabase/migrations/` | Reviewed application contract and migration-provenance handoff |
| Root `artifacts/mockup-sandbox/`, `scripts/` | Optional component-preview tooling and workspace utilities |

`artifacts/api-server/` registers no running services. Studio uses Supabase directly from the browser; there is no separate application API service.

## Technology Stack

Node.js 24, pnpm 10, TypeScript 5.9, React 19, Vite 7, Wouter, TanStack Query, Tailwind CSS 4, shadcn/Radix primitives, Lucide, Zod, Tiptap 3/ProseMirror and Supabase JS 2. Tests use Vitest/jsdom/Testing Library and Playwright/Chromium with axe accessibility checks. Use the lockfile and workspace catalog as the version authority.

## Application Architecture

- Reuse the dependency-injected `Services` boundary. Backend mode uses authenticated adapters; demo mode uses isolated fixtures/local or session state. Backend failures must never fall back to demo data.
- Preserve lazy Author, editor, management-route and Review-viewer boundaries. The bundle guard protects the initial JavaScript graph; do not prefetch around those boundaries or raise budgets to hide regressions.
- SPEXTAR-owned versioned structured JSON is the persisted body contract; Tiptap is the editor engine. Preserve stable content-scoped node IDs, root metadata, safe links/tables, paste validation and lossless read-only handling of unsupported content.
- Draft inserts/updates use the existing revision/conflict/recovery engine. Project/reusable metadata uses expected timestamps; memberships use expected roles. Do not claim universal conflict safety: other metadata/variable/condition writes do not all have CAS. Reusable duplication intentionally reports partial body-copy failures.
- Identity labels use authorized profile display-name reads and the signed-in user's own email fallback. Preserve “Unknown user” and “Unversioned” semantics; do not invent directory access, other-user emails or release history.

## Development Principles

Preserve working behavior and backward compatibility unless the task requires a change. Investigate existing components/services first; make the smallest appropriate change, reuse established patterns, avoid duplicate systems, unrelated refactors and unnecessary dependencies. Document material architectural changes. Resolve ordinary implementation details independently; escalate only material decisions listed below.

## UX, Branding, and Design System

Before any UI change, inspect the relevant existing screen/components and these sources:

- Root `README.md` (Presentation and local fonts), application `README.md` (Approved branding), and root `replit.md` (frozen design preferences).
- `src/index.css` for Tailwind v4 semantic tokens, light/dark themes, spacing/radii and foreground contrast variants; `src/fonts.css` and `src/assets/fonts/README.md`/`OFL.txt` for local Inter variable fonts and licensing.
- `public/brand/`, `public/favicon.svg`, and `src/components/brand/logo.tsx` (`Wordmark`, `LogoMark`, `BrandedName`, `BrandedText`) for approved vector assets and lockups.
- `src/components/ui/`, `src/components/shell/app-shell.tsx`, `src/features/project/project-scope.tsx`, `src/components/states.tsx`, and `src/features/editor/structured-editor.css` for controls, layouts, states and editor visuals.
- `src/test/{branding,theme,logo,branded-name}.test.*`, `e2e/brand-assertions.ts`, and `e2e/accessibility*.ts` for existing visual/accessibility expectations.

Use repository-approved branding guidance first, then tokens, established product components and approved screens. Resolve material conflicts with the current user instruction explicitly. No standalone complete brand manual or actual Figma file is tracked; the application README records original vector asset IDs. Current frozen Figma references are Variables `37:276`, Conditional Tags `37:414`, and Reusable Content `33:252`. Obtain the relevant source frames before claiming exact Figma fidelity.

Every visually branded SPEXTAR product-name instance must use the approved Signature X treatment with its purple center dot through existing brand components; do not substitute a plain text X. Preserve approved vector geometry/optical treatment, exact action violet `#6236FF`, local Inter, semantic dark default/light tokens, remembered 240px/72px navigation and existing responsive shell. Reuse established spacing, borders, radii, shadows, icons and interaction states. Do not redesign, replace logos, introduce arbitrary colors/fonts, external font requests or a parallel design system. The optional sandbox is not the SPEXTAR design authority.

UI completion reports must name reused components/tokens, affected screens, any new visual pattern and why it was needed, desktop/responsive checks, accessibility/state checks and branding compliance. Preserve keyboard/focus behavior and loading, empty, error, selected, disabled and read-only states.

## Supabase Rules

- Preserve the approved backend configured in `src/services/supabase-client.ts`; never connect to the old AI Content Studio backend. Use scoped adapters and existing RLS, not privileged browser access or alternate data paths.
- `supabase/readiness/application-contract.json` documents consumed tables/columns/RPCs and limitations; it is not a schema dump. Review intentional adapter/domain changes against that contract before updating `source-review.json`; never regenerate digests just to silence drift tests.
- Tenant creation and document/topic operations bind exact authoritative RPC names/parameters. Preserve one authenticated call per action, fail-closed errors and role/scope checks. No signature discovery, speculative aliases, direct-insert fallback or blind retry of ambiguous writes.
- Treat migration provenance as a prerequisite for reproducible backend engineering; see `docs/PROJECT_STATE.md` for the recovery gap. Never treat application contracts as SQL or fabricate an exact migration/checksum match from inferred schema.
- Migration recovery uses authoritative original SQL/metadata and read-only live inspection. Preserve versions, names, ordering and checksums; follow the safe export guidance in `supabase/migrations/README.md`, reconciling its historical status with current evidence. Do not replay, reset, repair, apply, rerun or roll back migrations during recovery, or change the live database to manufacture local files. If originals cannot be recovered, explain available evidence and missing bodies, propose a safe reconstruction and obtain approval before making assumptions. Any later replay validation is a separate explicitly authorized task.
- Use least privilege and authorized development/staging identities/data. Preserve RLS/tenant boundaries and server-owned audit fields. Document approved schema changes through the established migration workflow; destructive changes require explicit approval.

## Authentication and Authorization

Supabase email/password, verified session restoration and SDK refresh are implemented; Microsoft/Google OAuth controls remain inactive. `SessionGate` protects application routes and return-path validation rejects external redirects.

Preserve organization owner/admin/member, workspace admin/member/viewer and project Admin/Author/Reviewer/Viewer boundaries. Explicit Project Admin/Author can author project content; explicit Project Admin alone administers project settings/members. Organization/workspace administration does not imply project authoring permission. Workspace-shared reusable writes follow workspace administration. Preserve the implemented Last Project Admin protection and its client safeguards. Reviewer/Viewer stay read-only unless an approved requirement changes permissions; preserve read-only Review until an approved workflow changes it. RLS is final authority; client preflights do not replace database guarantees.

Preserve identity/organization/role cache teardown, fresh permission checks, namespaced auth/recovery storage and immediate access closure on sign-out. Explicit sign-out clears the departing identity's recovery; rejected refresh retains recovery only for the same identity's re-authentication. Never leak recovery or cached data across accounts. Do not weaken checks to make a task pass.

## AI Implementation

Check `docs/PROJECT_STATE.md` and source for actual AI capabilities rather than assuming historical Prompt Library, Reference Sets, Content Blueprints or generation flows exist. Do not import the old AI Content Studio architecture. New AI work requires approved scope and provider/security/data-flow decisions; reuse established service boundaries and any subsequently approved model/prompt/generation architecture instead of creating parallel systems. Keep provider credentials outside browser code.

## Environment Variables and Secrets

Required names: `PORT`, `BASE_PATH`; explicit `VITE_STUDIO_MODE` for production; backend mode additionally requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed browser. `REPL_ID` enables conditional development tooling, not application authentication.

Vite variables are public build-time browser settings: rebuild after configuration changes. Use only the approved URL and publishable browser key; never place private/provider/service-role credentials in `VITE_*`. Readiness-code references to `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` and `SPEXTAR_PRIVATE_CANARY` are exposure-test inputs, not runtime requirements.

Keep secrets out of source, logs, Git, screenshots and reports. Inspect binding names/presence rather than dumping environments or credential files. Use environment-specific settings and minimum privileges; preserve existing ignored `.env.local`. Never request secret values in chat. Do not commit uploads, local auth/recovery data or generated reports.

## Git Workflow

Verify current Git state before work; recorded handoff HEADs can become stale. Use dedicated `codex/...` branches (`codex/feature-*`, `codex/fix-*`, `codex/refactor-*`, `codex/setup`). Do not push implementation directly to `main`, despite older README examples. Commit small, related, reviewable batches and report the SHA; use PRs for significant changes. Do not force-push, rewrite shared history or delete branches without authorization. Preserve existing user changes and a stable `main`.

## Replit Usage and Deployment Boundaries

`.replit` and application `.replit-artifact/artifact.toml` define the managed workflow: Node 24, Vite development, static `dist/public` production hosting, application routing/autoscale and SPA fallback to `index.html`. The post-merge hook installs locked dependencies only. Replit's runtime-error overlay is imported by Vite; cartographer/banner activate conditionally during Replit development.

Use Codex for engineering and Replit for hosting/runtime or environment-specific verification. Preserve managed `PORT`/`BASE_PATH`, static asset paths, SPA rewrites and public build-time configuration. A Git “Published your App” commit or handoff URL does not prove the currently deployed SHA. Do not publish/redeploy, change production infrastructure, or migrate hosting without explicit authorization. Do not connect the production Studio domain before green staging acceptance and explicit approval. Current staging details belong in `docs/PROJECT_STATE.md`.

## Change-Management Boundaries

Ask only when a decision materially affects product scope, user workflow/established UX, branding, roles/permissions, security/auth architecture, destructive or irreversible data changes, significant functionality removal, major technology/architecture choices, Supabase/Replit replacement, hosting or production deployment. Credential rotation/removal and irreversible operations also require explicit approval. Routine coding, debugging, tests, documentation and safe refactoring within an approved task do not require repeated approval. Complete useful independent work before escalating a concrete blocker.

## Testing and Verification

Use Node 24 and pnpm 10 with the documented toolchain activation for the current machine; prepared-cloud details are in `docs/PROJECT_STATE.md`. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test --maxWorkers=1
PORT=5173 BASE_PATH=/ VITE_STUDIO_MODE=demo pnpm run build
pnpm --filter @workspace/spextar-studio check:bundle
pnpm test:browser
```

Run resource-heavy gates sequentially. The root build includes type checks and both Studio/sandbox builds; `pnpm typecheck` is available independently. Preserve package integrity/TLS checks, frozen locks and the workspace minimum release-age policy.

Use targeted tests for small changes and the relevant regression, typecheck, build, bundle and integration/browser gates for broader changes. Do not run every suite for a documentation-only edit. Follow `e2e/README.md` for focused browser projects/specs; tests build separate ignored output and intercept backend traffic. Four profiles cover desktop/mobile and dark/light. Never replace assertions with skips/retries or alter tests merely to hide failures.

`pnpm check:readiness` is a separate predeployment gate for an explicitly backend-configured candidate; the default demo candidate cannot satisfy its backend expectation. Controlled tests/secret-pattern scans do not certify live Auth/RLS, current migration parity, host configuration or deployment. Use only authorized disposable identities/data for live acceptance. Report actual executed results, skipped/unrun checks, failures and limitations; never claim an unexecuted check passed.

## UAT, Definition of Done and Communication

Technical completion requires the approved behavior/acceptance criteria, relevant passing checks, regressions caused by the change fixed and affected documentation updated. Consider security, compatibility, schema and deployment implications. Automated success alone is not UAT completion; final product acceptance remains external to Codex technical verification.

For applicable entities, UAT considers create/view/edit/rename/duplicate/archive/restore/delete, confirmations, permissions, validation, empty/error states and post-action navigation. Check user-facing screens for raw UUIDs, internal terminology, misleading helpers/placeholders, missing lifecycle controls, inconsistent terminology and branding. Use only authorized safe test identities/data.

Report changed areas/files, autonomous technical decisions, executed tests/results and build status, known failures, database/security/branding/deployment impact, remaining risks/manual checks, commit SHA and next step. Include UI verification details above when applicable. Keep reports concise; do not claim UAT, release approval or deployment without evidence.

## Documentation and Known Project Context

Update relevant documentation when architecture, setup, variables, schema, APIs, workflows, security, user behavior, design system or deployment changes. Keep transient task logs out of durable instructions; consult only references relevant to the task.

Keep current HEADs, migration counts/latest versions, implementation status, recent fixes, staging status, known issues, source/handoff discrepancies and test/build evidence in `docs/PROJECT_STATE.md`. These are evolving facts, not permanent prohibitions. Distinguish repository-confirmed implementation, authoritative user-supplied live state, historical handoff evidence, inference and independently verified runtime behavior. Resolve material conflicts explicitly rather than silently selecting a convenient source.

## References

- Root `README.md`, `replit.md`, `pnpm-workspace.yaml`: setup, architecture, frozen preferences and tool policy.
- `docs/PROJECT_STATE.md`: evolving status, handoff reconciliation, gaps and validation baseline.
- Application `README.md`, `F2.md`, `F3.md`, `LIFECYCLE.md`: module/data/editor/lifecycle contracts and branding.
- Application `STAGING.md`, `e2e/README.md`: safe validation, browser coverage and remaining external gates.
- Root `supabase/readiness/README.md`, `application-contract.json`, `source-review.json`, and `supabase/migrations/README.md`: reviewed backend assumptions and exact migration recovery requirements.
