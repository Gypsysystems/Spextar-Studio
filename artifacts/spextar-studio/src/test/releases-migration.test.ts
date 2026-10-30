import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe,expect,it } from 'vitest';
import { repositoryRoot } from './backend-contract-inspector';
const read=(name:string)=>readFileSync(resolve(repositoryRoot,'supabase/migrations',name));
const sql=read('20261030001220_immutable_document_releases.sql').toString();
describe('immutable release source contract',()=>{
  it('pins authority, locking, immutable writes and exact invoker API',()=>{
    for(const text of ["role = 'admin' for share",'for update;',"d.status <> 'approved'",'r.sequence <> (select max(sequence)',
      'app_private.validate_release_package(r)','unique(document_id,sequence)','unique(document_id,review_id)','unique(project_id,request_key)',
      'before update or delete on public.document_releases','on delete restrict','grant select on public.document_releases to authenticated',
      'app_private.is_project_member(project_id)',"security definer set search_path = ''",'from public,anon,authenticated',
      'public.publish_document_release(p_project_id uuid,p_document_id uuid,p_review_id uuid,p_expected_updated_at timestamptz,p_request_key uuid)'])expect(sql).toContain(text);
    expect(sql).not.toMatch(/grant (insert|update|delete)|exception when|set_config|disable trigger/i);
  });
  it('validates content only from the immutable frozen closure',()=>{
    const walker=sql.slice(sql.indexOf('create function app_private.release_dependency_walk'),sql.indexOf('-- Canonical'));
    expect(walker).not.toContain('from public.');expect(walker).toContain("jsonb_array_elements(p_package->'variables')");
    expect(walker).toContain("jsonb_array_elements(p_package->'reusable')");
    expect(walker).toContain('cardinality(p_trail) >= 8');expect(walker).toContain('v_id = any(p_trail)');
    expect(sql).toContain('sha256(convert_to(app_private.release_canonical_json(source)');
    expect(sql).toContain("'publishedAt',evidence->>'publishedAt'");
  });
  it.each([
    ['20261029140601_review_lifecycle_foundation.sql','26236450a9a8da8f34eb76b371639559e418066d42929b8bfc4add3b29087918'],
    ['20261029172250_enforce_explicit_project_admin_management.sql','16e2eeaa95163288b85e2092e28e970a13233f5fb1d8855ea84d74ec47082074'],
    ['20261029184603_freeze_review_dependency_packages.sql','0fec13d840af36be15d0984eb5439293c1fd7360cee3f67a10f1fc4b0e02e142'],
  ])('preserves accepted SQL bytes %s',(file,hash)=>expect(createHash('sha256').update(read(file)).digest('hex')).toBe(hash));
});
