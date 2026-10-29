# Recovered authoritative migration history

This directory contains all **21 applied migrations** from the approved Supabase
project `luyyxblmtupmugtazgbr`, recovered for [Issue #2](https://github.com/Gypsysystems/Spextar-Studio/issues/2)
on 2026-10-29. Each `<version>_<name>.sql` preserves the exact stored SQL text.
The latest is `20261028234310_align_authenticated_content_write_grants.sql`.
No migration was executed during recovery; no live database write occurred.

## Source and byte preservation

The authoritative source was `supabase_migrations.schema_migrations`, accessed
through connected Supabase MCP tools with read-only migration listing and
`SELECT` queries. The export read `version`, `name` and `statements` in version
order. SQL text was transported as base64 of `convert_to(statements[1], 'UTF8')`
and decoded directly into file bytes. No headers, separators, formatting,
line-ending changes or extra final newline were added.

Every ledger entry contains one element in its `statements` array. This is a
**stored-statement count**, not a count of SQL commands: an element can contain
several commands, functions and comments. For these entries the exact file bytes
match `md5(array_to_string(statements, E'\n'))` without joining multiple elements.

[`migration-manifest.json`](migration-manifest.json) records the shared source,
capture date, checksum convention and each version, name, filename,
stored-statement count, UTF-8 byte count and MD5. All 21 identities and checksums
matched the live ledger, the product-owner audit in Issue #2 and the retained
handoff CSV. The latest SQL also matched the retained original file byte for byte,
with MD5 `fa15d85d89ac2782b815ee55d5a628e4`.

The earlier report of 18 migrations and nine partial identities is superseded.
Historical migration-status fields in `../readiness/application-contract.json`
and its readiness documents describe the earlier application-contract snapshot;
this manifest is the recovery authority. The application contract remains an
expectation inventory, not SQL or a certification of live schema/security/replay.
Its drift checks and semantic digests were not changed.

## Offline integrity check

From the repository root, this checks the exact file set, unique ordered versions
and names, stored-statement counts, byte counts and MD5s without contacting
Supabase or executing SQL:

```sh
python - <<'PY'
import hashlib
import json
from pathlib import Path

root = Path('supabase/migrations')
manifest = json.loads((root / 'migration-manifest.json').read_text())
entries = manifest['migrations']
assert len(entries) == 21
assert len({entry['version'] for entry in entries}) == 21
assert len({entry['name'] for entry in entries}) == 21
assert entries == sorted(entries, key=lambda entry: entry['version'])
assert {path.relative_to(root).as_posix() for path in root.rglob('*.sql')} == {
    entry['file'] for entry in entries
}
for entry in entries:
    assert entry['file'] == f"{entry['version']}_{entry['name']}.sql"
    assert entry['statement_count'] == 1
    body = (root / entry['file']).read_bytes()
    assert body.decode('utf-8').encode('utf-8') == body
    assert len(body) == entry['byte_count']
    assert hashlib.md5(body).hexdigest() == entry['md5'], entry['file']
assert entries[-1]['version'] == '20261028234310'
assert entries[-1]['md5'] == 'fa15d85d89ac2782b815ee55d5a628e4'
print('21 exact migration files: identities, sizes and MD5s match manifest')
PY
git diff --check
```

This verifies local integrity against the captured manifest. A later live ledger
comparison requires another authorized read-only query. MD5 is retained for
parity with the ledger audit, not as a signature.

## Safety and remaining verification

Recovery closes the missing-original-SQL source-control gap for these 21 entries.
It does **not** certify replay, current schema parity, RLS/security behavior or
product UAT. No live schema, grants, policies, Auth configuration, functions,
triggers, tables, data or migration-ledger entries were modified. Application
behavior, permissions, lifecycle semantics, branding and deployment are unchanged.

Never replay, reset, repair, push, apply, rerun, revert or roll back migrations on
the live SPEXTAR project as part of recovery. Any replay validation requires a
separately authorized isolated disposable environment. Do not infer missing SQL
from current schema, regenerate historical bodies, or normalize these files to
silence a check. If a later comparison differs, report the exact gap and obtain
authoritative originals before extending the manifest.

The application contract in [`../readiness`](../readiness/README.md) must never
be applied as a database definition. Repository regression, typecheck/build,
bundle and controlled browser checks support technical verification; they do
not execute these migrations or certify live database behavior. Review the
recovery PR before merge; deployment and replay remain separate decisions.
