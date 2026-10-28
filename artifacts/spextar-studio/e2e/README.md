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
- Documents/Topics: real compiled create dialogs, retained input on server failure,
  metadata/body autosave, move/reorder, Promote/Demote, saved-body duplication and
  blocked dependent-document deletion, confirmed leaf/empty-document deletion,
  and retained confirmation after a denied delete. RPC signature probes and mutation arguments
  are intercepted explicitly; no live procedure executes.
- Variables: invalid-key rejection before a write, create failure/retry, editing
  defaults/output overrides, rename, duplication, search and refreshed selection.
- Conditions: category create failure/retry, metadata and stable-key rename,
  value creation/editing/order, search and refreshed selection.
- Reusable Content: project authoring versus workspace-shared authority,
  create failure/retry, tags, rename, saved structured-body duplication, draft
  error/refresh recovery and a stale-revision conflict with explicit reload/discard.
  Controlled cold editor downloads also protect the lazy editor's post-commit
  mount lifecycle rather than silently accepting its error-boundary fallback.
- Author statistics derive from canonical structured JSON, not legacy metadata:
  loading, marked/container content, edited headings, saved refresh, topic switching,
  missing bodies and unsupported versions. Counts describe the current body,
  including unsaved edits; only non-empty paragraph nodes count as paragraphs.
- Project Settings administration: explicit metadata saves and validation, scoped
  expected-timestamp writes, server-owned audit preservation, cache refresh and
  reload; permission/network failures retain edits; stale reads and read/write
  races require explicit reload/discard rather than overwriting newer values.
- Confirmed archive/restore changes status only; dirty details block the action.
  Existing-workspace-member add, confirmed role changes and confirmed removal
  refresh membership/candidate lists without removing workspace membership.
  Self-demotion/removal stays blocked; revoked administration is checked again
  before a write. Organization ownership/workspace administration do not elevate
  Author, Reviewer, Viewer or inherited-only project access.
- Settings read failures retry explicitly and foreign workspace rows fail closed.
  The Settings wire model is opt-in; independent unit tests protect its allowed
  tables, fields, scope filters, expected role/timestamp guards and denied writes.
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
In particular, Settings wire responses do not establish an atomic last-admin
database invariant or exercise real user membership changes.

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

Management responses are opt-in in `management-wire.ts`. Pure unit tests protect
their fail-closed scope, expected-revision/timestamp, role and audit-field guards.
They model existing browser service responses, not live database/RLS certification.
No deployment or GitHub Actions is configured by this suite.
