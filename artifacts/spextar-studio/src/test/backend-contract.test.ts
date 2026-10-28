import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adapterFiles, declarationValue, domainDirectory, inspectQueries, querySurface, readSource, repositoryRoot,
  semanticDigest, serviceDirectory, type BackendContract } from './backend-contract-inspector';
import { variableKeySchema } from '@/domain/project-variables';
import { projectMetadataSchema, settingsRole } from '@/domain/project-settings';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble, testSession } from './supabase-double';
import { atomicOperations } from '@/services/supabase-atomic';

const contract = JSON.parse(readFileSync(resolve(repositoryRoot, 'supabase/readiness/application-contract.json'), 'utf8'));
const review = JSON.parse(readFileSync(resolve(repositoryRoot, 'supabase/readiness/source-review.json'), 'utf8')) as {
  files: Record<string, string>;
};
const tables = contract as BackendContract;
const adapter = (file: string) => `${serviceDirectory}/supabase-${file}.ts`;
const reviewedDomains = ['project-variables', 'project-conditions', 'reusable-content', 'project-settings', 'topic-content', 'structured-content']
  .map(name => `${domainDirectory}/${name}.ts`);

describe('offline backend contract readiness (not live migration/RLS certification)', () => {
  it('inventories every backend module and the schema/JSON validators it relies on', () => {
    expect(Object.keys(review.files).sort()).toEqual([
      ...adapterFiles(), ...reviewedDomains, `${serviceDirectory}/validation.ts`,
    ].sort());
  });

  for (const [path, expected] of Object.entries(review.files)) {
    it(`requires explicit contract review when ${path.split('/').pop()} changes`, () => {
      const actual = semanticDigest(path);
      expect(actual, `Review schema/roles/serialization/scoping, then update the documented contract and digest deliberately.\n${querySurface(path).join('\n')}`)
        .toBe(expected);
    });
  }

  it('rejects undocumented static tables, columns, operations, literal write fields and F2 RPCs', () => {
    const reports = adapterFiles().map(path => inspectQueries(path, tables));
    expect(reports.flatMap(report => report.issues)).toEqual([]);
    expect([...new Set(reports.flatMap(report => report.usedTables))].sort()).toEqual(Object.keys(contract.tables).sort());
    for (const table of Object.values(contract.tables) as Array<{ columns: string[]; scope: string[]; insertFields?: string[]; updateFields?: string[]; concurrency?: string[] }>) {
      expect(new Set(table.columns).size).toBe(table.columns.length);
      for (const column of [...table.scope, ...table.insertFields ?? [], ...table.updateFields ?? [], ...table.concurrency ?? []])
        expect(table.columns).toContain(column);
    }
  });

  it.each([
    ["client.from('unreviewed').select('id')", 'undocumented table unreviewed'],
    ["client.from('topics').select('id,body')", 'undocumented topics.body'],
    ["client.from('topics').insert({title:'bad'})", 'undocumented topics.insert'],
    ["client.from('topic_drafts').update({revision:10})", 'undocumented topic_drafts.update field revision'],
    ["rpc('save_topic_body', {})", 'undocumented RPC save_topic_body'],
    ["import { fixture } from './demo-adapter'", 'backend must not import demo/test data'],
  ])('detects synthetic contract drift: %s', (source, issue) => {
    expect(inspectQueries('synthetic.ts', tables, source).issues.some(message => message.includes(issue))).toBe(true);
  });

  it.each([
    ['topic-drafts', ".eq('revision', expectedRevision)", ''],
    ['reusable', ".eq('revision', expected)", ''],
    ['project-settings', ".eq('updated_at', expected)", ''],
    ['atomic', 'if (!parent?.trim())', 'if (false)'],
    ['documents', '{ p_topic_id: topicId }', '{}'],
    ['variables', 'project.canEditContent !== true', 'false'],
  ])('detects removal of a reviewed boundary in %s', (name, before, after) => {
    const path = adapter(name), source = readSource(path);
    expect(source).toContain(before);
    expect(semanticDigest(path, source.replace(before, after))).not.toBe(review.files[path]);
  });

  it('keeps documented stable keys and writable project values aligned with actual domain parsers', () => {
    const pattern = new RegExp(contract.values.stableKeyPattern);
    for (const key of ['product_name', 'a', 'a0_', 'a'.repeat(80), 'ProductName', '_name', '0name', 'a'.repeat(81), 'a\n', '', 'a-b', 'é']) {
      expect(variableKeySchema.safeParse(key).success, key).toBe(pattern.test(key));
    }
    for (const status of [...contract.values.projectWritableStatus, 'in_review', 'published']) {
      expect(projectMetadataSchema.safeParse({ name: 'Project', slug: 'project', description: null, status }).success)
        .toBe(contract.values.projectWritableStatus.includes(status));
    }
    expect(settingsRole.options).toEqual(contract.roles.project);
  });

  it('matches authoritative atomic and document/topic RPC contracts to actual adapter declarations', () => {
    expect(declarationValue(adapter('atomic'), 'rpcNames')).toEqual(contract.rpcs.atomicNames);
    expect(declarationValue(adapter('documents'), 'rpcParameters')).toEqual(contract.rpcs.documentTopicOperations);
    const source = readSource(adapter('documents'));
    expect(source).not.toContain('__spextar_signature_probe__');
    expect(source).not.toContain('PGRST202');
    expect(source).not.toContain('error?.hint');
  });

  it.each(['organization', 'workspace', 'project'] as const)('keeps %s RPC arguments aligned with the confirmed contract', async entity => {
    const { client, raw } = supabaseDouble();
    await atomicOperations(client)(entity, { name: 'Contract Test', slug: 'contract-test', organizationId: 'org-a', workspaceId: 'ws-a' });
    const [name, args] = raw.rpc.mock.calls[0];
    expect(name).toBe(contract.rpcs.atomicNames[entity]);
    expect(Object.keys(args).sort()).toEqual([...contract.rpcs.atomicParameters[name]].sort());
    expect(raw.rpc).toHaveBeenCalledTimes(1);
    expect(raw.from).not.toHaveBeenCalled();
  });

  it.each([['orgRole', 'organization'], ['workspaceRole', 'workspace'], ['projectRole', 'project']])(
    'matches %s membership parsing to the documented role model', (declaration, scope) => {
      expect(declarationValue(adapter('adapter'), declaration)).toEqual(contract.roles[scope]);
    },
  );

  it.each(['admin', 'author', 'reviewer', 'viewer', null])(
    'aligns actual service permissions with the manifest for explicit role %s, not inherited administration', async role => {
      const fake = supabaseDouble(testSession);
      fake.db.project_members = role ? [{ project_id: 'project-a', user_id: testSession.user.id, role }] : [];
      // The fixture has workspace admin authority in every case. It must not
      // substitute for explicit project authoring or project administration.
      const services = createSupabaseServices(fake.client);
      const project = await services.projects.getProject('ws-a', 'project-a');
      expect(project?.canEditContent === true).toBe(contract.roles.projectContentWriters.includes(role));
      const settings = await services.projectSettings.get({ workspaceId: 'ws-a', projectId: 'project-a' });
      expect(settings.canAdminister).toBe(contract.roles.projectAdministrators.includes(role));
      expect(fake.calls.filter(call => call.patch || call.insert || call.deleted)).toEqual([]);
      expect(fake.raw.rpc).not.toHaveBeenCalled();
    },
  );

  it('never represents local checks as exact live migration parity', () => {
    expect(contract.migrationHistory).toMatchObject({ verifiedFromLiveLedger: false, exactSqlAvailable: false, replayCertified: false });
    expect(contract.unresolved.length).toBeGreaterThan(0);
  });
});
