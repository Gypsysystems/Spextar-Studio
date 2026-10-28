# Migration source-control handoff — SQL not yet exported

This directory intentionally contains **no reconstructed SQL migrations**.
The application contract in [`../readiness`](../readiness/README.md) is not a
database definition and must never be applied as one.

The supplied project history reports **18 applied migrations**. This is a
reported count, not a live ledger query result from this change. Neither that
count nor application reads establish the original SQL, timestamps, policy
definitions, foreign-key actions, function security properties or replayability.

## Known supplied identities (partial, not an export)

These nine identities were supplied earlier in the project conversation. They
remain **unverified against an exported ledger**, and are not placeholder files:

| Version | Name |
|---|---|
| 20261026235245 | f0_f1_identity_workspace_project_foundation |
| 20261026235312 | index_created_by_foreign_keys |
| 20261026235541 | harden_membership_bootstrap_and_create_flows |
| 20261027002606 | restrict_atomic_create_rpc_execution |
| 20261027002742 | least_privilege_authenticated_table_grants |
| 20261027010030 | f2_documents_topics_foundation |
| 20261027010127 | index_topics_parent_document_foreign_key |
| 20261027010421 | f2_topic_tree_operations |
| 20261027010458 | f2_document_topic_duplication |

Nine timestamped identities are listed above; organization-owner membership
protection was also confirmed, but its timestamp/name/SQL were not supplied
authoritatively here. Do not invent the remaining ledger entries.

## Safe completion gate

1. Obtain an authorized **read-only export** of the applied migration ledger,
   including version, name and the original ordered SQL statements for every
   applied entry, or the original files verified against that ledger.
   Do not request/expose a service-role key in the browser, weaken metadata
   access, grant anon access, or use application table reads as a schema dump.
2. Verify the current live count rather than assuming it is still 18. Reject
   missing/duplicate versions, missing SQL, truncated exports and name/order
   mismatches. Preserve exact original statements and their order; do not
   regenerate approximate migrations from a current-schema dump.
3. Track one `<version>_<name>.sql` per actual entry here. Record the export
   provenance and per-file checksums in a reviewed manifest without tokens,
   connection strings, personal data or machine-local paths.
4. Compare ledger identities, statement order and checksums. Reconcile adapter
   expectations with the exported schema, not by silently changing the database.
5. If replay validation is available, use only a separately authorized isolated
   disposable environment. Replay has **not** been performed or certified here.
   Never reset, repair, push, rerun, roll back or apply migrations on the live
   SPEXTAR project as part of source control.
6. Run the repository regression/typecheck/build/browser/bundle gates before
   committing the exact baseline. Do not claim migration parity until all
   applied entries and their exact SQL have been compared.

No migrations or live queries are executed by the readiness checks.
