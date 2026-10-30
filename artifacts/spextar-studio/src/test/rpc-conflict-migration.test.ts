import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './backend-contract-inspector';

const root = resolve(repositoryRoot, 'supabase/migrations');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const current = read('20261030213342_non_retryable_rpc_conflicts.sql');
const specs = [
  ['20261030001220_immutable_document_releases.sql', 'publish_document_release', 3],
  ['20261030001220_immutable_document_releases.sql', 'review_transition', 5],
  ['20261029184603_freeze_review_dependency_packages.sql', 'review_dependency_package', 1],
] as const;
const definition = (sql: string, name: string) => sql.match(new RegExp(
  `create (?:or replace )?function app_private\\.${name}\\([\\s\\S]*?end \\$\\$;`,
))![0];

describe('Forward-only PostgREST conflict contract', () => {
  it.each(specs)('changes only deterministic RAISE transport from %s / %s', (file, name, count) => {
    const original = definition(read(file), name);
    expect(original.match(/errcode = '40001'/g)).toHaveLength(count);
    const expected = original.replace('create function', 'create or replace function')
      .replace(/raise exception '([^']*)' using errcode = '40001'/g,
        (_, message: string) => `raise sqlstate 'PT409' using message = '${message}'`);
    expect(definition(current, name)).toBe(expected);
  });
  it('leaves no retryable authored guard in effective definitions and adds no other DDL', () => {
    const effective = new Map<string, string>();
    for (const file of readdirSync(root).filter(f => f.endsWith('.sql')).sort()) {
      for (const match of read(file).matchAll(/create (?:or replace )?function ([\w.]+)\([\s\S]*?\$\$;/gi)) {
        effective.set(match[1], match[0]);
      }
    }
    for (const sql of effective.values()) expect(sql).not.toMatch(/40001|40P01|serialization_failure|deadlock_detected/);
    let remainder = current.replace(/^--.*$/gm, '');
    for (const [, name] of specs) remainder = remainder.replace(definition(current, name), '');
    expect(remainder.replace(/begin;|commit;|\s/g, '')).toBe('');
  });
});
