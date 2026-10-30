# RPC conflict transport correction — Issue #27

Implementation base: accepted main `a307c8afebcfc9310c9de162834842e1a2ec6bc8`.
Branch: `codex/fix-rpc-conflict-27`. Blocks resumption of [Issue #26](https://github.com/Gypsysystems/Spextar-Studio/issues/26).
No live migration, merge, Replit deployment, Auth/configuration, domain or production action is authorized by this change.

## Current documentation check (2026-10-31)

The installed Supabase skill was followed before implementation: fetched and scanned
[the changelog index](https://supabase.com/changelog.md), reviewed the
[v14 rollout](https://supabase.com/changelog/41288-data-api-upgrade-to-postgrest-v14),
[client retry announcement](https://supabase.com/changelog/45071-automatic-postgrest-retries-for-transient-errors)
and [new-table grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
The table change is irrelevant here: no new tables/grants are introduced.
Client GET/HEAD transient retries are distinct from this server transaction retry defect.

[Supabase troubleshooting](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions)
(last edited 2026-10-14) confirms PostgREST 14 retries custom `40001`, recommends
`raise sqlstate 'PT409' using message = '...'` for HTTP 409 and identifies the
upstream fix in PostgREST 16. [PostgREST 14 error mapping](https://docs.postgrest.org/en/v14/references/errors.html#raise-errors)
confirms the PT status contract. Issue #26 product-owner decision
[#6533876407](https://github.com/Gypsysystems/Spextar-Studio/issues/26#issuecomment-6533876407)
classifies the defect; [diagnostic #6533853502](https://github.com/Gypsysystems/Spextar-Studio/issues/26#issuecomment-6533853502)
retains the limits of original request/backend attribution.

## Exact audit and forward change

Repository-wide searches included `40001`, `40P01`, `serialization_failure`,
`deadlock_detected`, SQL RAISE/ERRCODE and exception handling. Fourteen authored SQL
occurrences are deterministic application conflicts, with no genuine authored
serialization/deadlock handling found. Historical files remain byte-for-byte intact.
Five old guards are superseded; nine effective guards change only their transport.

| Accepted source file / lines | Function | Message(s) | Disposition |
| --- | --- | --- | --- |
| `20261029140601_review_lifecycle_foundation.sql:115,132,136,142,160` | `app_private.review_transition` | Document changed; Review changed (two); Approved review changed; Approved outline changed | All five historical occurrences unchanged; superseded by Publishing definition below |
| `20261029184603_freeze_review_dependency_packages.sql:280` | `app_private.review_dependency_package` | Review scope changed | One effective guard replaced in new migration; original unchanged |
| `20261030001220_immutable_document_releases.sql:372,376,379` | `app_private.publish_document_release` | Request changed; Approved document changed; Latest approval required | Three effective guards replaced; original unchanged |
| `20261030001220_immutable_document_releases.sql:431,448,452,458,476` | `app_private.review_transition` | Document changed; Review changed (two); Approved review changed; Approved outline changed | Five effective guards replaced; original unchanged |

Supabase CLI **2.122.0**: executed `--help`, `migration --help`, `migration new --help`,
then `migration new non_retryable_rpc_conflicts` (no invented filename).
New migration: `20261030213342_non_retryable_rpc_conflicts.sql`.
SHA-256: `b02589a5d8565e985d1b521ed1973b19b6e96ebe091950238699c62cd705a1ff`.
It uses transactional CREATE OR REPLACE for exactly those three current private
functions, retaining their signatures, owners, ACLs, attributes, safe messages,
roles, locks, frozen evidence/dependencies, sequence/digest/renderer and idempotency.
Public RPC wrappers and authorization SQLSTATE `42501` remain unchanged.

Adapters recognize PT409 as conflict and retain 40001/23505 compatibility without
retry/fallback writes. Mirrored native expectations and intercepted HTTP fixtures
now use PT409. The old migration assertion intentionally still reads 40001 from
immutable historical SQL. New source-equivalence tests prove each replacement is
otherwise identical and effective definitions contain no retryable authored guard.
Remaining retryable-code text is historical SQL, compatibility handling/tests,
audit documentation and negative/normalization assertions, never a new RAISE.
Only the two reviewed adapter semantic digests changed in source-review.json;
application-contract.json records this explicit transport contract.

## Executed disposable validation

- Native PostgreSQL 17.11 / pgcrypto 1.3: clean 25-file baseline then new migration;
  **16** dedicated conflict/catalog assertions pass, including every active safe
  conflict message, stale submission/new Draft, missing/completed Review, old
  approval, privileged outline drift (rolled back), dependency scope and request reuse.
  Failed calls leave document/topic/draft/review/release rows unchanged.
- Catalog SHA-256 before: `f5e48af6401fcdfc2dc694ec7292c9758e79edb32b74557e6bb787aee718abe6`;
  after: `0731b0e959e5f22ff54ae745702b3b2ff4455e673e1adeacda3ed3ca540d5723`.
  Exact normalized whole-catalog comparison allows only the nine RAISE expressions.
  Owners/ACLs/RLS/policies/triggers/tables/constraints/indexes/types and all 15 public
  RPC signatures match. Final effective functions contain no 40001/40P01 misuse.
- Full native backend suites: **75** release, **55** dependency/lifecycle/security,
  **138** six-persona/concurrency assertions pass. Includes submit/approve/request
  changes/new Draft/publish, frozen evidence, unauthorized roles, last Admin,
  same-key idempotency, changed parameters rejected and genuine competing sessions.
- Actual Docker **PostgREST 14.0 + Linux PostgreSQL 17.11**: all 26 SQL files replayed
  unchanged. One raw stale submit POST returned **409 / PT409 / Document changed
  in 20 ms**, zero evidence/state change. A nontransactional entry counter in the
  disposable function copy measured exactly **one** execution, checked again after
  one second. Valid submit/approve/publish/new Draft, stale new Draft (409), same-key
  retry, changed review/key identity (409) and Viewer denial (403/42501) pass.
  This uses synthetic JWT/Auth, not hosted Supabase Auth/gateway/pooler certification.
  Initial harness run reached the last-Admin safeguard when attempting to demote its
  only Admin; fixture corrected to a separate Viewer, then complete rerun passed.
- Supabase CLI security advisors ran on an explicit disposable loopback URL before
  and after: exact same output, only baseline `extension_in_public` warning for
  pgcrypto. No new finding. No baseline extension/schema behavior was changed.
  Database lint was attempted but portable Windows PostgreSQL lacks plpgsql_check
  (`0A000`); this is an unavailable tool prerequisite, not a passing lint claim.
- Initial focused application/adapter/source contracts: **101 / 101 passed**.
  Remaining full-suite/build/browser/hosted evidence is recorded below when complete.

Reproduce native commands using the documented binary/pg driver selectors in
[backend validation](PRIVATE_BETA_BACKEND_VALIDATION.md):
`node supabase/tests/rpc-conflicts.mjs`, `node supabase/tests/document-releases.mjs`,
`node supabase/tests/review-dependency-packages.mjs`.
On Linux with Docker and Node >=22:
`node supabase/tests/postgrest-conflicts.mjs`.
Containers/networks have unique names and are removed in finally; no live selector
or credentials are accepted. Optional test-driver dependencies stay outside the app.
CI now executes native backend and actual PostgREST 14 checks as well as existing
unit/type/build/bundle/migration-integrity jobs. Windows pg_ctl diagnostics use
files to avoid server descendants retaining synchronous subprocess pipes.

## Forward rollout and recovery (requires separate approval)

Keep PR unmerged for independent product-owner review after green CI. Issue #26
remains open; Replit/UAT blocked. Product owner must explicitly authorize merge and
staging migration separately. Before rollout: confirm accepted SHA, fresh 25-entry
ledger/parity and backup/change coverage; inspect ongoing old retrying backends
with correlation evidence. Changing a function does not cancel already executing
requests. Do not terminate sessions or restart services without separate operational
authorization. Never repeat the current live stale RPC to test the diagnosis.

After authorization, apply only this 26th migration through the established workflow,
verify ledger/hash and exact catalog delta, rerun real authenticated Issue #26 smoke
starting at stale submit, then remaining six-persona lifecycle/security gates.
Replit deployment, UAT acceptance and domain connection remain separate gates.
Do not edit historical migrations or roll back to retryable guards. If a defect is
found, stop rollout and prepare a reviewed compensating forward migration. Reverting
the additive browser recognition is unnecessary for database rollback compatibility.
No product/permission/UI/brand/lifecycle change or independent product acceptance
is claimed. No secrets/private UAT logs are tracked.
