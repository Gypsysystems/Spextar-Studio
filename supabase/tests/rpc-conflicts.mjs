// Native disposable PostgreSQL regression. No remote configuration or credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDatabase, recordReplay } from './disposable-postgres.mjs';

const db = await openDatabase();
assert.ok(db.native, 'This contract/drift/count regression requires native PostgreSQL');
const directory = new URL('../migrations/', import.meta.url);
const files = fs.readdirSync(directory).filter(f => f.endsWith('.sql')).sort();
const migration = files.at(-1);
assert.ok(migration.endsWith('_non_retryable_rpc_conflicts.sql'));
let checks = 0;
const q = async (sql, args) => (await db.query(sql, args)).rows;
const scalar = async (sql, args) => Object.values((await q(sql, args))[0])[0];
const id = n => `27000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  for (const file of files.slice(0, -1)) await db.exec(fs.readFileSync(new URL(file, directory), 'utf8'));
  assert.equal(files.length - 1, 25);
  const before = await recordReplay(db, files.slice(0, -1));
  await db.exec(fs.readFileSync(new URL(migration, directory), 'utf8'));
  const after = await recordReplay(db, files);
  // Compare the entire inventoried schema/security catalog, normalizing only the
  // nine intended RAISE expressions. Owners, ACLs and function attributes remain exact.
  const normalize = value => JSON.stringify(value).replace(/raise exception '([^']*)' using errcode = '40001'/g,
    (_, message) => `raise sqlstate 'PT409' using message = '${message}'`);
  assert.equal(normalize(before), JSON.stringify(after)); checks++;
  assert.equal(after.functions.filter(f => /raise sqlstate 'PT409'/.test(f.definition)).length, 3);
  assert.ok(!after.functions.some(f => /40001|40P01|serialization_failure|deadlock_detected/.test(f.definition))); checks++;
  const user = id(1), org = id(10), ws = id(11), project = id(12), doc = id(13), topic = id(14);
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await q('insert into auth.users(id) values($1)', [user]);
  await q("insert into organizations(id,name,slug,created_by) values($1,'Conflict','conflict',$2)", [org,user]);
  await q("insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')", [org,user]);
  await q("insert into workspaces(id,organization_id,name,slug,created_by) values($1,$2,'Conflict','conflict',$3)", [ws,org,user]);
  await q("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'admin')", [ws,user]);
  await q("insert into projects(id,workspace_id,name,slug,created_by) values($1,$2,'Conflict','conflict',$3)", [project,ws,user]);
  await q("insert into project_members(project_id,user_id,role) values($1,$2,'admin')", [project,user]);
  await q("insert into documents(id,project_id,title,slug,created_by) values($1,$2,'Conflict','conflict',$3)", [doc,project,user]);
  await q("insert into topics(id,document_id,title,slug,created_by) values($1,$2,'Topic','topic',$3)", [topic,doc,user]);
  await q('insert into topic_drafts(topic_id,content) values($1,$2)', [topic,{type:'doc',version:1,content:[{type:'paragraph',attrs:{id:'p'},content:[{type:'text',text:'Synthetic'}]}]}]);
  const stamp = () => scalar('select updated_at::text from documents where id=$1', [doc]);
  const state = async () => JSON.stringify(await q(`select
    (select jsonb_agg(d) from documents d) documents,
    (select jsonb_agg(t) from topics t) topics,
    (select jsonb_agg(t) from topic_drafts t) drafts,
    (select jsonb_agg(r) from document_reviews r) reviews,
    (select jsonb_agg(r) from document_releases r) releases`));
  const conflict = async (sql, args, message) => {
    const snapshot = await state(), start = performance.now();
    await assert.rejects(() => q(sql, args), e => e.code === 'PT409' && e.message === message);
    assert.ok(performance.now() - start < 2000, `${message} returns promptly`);
    assert.equal(await state(), snapshot, `${message} has no lifecycle/evidence side effects`);
    checks++; console.log('PASS PT409, prompt, unchanged:', message);
  };
  await db.exec('set role authenticated');
  const stale = '2000-01-01T00:00:00Z';
  await conflict('select submit_document_review($1,$2,$3)', [project,doc,stale], 'Document changed');
  const submit = async () => scalar('select submit_document_review($1,$2,$3)', [project,doc,await stamp()]);
  const review = await submit();
  await conflict('select approve_document_review($1,$2,$3,null)', [project,doc,id(999)], 'Review changed');
  await scalar('select request_document_changes($1,$2,$3,$4)', [project,doc,review,'Revise']);
  await conflict('select approve_document_review($1,$2,$3,null)', [project,doc,review], 'Review changed');
  const approved = await submit();
  await scalar('select approve_document_review($1,$2,$3,null)', [project,doc,approved]);
  await conflict('select start_document_draft($1,$2,$3,$4)', [project,doc,approved,stale], 'Approved review changed');
  const time = await stamp(), key = id(500);
  const publishSql = 'select publish_document_release($1,$2,$3,$4,$5)';
  await conflict(publishSql, [project,doc,approved,stale,key], 'Approved document changed');
  await conflict(publishSql, [project,doc,review,time,key], 'Latest approval required');
  // Privileged drift is injected only inside this disposable transaction and rolled back.
  await db.exec('reset role; begin; alter table public.topics disable trigger topics_review_lock');
  await q("insert into topics(id,document_id,title,slug,created_by) values($1,$2,'Drift','drift',$3)", [id(600),doc,user]);
  await db.exec('set role authenticated; savepoint drift');
  await assert.rejects(() => q('select start_document_draft($1,$2,$3,$4)', [project,doc,approved,time]), e => e.code === 'PT409' && e.message === 'Approved outline changed'); checks++;
  await db.exec('rollback to savepoint drift; rollback; reset role');
  await conflict('select app_private.review_dependency_package($1,$2,$3,$4)', [project,id(998),org,[]], 'Review scope changed');
  await db.exec('set role authenticated');
  const release = await scalar(publishSql, [project,doc,approved,time,key]);
  assert.equal(await scalar(publishSql, [project,doc,approved,time,key]), release); checks++;
  await conflict(publishSql, [project,doc,review,time,key], 'Request changed');
  await conflict(publishSql, [project,doc,approved,time,id(501)], 'Approved document changed');
  await scalar('select start_document_draft($1,$2,$3,$4)', [project,doc,approved,await stamp()]); checks++;
  // Nontransactional sequence records actual function entries even on rollback.
  // Instrument only this disposable copy after the unmodified catalog comparison.
  await db.exec('reset role; create sequence app_private.conflict_entries');
  const definition = after.functions.find(f => f.proname === 'review_transition').definition;
  await db.exec(definition.replace(/\bbegin\b/i, "begin perform nextval('app_private.conflict_entries');"));
  await db.exec('set role authenticated');
  await conflict('select submit_document_review($1,$2,$3)', [project,doc,stale], 'Document changed');
  await db.exec('reset role');
  assert.equal(await scalar('select last_value from app_private.conflict_entries'), 1); checks++;
  console.log('PASS one native stale RPC = one measured function execution (not an HTTP/PostgREST claim)');
  console.log(`${checks} native conflict/catalog assertions passed.`);
} finally { await db.close(); }
