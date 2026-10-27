# Controlled production-browser regression suite

Run from the repository root:

```sh
pnpm install --frozen-lockfile
# First run on a machine without a managed Chromium:
pnpm --filter @workspace/spextar-studio exec playwright install chromium
pnpm test:browser
```

Replit's managed Chromium is detected automatically. Other environments default to
Playwright's installed Chromium; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select a
local compatible executable. No Supabase login, environment file, real user,
service-role key, or other credential is needed.

For one project/spec or interactive debugging:

```sh
pnpm --filter @workspace/spextar-studio test:browser --project=desktop-dark
pnpm --filter @workspace/spextar-studio test:browser e2e/author-persistence.spec.ts --headed
```

## Build and safety boundary

- Playwright builds production-mode Studio into the **separate ignored**
  `generated-artifacts/browser-regression/app` directory. It does not replace the
  normal Studio distribution or change the development workflow/configuration.
- The runner supplies explicit backend mode, the existing approved URL and an
  intentionally non-functional synthetic publishable-key-shaped value. The
  fixture rejects any non-synthetic API key without printing its value.
- Only the fixed loopback server `127.0.0.1:4181` can pass through the route guard.
  All Supabase Auth/table requests are intercepted; unknown endpoints, external
  hosts and unexpected writes fail the test and never fall through to the network.
  Service workers are blocked. Do not replace the base URL with a live host.
- Draft writes are wire doubles for the existing insert/revision-filtered update
  contract. They model server revision responses and deliberate conflict/error
  cases, **not** a new database contract or an RLS implementation.
- Each test receives a fresh browser context, synthetic session and mutable
  backend fixture. No shared stored login, real credentials, production users or
  production writes are used. Context teardown clears browser storage.
- The real compiled UI performs sign-in, navigation, editing, query caching,
  recovery and sign-out. No test-only application adapter or Auth bypass ships.

## Coverage

Four Chromium projects exercise desktop dark (1440 px), desktop light (1280 px),
mobile dark and mobile light (390 px, touch-enabled). Mobile interactions use
native actionability-checked taps and visible controls, not injected DOM clicks.

- Protected deep-link login, credential errors, restored sessions, offline
  sign-out, identity-scoped recovery/cache teardown and a second synthetic login.
- Workspace/project navigation, breadcrumbs, collapsed-navigation persistence,
  mobile drawers, direct route refreshes, semantic themes and approved vectors.
- Explicit Admin/Author, Reviewer/Viewer and inherited workspace-admin controls;
  Project Settings remains admin-only.
- Structured Author autosave, first insert, expected-revision updates, preserved
  metadata/node IDs, stale-write rejection, explicit retry/reload, recovery
  restore/discard and read-only body behavior.
- Review ordered hierarchy, saved revisions, missing drafts, no eligible
  documents, errors/retry, verbatim unsupported JSON and zero writes for all roles.
- Variables Output Preview default/override selection with zero mutation calls.
- Loading, scoped data errors/retry, empty backend Projects with unavailable
  import, missing resources and honest unfinished route placeholders.
- Production network boundaries: no initial Author/editor/viewer downloads,
  Review viewer deferred until a draft exists, direct Author load and refresh.
  The separate bundle guard checks the complete initial module graph.

These are controlled browser regressions—not live email-delivery/password
validation, cross-user RLS certification, real multi-browser database races,
visual pixel-diff approval, or a supported-browser matrix beyond Chromium.

## Reports and maintenance

HTML reports, failure screenshots and retained failure traces are written under
`generated-artifacts/browser-regression/`, already excluded by Git and Replit
packaging. Do not commit generated output or stored browser sessions.

```sh
pnpm --filter @workspace/spextar-studio exec playwright show-report ../../generated-artifacts/browser-regression/report
```

Retries are disabled: a failing scenario must be investigated rather than hidden
by a green retry. Assertions wait for settled semantic state; do not add sleeps,
force interactions, skipped role cases, or product behavior solely to satisfy a
test. Contract changes should update the typed fixture explicitly; unknown API
operations must remain fail-closed.

Full local gate:

```sh
pnpm test
pnpm typecheck
PORT=4174 BASE_PATH=/ pnpm build
pnpm --filter @workspace/spextar-studio check:bundle
pnpm test:browser
```

No deployment or GitHub Actions is configured by this suite.
