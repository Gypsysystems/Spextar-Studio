// Disposable in-memory PostgreSQL only. No URL, credentials, remote connection,
// Supabase CLI or application environment is used. Optional PGlite 0.5.13 runner;
// set PGLITE_MODULE_PATH to an installed module's dist/index.js when not on PATH.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleName = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(moduleName ? pathToFileURL(moduleName).href : '@electric-sql/pglite');
const db = new PGlite();
const root = fileURLToPath(new URL('../migrations/', import.meta.url));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0];
const denied = async (action, codes = ['42501','23514','22P02','22023','40001']) => {
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
    // Only this in-memory input copy omits extension installation. Source bytes
    // are never rewritten; this is not full Supabase migration replay certification.
    const sql = fs.readFileSync(`${root}/${file}`, 'utf8').replace('create extension if not exists pgcrypto;', '');
    try { await db.exec(sql); } catch (e) { throw new Error(`Offline migration compilation: ${file}: ${e.message}`, { cause: e }); }
  }
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
  const request = id(500);
  const stamp = await scalar(`select updated_at::text from documents where id=$1`,[doc]);
  const publish = (key=request,reviewId=review) => scalar(`select publish_document_release($1,$2,$3,$4,$5)`,[project,doc,reviewId,stamp,key]);
  // Author/Reviewer/Viewer and absent explicit membership cannot publish, even
  // when inherited organization/workspace administration allows project reads.
  for (const role of ['author','reviewer','viewer',null]) {
    await db.exec('reset role');
    if (role) await query(`insert into project_members(project_id,user_id,role) values($1,$2,$3) on conflict(project_id,user_id) do update set role=excluded.role`,[project,outsider,role]);
    else await query(`delete from project_members where project_id=$1 and user_id=$2`,[project,outsider]);
    await query(`select set_config('request.jwt.claim.sub',$1,false)`,[outsider]);
    await db.exec('set role authenticated'); await denied(publish);
  }
  await db.exec('reset role'); await query(`select set_config('request.jwt.claim.sub',$1,false)`,[user]); await db.exec('set role authenticated');
  await denied(()=>publish(request,id(999)));
  check(await scalar(`select count(*) from document_releases`)===0,'stale review inserts no release');
  // All current dependency changes must be irrelevant to publishing.
  await query(`update project_variables set value='"Mutable"' where id=$1`,[variable]);
  await query(`update reusable_content_drafts set content=$2 where reusable_content_id=$1`,[nested,body([])]);
  await query(`update condition_values set name='Mutable condition' where id=$1`,[value]);
  // Transaction failure after release INSERT must roll everything back.
  await db.exec(`reset role; create function app_private.test_publish_failure() returns trigger language plpgsql as $$begin if new.status='published' then raise exception 'synthetic failure'; end if; return new; end$$;
    create trigger test_publish_failure before update on documents for each row execute function app_private.test_publish_failure(); set role authenticated;`);
  await denied(publish,['P0001']);
  check(await scalar(`select count(*) from document_releases`)===0,'atomic release rollback');
  check(await scalar(`select status from documents where id=$1`,[doc])==='approved','atomic lifecycle rollback');
  await db.exec('reset role; drop trigger test_publish_failure on documents; drop function app_private.test_publish_failure(); set role authenticated;');
  const releaseId=await publish();
  const release=(await query(`select * from document_releases where id=$1`,[releaseId]))[0];
  check(release.sequence===1,'server positive sequence');
  check(release.published_by===user,'auth publisher');
  check(release.frozen_source.dependencies.variables[0].value==='Frozen','approved defaults only');
  check(release.frozen_source.dependencies.values[0].name==='Technician','approved conditions only');
  assert.deepEqual(release.frozen_source.dependencies.reusable.find(r=>r.item.id===nested).draft.content,nestedBody);checks++;
  check(await scalar(`select status from documents where id=$1`,[doc])==='published','document Published');
  check(await scalar(`select status from topics where id=$1`,[topic])==='published','topics Published');
  check(await publish()===releaseId,'same request returns same release after lifecycle change');
  await denied(()=>publish(id(501)));
  check(await scalar(`select count(*) from document_releases`)===1,'different request cannot republish approval');
  await denied(()=>query(`update document_releases set sequence=2`));
  await denied(()=>query(`delete from document_releases`));
  await denied(()=>query(`insert into document_releases select * from document_releases`));
  await db.exec('reset role');
  await denied(()=>query(`delete from documents where id=$1`,[doc]),['23001']);
  await denied(()=>query(`delete from projects where id=$1`,[project]),['23001']);
  await denied(()=>query(`update document_releases set sequence=2`));
  await denied(()=>query(`delete from document_releases`));
  for (const role of ['author','reviewer','viewer']) {
    await query(`insert into project_members(project_id,user_id,role) values($1,$2,$3)`,[project,outsider,role]);
    await query(`select set_config('request.jwt.claim.sub',$1,false)`,[outsider]);await db.exec('set role authenticated');
    check(await scalar(`select count(*) from document_releases`)===1,`${role} reads retained release with current project access`);
    await denied(publish);
    await db.exec('reset role');await query(`delete from project_members where project_id=$1 and user_id=$2`,[project,outsider]);
    await query(`select set_config('request.jwt.claim.sub',$1,false)`,[user]);
  }
  const canonical = v => v===null || typeof v!=='object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  const hash = s => createHash('sha256').update(s,'utf8').digest('hex');
  for (const vector of [{}, {z:[3,true,null],a:'line\n"\\'}, {'\u{1f600}':1,'\uffff':2,'a':-1}, [0,9007199254740991,-9007199254740991], {é:'e\u0301'}]) {
    const encoded=await scalar(`select app_private.release_canonical_json($1)`,[vector]);
    check(encoded===canonical(vector),'cross-language canonical vector');
    check(await scalar(`select encode(sha256(convert_to(app_private.release_canonical_json($1),'UTF8')),'hex')`,[vector])===hash(canonical(vector)),'SHA-256 vector');
  }
  check(release.package_digest===hash(canonical(release.frozen_source)),'frozen source digest');
  const manifest={schemaVersion:1,releaseId,projectId:project,documentId:doc,reviewId:review,sequence:1,packageDigest:release.package_digest,publishedBy:user,publishedAt:release.published_at.toISOString().replace('.000Z','+00:00'),requestKey:request,audit:release.audit};
  // SQL timestamp text is retained in the canonical manifest; compare using the
  // database JSON conversion rather than JavaScript Date's millisecond truncation.
  manifest.publishedAt=release.audit.publishedAt;
  check(release.manifest_digest===hash(canonical(manifest)),'manifest digest');
  await query(`select set_config('request.jwt.claim.sub',$1,false)`,[outsider]);
  await db.exec('set role authenticated');
  check(await scalar(`select count(*) from document_releases`)===0,'tenant outsider sees no release');
  await db.exec('reset role; set role anon');
  await denied(()=>query(`select * from document_releases`));
  await denied(()=>publish());
  await db.exec('reset role');
  // Validate synthetic damaged frozen packages without mutating real evidence.
  for (const damage of [
    r=>{r.dependency_package=null;},
    r=>{r.dependency_package.futurePolicy=true;},
    r=>{r.dependency_package.workspaceId=null;},
    r=>{r.dependency_package.variables[0].value='';},
    r=>{r.dependency_package.variables[0].value='\u00a0\ufeff';},
    r=>{r.dependency_package.variables[0].value='x'.repeat(50000);r.topics_snapshot[0].content=body(Array.from({length:700},()=>({type:'paragraph',content:[vr]})));},
    r=>{r.topics_snapshot[0].content={type:'doc',version:1,content:[{type:'futureModule'}]};},
    r=>{r.dependency_package.reusable.find(x=>x.item.id===nested).draft.content=body([rr(reusable)]);},
    r=>{r.dependency_package.reusable=[];},
    r=>{r.topics_snapshot[0].content=null;},
    r=>{r.topics_snapshot[0].parent_topic_id=r.topics_snapshot[0].id;},
    r=>{r.topics_snapshot[0].sort_order=-1;},
  ]) {
    const frozen=(await query(`select to_jsonb(r) as r from document_reviews r where id=$1`,[review]))[0].r;
    damage(frozen);
    await denied(()=>query(`select app_private.validate_release_package(jsonb_populate_record(null::public.document_reviews,$1))`,[frozen]),['23514','P0002','P0003','42501']);
  }
  // A later approved cycle gets the next number; original release stays exact.
  await query(`select set_config('request.jwt.claim.sub',$1,false)`,[user]);
  await db.exec('set role authenticated');
  await scalar(`select start_document_draft($1,$2,$3,(select updated_at from documents where id=$2))`,[project,doc,review]);
  check(await scalar(`select status from documents where id=$1`,[doc])==='draft','Published starts new Draft without changing release');
  const next=await submit();await scalar(`select approve_document_review($1,$2,$3,null)`,[project,doc,next]);
  const stamp2=await scalar(`select updated_at::text from documents where id=$1`,[doc]);
  const publish2=key=>scalar(`select publish_document_release($1,$2,$3,$4,$5)`,[project,doc,next,stamp2,key]);
  const attempts=await Promise.allSettled([publish2(id(510)),publish2(id(511))]);
  check(attempts.filter(r=>r.status==='fulfilled').length===1,'queued competing publishes commit one approval only');
  check((await query(`select sequence from document_releases order by sequence`)).map(r=>r.sequence).join(',')==='1,2','monotonic committed release sequence');
  assert.deepEqual((await query(`select frozen_source from document_releases where id=$1`,[releaseId]))[0].frozen_source,release.frozen_source);checks++;
  check(await publish()===releaseId,'old request remains idempotent after later cycle');
  console.log(`${checks} disposable PostgreSQL release assertions passed (PGlite; synthetic Auth; no concurrent sessions or live certification).`);
} finally { await db.close(); }
