# SPEXTAR Studio

A non-AI structured authoring and technical documentation platform with F0/F1 and F2 Supabase adapters and isolated local demo mode.

## Run & Operate

- `pnpm --filter @workspace/spextar-studio run dev` — run Studio through its managed workflow, which supplies `PORT` and `BASE_PATH`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm test` — run all workspace test suites
- SPEXTAR Studio connects directly to its approved Supabase project in backend mode. Demo mode runs without a backend.
- The optional `artifacts/mockup-sandbox: Component Preview Server` workflow supports Canvas/component previews independently of Studio.
- Post-merge setup installs frozen-lockfile dependencies only. It never pushes database schema changes.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Application: React 19, React Query, Wouter
- Backend: direct Supabase browser client behind Studio service contracts
- Build: Vite, Tailwind CSS
- Tests: Vitest, React Testing Library

## Where things live

- `artifacts/spextar-studio` — application source, tests, environment template and local brand assets.
- `artifacts/mockup-sandbox` — optional design/component-preview tooling.
- `scripts` — utility package and dependency-only post-merge hook.
- `tsconfig.base.json` — shared strict TypeScript defaults; each retained package owns its typecheck configuration.

## Architecture decisions

- Keep demo and Supabase services isolated behind the same UI-facing contracts.
- Demo entry is not real authentication. Do not store or validate passwords locally.
- This is a new product foundation, not a reuse of the old AI Content Studio architecture.

## Product

Workspaces → Projects → Project Home and a document-aware project shell. F0/F1 includes route-ready authoring, review, publishing, reusable content, variables/conditions, style, history, settings, and brand/output views.
F2 persists document/topic metadata and tree operations, not topic body/content. Body editing is explicitly session-only until F3. Only explicit project admin/author memberships enable F2 mutations; inherited workspace administration must not elevate a reviewer/viewer.

## User preferences

- No AI generation features.
- Follow the frozen SPEXTAR Studio Authoring Core V1 design; obtain the actual Figma source before claiming exact visual fidelity.
- SPEXTAR Violet is #6236FF. Dark left navigation is 240px expanded and 72px collapsed, with a remembered preference.
- Studio defaults to semantic dark mode; retain the light semantic theme for future preference support. Use local, licensed Inter for all product and authoring UI, never a serif editor or external font requests.
- Use Create project, Import project, Documents, Topics, Promote, Demote, Author, Review, Publish.
- Do not publish until the user asks.
- “SPEXTAR is finalized.” Preserve the frozen Figma IA and route structure; do not redesign or invent product areas.
- Use only the supplied frozen Figma wordmark/Signature X vectors; never recreate SPEXTAR as text or a generic icon. Studio is an inline right-hand suffix, not stacked.
- Do not connect to or reuse the old AI Content Studio Supabase project.
- Proceed independently until user input is genuinely needed.
- Preserve the existing Supabase schema and security policies. Use the database's atomic resource-plus-membership operations; never replace them with separate client inserts or weaker grants.
- “We will maintain our project on GitHub and update it regularly.” Use https://github.com/Gypsysystems/Spextar-Studio.git for source control; review outgoing changes and exclude private credentials and machine-local/generated files.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See `README.md` and `artifacts/spextar-studio/README.md` for development, validation and service contracts.
