// Runs only inside openDatabase's newly initialized native cluster.
import assert from 'node:assert/strict';
export async function validatePrivateBeta(db) {
  assert.equal(db.native, true);
  const root = await db.connect(), a = await db.connect(), b = await db.connect();
  const q = async (c, sql, args = []) => (await c.query(sql, args)).rows;
  const scalar = async (c, sql, args = []) => Object.values((await q(c, sql, args))[0])[0];
  let checks = 0, serial = 20000;
  const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const check = (value, label) => { assert.ok(value, label); checks++; console.log('PASS', label); };
  const denied = async (fn, label, codes = ['42501', '23514', '40001']) => {
    await assert.rejects(fn, e => codes.includes(e.code), label); checks++; console.log('PASS', label);
  };
  const as = async (c, user) => {
    await c.query('reset role');
    await c.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await c.query('set role authenticated');
  };
  const owner = id(1), wa = id(2), admin = id(3), author = id(4), reviewer = id(5), viewer = id(6), foreign = id(7), orgAdmin = id(8), target = id(9);
  const org = id(10), ws = id(11), project = id(12);
  for (const u of [owner, wa, admin, author, reviewer, viewer, foreign, orgAdmin, target]) await root.query('insert into auth.users(id) values($1)', [u]);
  await root.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  await root.query("insert into organizations(id,name,slug,created_by) values($1,'Matrix','matrix',$2)", [org, owner]);
  for (const u of [owner, wa, admin, author, reviewer, viewer, orgAdmin, target]) await root.query('insert into organization_members values($1,$2,$3,now())', [org, u, u === owner ? 'owner' : u === orgAdmin ? 'admin' : 'member']);
  await root.query("insert into workspaces(id,organization_id,name,slug,created_by) values($1,$2,'Matrix','matrix',$3)", [ws, org, owner]);
  for (const u of [wa, admin, author, reviewer, viewer]) await root.query('insert into workspace_members(workspace_id,user_id,role) values($1,$2,$3)', [ws, u, u === wa ? 'admin' : 'member']);
  await root.query("insert into projects(id,workspace_id,name,slug,created_by) values($1,$2,'Matrix','matrix',$3)", [project, ws, admin]);
  for (const [u, role] of [[admin, 'admin'], [author, 'author'], [reviewer, 'reviewer'], [viewer, 'viewer']]) await root.query('insert into project_members(project_id,user_id,role) values($1,$2,$3)', [project, u, role]);
  // Foreign identity belongs to a separate tenant, not merely an unassigned user.
  await as(a, foreign);
  const foreignOrg = await scalar(a, "select create_organization('Foreign','matrix-foreign')");
  check(Boolean(foreignOrg), 'authenticated organization bootstrap');
  await as(a, owner);
  const bootstrap = await scalar(a, "select create_project($1,'Bootstrap','matrix-bootstrap')", [ws]);
  check(await scalar(root, "select count(*) from project_members where project_id=$1 and user_id=$2 and role='admin'", [bootstrap, owner]) === 1, 'project bootstrap grants only initial creator Admin');
  await root.query('insert into project_members(project_id,user_id,role) values($1,$2,\'admin\')', [bootstrap, admin]);
  await root.query('delete from project_members where project_id=$1 and user_id=$2', [bootstrap, owner]);
  await denied(() => a.query("insert into project_members(project_id,user_id,role) values($1,$2,'admin')", [bootstrap, owner]), 'revoked creator cannot bootstrap again');
  const fresh = async () => {
    const d = id(serial++), t = id(serial++);
    await root.query("insert into documents(id,project_id,title,slug,created_by) values($1,$2,'Matrix document',$3,$4)", [d, project, `doc-${serial}`, admin]);
    await root.query("insert into topics(id,document_id,title,slug,created_by) values($1,$2,'Topic',$3,$4)", [t, d, `topic-${serial}`, admin]);
    await root.query('insert into topic_drafts(topic_id,content) values($1,$2)', [t, {type:'doc',version:1,content:[{type:'paragraph',attrs:{id:'p'},content:[{type:'text',text:'Synthetic'}]}]}]);
    return d;
  };
  const stamp = d => scalar(root, 'select updated_at::text from documents where id=$1', [d]);
  const submit = async (c, d) => scalar(c, 'select submit_document_review($1,$2,$3)', [project, d, await stamp(d)]);
  const approve = (c, d, r) => scalar(c, 'select approve_document_review($1,$2,$3,null)', [project, d, r]);
  const draft = async (c, d, r) => scalar(c, 'select start_document_draft($1,$2,$3,$4)', [project, d, r, await stamp(d)]);
  const publish = async (c, d, r, key = id(serial++), time) => scalar(c, 'select publish_document_release($1,$2,$3,$4,$5)', [project, d, r, time ?? await stamp(d), key]);
  for (const [u, label, canWrite, canDecide] of [[owner,'Org owner',false,false],[orgAdmin,'Org Admin',false,false],[wa,'Workspace Admin',false,false],[admin,'Project Admin',true,true],[author,'Author',true,false],[reviewer,'Reviewer',false,true],[viewer,'Viewer',false,false]]) {
    await as(a, u);
    for (const [table, key, val] of [['organizations','id',org],['workspaces','id',ws],['projects','id',project]]) check(await scalar(a, `select count(*) from ${table} where ${key}=$1`, [val]) === 1, `${label} scoped ${table} read`);
    check((await a.query('update projects set name=name where id=$1 returning id', [project])).rowCount === (u === admin ? 1 : 0), `${label} project metadata boundary`);
    if (u === admin) {
      await a.query("insert into project_members(project_id,user_id,role) values($1,$2,'viewer')",[project,target]);
      check(true,`${label} adds project member`);
    } else {
      await denied(()=>a.query("insert into project_members(project_id,user_id,role) values($1,$2,'viewer')",[project,target]),`${label} cannot add project member`);
      await root.query("insert into project_members(project_id,user_id,role) values($1,$2,'viewer')",[project,target]);
    }
    check((await a.query("update project_members set role='reviewer' where project_id=$1 and user_id=$2 returning user_id",[project,target])).rowCount===(u===admin?1:0),`${label} member role-change boundary`);
    check((await a.query('delete from project_members where project_id=$1 and user_id=$2 returning user_id',[project,target])).rowCount===(u===admin?1:0),`${label} member removal boundary`);
    await root.query('delete from project_members where project_id=$1 and user_id=$2',[project,target]);
    const d = await fresh();
    check((await a.query('update documents set title=title where id=$1 returning id', [d])).rowCount === (canWrite ? 1 : 0), `${label} authoring boundary`);
    let r;
    if (canWrite) { r = await submit(a,d); check(Boolean(r), `${label} submits`); }
    else { await denied(() => submit(a,d), `${label} cannot submit`); await as(b,admin); r = await submit(b,d); }
    if (canDecide) { await approve(a,d,r); check(true, `${label} approves`); }
    else { await denied(() => approve(a,d,r), `${label} cannot approve`); await as(b,reviewer); await approve(b,d,r); }
    await denied(() => a.query('update document_reviews set decision_note=\'tampered\' where id=$1', [r]), `${label} cannot mutate Review evidence`);
    if (u === admin) { await publish(a,d,r); check(true, 'Project Admin publishes'); }
    else { await denied(() => publish(a,d,r), `${label} cannot publish`); await as(b,admin); await publish(b,d,r); }
    check(await scalar(a, 'select count(*) from document_releases where document_id=$1', [d]) === 1, `${label} reads immutable release`);
    if (canWrite) { await draft(a,d,r); check(true, `${label} starts Draft from Published`); }
    else await denied(() => draft(a,d,r), `${label} cannot start Draft`);
    const changeDoc = await fresh(); await as(b,admin); const changeReview = await submit(b,changeDoc);
    if (canDecide) {
      await denied(() => a.query('select request_document_changes($1,$2,$3,\' \')', [project,changeDoc,changeReview]), `${label} requires changes note`, ['22023']);
      await a.query('select request_document_changes($1,$2,$3,\'Revise\')', [project,changeDoc,changeReview]);
      check(await scalar(root, 'select status from documents where id=$1',[changeDoc]) === 'draft', `${label} requests changes atomically`);
    } else await denied(() => a.query('select request_document_changes($1,$2,$3,\'Revise\')', [project,changeDoc,changeReview]), `${label} cannot request changes`);
  }
  await as(a,owner);
  check((await a.query("update organization_members set role='member' where organization_id=$1 and user_id=$2 returning user_id",[org,owner])).rowCount === 0,'owner cannot be demoted');
  check((await a.query('delete from organization_members where organization_id=$1 and user_id=$2 returning user_id',[org,owner])).rowCount === 0,'owner cannot be removed');
  await as(a,admin);
  await denied(() => a.query("update project_members set role='viewer' where project_id=$1 and user_id=$2",[project,admin]),'last Project Admin retained');
  const d = await fresh(), r = await submit(a,d); await approve(a,d,r); await publish(a,d,r);
  for (const u of [foreign,viewer]) {
    if (u === viewer) {
      await root.query('delete from project_members where project_id=$1 and user_id=$2',[project,viewer]);
      await as(a,viewer);
      check(await scalar(a,'select count(*) from document_releases where document_id=$1',[d])===1,'project revocation preserves separately authorized workspace read');
      await denied(() => publish(a,d,r),'project revocation still denies publication');
      await root.query('delete from workspace_members where workspace_id=$1 and user_id=$2',[ws,viewer]);
      await root.query('delete from organization_members where organization_id=$1 and user_id=$2',[org,viewer]);
    }
    await as(a,u);
    for (const table of ['documents','document_reviews','document_releases']) check(await scalar(a,`select count(*) from ${table} where ${table==='documents'?'id':'document_id'}=$1`,[d]) === 0, `${u===foreign?'foreign tenant':'revoked stale identity'} denied ${table}`);
    await denied(() => publish(a,d,r), 'foreign/revoked publication denied');
  }
  await a.query('reset role; set role anon');
  for (const table of ['documents','document_reviews','document_releases']) await denied(() => a.query(`select * from ${table}`), `anon denied ${table}`);
  // Two independently connected backend PIDs, controlled overlap, and server
  // lock-wait observation establish actual concurrency rather than Promise queues.
  const pidA = await scalar(a,'select pg_backend_pid()'), pidB = await scalar(b,'select pg_backend_pid()');
  check(pidA !== pidB, 'independent PostgreSQL backend sessions');
  const waiting = async pid => {
    for (let i=0;i<100;i++) {
      if (await scalar(root,"select count(*) from pg_stat_activity where pid=$1 and wait_event_type='Lock'",[pid])) return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error('Expected actual PostgreSQL lock wait');
  };
  await as(a,admin); await as(b,admin);
  const raceDoc = await fresh(), raceReview = await submit(a,raceDoc); await approve(a,raceDoc,raceReview);
  const raceStamp = await stamp(raceDoc), request = id(serial++);
  await a.query('begin'); const first = await publish(a,raceDoc,raceReview,request,raceStamp);
  const retry = publish(b,raceDoc,raceReview,request,raceStamp);
  await waiting(pidB); await a.query('commit');
  check(await retry === first,'overlapping same-key publication waits then returns original release');
  await draft(a,raceDoc,raceReview); const r2=await submit(a,raceDoc); await approve(a,raceDoc,r2);
  const stamp2=await stamp(raceDoc);
  await a.query('begin'); await publish(a,raceDoc,r2,id(serial++),stamp2);
  const competing=publish(b,raceDoc,r2,id(serial++),stamp2).then(v=>({v}),e=>({e}));
  await waiting(pidB); await a.query('commit'); const outcome=await competing;
  check(outcome.e?.code === '40001','different-key concurrent publication fails stale after lock');
  check((await q(root,'select sequence from document_releases where document_id=$1 order by sequence',[raceDoc])).map(x=>x.sequence).join(',') === '1,2','concurrent release numbering has no duplicate or gap');
  await draft(a,raceDoc,r2); const staleStamp=await stamp(raceDoc);
  await a.query('begin'); await a.query('update documents set title=\'Updated\' where id=$1',[raceDoc]);
  const stale=b.query('select submit_document_review($1,$2,$3)',[project,raceDoc,staleStamp]).then(v=>({v}),e=>({e}));
  await waiting(pidB); await a.query('commit');
  check((await stale).e?.code === '40001','concurrent document change rejects stale submission');
  const raceDraftDoc=await fresh(), raceDraftReview=await submit(a,raceDraftDoc); await approve(a,raceDraftDoc,raceDraftReview);
  const draftStamp=await stamp(raceDraftDoc);
  await a.query('begin'); await publish(a,raceDraftDoc,raceDraftReview,id(serial++),draftStamp);
  const newDraft=b.query('select start_document_draft($1,$2,$3,$4)',[project,raceDraftDoc,raceDraftReview,draftStamp]).then(v=>({v}),e=>({e}));
  await waiting(pidB); await a.query('commit');
  check((await newDraft).e?.code === '40001','concurrent Publish versus Start Draft rejects stale transition');
  await root.query("update project_members set role='admin' where project_id=$1 and user_id=$2",[project,author]);
  const revokedDoc=await fresh(), revokedReview=await submit(a,revokedDoc); await approve(a,revokedDoc,revokedReview);
  const revokedStamp=await stamp(revokedDoc);
  await as(b,author); await a.query('reset role; begin');
  await a.query('delete from project_members where project_id=$1 and user_id=$2',[project,author]);
  const revoked=publish(b,revokedDoc,revokedReview,id(serial++),revokedStamp).then(v=>({v}),e=>({e}));
  await waiting(pidB); await a.query('commit');
  check((await revoked).e?.code === '42501','concurrent membership revocation closes publishing authority');
  check(await scalar(root,'select count(*) from document_releases where document_id=$1',[revokedDoc])===0,'revocation leaves no partial release');
  await b.query('reset role');
  const variable=id(serial++);
  await root.query("insert into project_variables(id,project_id,name,key,value) values($1,$2,'Concurrent','concurrent','\"Before\"')",[variable,project]);
  const snapshotTopics=[{content:{type:'doc',version:1,content:[{type:'paragraph',attrs:{id:'p'},content:[{type:'variableReference',attrs:{id:'v',referenceVersion:1,variableId:variable}}]}]}}];
  const snapshots=b.query('select app_private.review_dependency_package($1,$2,$3,$4) as before, pg_sleep(1), app_private.review_dependency_package($1,$2,$3,$4) as after',[project,ws,org,JSON.stringify(snapshotTopics)]);
  let sleeping=false;
  for (let i=0;i<100;i++) {
    sleeping=Boolean(await scalar(root,"select count(*) from pg_stat_activity where pid=$1 and wait_event='PgSleep'",[pidB]));
    if (sleeping) break;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.ok(sleeping,'dependency statement reached barrier');
  await root.query("update project_variables set value='\"After\"' where id=$1",[variable]);
  const snapshot=(await snapshots).rows[0];
  check(snapshot.before.variables[0].value==='Before' && snapshot.after.variables[0].value==='Before','dependency capture shares statement snapshot across concurrent catalog commit');
  check(await scalar(root,'select value from project_variables where id=$1',[variable])==='After','concurrent catalog update committed independently');
  // Last-admin race: privileged fixture actors isolate trigger protection from
  // client self-demotion safeguards. Both statements still execute the trigger.
  await root.query("insert into project_members(project_id,user_id,role) values($1,$2,'admin')",[project,wa]);
  await a.query('reset role'); await b.query('reset role');
  await a.query('begin'); await a.query("update project_members set role='viewer' where project_id=$1 and user_id=$2",[project,wa]);
  const remove=b.query("update project_members set role='viewer' where project_id=$1 and user_id=$2",[project,admin]).then(v=>({v}),e=>({e}));
  await waiting(pidB); await a.query('commit');
  check((await remove).e?.code === '23514','concurrent last-admin demotions retain one Admin');
  check(await scalar(root,"select count(*) from project_members where project_id=$1 and role='admin'",[project])===1,'one Project Admin remains after race');
  console.log(`${checks} native six-persona/concurrency assertions passed; synthetic Auth only.`);
}
