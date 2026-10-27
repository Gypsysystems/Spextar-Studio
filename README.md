# SPEXTAR Studio

Professional structured authoring and technical-documentation management.
This repository starts with the **SPEXTAR Studio F0/F1 foundation baseline**.
There are no AI generation features.

## Included in the baseline

- React/TypeScript application, tests, pnpm lockfile and workspace configuration.
- Approved local SPEXTAR vector assets, exact primary violet `#6236FF`, and the
  remembered 240px/72px collapsible navigation.
- Organization → workspaces → projects → documents/topics navigation,
  contextual breadcrumbs and route-ready project areas.
- Supabase email/password authentication, session handling, protected routes,
  membership-aware reads and atomic creation boundaries.
- Strictly isolated browser-local demo mode.

Microsoft and Google sign-in are intentionally inactive. F2 connects document/topic
metadata, hierarchy, ordering and duplication to the existing Supabase tables/RPCs.
Topic body authoring remains session-only until F3. Publishing execution and
document import are not implemented as backend persistence.
Authenticated live creation-function contracts and two-account RLS acceptance
checks still require verification; passing contract tests does not prove those
live database behaviors.

See [the application documentation](artifacts/spextar-studio/README.md) for the
route map, service contracts, approved branding and known integration boundaries.
See [the F2 contract](artifacts/spextar-studio/F2.md) for metadata and body-storage boundaries.

## Development

Use Node.js 24 and pnpm 10.

```sh
pnpm install --frozen-lockfile
cp artifacts/spextar-studio/.env.example artifacts/spextar-studio/.env.local
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/spextar-studio run dev
```

The template defaults to isolated demo mode. For Supabase mode, configure the
approved project URL and its **publishable browser key** in the ignored local
environment file, and set `VITE_STUDIO_MODE=backend`. Replit supplies these public
settings through its environment configuration and supplies `PORT`/`BASE_PATH`
through the existing managed workflow.

Never put a Supabase secret/service-role key, account password, OAuth secret,
private key, or server credential in a `VITE_*` setting. Vite settings are
included in browser bundles. Existing public browser settings in `.replit` are
not server secrets.

## Validation

```sh
pnpm run typecheck
pnpm test
PORT=5173 BASE_PATH=/ pnpm run build
```

The root typecheck covers Studio, the component-preview sandbox, and utility
scripts. The root test command runs every workspace test suite. The build checks
types and builds Studio plus the retained preview tooling. Studio-only commands
are documented in the application README.

Automated tests exercise demo behavior, routing, branding, session/cache cleanup,
Supabase SDK browser-session behavior, tenant-scoped service boundaries, creation
contracts and backend failures. Tests do not need live account credentials.

## Workspace structure

- `artifacts/spextar-studio` — the application, direct Supabase adapters,
  isolated demo services, tests, and approved local brand assets.
- `artifacts/mockup-sandbox` — optional Canvas/component-preview tooling with
  its own managed development service; not a Studio runtime dependency.
- `scripts` — utility scripts and post-merge dependency installation.
- Root configuration — pnpm workspace/lockfile, shared TypeScript defaults,
  validation commands, and Replit configuration.

Studio uses Supabase directly. There is no separate application API server or
automatic database schema push. Post-merge setup installs locked dependencies
only; it does not modify any database.

## Source-control hygiene

Local environment files, private credential files, dependencies, build output,
generated reports, caches, raw uploads and local agent state are ignored.
Environment templates and the app's local `public/brand` assets are tracked.
No database schema or security changes are part of this source-control setup.

For regular updates:

```sh
git pull --ff-only origin main
# Make changes, then run the validation commands above.
git add <reviewed-source-files>
git diff --cached --check
git diff --cached
git commit -m "Describe the SPEXTAR Studio change"
git push origin main
```

Review staged content before every push. Ignore rules do not remove credentials
that were previously committed; if a private credential is ever exposed, revoke
and rotate it immediately.
