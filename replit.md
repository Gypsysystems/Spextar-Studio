# SPEXTAR Studio

A non-AI structured authoring and technical documentation platform with an F0/F1 Supabase adapter and isolated local demo mode.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- SPEXTAR Studio connects directly to its approved Supabase project in backend mode; the shared API/database packages are unused starter infrastructure. Demo mode runs without a backend.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Keep demo and Supabase services isolated behind the same UI-facing contracts.
- Demo entry is not real authentication. Do not store or validate passwords locally.
- This is a new product foundation, not a reuse of the old AI Content Studio architecture.

## Product

Workspaces → Projects → Project Home and a document-aware project shell. F0/F1 includes route-ready authoring, review, publishing, reusable content, variables/conditions, style, history, settings, and brand/output views.

## User preferences

- No AI generation features.
- Follow the frozen SPEXTAR Studio Authoring Core V1 design; obtain the actual Figma source before claiming exact visual fidelity.
- SPEXTAR Violet is #6236FF. Dark left navigation is 240px expanded and 72px collapsed, with a remembered preference.
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

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
