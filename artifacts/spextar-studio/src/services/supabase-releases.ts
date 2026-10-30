import type { SupabaseClient } from '@supabase/supabase-js';
import { checkedRelease, type ReleaseService } from '@/domain/releases';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';
const fields = 'id,project_id,document_id,review_id,sequence,state,package_schema_version,resolver_version,renderer_version,canonicalization,frozen_source,package_digest,manifest_digest,published_by,published_at,request_key,audit';
/** Exact one-call publication. Ambiguous outcomes are recovered by request key. */
export function supabaseReleases(client: SupabaseClient): ReleaseService {
  return {
    async list(projectId, documentId) {
      const rows = [];
      for (let offset=0;;offset+=100) {
        const result = await client.from('document_releases').select(fields).eq('project_id',projectId).eq('document_id',documentId).order('sequence',{ascending:false}).range(offset,offset+99);
        if (result.error) throw backendError(result.error);
        rows.push(...await Promise.all((result.data ?? []).map(r=>checkedRelease(r,projectId,documentId))));
        if ((result.data ?? []).length < 100) return rows;
      }
    },
    async findRequest(r) {
      const result = await client.from('document_releases').select(fields).eq('project_id',r.projectId).eq('document_id',r.documentId).eq('request_key',r.requestKey).maybeSingle();
      if (result.error) throw backendError(result.error);
      return result.data ? checkedRelease(result.data,r.projectId,r.documentId) : null;
    },
    async publish(r) {
      const result = await client.rpc('publish_document_release',{
        p_project_id:r.projectId,p_document_id:r.documentId,p_review_id:r.reviewId,p_expected_updated_at:r.expectedUpdatedAt,p_request_key:r.requestKey,
      });
      if (result.error) {
        if (['40001','23505'].includes(result.error.code)) throw new ServiceError('The approved document changed. Refresh before publishing.','conflict');
        if (['23514','22023','22P02','P0002','P0003'].includes(result.error.code)) throw new ServiceError('The approved content cannot be published. Create a new Draft, check saved content and submit again.','validation');
        throw backendError(result.error);
      }
      if (typeof result.data !== 'string' || !result.data) throw new ServiceError('Publication could not be confirmed. Check publication status.','network');
      return result.data;
    },
  };
}
