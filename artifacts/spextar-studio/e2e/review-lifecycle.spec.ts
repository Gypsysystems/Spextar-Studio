import { test, expect, login, activate, noOverflow, projectPath } from './fixture';
import { accessible, tabTo, visibleFocus } from './accessibility-helpers';

test('approved semantic package survives catalog changes without mutable dependency reads', async ({ page, backend }) => {
  const at = '2026-10-27T10:00:00Z';
  const ref = (id: string) => ({ type:'reusableReference',attrs:{id:`node-${id}`,referenceVersion:1,reusableId:id} });
  backend.db.reusable_contents = ['reuse-a','reuse-b'].map(id => ({ id,workspace_id:'ws-a',project_id:'project-a',scope:'project',name:`Frozen notice ${id.slice(-1)}`,slug:id,description:null,settings:{},status:'draft',update_policy:'notify',tags:[],created_by:'user-a',created_at:at,updated_at:at }));
  backend.db.reusable_content_drafts = [
    { reusable_content_id:'reuse-a',revision:3,updated_at:at,updated_by:'user-a',content:{type:'doc',version:1,content:[ref('reuse-b')]} },
    { reusable_content_id:'reuse-b',revision:4,updated_at:at,updated_by:'user-a',content:{type:'doc',version:1,content:[{type:'paragraph',attrs:{id:'nested'},content:[{type:'text',text:'Frozen nested safety notice'}]}]} },
  ];
  backend.db.topic_drafts[0].content = {type:'doc',version:1,content:[
    {type:'paragraph',attrs:{id:'p',conditions:{version:1,values:[{categoryId:'cat-a',valueId:'val-a'}]}},content:[{type:'variableReference',attrs:{id:'v',referenceVersion:1,variableId:'var-a'}}]},ref('reuse-a'),
  ]};
  backend.captureReview(); backend.db.documents[0].status='in_review'; backend.setRole('reviewer');
  const evidence=structuredClone(backend.db.document_reviews[0]);
  await login(page,projectPath+'/review');
  const body=page.getByRole('textbox',{name:'Topic body'});
  await expect(body).toContainText('QA Product');
  await expect(body).toContainText('Frozen nested safety notice');
  await expect(body).toContainText('submitted revision 4');
  await expect(page.getByLabel('Applied conditional tags')).toContainText('Audience: Developer');
  await activate(page,page.getByRole('button',{name:'Approve',exact:true})); await accessible(page);
  await activate(page,page.getByRole('button',{name:'Confirm approve'}));
  await expect(page.getByText('Approved · Review 1')).toBeVisible();
  for (const table of ['project_variables','condition_categories','condition_values','reusable_contents','reusable_content_drafts']) backend.db[table]=[];
  backend.reads.length=0; await page.reload();
  await expect(body).toContainText('QA Product'); await expect(body).toContainText('Frozen nested safety notice');
  await expect(page.getByLabel('Applied conditional tags')).toContainText('Audience: Developer');
  expect(backend.reads.filter(r=>['project_variables','condition_categories','condition_values','reusable_contents','reusable_content_drafts','topic_drafts'].includes(r.table))).toEqual([]);
  expect(backend.db.document_reviews[0].dependency_package).toEqual(evidence.dependency_package);
  expect(backend.db.document_reviews[0].topics_snapshot).toEqual(evidence.topics_snapshot);
  await expect(body).toHaveAttribute('contenteditable','false'); await noOverflow(page); await accessible(page);
});

test('legacy semantic evidence has an explicit unavailable state without catalog resolution', async ({ page, backend }) => {
  // Capture ordinary legacy evidence first, then represent its historical semantic body.
  backend.captureReview();
  const legacy=backend.db.document_reviews[0]; legacy.dependency_package=null;
  (legacy.topics_snapshot as Record<string,unknown>[])[0].content={type:'doc',version:1,content:[{type:'paragraph',content:[{type:'variableReference',attrs:{referenceVersion:1,variableId:'var-a'}}]}]};
  backend.reads.length=0;
  await login(page,projectPath+'/review');
  await expect(page.getByRole('alert')).toContainText('older review has no frozen dependencies');
  await expect(page.getByRole('textbox',{name:'Topic body'})).toHaveCount(0);
  expect(backend.reads.filter(r=>['project_variables','condition_categories','condition_values','reusable_contents'].includes(r.table))).toEqual([]);
  await noOverflow(page); await accessible(page);
});

test('saved Draft submission, Author lock, Reviewer approval, explicit new Draft preserve submitted content', async ({ page, backend }) => {
  backend.db.document_reviews = [];
  await login(page, projectPath + '/author/doc-a');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true');
  const submit = page.getByRole('button', { name: 'Submit for review', exact: true });
  await activate(page, submit);
  await expect(page.getByRole('dialog')).toBeVisible(); await accessible(page);
  await page.keyboard.press('Escape'); await expect(submit).toBeFocused();
  await tabTo(page, submit); await visibleFocus(submit); await page.keyboard.press('Enter');
  await activate(page, page.getByRole('button', { name: 'Confirm submit for review' }));
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Create topic', exact: true })).toHaveCount(0);
  expect(backend.db.documents[0].status).toBe('in_review');
  const evidence = structuredClone(backend.db.document_reviews[0]);
  backend.setRole('reviewer'); await page.goto(projectPath + '/review');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toContainText('Current saved QA topic');
  await activate(page, page.getByRole('button', { name: 'Approve', exact: true }));
  await accessible(page);
  await activate(page, page.getByRole('button', { name: 'Confirm approve' }));
  await expect(page.getByText('Approved · Review 1')).toBeVisible();
  expect(backend.db.document_reviews[0].topics_snapshot).toEqual(evidence.topics_snapshot);
  backend.setRole('author'); await page.goto(projectPath + '/author/doc-a');
  await activate(page, page.getByRole('button', { name: 'Start new draft', exact: true }));
  await accessible(page);
  await activate(page, page.getByRole('button', { name: 'Confirm start new draft' }));
  const body = page.getByRole('textbox', { name: 'Topic body' });
  await expect(body).toHaveAttribute('contenteditable', 'true');
  await body.press('ControlOrMeta+End'); await page.keyboard.type(' New draft only');
  await expect.poll(() => JSON.stringify(backend.db.topic_drafts[0].content)).toContain('New draft only');
  await page.goto(projectPath + '/review');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).not.toContainText('New draft only');
  expect(backend.db.document_reviews[0].topics_snapshot).toEqual(evidence.topics_snapshot);
  await noOverflow(page); await accessible(page);
});

test('changes note validation, request changes returns Draft, decision denial and immutable missing body', async ({ page, backend }) => {
  backend.db.documents[0].status = 'in_review'; backend.setRole('reviewer');
  await login(page, projectPath + '/review');
  await activate(page, page.getByRole('button', { name: 'Request changes', exact: true }));
  const confirm = page.getByRole('button', { name: 'Confirm request changes' });
  await expect(confirm).toBeDisabled(); await page.getByLabel('Decision note').fill('   '); await expect(confirm).toBeDisabled();
  await page.getByLabel('Decision note').fill('Clarify the warning'); await accessible(page);
  await activate(page, confirm); await expect(page.getByText('Changes requested · Review 1')).toBeVisible();
  expect(backend.db.documents[0].status).toBe('draft');
  expect(backend.db.topics.every(t => t.status === 'draft')).toBe(true);
  await activate(page, page.getByRole('button', { name: 'Child topic', exact: true }));
  await expect(page.getByText('No saved body was submitted for this topic.')).toBeVisible();
  for (const role of ['author', 'viewer'] as const) {
    backend.setRole(role); await page.reload();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Request changes', exact: true })).toHaveCount(0);
  }
  expect(backend.writes.every(w => w.table.startsWith('rpc/'))).toBe(true);
  await noOverflow(page); await accessible(page);
});

test('unsaved/error body blocks submission and snapshot reads fail closed', async ({ page, backend }) => {
  backend.db.document_reviews = []; backend.failDraftWrites = true;
  await login(page, projectPath + '/author/doc-a');
  const body = page.getByRole('textbox', { name: 'Topic body' }); await expect(body).toHaveAttribute('contenteditable', 'true');
  await body.press('ControlOrMeta+End'); await page.keyboard.type(' Unsaved');
  await activate(page, page.getByRole('button', { name: 'Submit for review', exact: true }));
  await activate(page, page.getByRole('button', { name: 'Confirm submit for review' }));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Save or resolve');
  expect(backend.writes.some(w => w.table === 'rpc/submit_document_review')).toBe(false);
  await page.keyboard.press('Escape');
  backend.failures.add('document_reviews'); await page.goto(projectPath + '/review');
  await expect(page.getByText('Submitted review did not load')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveCount(0);
  await noOverflow(page);
});

test('a competing decision rejects the stale confirmation without retries or content writes', async ({ page, backend }) => {
  backend.db.documents[0].status = 'in_review'; backend.setRole('reviewer');
  await login(page, projectPath + '/review');
  await activate(page, page.getByRole('button', { name: 'Approve', exact: true }));
  const snapshot = structuredClone(backend.db.document_reviews[0].topics_snapshot);
  // Another authorized browser completed the review after this dialog opened.
  backend.db.documents[0].status = 'approved';
  Object.assign(backend.db.document_reviews[0], { status: 'approved', decided_by: 'user-a', decided_at: '2026-10-29T12:30:00Z' });
  await activate(page, page.getByRole('button', { name: 'Confirm approve' }));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');
  expect(backend.writes).toHaveLength(1);
  expect(backend.db.document_reviews[0].topics_snapshot).toEqual(snapshot);
  await accessible(page); await noOverflow(page);
});

test('submission keeps its confirmation timestamp after a stale response and background refresh', async ({ page, backend }) => {
  backend.db.document_reviews = [];
  await login(page, projectPath + '/author/doc-a');
  await expect(page.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true');
  await activate(page, page.getByRole('button', { name: 'Submit for review', exact: true }));
  Object.assign(backend.db.documents[0], { title: 'Changed after confirmation', updated_at: '2026-10-29T13:30:00Z' });
  await activate(page, page.getByRole('button', { name: 'Confirm submit for review' }));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');
  await expect(page.getByText('Changed after confirmation', { exact: true }).first()).toBeVisible();
  await activate(page, page.getByRole('button', { name: 'Confirm submit for review' }));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');
  const submissions = backend.writes.filter(write => write.table === 'rpc/submit_document_review');
  expect(submissions).toHaveLength(1);
  expect(submissions[0].body.p_expected_updated_at).toBe('2026-10-27T10:00:00Z');
  await accessible(page); await noOverflow(page);
});
