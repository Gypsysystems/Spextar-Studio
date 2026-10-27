# SPEXTAR Studio

## F3 Slice 2B1-B — Conditional Tags Management

The existing Variables & Conditions route now includes a functional Conditional tags tab. Categories and values are project-scoped through the same authenticated service boundary as Variables. Backend mode uses `condition_categories` and `condition_values` only; errors never fall back to demo fixtures. No migrations or Auth changes are included.

The table adapter projects category columns `id, project_id, name, key, description, settings, unassigned_behavior, value_match_mode, created_at, updated_at` and value columns `id, category_id, name, key, sort_order, created_at, updated_at`. Reads are paginated and strictly validated; malformed JSON/settings, unsupported behavior modes, invalid keys/orders, foreign parents and duplicate identities fail closed. Settings can be a JSON object or null and are preserved, not edited or overwritten by metadata changes. Server IDs, ownership and timestamps are never sent as writable input.

Project Admin/Author membership is required for category/value creation, metadata edits and renames. Inherited Workspace Admin access alone is read-only, as are Project Reviewer/Viewer roles. UI and services check `canEditContent === true`; authenticated database RLS remains the final authority on every request. A value read/write first resolves its category under the requested project. No category/value deletion is exposed.

Keys follow the same lowercase, letter-first, 80-character rule as Variables. Display names are nonblank and at most 120 characters. Existing keys and IDs are intentionally immutable in this management UI; rename changes only the display name so future semantic assignments retain stable identities. New values suggest the highest current sort order plus 10 (bounded by the SQL integer limit). Editing Order changes just that value in one update; there is no non-atomic multi-row swapping or renumbering. Values sort by `sort_order`, then stable ID for ties, subject to database uniqueness constraints.

Default guidance is no tag → Include, same-category values → any/OR, different categories → AND. Existing include/exclude and any/all category settings are displayed accurately and editable through finite choices, not Boolean expressions. These settings are stored definitions only: Author assignment, actual output filtering/resolution, reference tracking, usage counts and affected-document claims are not implemented. The separate Output preview tab remains a labelled later-state placeholder.

Demo samples belong to one adapter in memory, are cloned across the service boundary, never write to Supabase/browser storage, and are discarded on sign-out or app reload. The surrounding demo session/project infrastructure is unchanged. Automated adapter tests use contract doubles, not a live RLS simulator; controlled-browser acceptance likewise does not certify live two-account RLS.

## F0/F1 foundation and F2 metadata integration

SPEXTAR Studio is a structured authoring and content management workspace for technical writers. It has no AI features. Backend mode uses Supabase Auth and the existing F0/F1 organization/workspace/project database. Isolated demo mode uses browser-local fixture data. The brand uses the exact supplied Figma vectors; full-screen UI fidelity still requires comparison with the complete frozen design file.

## Approved branding

- `public/brand/spextar-wordmark-reversed.svg`: exact dark-background wordmark from Figma asset `306e57fe-6f96-4527-8473-c57fab20e1cc`.
- `public/brand/spextar-wordmark-primary.svg`: exact light-background wordmark from Figma asset `8a246462-3677-40de-932f-fb1b08cd7852`.
- `public/brand/spextar-signature-x.svg`: exact compact mark from Figma asset `fb26ee43-c3e6-47a3-b8cc-2769e738348a`; also copied verbatim as `public/favicon.svg`.
- Files are unchanged local copies, not temporary Figma runtime URLs. SHA-256 regression tests protect their original contents.
- Shared lockup: 115×20 vector wordmark, 6px gap, inline right-hand Studio suffix in Inter Medium 12px/16px, #A7A7B0. Never render SPEXTAR as text.
- The black-stroke Signature X retains its original colors; collapsed dark navigation gives it a neutral white backing for contrast. No violet rounded-square replacement mark is used.

## Route map

| Route | View | Scope |
|---|---|---|
| `/` | Workspaces after authentication; otherwise redirects to `/sign-in` | Functional |
| `/sign-in` | Email/password in backend mode; explicit demo entry in demo mode; OAuth providers inactive | Functional |
| `/workspaces` | Organization selection/creation, workspace search/creation | Supabase or isolated demo |
| `/workspaces/:workspaceId/projects` | Projects: search, status filter, Create project; document Import project remains demo-only | Supabase or isolated demo |
| `…/projects/:projectId` | Project Home: lifecycle counts, recent documents, activity, project areas | Functional |
| `…/documents` | Live document list, expandable topic outlines, create/duplicate, metadata and confirmed empty-document deletion | Supabase or isolated demo |
| `…/author`, `…/author/:documentId` | Preserved outline/editor/inspector with open-source Tiptap. Backend metadata/tree and structured JSON drafts persist; demo bodies stay session-only | F2 + F3 Slices 1/2A |
| `…/review`, `…/publish` | Placeholder that also lists the matching documents (read-only). Actions are disabled | Placeholder |
| `…/variables-conditions` | Text variable management, output overrides, scoped validation, category/value management; Output preview tab coming next | Supabase or session-only demo |
| `…/reusable-content`, `…/style-guide`, `…/history`, `…/settings`, `…/brand-outputs` | Route-ready placeholders | Placeholder |
| anything else | Not found. Unknown workspace, project and document IDs also show not-found inside the shell | — |

Breadcrumbs: Workspaces → workspace → project → page/document.

## F3 Variables Management (Slice 2B1-A)

- The supplied written specification extracted from frozen Figma node `37:276` is the visual contract: existing project shell, three text tabs, responsive list/details/reference rail, semantic dark/light cards, and violet selection. The actual Figma file was not fetched.
- `Services.variables` exposes list/create/update/rename/duplicate and nonmutating validation. Backend mode uses normal authenticated `public.project_variables` table operations only, never fixtures or new RPCs. Every query/write is project-scoped; existing organization/project resolution and explicit `project.canEditContent === true` gate writes. RLS remains the final authority. Reviewer/Viewer and inherited Workspace Admin without explicit Project Admin/Author membership are read-only.
- The exact selected columns are `id, project_id, name, key, value_type, value, description, required, output_values, created_at, updated_at`. New writes supply only editable fields plus project ID on insert; IDs, ownership and timestamps stay server-controlled. Rename changes name/key only; duplication creates a new server-assigned ID with copied values and overrides.
- This slice supports `value_type: "text"` and JSONB **string** `value` (not an object and not an additional JSON-encoded string). `output_values` is a JSON object with stable IDs `web-help`, `pdf-manual`, `word-review`, each containing a string override when present. Empty/whitespace-only or missing overrides resolve to the unchanged default string. Unknown output IDs/types, null/non-string values, malformed dates and foreign project records fail explicitly; no unsupported values are silently dropped or coerced.
- Names are nonblank, single-line and at most 120 characters; display names such as `ProductName` are unchanged. Keys exactly match the live constraint `^[a-z][a-z0-9_]{0,79}$`: lowercase letter first, then only lowercase letters/digits/underscores, maximum 80 characters. The same schema governs forms, create/edit/rename/duplicate, demo/backend reads and project validation. Suggestions are lowercase and bounded; digit-leading names receive a `var_` prefix, and duplicate suffixes reserve space within 80 characters. Manually entered and backend keys are never silently lowercased or trimmed. Text values/overrides allow up to 50,000 characters; descriptions allow up to 2,000. The database enforces its own uniqueness and constraints; conflicting keys are reported without retries or fallback. A required default cannot be saved blank. Existing required-empty rows remain readable and are flagged by validation.
- “Validate project” checks **variable definitions only**, including missing required defaults and malformed/unsupported rows/overrides. It reports all row issues without changing data. It does not claim to validate references, inserted tokens, conditional content, outputs or publishing.
- Demo variables use the same contract with adapter-owned in-memory sample data. Changes are session-only, never sent to Supabase or stored in browser storage, and are cleared on demo sign-out; reloading recreates the demo samples.
- No deletion API/UI, semantic insertion, usage counts, document references, conditional tags, reusable content, publishing or schema migration is included. The rail explicitly states that reference tracking depends on future variable insertion. The separate Output preview tab is coming next; the selected variable's resolved-value rail is not an output rendering engine.
- Saves are explicit form submissions with field/error preservation and cache invalidation, not topic-body autosave. Existing Author/editor loading, structured JSON, topic autosave/concurrency/recovery and F2 behavior are unchanged.

## Structure

```
src/domain/types.ts            Domain model (pure types)
src/services/contracts.ts      AuthService, OrganizationService, WorkspaceService, ProjectService, DocumentService
src/services/demo-adapter.ts   Local async adapter (fixtures + localStorage, simulated latency)
src/services/storage.ts        Safe localStorage helpers (versioned keys `spextar.v1.*`)
src/services/import-schema.ts  Zod import contract + example
src/fixtures/demo-data.ts      Seeded org, workspaces, projects, documents, activity
src/providers/services-provider.tsx  Injects Services (swap adapter / inject fakes in tests)
src/hooks/use-studio-data.ts   React Query hooks for every service call, plus usePageTitle
src/components/shell/          Global shell: 240/72px dark nav, breadcrumbs, mobile sheet
src/features/                  project scope + sections, create/import dialogs, workspace dialog
src/pages/                     Routed views
```

### Supabase configuration and mode isolation
- Default mode is `demo`. `createRuntimeServices()` reads `VITE_STUDIO_MODE` (`demo` or `backend`); unknown modes fail closed.
- Backend mode uses `@supabase/supabase-js` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Only the approved project URL is accepted; missing/incorrect configuration fails closed. These Vite settings are public browser configuration, never service-role credentials.
- The adapter reads profiles and organization/workspace/project membership roles through RLS. Workspace reads are scoped to the active organization; project reads validate the workspace and scope the project identifier. Organization selection is validated against authenticated memberships.
- Email/password sign-in, verified session restoration, refresh/identity notifications, and local-browser sign-out are connected. SDK tokens use a dedicated backend auth storage namespace. Passwords are never copied to application storage.
- Microsoft and Google controls remain disabled. No OAuth requests are issued.
- All application routes share `SessionGate`. Only `/sign-in` is public. Demo entry is an explicit local-session action, not credential authentication.
- Existing `spextar.v1.*` record/session keys are exclusively demo storage. Backend adapters must never consume them or automatically migrate them into real accounts. Navigation preference is retained.
- Implement `Services` from `contracts.ts` and pass it in with `<ServicesProvider services={...}>`.
- `Services` declares its mode. Sessions are a discriminated demo/backend union. Backend authentication supports password sign-in, restore, sign-out and auth-change subscriptions; backend mode refuses `enterDemo()`.
- `SessionProvider` sits outside the data cache. Each identity, organization or role transition gets a fresh QueryClient; the old client cancels queries and clears query/mutation caches. Token refresh for an unchanged identity does not destroy page state. Sign-out immediately locks routes, clears the backend organization preference and backend credentials even on a network failure, and leaves demo records and navigation preference separate.
- Replacing the injected adapter also resets session and cache state. Sign-in renders no organization query before authentication.
- No schema migrations, grants, policies or membership inserts are performed by this application.

### Atomic creation contract

- Organization/workspace/project creation must use one existing database RPC that creates the resource and owner/admin membership atomically. The client never implements this as multiple inserts.
- The public publishable API cannot expose the full schema anonymously. After authentication, read-only GET probes with deliberately unmatched parameters request PostgREST's callable-function signature hints. Supported names are `create_organization_with_owner` / `create_organization`, `create_workspace_with_admin` / `create_workspace`, and `create_project_with_admin` / `create_project`.
- Only parameters whose resource-name/slug/description/parent-ID meanings are recognized are accepted. Unknown or undiscoverable signatures fail explicitly without a write. A verified signature is cached for subsequent creation calls.
- The actual creation response must contain the resource ID. The adapter re-reads the resource and verifies the new owner/admin membership before showing success.
- These authenticated RPC signatures and live multi-account RLS behavior must be verified against an authorized account; automated contract doubles do not prove live database transaction behavior.
- The database uses `projects.slug` for the UI's short project key. Product metadata and document import are not in the F0/F1 foundation, so the backend form/control does not pretend to save them.
- F2 document/topic reads, metadata updates, create/move/promote/demote/duplicate operations use Supabase behind the existing service abstraction. F3 Slice 1 adds separate `topicDrafts.get/save` service methods for structured body JSON, debounced autosave, revision conflicts and browser recovery. Publishing execution and activity persistence remain outside this integration. Backend queries do not use fixtures. See `F2.md` and `F3.md`.
- F3 Slice 2A uses MIT-licensed Tiptap as an editor only, not the persisted-model authority. The SPEXTAR JSON bridge retains version/root metadata and Topic-scoped node IDs, rejects unsupported structures without flattening, and feeds the existing Slice 1 controller. Demo editing uses the same surface without backend body persistence. See `F3.md` for the supported schema and identity contract.
- F3 Slice 2B adds semantic Note/Tip/Caution/Warning callouts with stable IDs, kind changes, lossless unwrap, keyboard exit and the same revision-safe draft/recovery path. Reviewer/Viewer stay read-only; demo edits remain session-only. No migrations or new dependencies are needed.
- F3 Slice 2C adds Topic-local literal Find and Replace, match navigation and case sensitivity. Search is available read-only; replacement preserves nodes/IDs/marks through the existing autosave/recovery/concurrency flow. Search state/highlights are never persisted. Unknown JSON stays read-only; no schema or dependencies change.
- Structured paste hardening preflights HTML and validates the full insertion before changing JSON. Unsupported content offers explicit literal-text fallback; copied nodes receive new IDs. Long Topics have heading navigation and Ctrl/Cmd+Alt+Up/Down shortcuts, available read-only without saves. See `F3.md` for limits and clipboard handling.
- Author is a lazy route behind the existing session gate. Workspaces, Projects and Documents do not download the editor. While downloading, the existing project shell shows an accessible loading state; a failed download offers Reload Author or Back to Documents. No automatic reload risks unsaved work. Runtime editor errors still use the existing routed error boundary.
- After a production build, `pnpm --filter @workspace/spextar-studio check:bundle` checks the Vite manifest and emitted JavaScript to ensure Author is a dynamic entry and ProseMirror is absent from the initial static import graph. It reports initial/deferred JavaScript byte sizes; build outputs remain ignored.
- Advanced technical tables add safe merge/split, first header-row/column and selected-cell header controls, cell/row/column/table selection, keyboard range selection, and Tab navigation/row creation. Operations preserve the existing draft/recovery/CAS contract and exact undo/redo; Reviewer/Viewer remain read-only and malformed JSON remains verbatim. No migrations or dependencies are added.
- All methods return Promises. `get*` methods resolve `null` for not-found. Conflicts and validation errors throw `ServiceError` (`code`, `issues`).

### Test-readiness
- Every interactive or meaningful element has a `data-testid` (for example `button-create-project`, `row-project-<id>`, `nav-<section>`, `outline-topic-<id>`).
- Services are injectable, so unit tests can render pages with a fake `Services` object without touching storage.

### Automated tests
- `pnpm --filter @workspace/spextar-studio test` — Vitest + React Testing Library in jsdom.
- `pnpm --filter @workspace/spextar-studio test:watch` — interactive watch mode.
- `pnpm --filter @workspace/spextar-studio test:coverage` — service/auth/router coverage; HTML report in ignored `generated-artifacts/spextar-coverage`.
- `pnpm --filter @workspace/spextar-studio typecheck` — includes test source type checks.
- Tests cover route protection and placeholder routes, workspace/project/document navigation and breadcrumbs, 240px/72px persistence/tooltips, not-found cases, sign-in/sign-out, invalid/foreign sessions, mode isolation, old cache cancellation, auth identity changes, import validation and service boundaries.
- jsdom tests do not certify pixel fidelity or real browser layout. The frozen Figma source is still needed for an exact visual comparison.

## Demo import contract (v1)

Upload a `.json` file of 1 MB or less. The file is validated against the schema before anything is created.

```json
{
  "spextarImport": 1,
  "project": {
    "name": "Meridian X5 Quick Start",
    "key": "MX5",
    "description": "optional, max 400 chars",
    "product": "optional",
    "documents": [
      {
        "title": "First power-on",
        "type": "guide | procedure | reference | release-notes",
        "summary": "optional",
        "topics": [
          { "title": "Before you begin", "kind": "concept | task | reference", "level": 1, "body": ["Paragraph", "Paragraph"] }
        ]
      }
    ]
  }
}
```

Rules:
- `name` is 3–80 characters.
- `key` is optional. When present it must match `^[A-Z][A-Z0-9]{1,9}$` and be unique in the workspace. When missing, a key is derived from the name.
- Limits: up to 50 documents, up to 200 topics per document, and `level` from 1 to 4.
- `body` can be a string or an array of strings.
- Imported documents start as `draft`.

The import dialog also has an **Example file** download.

## Manual verification checklist
1. `/` redirects to `/sign-in` without a session. Enter demo explicitly to see Workspaces and Halvorsen Instruments context.
2. Collapse the nav: it goes from 240px to 72px and shows icon tooltips on hover and focus. Reload the page and the setting persists.
3. Go to Product Documentation → Projects. Check that search, the status filters and the empty-filter reset all work.
4. Create project: the form validates, the key is auto-suggested, and duplicate keys are rejected. You land on Project Home. Reload and the project persists.
5. Import project with a valid example file: it creates the project and its documents. A malformed file shows the issues and creates nothing.
6. Use the sidebar workspace switcher to move between workspaces.
7. Project Home → Documents → expand an outline → open a topic in Author. Promote and Demote work via buttons and Alt+Arrow keys. Discard changes resets the edits.
8. Author at 1280px shows three panes. On mobile the panes stack and the nav opens as a sheet.
9. Review and Publish list documents in that state, and their actions are disabled and marked not connected.
10. `/workspaces/nope/projects`, an unknown project, `…/author/unknown` and `/random` all show not-found.
11. `/sign-in` → Enter demo → account menu → Sign out returns you to `/sign-in`.
