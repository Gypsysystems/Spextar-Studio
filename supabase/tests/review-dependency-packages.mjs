// Disposable PostgreSQL only: fresh native loopback cluster or PGlite 0.5.13.
// See docs/PRIVATE_BETA_BACKEND_VALIDATION.md for binary/driver selection.
// No URL, credentials, Supabase CLI or application environment is consumed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase, recordReplay } from './disposable-postgres.mjs';
const db = await openDatabase();
const root = fileURLToPath(new URL('../migrations/', import.meta.url));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0];
const denied = async (action, codes = ['42501','23514','22P02','22023','PT409']) => {
  await assert.rejects(action, e => codes.includes(e.code)); checks++;
};
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.sql')).sort()) {
    // PGlite has built-in gen_random_uuid; pgcrypto is unused by these migrations.
    // Only the PGlite input copy omits extension installation. Native executes
    // the entire file unchanged. Source bytes are never rewritten.
    const original = fs.readFileSync(`${root}/${file}`, 'utf8');
    const sql = db.native ? original : original.replace('create extension if not exists pgcrypto;', '');
    try { await db.exec(sql); } catch (e) { throw new Error(`Offline migration compilation: ${file}: ${e.message}`, { cause: e }); }
  }
  await recordReplay(db, fs.readdirSync(root).filter(f => f.endsWith('.sql')).sort());
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const user = id(1), outsider = id(2), org = id(10), ws = id(11), project = id(12), doc = id(13), topic = id(14);
  const variable = id(20), category = id(21), value = id(22), reusable = id(23), nested = id(24);
  await query(`select set_config('request.jwt.claim.sub',$1,false)`, [user]);
  await query(`insert into auth.users(id) values ($1),($2)`, [user, outsider]);
  await query(`insert into organizations(id,name,slug,created_by) values($1,'Test org','test-org',$2)`, [org,user]);
  await query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [org,user]);
  await query(`insert into workspaces(id,organization_id,name,slug,created_by) values($1,$2,'Test workspace','test-workspace',$3)`, [ws,org,user]);
  await query(`insert into workspace_members(workspace_id,user_id,role) values($1,$2,'admin')`, [ws,user]);
  await query(`insert into projects(id,workspace_id,name,slug,created_by) values($1,$2,'Test project','test-project',$3)`, [project,ws,user]);
  await query(`insert into project_members(project_id,user_id,role) values($1,$2,'admin')`, [project,user]);
  await query(`insert into documents(id,project_id,title,slug,created_by) values($1,$2,'Test document','test-document',$3)`, [doc,project,user]);
  await query(`insert into topics(id,document_id,title,slug,created_by) values($1,$2,'Test topic','test-topic',$3)`, [topic,doc,user]);
  await query(`insert into project_variables(id,project_id,name,key,value,required,output_values) values($1,$2,'Product','product','"Frozen"',true,'{"web-help":"Web frozen"}')`, [variable,project]);
  await query(`insert into condition_categories(id,project_id,name,key) values($1,$2,'Audience','audience')`, [category,project]);
  await query(`insert into condition_values(id,category_id,name,key) values($1,$2,'Technician','technician')`, [value,category]);
  for (const r of [reusable,nested]) await query(`insert into reusable_contents(id,project_id,workspace_id,name,slug) values($1,$2,$3,'Linked content',$4)`, [r,project,ws,`linked-${r.slice(-2)}`]);
  const vr = { type: 'variableReference', attrs: { id: 'v', referenceVersion: 1, variableId: variable } };
  const rr = r => ({ type: 'reusableReference', attrs: { id: 'r', referenceVersion: 1, reusableId: r } });
  const body = content => ({ type: 'doc', version: 1, metadata: { preserved: true }, content });
  const nestedBody = body([{ type:'paragraph', attrs:{ id:'nested' }, content:[vr] }]);
  await query(`insert into reusable_content_drafts(reusable_content_id,content) values($1,$2),($3,$4)`, [nested,nestedBody,reusable,body([rr(nested)])]);
  const content = body([{ type:'paragraph', attrs:{ id:'p', conditions:{ version:1, values:[{categoryId:category,valueId:value}] } }, content:[vr] },rr(reusable)]);
  await query(`insert into topic_drafts(topic_id,content) values($1,$2)`, [topic,content]);
  await db.exec('set role authenticated');
  const submit = async () => scalar(`select submit_document_review($1,$2,(select updated_at from documents where id=$2))`, [project,doc]);
  const latest = async () => (await query(`select * from document_reviews order by sequence desc limit 1`))[0];
  const review = await submit(); const submitted = await latest(); const pkg = submitted.dependency_package;
  check(pkg.schemaVersion === 1 && pkg.resolverVersion === 1, 'versioned package');
  check(pkg.variables.length === 1 && pkg.variables[0].value === 'Frozen', 'bounded variable default closure');
  check(pkg.variables[0].output_values['web-help'] === 'Web frozen', 'output overrides retained');
  check(pkg.categories[0].id === category && pkg.values[0].id === value, 'condition category and value closure');
  check(pkg.reusable.length === 2 && pkg.reusable[0].draft.revision === 1, 'nested reusable transitive closure with revision');
  assert.deepEqual(submitted.topics_snapshot[0].content, content); checks++;
  assert.deepEqual(pkg.reusable.find(r => r.item.id === nested).draft.content, nestedBody); checks++;
  await scalar(`select approve_document_review($1,$2,$3,null)`, [project,doc,review]);
  await query(`update project_variables set value='"Changed"',name='Changed product' where id=$1`, [variable]);
  await query(`update condition_categories set name='Changed audience' where id=$1`, [category]);
  await query(`update condition_values set name='Changed technician' where id=$1`, [value]);
  await query(`update reusable_content_drafts set content=$2 where reusable_content_id=$1`, [nested,body([])]);
  assert.deepEqual((await latest()).dependency_package, pkg); checks++;
  await scalar(`select start_document_draft($1,$2,$3,(select updated_at from documents where id=$2))`, [project,doc,review]);
  assert.deepEqual((await latest()).dependency_package,pkg); checks++;
  const second = await submit(); const secondRow = await latest();
  check(second !== review && secondRow.dependency_package.variables[0].value === 'Changed', 'resubmission captures new values');
  check(secondRow.dependency_package.categories[0].name === 'Changed audience', 'resubmission captures new category metadata');
  await scalar(`select request_document_changes($1,$2,$3,'Revise')`, [project,doc,second]);
  const before = await scalar(`select count(*) from document_reviews`);
  const failedSubmit = async saved => {
    await query(`update topic_drafts set content=$2 where topic_id=$1`, [topic,saved]);
    await denied(submit);
    check(await scalar(`select count(*) from document_reviews`) === before, 'failed freeze inserts no evidence');
    check(await scalar(`select status from documents where id=$1`,[doc]) === 'draft','failed freeze leaves Draft');
  };
  await failedSubmit(body([rr(id(999))])); // missing/inaccessible dependency
  await failedSubmit(body([{type:'paragraph',attrs:{conditions:{version:1,values:[{categoryId:category,valueId:id(998)}]}}}]));
  await query(`update reusable_content_drafts set content=$2 where reusable_content_id=$1`, [nested,body([rr(reusable)])]);
  await failedSubmit(body([rr(reusable)])); // cycle
  await query(`update reusable_content_drafts set content=$2 where reusable_content_id=$1`, [nested,nestedBody]);
  await failedSubmit(body([{ type:'futureModule',attrs:{ opaque:true } }]));
  await failedSubmit(body([{ type:'paragraph',content:[{...vr,attrs:{...vr.attrs,referenceVersion:2}}] }]));
  await failedSubmit(body([{ type:'paragraph',content:[{type:'text',text:'unsafe',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}] }]));
  await failedSubmit({ ...body([]), metadata:{ unsafeNumber:9007199254740992 } });
  let deepMetadata='leaf';
  for(let i=0;i<96;i++) deepMetadata=[deepMetadata];
  await failedSubmit({ ...body([]), metadata:deepMetadata }); // envelope depth, not just body depth
  const chain = Array.from({length:9},(_,i)=>id(100+i));
  await db.exec('reset role');
  for (let i=0;i<chain.length;i++) {
    await query(`insert into reusable_contents(id,project_id,workspace_id,name,slug) values($1,$2,$3,'Depth test',$4)`,[chain[i],project,ws,`depth-${i}`]);
    await query(`insert into reusable_content_drafts(reusable_content_id,content) values($1,$2)`,[chain[i],body(i===8?[]:[rr(chain[i+1])])]);
  }
  await db.exec('set role authenticated');
  await failedSubmit(body([rr(chain[0])])); // ninth reusable fails
  await query(`update topic_drafts set content=$2 where topic_id=$1`,[topic,body([rr(chain[1]),rr(chain[1])])]);
  const depthReview = await submit(); check((await latest()).dependency_package.reusable.length===8,'eight levels and repeated DAG allowed');
  await scalar(`select request_document_changes($1,$2,$3,'Revise')`,[project,doc,depthReview]);
  // A dependency in another project of the same workspace is still forbidden.
  await db.exec('reset role');
  const foreignProject=id(200), foreignVariable=id(201), foreignReusable=id(202);
  await query(`insert into projects(id,workspace_id,name,slug,created_by) values($1,$2,'Other project','other-project',$3)`,[foreignProject,ws,user]);
  await query(`insert into project_members(project_id,user_id,role) values($1,$2,'admin')`,[foreignProject,user]);
  await query(`insert into project_variables(id,project_id,name,key) values($1,$2,'Foreign','foreign')`,[foreignVariable,foreignProject]);
  await query(`insert into reusable_contents(id,project_id,workspace_id,name,slug) values($1,$2,$3,'Foreign reusable','foreign-reusable')`,[foreignReusable,foreignProject,ws]);
  await query(`insert into reusable_content_drafts(reusable_content_id) values($1)`,[foreignReusable]);
  await db.exec('set role authenticated');
  const foreignBody=body([{type:'paragraph',content:[{...vr,attrs:{...vr.attrs,variableId:foreignVariable}}]}]);
  await denied(async()=>{await query(`update topic_drafts set content=$2 where topic_id=$1`,[topic,foreignBody]);await submit();});
  await denied(async()=>{await query(`update topic_drafts set content=$2 where topic_id=$1`,[topic,body([rr(foreignReusable)])]);await submit();});
  // Same-workspace shared items are allowed; foreign-workspace items are not.
  await db.exec('reset role');
  const shared=id(210), foreignOrg=id(220), foreignWs=id(221), foreignShared=id(222);
  await query(`insert into reusable_contents(id,project_id,workspace_id,scope,name,slug) values($1,null,$2,'workspace','Shared notice','shared-notice')`,[shared,ws]);
  await query(`insert into reusable_content_drafts(reusable_content_id,content) values($1,$2)`,[shared,body([])]);
  await query(`insert into organizations(id,name,slug,created_by) values($1,'Other tenant','other-tenant',$2)`,[foreignOrg,outsider]);
  await query(`insert into workspaces(id,organization_id,name,slug,created_by) values($1,$2,'Other workspace','other-workspace',$3)`,[foreignWs,foreignOrg,outsider]);
  await query(`insert into reusable_contents(id,project_id,workspace_id,scope,name,slug) values($1,null,$2,'workspace','Foreign shared','foreign-shared')`,[foreignShared,foreignWs]);
  await query(`insert into reusable_content_drafts(reusable_content_id,content) values($1,$2)`,[foreignShared,body([])]);
  await db.exec('set role authenticated');
  await denied(async()=>{await query(`update topic_drafts set content=$2 where topic_id=$1`,[topic,body([rr(foreignShared)])]);await submit();});
  await db.exec('reset role');
  const unsavedReusable=id(223);
  await query(`insert into reusable_contents(id,project_id,workspace_id,name,slug) values($1,$2,$3,'No saved body','no-saved-body')`,[unsavedReusable,project,ws]);
  await db.exec('set role authenticated');
  await denied(async()=>{await query(`update topic_drafts set content=$2 where topic_id=$1`,[topic,body([rr(unsavedReusable)])]);await submit();});
  // A missing TOPIC body retains the accepted explicit null representation.
  await db.exec('reset role');
  const missingTopic=id(230);
  await query(`insert into topics(id,document_id,title,slug,created_by) values($1,$2,'Missing topic','missing-topic',$3)`,[missingTopic,doc,user]);
  await db.exec('set role authenticated');
  await query(`update topic_drafts set content=$2 where topic_id=$1`,[topic,body([rr(shared)])]);
  const sharedReview=await submit(); const sharedRow=await latest();
  check(sharedRow.dependency_package.reusable[0].item.scope==='workspace','same-workspace shared reusable allowed');
  check(sharedRow.topics_snapshot.some(t=>t.id===missingTopic && t.content===null && t.revision===null),'missing topic body remains explicit');
  await scalar(`select request_document_changes($1,$2,$3,'Revise')`,[project,doc,sharedReview]);
  // RLS and private execution boundary, not a browser permission simulation.
  await denied(()=>query(`update document_reviews set dependency_package='{}' where id=$1`,[review]));
  await denied(()=>query(`select app_private.review_dependency_package($1,$2,$3,'[]')`,[project,ws,org]));
  await query(`select set_config('request.jwt.claim.sub',$1,false)`,[outsider]);
  check(await scalar(`select count(*) from document_reviews`)===0,'outsider cannot read parent review/package');
  await denied(()=>scalar(`select submit_document_review($1,$2,now())`,[project,doc]));
  await query(`select set_config('request.jwt.claim.sub',$1,false)`,[user]);
  await db.exec('reset role');
  await denied(()=>query(`update document_reviews set dependency_package='{}' where id=$1`,[review]));
  // A write between two captures in ONE SQL statement must be invisible to
  // both STABLE closures. This deterministically distinguishes fixed statement
  // snapshots from per-query reads; it is not a concurrent-session simulation.
  await db.exec(`create function app_private.test_catalog_edit() returns text language plpgsql volatile as $$
    begin update public.project_variables set value='"Statement write"'; return 'changed'; end $$;`);
  const [snapshot] = await query(`select
    app_private.review_dependency_package($1,$2,$3,$4) as before,
    app_private.test_catalog_edit() as edit,
    app_private.review_dependency_package($1,$2,$3,$4) as after`,[project,ws,org,[{content}]]);
  assert.deepEqual(snapshot.before,snapshot.after); checks++;
  check(snapshot.after.variables[0].value==='Changed','statement capture excludes intervening writes');
  check(await scalar(`select value from project_variables where id=$1`,[variable])==='Statement write','intervening test write actually occurred');
  await db.exec('drop function app_private.test_catalog_edit()');
  check(await scalar(`select provolatile from pg_proc where oid='app_private.review_dependency_walk(jsonb,uuid,uuid,uuid[],jsonb)'::regprocedure`)==='s','walker uses shared statement snapshot');
  check(await scalar(`select provolatile from pg_proc where oid='app_private.review_dependency_package(uuid,uuid,uuid,jsonb)'::regprocedure`)==='s','whole closure uses shared statement snapshot');
  console.log(`${checks} offline PostgreSQL package/lifecycle/security assertions passed (${db.native ? 'native' : 'PGlite'}; no live Supabase).`);
} finally { await db.close(); }
