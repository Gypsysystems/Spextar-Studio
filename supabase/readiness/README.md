# Backend-contract readiness

## Authority and safety

This folder captures **the application's current assumptions**, not a live
Supabase schema, migration ledger, schema dump or security certification.
It adds no runtime dependencies, database operations, credentials or migrations.
The approved project remains `luyyxblmtupmugtazgbr`; demo data stays separate.

| Artifact | Purpose |
|---|---|
| `application-contract.json` | Reviewable tables, consumed columns, application operations/writable fields, scope and concurrency keys, roles, values, RPC compatibility and unresolved assumptions |
| `source-review.json` | Comment/trivia-insensitive semantic digests for backend adapters and relevant domain/JSON validators |
| `VALIDATION.md` | Dated validation evidence for this readiness change, not a live backend certification |
| `../migrations/README.md` | Partial supplied identities and the safe exact-ledger export/import/replay handoff |

`operations` describes **what this app uses**, not all PostgreSQL grants or
available operations. `columns` means consumed/filtered fields, not a complete
database column catalog. Audit nullability, UUID/timestamp types, constraints,
unique indexes and policies must be confirmed from authoritative SQL; accepted
parser input does not prove an actual SQL definition. No `.sql` file is created.

## Domain expectations already used

- Identity: Supabase email/password, `getSession` plus verified `getUser`,
  restored-session events and explicit local sign-out/identity cleanup. A
  publishable browser key is not permission to read administrative SQL metadata.
  OAuth buttons remain inactive; anonymous/temporary test users are not created.
- Tenant hierarchy: organization → workspace → project → document → topic.
  Profile identity is linked to Auth; profile/bootstrap/update triggers are
  expected by the established foundation. The application does not implement
  its own privileged membership bootstrap or bypass RLS.
- Explicit Project Admin/Author may author project content. Reviewer/Viewer and
  inherited workspace administration do not elevate project authoring. Only
  explicit Project Admin administers project metadata/members. Workspace-shared
  reusable mutation follows workspace-admin authority.
- Document/topic lifecycle is `draft/in_review/approved/published` in storage;
  the UI maps `in_review` to `in-review`. Project metadata writes accept only
  `active/archived`, trimmed names 2–160 and lowercase hyphenated slugs unique
  within the workspace. The general project reader also accepts legacy review
  status spellings; this compatibility is **not** an expanded writable schema.
- Documents/topics use titles, slugs, JSON object settings, server audits,
  same-document parent pointers and sibling order. Parent cycles are invalid.
  Bodies are separate draft JSON, never metadata/settings body fields.
- Variables: Text only; JSONB string value; object overrides keyed by
  `web-help`, `pdf-manual`, `word-review`. Empty/missing overrides resolve to
  default. Names can be human-facing ProductName-style; stable keys begin with
  a lowercase ASCII letter followed by lowercase letters/digits/underscores,
  at most 80 characters. Variable/condition names are nonblank, at most 120.
- Conditions management stores include/exclude and any/all values as allowed
  by the existing schema. Product explanation remains no-tag Include,
  same-category OR, cross-category AND; management is **not** semantic
  assignment, expression authoring or an output evaluation engine.
- Reusable scope is workspace (null project) or project (required project),
  with tags, settings, lifecycle and notify/manual/auto policy. Policy selection
  does **not** mean linked references or propagation exist.
- Topic/reusable bodies use SPEXTAR-owned versioned structured JSON, stable
  node IDs and safe unsupported-content handling. Node IDs are parent-content
  scoped because duplication copies JSON unchanged. Tiptap is only an engine.

### Mutation and concurrency boundaries

Draft insertion establishes revision 1 in the database; updates match the
last-read revision and read the resulting row. Topic saves require an advanced
revision; reusable saves require exactly +1. A duplicate first insert or zero-row
update is a conflict, not permission to retry an unguarded overwrite.
Reusable audit fields are server-owned; Topic writes currently submit
`updated_by` as the authenticated scoped user but not revision/timestamp.

Project metadata and reusable metadata updates use expected `updated_at`.
Membership change/removal uses expected role. Conservative document/topic
deletion uses expected `updated_at` plus preflight dependency checks.
**Client preflights do not provide an atomic last-admin/dependency invariant**.
Document/topic metadata, variable and condition edits have no equivalent
server-side CAS in the existing adapters; do not claim universal conflict safety.

F0/F1 creation calls the authoritative `create_organization(p_name, p_slug)`,
`create_workspace(p_organization_id, p_name, p_slug, p_description)` or
`create_project(p_workspace_id, p_name, p_slug, p_description)` directly, then
verifies the resource and bootstrap role. Description is optional for workspace
and project creation; omitted descriptions are sent as null. Each creation uses
one RPC POST, without signature discovery, alternate names, direct entity inserts
or client-created memberships. A missing/denied operation fails closed.
Document/topic creation, tree operations and duplication bind directly to the
seven verified RPC names and exact `p_` named parameters listed in
`application-contract.json`. Each action sends one authenticated POST after
existing role/scope validation; no discovery GET, error-hint parsing, alternate
signature or direct-insert fallback is allowed. Failure is surfaced without
retrying a potentially applied write. No draft save RPC exists.

Reusable duplication is a metadata create followed by draft copy; partial-copy
warnings are intentional. Document/topic RPC duplication is expected to preserve
saved draft bodies and reset lifecycle to draft. Exact transaction definitions
and deletion FK behavior still require the original SQL.

## Automated drift checks

Run the focused check from the repository root:

```sh
pnpm --filter @workspace/spextar-studio exec vitest run src/test/backend-contract.test.ts
```

It also runs in normal `pnpm test`, entirely offline:

1. Inventories **all** `supabase*.ts` modules, plus reviewed schema/content
   validators, so new backend files cannot silently escape the review set.
2. Resolves literal table/query chains and local column constants, rejecting
   undocumented tables, columns, operations, literal write fields and F2 RPCs;
   compares the consumed table set with the manifest.
3. Requires explicit review of semantic-source changes (comments/formatting
   are ignored). This deliberately conservative guard also flags semantic
   non-query edits; do not auto-regenerate digests to silence a failure.
4. Negative tests inject unknown tables/columns/RPCs/audit writes and remove
   revision/timestamp/signature/role gates, proving the checks detect drift.
5. Compares representative actual key/status/role parsers with documented
   values, including trailing-newline and maximum-length cases.

**Limits:** static chains do not resolve arbitrary control flow, query builders
stored in variables, spread payloads, dynamic helper table names, imported
constants or database policies. Their reviewed sources are pinned and existing
adapter/browser tests exercise behavior. Digests do not prove that documentation
is semantically complete. These checks detect **application vs reviewed
expectation drift**, not changes in a live Supabase database.

### Reviewing an intentional change

Read the reported query surface, changed adapter/domain code and affected
service tests. Update `application-contract.json` and explanatory limitations
first. Obtain an authoritative contract before introducing new backend semantics.
Only then update the affected digest in `source-review.json`. To inspect a
digest or query surface without writing files or contacting Supabase:

```sh
node --experimental-strip-types --input-type=module <<'JS'
import { semanticDigest, querySurface } from './artifacts/spextar-studio/src/test/backend-contract-inspector.ts';
const file = 'artifacts/spextar-studio/src/services/supabase-topic-drafts.ts';
console.log(semanticDigest(file));
console.log(querySurface(file).join('\n'));
JS
```

Then run full unit/integration, TypeScript, both production builds, bundle guard
and isolated Playwright. Never replace these checks with a live migration push.

## Explicit unresolved readiness gates

1. Exact original statements/version/name/order for all reported 18 migrations
   remain unavailable. Source-controlling these expectations does **not** close
   that task or certify replay.
2. Exact live RLS/grants, anon denial, authenticated-only RPC execution,
   security-definer search paths, triggers, private helpers, FK actions and
   constraints need an authorized read-only ledger/schema export.
3. Live multi-identity read/write isolation across all tables and draft revision
   triggers requires separately authorized disposable users/data. Synthetic
   adapter/browser tests do not certify this and make no live writes.
4. Concurrent last-admin protection, deletion/dependency races and partial
   reusable duplication are not promoted to unverified transaction guarantees.
5. Semantic references, comments/approvals, immutable releases/history, media,
   style enforcement, Brand & Outputs and publishing remain separate product
   work. Route labels and JSON extensibility are not backend contracts.
