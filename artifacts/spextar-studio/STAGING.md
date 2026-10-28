# QA and staging readiness

This is a pre-deployment checklist, not deployment approval. Nothing in the readiness pass creates users/data, modifies Supabase, or publishes Studio.

## Configuration requirements

- Production bundles require explicit `VITE_STUDIO_MODE=backend` or `demo`. An omitted/unknown production mode fails closed rather than silently presenting demo data. Development may still default to demo.
- Backend builds require the existing approved project URL and its **publishable** browser key. Use the environment template; never place a secret/service-role key, management token, database password or private credential in a `VITE_*` variable or Git.
- These are Vite build-time settings. Changing a host's environment after building static files does not change the bundle: rebuild after approved configuration changes.
- Confirm the visible mode marker before testing. Demo is isolated local/session sample behavior, not authentication or persistence certification.
- The registered static artifact already has an SPA rewrite to `index.html`. A future staging host must preserve this for direct/refresh URLs and serve the built asset paths correctly. Vite preview verifies the built application locally; it does not certify an undeployed host's rewrites or headers.
- No new schema or migration is part of this pass. Do not run starter database pushes or weaken Auth/RLS to unblock QA.

## Access and data safety

- Use separately authorized disposable test identities and clearly test-scoped data only. This pass does not provision them or certify isolation from production.
- Project Admin/Author edit content; Reviewer/Viewer and inherited workspace administration without an explicit project authoring role remain read-only for project content. Project Settings requires explicit Project Admin. Workspace-shared reusable content follows workspace administration.
- RLS remains authoritative. Automated service doubles and intercepted browser responses are contract tests, not real multi-account RLS certification.
- Project Settings prevents accidental self-demotion/removal and performs fresh last-admin checks. This is not a proven atomic cross-session last-admin database invariant.
- Do not exercise destructive actions against real customer content. Existing conservative deletion behavior is not permission to delete production data.

## Manual smoke matrix

Use desktop and mobile browsers in both semantic themes. Record browser, viewport, account role, mode, commit and expected result—never passwords, access tokens, confirmation links or private keys.

1. Open a protected deep link signed out. Sign in and confirm the original same-app route is restored. Unsafe/external return paths must land at Workspaces.
2. Refresh Workspaces, Projects, Project Home, Documents, Author (including a document URL), Review, Variables & Conditions, Reusable Content and Project Settings. Verify membership-scoped data and document-aware breadcrumbs.
3. Verify wrong credentials remain on Sign in with an actionable error; password is cleared. Microsoft/Google remain unavailable. Refresh a restored session without a transient login bounce.
4. Verify workspace/project selection, navigation collapse persistence, mobile navigation and keyboard focus.
5. Verify loading, genuinely empty data, missing resources, permission/network errors and explicit retry. Errors must never substitute demo fixtures in backend mode. Unsupported structured content stays verbatim/read-only.
6. Verify role-specific controls. Review and Variables Output Preview are read-only for **every** role. Backend project import is unavailable in both header and empty state.
7. Verify Author/reusable structured editing, saved revision/conflict/recovery behavior with authorized test data. These are current drafts, not release history. Author/editor must not load on Workspaces; Review loads its viewer only when content exists.
8. Verify Review only shows In-review documents and saved drafts, not browser-local unsaved recovery copies. Missing drafts have no fabricated revision.
9. Verify Variables/Conditions/Reusable where-used guidance makes no reference/propagation claims. Publish, Style Guide, History and Brand & Outputs remain labelled placeholders; no workflow should pretend to execute.
10. Sign out from a project and confirm protected content disappears, the next login does not inherit that project's return URL, and refresh does not restore the signed-out session. Do not expect sign-out to delete server data.

## Local quality gates

```sh
pnpm test
pnpm typecheck
PORT=4174 BASE_PATH=/ pnpm build
pnpm --filter @workspace/spextar-studio check:bundle
pnpm test:browser
```

The workspace build runs TypeScript plus both Studio and component-preview production builds. The bundle guard verifies that Author and Review viewer/editor code remain absent from initial JavaScript. A pre-existing large-entry warning is non-failing; it is not evidence of editor leakage.

The permanent [controlled Playwright suite](e2e/README.md) builds a separate local production bundle with synthetic credentials and intercepted backend responses. It is repeatable browser regression coverage, not live Supabase/RLS certification.

## Project administration safety gate

The controlled suite now exercises the existing Project Settings contract end to
end in all four desktop/mobile dark/light projects: metadata validation and explicit
saves, cache refresh/deep-link reload, expected-timestamp conflicts, error/retry,
archive/restore confirmation, existing-workspace-member add/change/remove, expected-role
conflicts and administration revoked after form load. Read-only cases include
organization ownership and workspace administration without explicit Project Admin.
The opt-in Settings wire guard rejects unscoped writes, server-owned payload fields,
unrelated tables and project deletion. These are contract regressions, not live RLS
or atomic last-admin certification.

### Why this readiness slice precedes another product placeholder

The current source of truth is the route/service contract inventory in README.md,
the F2/F3 documents, the supplied frozen visual specifications and existing tests.
There is no separate authoritative continuation checklist or detailed frozen
Settings screen in the repository. The following remaining areas cannot safely be
implemented merely from route labels or planned-feature descriptions:

- Publish needs authoritative output/release execution and snapshot contracts.
- History needs historical revision storage/read/restore contracts; the current
  draft revision counter alone is not revision history.
- Style Guide needs confirmed terminology/rule storage and evaluation semantics.
- Brand & Outputs needs confirmed brand/template/output configuration contracts;
  the three existing variable-preview output identifiers are not such a contract.
- Linked reusable insertion remains parked pending its persisted-reference contract.

Project Settings already has complete typed administration services and documented
live-shaped table operations, so closing its browser mutation-safety gap requires
no invented persistence, product workflow, design, live writes or deployment.

## Remaining external readiness gaps

- [Backend-contract readiness](../../supabase/readiness/README.md) now captures
  application expectations and offline drift checks. It does not close exact
  migration-ledger export, replay validation or live RLS acceptance. The
  [migration handoff](../../supabase/migrations/README.md) explicitly records
  those unresolved gates without generating or executing guessed SQL.

- Real email/password confirmation/sign-in and authenticated multi-account RLS acceptance require authorized test users and safe test data. Controlled browser checks do not close this gap.
- An isolated staging account/dataset policy and the actual future host configuration have not been certified. Do not assume the approved backend is a disposable staging database.
- Exact applied migration SQL is not yet source-controlled; reproducing a fresh equivalent backend remains a separate blocked task requiring authoritative migration-history access/files.
- Atomic protection of the final Project Admin across concurrent administrators remains unverified at the database level.
- Detailed screen-to-Figma fidelity and any supported-browser matrix beyond the exercised controlled Chromium viewports need separate confirmation.

Assignments/comments/approvals, submitted Review snapshots, publishing, historical versions, linked reusable references and other labelled placeholders remain deliberately unfinished. They are scope exclusions, not simulated QA successes.
