// Run on Linux with Docker + Node >=22. Only uniquely named disposable containers.
// No Supabase config, environment credentials, live URL or application data used.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
const suffix = randomUUID(), network = `spextar-27-${suffix}`, pg = `${network}-pg`, api = `${network}-api`;
const docker = (args, input) => {
  const r = spawnSync('docker', args, { input, encoding:'utf8', timeout:120000 });
  if (r.status !== 0) throw new Error(`docker ${args[0]}: ${r.error ?? r.stderr}`);
  return r.stdout.trim();
};
const sql = text => docker(['exec','-i',pg,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'], text);
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const directory = new URL('../migrations/', import.meta.url);
const secret = 'disposable-test-signing-key-no-live-use-27';
const id = n => `27000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1),org=id(10),ws=id(11),project=id(12),doc=id(13),topic=id(14);
try {
  docker(['network','create',network]);
  docker(['run','-d','--name',pg,'--network',network,'--network-alias','pg','-e','POSTGRES_PASSWORD=disposable-only','postgres:17.11']);
  for(let i=0;;i++) {
    try { sql('select 1'); break; } catch(e) { if(i===60)throw e; await pause(250); }
  }
  sql(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  const files=fs.readdirSync(directory).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files)sql(fs.readFileSync(new URL(file,directory),'utf8'));
  console.log('Clean Linux PostgreSQL replay:',files.length,'migrations');
  sql(`select set_config('request.jwt.claims','{"sub":"${user}"}',false);
    insert into auth.users(id) values('${user}');
    insert into organizations(id,name,slug,created_by) values('${org}','HTTP','http','${user}');
    insert into organization_members(organization_id,user_id,role) values('${org}','${user}','owner');
    insert into workspaces(id,organization_id,name,slug,created_by) values('${ws}','${org}','HTTP','http','${user}');
    insert into workspace_members(workspace_id,user_id,role) values('${ws}','${user}','admin');
    insert into projects(id,workspace_id,name,slug,created_by) values('${project}','${ws}','HTTP','http','${user}');
    insert into project_members(project_id,user_id,role) values('${project}','${user}','admin');
    insert into documents(id,project_id,title,slug,created_by) values('${doc}','${project}','HTTP','http','${user}');
    insert into topics(id,document_id,title,slug,created_by) values('${topic}','${doc}','Topic','topic','${user}');
    insert into topic_drafts(topic_id,content) values('${topic}','{"type":"doc","version":1,"content":[{"type":"paragraph","attrs":{"id":"p"},"content":[{"type":"text","text":"Synthetic"}]}]}');`);
  // Sequence increments survive transaction rollback: count actual server entries.
  sql('create sequence app_private.http_conflict_entries');
  const definition=sql("select pg_get_functiondef('app_private.review_transition(text,uuid,uuid,uuid,timestamptz,text)'::regprocedure)");
  sql(definition.replace(/\bbegin\b/i,"begin perform nextval('app_private.http_conflict_entries');"));
  docker(['run','-d','--name',api,'--network',network,'-p','127.0.0.1::3000',
    '-e','PGRST_DB_URI=postgres://postgres:disposable-only@pg:5432/postgres','-e','PGRST_DB_SCHEMAS=public',
    '-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${secret}`,'postgrest/postgrest:v14.0']);
  const address='http://'+docker(['port',api,'3000/tcp']);
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'authenticated',sub:user,exp:Math.floor(Date.now()/1000)+600});
  const token=payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  for(let i=0;;i++) {
    try { const r=await fetch(address+'/documents?select=id',{headers,signal:AbortSignal.timeout(1000)}); if(r.ok)break; throw Error(await r.text()); }
    catch(e) {if(i===60)throw e; await pause(250);}
  }
  const rpc=async(name,body,expected=200)=>{
    const start=performance.now();
    const r=await fetch(address+'/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(2000)});
    const result=await r.json(); assert.equal(r.status,expected,JSON.stringify(result));
    console.log(name,r.status,result.code??'success',Math.round(performance.now()-start)+'ms');return result;
  };
  const base={p_project_id:project,p_document_id:doc},stamp=()=>sql(`select updated_at::text from documents where id='${doc}'`);
  const state=()=>sql(`select jsonb_build_object('documents',(select jsonb_agg(d) from documents d),'reviews',(select jsonb_agg(r) from document_reviews r),'releases',(select jsonb_agg(r) from document_releases r))`);
  const before=state();
  const error=await rpc('submit_document_review',{...base,p_expected_updated_at:'2000-01-01T00:00:00Z'},409);
  assert.equal(error.code,'PT409');assert.equal(error.message,'Document changed');assert.equal(state(),before);
  await pause(1000);
  assert.equal(sql('select last_value from app_private.http_conflict_entries'),'1');
  console.log('PASS one stale HTTP request = one measured PostgreSQL function execution, no evidence/state changes');
  const review=await rpc('submit_document_review',{...base,p_expected_updated_at:stamp()});
  await rpc('approve_document_review',{...base,p_review_id:review,p_note:null});
  assert.equal((await rpc('start_document_draft',{...base,p_review_id:review,p_expected_updated_at:'2000-01-01T00:00:00Z'},409)).code,'PT409');
  const request={...base,p_review_id:review,p_expected_updated_at:stamp(),p_request_key:id(500)};
  const release=await rpc('publish_document_release',request);
  assert.equal(await rpc('publish_document_release',request),release);
  assert.equal((await rpc('publish_document_release',{...request,p_review_id:id(999)},409)).code,'PT409');
  await rpc('start_document_draft',{...base,p_review_id:review,p_expected_updated_at:stamp()});
  const viewer=id(2);
  sql(`insert into auth.users(id) values('${viewer}'); insert into project_members(project_id,user_id,role) values('${project}','${viewer}','viewer')`);
  const viewerPayload=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'authenticated',sub:viewer,exp:Math.floor(Date.now()/1000)+600});
  headers.Authorization='Bearer '+viewerPayload+'.'+createHmac('sha256',secret).update(viewerPayload).digest('base64url');
  assert.equal((await rpc('submit_document_review',{...base,p_expected_updated_at:stamp()},403)).code,'42501');
  console.log('PASS PostgREST 14 HTTP conflict, lifecycle, idempotency, changed-key-parameters and authorization contract');
} finally {
  for(const name of [api,pg])spawnSync('docker',['rm','-f',name],{encoding:'utf8',timeout:30000});
  spawnSync('docker',['network','rm',network],{encoding:'utf8',timeout:30000});
}
