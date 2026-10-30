# Private Beta backend validation — Issue #24

Validation date: 2026-10-30. Repository: `Gypsysystems/Spextar-Studio`.
Base: `3197174fc3d80ad0e3df1b4d3f653a55ec33a532`, fetched from GitHub main;
initial checkout clean. Branch: `codex/private-beta-backend-validation`.
The PR head is reported in the PR (a document cannot embed its own commit SHA).
This report concerns source and disposable environments, never live certification.

## Decision and boundaries

Rollout is **not authorized** by this report. Final technical results and remaining
gates are recorded below. No accepted SQL is edited, reformatted or repaired.
No live Supabase inspection/write, migration apply/replay/reset/repair/rollback,
Auth/settings/secret change, Replit action, deployment, infrastructure, production,
domain or DNS change occurred. No product UAT, merge or release approval is claimed.

**Technical recommendation: ready to request authorization for a gated staging
rollout.** No accepted source/database defect was found by the executed checks.
The older browser fixture mismatch is corrected with stronger assertions and no
application change. Actual rollout remains blocked until the external ledger,
backup, Auth/security and candidate prerequisites below are cleared; this is not
Private Beta acceptance or a statement of current live parity.

## Disposable database and reproducibility

Native PostgreSQL **17.11**, x86_64 Windows, compiled by **msvc-19.44.35229**, 64-bit;
`pgcrypto` **1.3**. The official [PostgreSQL Windows page](https://www.postgresql.org/download/windows/)
points to [EDB binary archives](https://www.enterprisedb.com/download-postgresql-binaries);
the 17.11 Windows archive was obtained via EDB file ID `1260616`. Only portable
bin/lib/share files were extracted under ignored `generated-artifacts/issue24-pg`.
No system installation, Windows service or infrastructure configuration was made.
Docker/PostgreSQL were not on PATH or in the inspected standard installation
locations; portable native PostgreSQL was stronger than the available PGlite.

`supabase/tests/disposable-postgres.mjs` creates a new random temporary cluster,
UTF-8/no-locale, postgres owner, random port, `127.0.0.1` only, trust for that
loopback address and explicit rejection elsewhere. Credentials/PG environment
settings, application `.env.local` and Supabase CLI configuration are never used.
The driver is explicitly configured, independent of PGHOST/DATABASE_URL. Every
normal success/failure closes clients and stops that cluster. Synthetic temporary
data/logs are retained locally for diagnosis and are not committed. Interrupted
processes require stopping only their printed temporary cluster with its matching
`pg_ctl -D <printed-data-path> -m fast -w stop`; never target an existing cluster.

Only synthetic platform prerequisites are added: `anon`/`authenticated` roles,
`auth.users(id,raw_user_meta_data)` and `auth.uid()` reading a test claim setting.
Each of the **25 entire source SQL files** then executes in sorted version order,
unchanged, including the real `CREATE EXTENSION pgcrypto`. No object replacement,
SQL omission, manual repair or out-of-band application schema is required. Each
file is submitted as one query/transaction, not a simulation of Supabase's ledger
runner. The database starts with PostgreSQL defaults and synthetic Auth, not a
complete Supabase distribution.

Windows PostgreSQL/no-locale is not proof of Linux/Supabase collation, managed
extension placement/default grants, GoTrue schema/triggers, PostgREST authorization
or pooler behavior. Those require the fresh platform inventory and real Auth/API
smoke gates below. Synthetic auth claims are test inputs, not verified JWTs.

The existing PGlite branch still omits the unused extension installation only in
its in-memory copy; that branch is separately labeled and never replay certification.
Native fixture arrays are explicitly serialized as JSONB. Native 17 reports
FK retention as `23503`, while PGlite reports `23001`; each backend asserts its
specific expected code, retaining the same denied deletion behavior.

Reproduce from repository root with Node 24, existing locked workspace dependencies,
a trusted portable/native PostgreSQL bin directory and separately installed pinned
`pg@8.16.3` outside application dependencies:

```powershell
# Optional isolated test-driver install; no application dependency/lock change:
pnpm --dir generated-artifacts/issue24-pg --ignore-workspace add pg@8.16.3
$env:SPEXTAR_TEST_POSTGRES_BIN = '<absolute PostgreSQL bin directory>'
$env:SPEXTAR_TEST_PG_MODULE = '<absolute pg/lib/index.js>'
node supabase/tests/document-releases.mjs
node supabase/tests/review-dependency-packages.mjs
```

These flags select only binaries/driver; there is no remote database selector.
Without native flags, the existing `PGLITE_MODULE_PATH` selects PGlite 0.5.13.
Never point a test script at a live database. No test-driver dependency or lockfile
is added to the application. `recordReplay` asserts all **15** inventoried RPC
names/argument lists against `pg_proc`, rejects overloads, and prints a SHA-256
inventory of columns/defaults, functions/owners/ACLs, policies, table RLS/ACLs,
constraints, triggers, indexes and types. Repeat clean runs compare that inventory;
it excludes physical OIDs, data and Supabase-managed platform configuration.

## Roles and protected scope

The native matrix uses six distinct synthetic identities, a separate non-owner
Org Admin, a spare membership target and a separate tenant,
and actual `SET ROLE authenticated` for operations. Fixture creation alone uses
postgres. An organization bootstrap RPC and project bootstrap RPC execute as
authenticated users. Last-admin race actors use postgres to isolate the trigger
invariant from client self-demotion protections; this does not certify every
authenticated management race.

| Persona | Scoped read | Project metadata | Author/Submit/New Draft | Decide Review | Publish |
| --- | --- | --- | --- | --- | --- |
| Org owner/bootstrap, no project role | Yes, inherited | Denied | Denied | Denied | Denied |
| Non-owner Org Admin, no project role | Yes, inherited | Denied | Denied | Denied | Denied |
| Workspace Admin, no project role | Yes, inherited | Denied | Denied | Denied | Denied |
| Explicit Project Admin | Yes | Allowed | Allowed | Allowed | Allowed |
| Author | Yes | Denied | Allowed | Denied | Denied |
| Reviewer | Yes | Denied | Denied | Allowed | Denied |
| Viewer | Yes | Denied | Denied | Denied | Denied |

Approved/Published working content requires the checked New Draft transition;
request-changes requires a meaningful note and returns working state to Draft.
All personas are denied direct Review updates. Existing release tests deny all
authenticated evidence writes and ordinary privileged release updates/deletes,
exercise restrictive parent retention, frozen values after catalog edits, malformed/
legacy/deep/cyclic packages, same-key recovery and independent canonical SHA vectors.
Owner membership cannot be removed/demoted; last Project Admin and revoked-creator
bootstrap safeguards are checked. Foreign-tenant and anon protected reads/RPCs
fail closed. Same-identity membership changes are tested without token refresh.

**Read scope detail:** accepted `is_project_member` includes workspace membership,
and `is_workspace_member` includes organization membership. Removing a project
role closes explicit transition/publication authority but can retain inherited
reads of documents/Review/releases. The matrix verifies retained authorized reads,
then removes project, workspace and organization memberships to verify full read
closure. This is existing accepted SQL, not a newly tightened tenant policy.
Both bootstrap owner and non-owner organization Admin are tested independently;
corresponding real Auth accounts remain part of staging UAT.

## Transaction/concurrency evidence

The additional native suite uses distinct `pg_backend_pid()` values, uncommitted
transactions and `pg_stat_activity.wait_event_type='Lock'` before releasing a
transaction. It does not infer concurrency merely from JavaScript promises.
It exercises same-key retry, different-key competing publication and numbered
releases, Publish versus New Draft, stale submission versus document edit,
publication versus membership revocation, and competing last-admin demotions.
Dependency consistency uses a PostgreSQL `PgSleep` barrier between two STABLE
captures in one statement, commits a catalog edit in another session, and checks
both captures retain the old snapshot while a new statement sees the committed edit.

The existing release harness separately injects a failure after release insertion
and verifies no release and unchanged Approved lifecycle; dependency harness checks
capture errors leave no partial submission. These are genuine PostgreSQL transaction
checks. Queued calls in the original release harness remain explicitly queued.
No claim covers every deadlock schedule, isolation level, all management/deletion/
body-write race permutations, hosted Supabase pooling, network ambiguity or outages.

## Source/application audit

Reviewed `supabase-atomic.ts`, `supabase-documents.ts`, `supabase-reviews.ts`,
`supabase-releases.ts`, adapter initialization/client, domain release/package
validators, frozen Review provider/Release renderer, readiness inventory and tests.
The native catalog asserts the exact 15 inventoried RPC argument-name arrays;
source tests protect parameter names, projections, scopes and grants. No alias
discovery, signature probing, direct-insert fallback or backend-to-demo fallback
is present in these action paths. Each approved action invokes one exact RPC;
uncertain transitions are not blindly retried. Routine adapter preflight reads
are distinct from the write RPC.

The browser client requires the approved URL and publishable-key format; no browser
service-role/private credential path was found. Backend errors throw, modes remain
separate, fresh explicit-role checks constrain authoring/management and database
membership is authoritative. This is source inspection and controlled exposure
tests, not proof of every external secret binding or a forensic repository audit.

Review uses its frozen dependency provider; Publish/Release content uses only
retained Approved evidence and pinned resolver/renderer v1. Authorized display-name
profile reads are outside the frozen semantic contract. Catalog-edit SQL and
intercepted-browser tests independently check frozen output/no mutable semantic
reads. Canonical keys use UTF-16 ordering, UTF-8 SHA-256, safe integers, retained
array order/Unicode and fixed six-digit UTC timestamps; native SQL compares
independent Node vectors plus actual package/manifest digests. Hashes are not
authorization signatures. Existing source-review semantic digests are preserved;
validation evidence does not justify regenerating them.

## No-change staging rollout checklist

Every step below is **pending** and requires separately authorized access/change
scope. No live ledger, Auth or hosting check was performed for Issue #24.

1. Record target project identity/region, current PostgreSQL/platform versions,
   candidate Git SHA and the responsible operator/approval. Obtain a fresh read-only
   `supabase_migrations.schema_migrations` export (version/name/ordered statements,
   byte lengths/checksums), schema/grant/RLS/function/trigger/extension inventory
   and security advisors. Do not infer parity from this application's contract.
   Compare all 21 recovered entries exactly against the manifest and accepted later
   bodies. Stop on missing/extra/reordered/changed history or schema drift; recover
   authoritative evidence rather than repair the ledger or rewrite old SQL.
2. Assuming the last authoritative 21-entry ledger is still current, the pending
   order is exactly:
   `20261029140601_review_lifecycle_foundation.sql` →
   `20261029172250_enforce_explicit_project_admin_management.sql` →
   `20261029184603_freeze_review_dependency_packages.sql` →
   `20261030001220_immutable_document_releases.sql`.
   A fresh ledger can change which entries are pending; never blindly reapply them.
3. Verify recoverable backup/snapshot/PITR coverage, timestamp, retention, restore
   procedure and access owner before apply. Prove restore in a separate disposable
   environment if required by operations. Capture schema/ledger baseline. Plan an
   approved change window and client compatibility. Restore is a separately
   authorized incident action, not an automatic migration rollback.
4. Resolve the leaked-password-protection warning last independently observed
   2026-10-29. Re-read current Auth settings/advisors; after explicit approval enable
   supported leaked-password protection, verify password policy and expected
   rejected-password behavior using disposable accounts, then retain a clean
   advisor result. [Supabase password-security documentation](https://supabase.com/docs/guides/auth/password-security)
   currently states leaked-password protection requires Pro or above. If unavailable,
   record the plan/setting blocker for an owner decision; do not silently accept or
   claim remediation. Review any additional Auth/security warning and approved
   remediation/exception before opening beta. No setting was changed here.
5. After separate migration authorization only, apply just verified pending forward
   migrations in order using the approved operational mechanism; retain per-version
   success, exact checksums and resulting ledger/schema diff. Stop at first failure.
   No reset, repair, historical edit, down migration or blind retry. Rollback policy
   is an independently reviewed new forward fix; preserve immutable evidence.
6. Run post-apply smoke checks as actual authenticated O/W/P/A/R/V plus foreign/anon:
   creation/bootstrap, exact RPC calls/argument types/returns, scoped SELECT,
   authoring and expected-revision conflicts, submit/decide/changes/new Draft,
   frozen closure, Admin-only publish, same-key recovery, unique sequences/digests,
   retention, direct evidence-write denial, owner/last-admin, revocation and tenant
   denial. Recheck definer owner/search_path/ACLs, public/anon revokes, private helper
   exposure and RLS. Test through PostgREST/Auth, not only SQL `SET ROLE`.
7. Provision approved disposable accounts/data and a separate tenant; keep account
   credentials out of artifacts. Check verified session restoration/expiry/refresh,
   sign-out/second-account cache and recovery isolation, password-reset/email flows
   used by beta and rate limits. OAuth controls remain inactive. Check allowed
   redirect/site URLs, safe return paths, HTTPS, exact staging origin/CORS and CSP
   requirements. SPA currently stores SDK sessions in namespaced browser storage;
   it is not a server-cookie session design. Inspect actual cookies/storage without
   exporting tokens; validate any hosting cookie flags that actually exist.
8. Inspect binding names/presence only: explicit `VITE_STUDIO_MODE=backend`, approved
   `VITE_SUPABASE_URL`, approved publishable browser key, managed `PORT`/`BASE_PATH`.
   No service-role/provider secret in any `VITE_*`, bundle, map, logs or screenshots.
   Rebuild for public setting changes. Review ignored `.env.local` without publishing
   values. The demo candidate cannot pass backend readiness. Run
   `pnpm check:readiness` only on an explicitly configured backend candidate under
   its documented controlled testing scope; retain bundle/exposure/network evidence.
9. Keep the upcoming [TLS cipher deprecation](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
   starting 2026-11-10 at the earliest in client compatibility checks (modern browser/SDK stack). Changelog
   was reviewed on validation date; no source update is required by this task.
10. Before requesting Replit staging deployment, collect green exact-head
    hosted CI, migration/parity and security evidence, configured-candidate readiness,
    disposable six-persona smoke results, concurrency results/gaps, backup/forward-fix
    owner and the prepared [UAT matrix](PRIVATE_BETA_UAT.md). After separately
    authorized deployment, verify deployed SHA, runtime settings/SPA fallback/assets
    and complete candidate UAT before Replit staging acceptance; a Git publication
    commit or old URL is insufficient. Product-owner UAT/security acceptance and
    domain/production approval remain separate gates.

## Executed checks and open gates

| Check | Executed result |
| --- | --- |
| Native PostgreSQL full ordered replay | 25/25 unchanged migrations, real pgcrypto 1.3; repeated clean clusters produce identical contract inventory |
| Replay inventory SHA-256 | `f5e48af6401fcdfc2dc694ec7292c9758e79edb32b74557e6bb787aee718abe6` |
| Native release suite | 75 passed |
| Native persona/concurrency extension | 138 passed, including separate non-owner Org Admin and per-persona member INSERT/UPDATE/DELETE boundaries |
| Native dependency suite | 55 passed in a separate empty cluster; same inventory hash; final summary reports native engine |
| PGlite compatibility | 75 release + 55 dependency assertions passed with native flags absent |
| Native environment isolation | Final 75+138 assertions passed with synthetic invalid PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD/PGSSLMODE/PGOPTIONS; explicit loopback config still used, UTC session pinned, normal shutdown verified |
| Historical/source integrity | 21 recovered lengths/MD5s match; all 25 raw SQL files match accepted Git base byte-for-byte; provenance manifest tracked blob unchanged |
| Full prepared Windows units/source contracts | 1103 passed, 4 failed, 54 setup-blocked/skipped / 1161, 57 passed files / 3 failed. All remaining failures are symlink EPERM in predeploy CLI/readiness; server setup blocks its 54 assertions |
| Earlier sandboxed full run | 1101 passed, 6 failed, 54 setup-blocked/skipped / 1161; same four symlink failures plus F2 autosave and frozen Review viewer timing failures. Those two UI tests passed in the complete prepared run, unchanged |
| Final evidence inventory follow-up | 55/55 backend-contract tests and final workspace typecheck passed after readiness evidence corrections and browser-fixture change; semantic digests unchanged |
| Typecheck/build/bundle | Workspace typecheck and Studio/sandbox demo production builds passed. Bundle 740804 / 975000 initial JS bytes; existing lazy boundaries passed; existing sourcemap/chunk notices remain non-failing |
| Controlled browsers | Seven suites, 216 cases, Chrome 155.0.8059.85, one worker, four desktop/mobile dark/light profiles: 212 passed / 4 failed (21.4m). All four failures were the same older unsupported Review fixture. Corrected scenario then passed 4/4 profiles (1.1m). No entire 216-case rerun or all-spec browser sweep is claimed |
| Hosted CI | [Quality run 41002756458](https://github.com/Gypsysystems/Spextar-Studio/actions/runs/41002756458) passed both required jobs on `23534acac7b8a0c9717d8d1d1162bae8a2faa654`: 60 files / 1161 tests, locked install, typecheck, both builds, bundle 740804/975000, tracked-file and migration integrity. Final-head checks are reported on [unmerged PR #25](https://github.com/Gypsysystems/Spextar-Studio/pull/25), independently of this earlier run |

Windows symlink creation is an existing environment limitation; no assertion,
timeout, skip or retry policy is weakened. Controlled browsers intercept all
backend traffic and do not certify actual Supabase Auth/PostgREST/RLS behavior.

Browser classification: the old test replaced a topic with an unknown node while
retaining a non-null versioned dependency package. Accepted package validation
correctly rejected that invalid evidence before rendering; the test expected the
legacy raw viewer. The fixture now first asserts rejection/no body, then explicitly
sets the package to legacy NULL and retains every original raw PRE/JSON equality,
read-only, error/retry, empty-state, overflow and zero-write assertion. No timeout,
retry, skip or application behavior changes. Initial four failure traces/screenshots
and logs are retained only in ignored local validation output.

No production UI, design pattern, component, token, font, logo or branding change.
Existing Publish/Review/Author/Settings/semantic/session screens were exercised at
desktop and mobile in dark/light, including their embedded axe, keyboard/focus,
read-only, error/recovery and overflow assertions. This is automated coverage,
not manual visual or assistive-technology UAT. Approved brand assets and semantic
tokens are unchanged.

Remaining gates before authorized staging rollout: exact-head green hosted checks;
fresh live ledger/schema/extension/platform parity; verified backup/change plan;
Auth warning resolution or explicit owner decision where protection is unavailable;
real authenticated six-persona/foreign/anon smoke checks through platform APIs;
backend candidate readiness/bindings/session/origin checks; manual UAT/security and
product-owner acceptance. Database evidence supports requesting controlled rollout
once these gates are satisfied; it is not permission to apply or deploy. Any
confirmed failing browser acceptance case remains a blocker until classified and
resolved with unchanged assertions or explicitly accepted by the product owner.

## Issue #27 compatibility correction

The authenticated Issue #26 stale-submit gate exposed a PostgREST 14 retry defect
in authored SQLSTATE 40001 business guards. The historical ready-to-request-rollout
recommendation above predates that finding. [Issue #27 audit and verification](RPC_CONFLICT_TRANSPORT.md)
records the new forward-only PT409 fix and disposable HTTP/native evidence.
Issue #26 remains open and Replit/UAT remains blocked until independent review,
explicit merge/migration authorization and fresh real authenticated smoke. No live
rollout authority is granted by passing disposable tests.
