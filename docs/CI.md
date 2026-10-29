# Pull request quality gates

`.github/workflows/quality.yml` runs on every pull request targeting `main`,
including documentation-only changes, and supports manual dispatch once present
on the default branch. Stable jobs are `unit-type-build` and
`migration-integrity` in workflow `quality`. Superseded runs are cancelled;
timeouts are 20 and 5 minutes respectively. Branch protection is not configured.

The first job installs with Node 24 and pnpm 10.34.9 on Ubuntu 24.04, then runs
the existing typecheck, full unit/contract suite (one worker), demo production
build and bundle guard. Source-contract drift validation is already included in
the unit suite. Installation preserves the lockfile, integrity checks and minimum
release-age policy. A final diff fails if these commands alter tracked files.
PR whitespace checking covers the entire base-to-head patch, not just unstaged
changes. Jobs use read-only contents permission and no repository secrets.

Reproduce from a clean checkout on Linux with Node 24 and pnpm 10.34.9:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test --maxWorkers=1
export PORT=5173 BASE_PATH=/ VITE_STUDIO_MODE=demo
pnpm run build
pnpm --filter @workspace/spextar-studio check:bundle
git diff --check
git diff --exit-code
# After fetching the PR base/head refs:
git diff --check origin/main...HEAD
```

The second job runs the Python block in `quality.yml` directly (no dependency
installation). To reproduce, save that block to a temporary `.py` file and run
`python <file>` from the repository root. It checks unique ordered identities,
filenames, stored-statement counts, UTF-8, byte sizes and MD5s against the recovered
provenance manifest. It never executes SQL or contacts Supabase. Only entries in
that historical manifest are covered; later migrations need separate review and
validation and do not require rewriting the recovered history. Exact bytes require
an LF-preserving checkout; do not normalize historical SQL to fix a failure.

Browser/E2E remains a manual engineering/acceptance gate: the four-profile suite
is broader than the fast checks and has not been established as bounded routine
GitHub CI. Follow the [browser instructions](../artifacts/spextar-studio/e2e/README.md)
for Chromium installation and `pnpm test:browser`, including focused specs.
No optional browser workflow or new test configuration is introduced here.
Backend-candidate `pnpm check:readiness`, live Auth/RLS, migration replay, staging
runtime, accessibility review and manual UAT remain separate authorized checks.
These CI jobs certify none of those and perform no deployment or infrastructure
changes. GitHub account policy/capacity can prevent execution; a workflow file
alone is not evidence of a successful hosted run.
