# Validation snapshot — backend-contract readiness

Validated on 2026-10-28 for this readiness change, against the existing
`3ef80592727bfe88e99a5e9c4300cbc0f704b8da` application baseline.
This is retained evidence for this change, not a continuously updated CI status.

| Gate | Result |
|---|---|
| Focused offline contract tests | 42 passed, 1 file |
| Full unit/integration suite (`pnpm test`) | 763 passed, 39 files; includes the 42 contract tests |
| Workspace TypeScript (`pnpm typecheck`) | Passed: scripts, Studio, component-preview |
| Both production builds (`PORT=4174 BASE_PATH=/ pnpm build`) | Passed: Studio and component-preview, including workspace TypeScript |
| Bundle guard (`pnpm --filter @workspace/spextar-studio check:bundle`) | Passed: Author/editor and Review viewer absent from initial JavaScript graph |
| Full permanent browser suite (`pnpm test:browser`) | 352 passed, 10 specs, 14.5 minutes |
| Browser profiles | Desktop dark 1440×1024, desktop light 1280×1024, mobile dark/light 390×844 with native touch |
| Development preview | Mobile sign-in screenshot checked; managed Studio workflow starts cleanly |
| Credential review | No private credential patterns found in outgoing files |

The browser suite uses the production build with synthetic Auth identities and
intercepted responses; unintended external/live Supabase traffic remains blocked.
It covers existing navigation, session/identity teardown, explicit/inherited role
affordances, management mutations/failures, Author autosave/conflicts/recovery,
read-only Review/Output Preview, accessibility, overflow and lazy boundaries.

The initial JavaScript remains 1,070,203 bytes; the separate Author route is
18,444 bytes, structured editor 487,211 bytes, and Review viewer 294 bytes.
The existing non-failing large-entry warning remains; this change adds no runtime
imports or dependencies and does not treat that warning as editor leakage.

## Deliberately not certified

- The reported 18 live migration entries were not queried/exported or recreated.
  No executable migration SQL was added and replayability is not certified.
- No live users/data, Auth settings, schema, RLS, policies, grants or RPCs changed.
- No live multi-account isolation, database policy equivalence, transactional
  last-admin/dependency guarantees or database-trigger implementation was tested.
- No deployment or publishing occurred; host-specific staging behavior is not
  certified by local build/browser checks.
