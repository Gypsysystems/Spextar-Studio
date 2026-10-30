# Private Beta UAT execution matrix

Prepared 2026-10-30 for [Issue #24](https://github.com/Gypsysystems/Spextar-Studio/issues/24).
This is an execution plan, not completed UAT or authorization to modify staging.
Use only a separately approved staging candidate and disposable accounts/data.
The product owner records acceptance after engineering verification.

## Setup and evidence

Record candidate Git SHA/build identity, migration ledger versions, browser/OS,
viewport, theme, tester, persona and UTC time. For every row record PASS/FAIL/BLOCKED,
actual result, redacted screenshot/trace reference, defect and retest reference.
Never attach tokens, passwords, browser storage exports or real customer content.

Create tenant A and tenant B with distinct synthetic documents, variables,
conditions and reusable content. Tenant A needs six separate accounts: O (Org
owner/admin with no project membership), W (Workspace Admin with no project
membership), P (explicit Project Admin), A (Author), R (Reviewer), V (Viewer).
Give A/R/V ordinary organization/workspace membership and only their stated
project role. Test an additional organization admin independently of bootstrap
owner; neither may inherit project authoring. B has its own owner and project.
Use a separate spare Admin for revocation tests; never remove the sole Admin.
Keep an unauthenticated/incognito session and two independent signed-in browser
sessions. Preserve two server revisions for conflict exercises.

Run the primary flow with P/A/R, then repeat the denied actions with O/W/V.
Repeat critical paths at desktop 1440/1280px and mobile 390px in dark and light.
Account setup and cleanup require their own authorized staging-data scope.

| ID / actors | Steps | Expected result / evidence to retain |
| --- | --- | --- |
| U01 all | Sign in with incorrect password, correct password; reload a protected deep link; sign out; use Back | Useful error, verified restoration, safe internal return path; protected content closes immediately after sign-out. No external redirect |
| U02 all | Sign in, open Workspace → Project → Project Home → Documents; navigate directly and reload | Authorized scope, correct breadcrumbs, human-readable identities, Unknown user/Unversioned when appropriate; no cross-tenant rows or raw UUID labels |
| U03 O/W/P | Create workspace/project as permitted; inspect Settings; attempt direct project metadata/member operations under parent-only roles | Initial creator gets explicit Admin through bootstrap. Established project settings/members mutate only for P; inherited administration does not grant authoring. Capture server denial as well as hidden controls |
| U04 P | Rename/archive/restore project; change/add/remove a spare member using expected timestamp/role; try removing/demoting sole Admin | Confirmations and navigation correct; stale writes retain input and require refresh; last Admin stays. O owner cannot be removed/demoted; parent deletion may be retained by evidence FKs |
| U05 P/A | Create/rename/duplicate document and topic; reorder/move/promote/demote; delete permitted leaf/empty document; cancel confirmation | Correct hierarchy, validation, stable IDs and post-action selection; dependent deletion is blocked with useful feedback. No optimistic false success |
| U06 P/A | Author marked text, headings, callouts, merged tables; paste valid and unsafe rich content; Find/Replace, Undo/Redo; reload | Structured body survives save/reload; IDs/metadata preserved; unsafe/malformed paste rejected with explicit text fallback; unsupported saved content remains lossless/read-only |
| U07 P/A; W | Create/rename/duplicate variables and condition category/values; project reusable and workspace-shared reusable; save linked nested reusable | Project authoring requires explicit P/A; workspace-shared writes require workspace administration. Where-used is scoped and saved-state based; partial duplication/body-copy failure is reported |
| U08 P/A | Insert variable, condition pair and nested linked reusable; rename definitions; try missing/foreign-project/foreign-tenant reference and delete referenced definitions | Stable references retain identity; missing states visible; unsupported/out-of-scope capture fails closed; conservative definition-delete blocking remains |
| U09 A/P | Leave a save pending/error/recovery offered, choose Submit; resolve state, save, confirm submission | Submission blocked until persisted content is safe. Exactly one RPC with captured expected timestamp. In Review locks body, metadata and tree, including direct server writes |
| U10 R/P | Open Review; change mutable catalogs/reusable drafts in other session, then reload Review | Exact submitted outline/body/revisions and frozen semantic defaults/conditions/reusable bodies persist; no current semantic-catalog/body requests. Identity profile reads are display-only |
| U11 R/P; A/V/O/W | Request changes with blank note then meaningful note; attempt decision as other roles | Blank note rejected; only R/P decides. Changes Requested returns working document/topics to Draft atomically, retains review evidence and note |
| U12 A then R | Revise and resubmit; R approves; try editing Approved; P/A chooses Start New Draft | New Review sequence and package captured; Approved remains read-only. Explicit new Draft advances existing body revisions and retains immutable approval. No silent edit of Approved |
| U13 V/R/O/W | Inspect Author/Review/Publish controls; attempt submission/new Draft/publication via direct requests | V read-only; R decides but cannot author/publish; O/W parent administration cannot submit/decide/publish absent explicit role. Server rechecks current membership |
| U14 P | Publish latest Approved review; confirm; repeat click/retry same key; inspect Release 1 | One immutable release, accurate status announcement/focus, numbered history, independently verified digests; source is frozen Approved evidence only. Different key cannot publish same approval twice |
| U15 P/A/R | Start Draft from Published; modify variables/bodies; submit/approve; P publishes again; select old/new releases | Release 2 follows 1; old source/digests/approval sequence unchanged. Inspector uses pinned v1 rendering/default variables/neutral conditions and exact reusable provenance |
| U16 P | Attempt legacy NULL package, missing/unsupported/required-empty/cyclic/deep package publication | Publication blocked with actionable recovery via new Draft/resubmission. Optional-empty warns; unsupported release version fails closed, retaining evidence |
| U17 P | Simulate network loss after publishing request; recover by request lookup; same-key retry; navigate/reload | Uncertain state retains mounted-screen key; lookup/retry resolves one release. Reload loses pending UI state; history/approval uniqueness still prevent duplicate. No blind automatic retry |
| U18 P/A | Edit same saved body in two sessions; race metadata expected timestamp and member expected role; restore/discard recovery, switch accounts | Conflict never overwrites newer content. Useful retry/reload choices. Explicit logout clears departing recovery/cache; rejected refresh preserves recovery only for same identity re-authentication |
| U19 spare P | Revoke/demote role from another session while stale page remains open; repeat read/write/transition/publish | Fresh permissions and server authority close access; no fallback/demo rows; old roles in UI/JWT do not broaden authority. No stale cache survives identity change |
| U20 B and anon | Request tenant A IDs through direct routes, REST and RPC as tenant B/anon; query Review/Release with foreign document/review combinations | No protected content/evidence leakage, unauthorized transitions denied, direct INSERT/UPDATE/DELETE on evidence denied; avoid logging request credentials |
| U21 P/A/R | Race publish versus publish/new Draft; simultaneous stale submission/body write; interrupt a transition in approved test setup | Single approval publication, monotonically numbered committed releases; stale/conflict reported; failure has no partial state/evidence. Retain both session timelines and resulting rows |
| U22 all | Keyboard-only navigation, dialogs/Escape/Tab focus trap and restoration, screen-reader names/statuses; 200% zoom; mobile drawer; dark/light | No overflow or hidden actions; correct loading/empty/error/selected/disabled/read-only states. Visible focus, no duplicate landmark labels, axe plus manual contrast/keyboard checks |
| U23 all | Navigate Sign in → Workspace → Project → Author → Review → Publish → history/inspector at all four profiles | Approved Signature X/purple center dot via existing brand components, local Inter, action violet #6236FF, semantic themes and remembered navigation. No external fonts |

## Exit gate

All critical role, tenant, immutable-evidence, recovery and lifecycle rows must pass
on the actual candidate. Record accessibility/mobile differences and unresolved
severity with an owner; security/data-integrity failures block acceptance. Confirm
v1/default/neutral/internal-inspection scope, no PDF/Word/public portal/global
History promise. Product owner signs UAT separately from technical checks and
separately authorizes any Replit deployment/domain connection. See the backend
[validation and rollout checklist](PRIVATE_BETA_BACKEND_VALIDATION.md).
