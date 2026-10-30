import type { SupabaseClient } from '@supabase/supabase-js';
import { checkedReview, type ReviewService } from '@/domain/reviews';
import { ServiceError } from './contracts';
import { backendError } from './supabase-errors';
export const reviewRpcParameters: Record<string, string[]> = {
  submit_document_review: ['p_project_id', 'p_document_id', 'p_expected_updated_at'],
  approve_document_review: ['p_project_id', 'p_document_id', 'p_review_id', 'p_note'],
  request_document_changes: ['p_project_id', 'p_document_id', 'p_review_id', 'p_note'],
  start_document_draft: ['p_project_id', 'p_document_id', 'p_review_id', 'p_expected_updated_at'],
};

/** One authenticated operation per action. Never retry an ambiguous transition. */
export function supabaseReviews(client: SupabaseClient): ReviewService {
  async function run(name: string, args: Record<string, unknown>) {
    const parameters = reviewRpcParameters[name];
    if (!parameters || parameters.length !== Object.keys(args).length || parameters.some(p => !Object.hasOwn(args, p))) throw new ServiceError('This review action could not be prepared. Refresh and try again.', 'unavailable');
    const result = await client.rpc(name, args);
    if (result.error) {
      if (['PT409', '40001', '23505'].includes(result.error.code)) throw new ServiceError('This document or review changed. Refresh before trying again.', 'conflict');
      if (name === 'submit_document_review' && ['23514', '22P02', '22023'].includes(result.error.code)) throw new ServiceError('Review dependencies could not be frozen. Check saved content and linked definitions before submitting again.', 'validation');
      if (result.error.code === '22023' && name === 'request_document_changes') throw new ServiceError('Enter a decision note before requesting changes.', 'validation');
      throw backendError(result.error);
    }
    if (typeof result.data !== 'string' || !result.data) throw new ServiceError('The review action could not be confirmed. Refresh before trying again.', 'unavailable');
    return result.data;
  }
  return {
    async latest(projectId, documentId) {
      const result = await client.from('document_reviews').select('id,project_id,document_id,sequence,status,submitted_by,submitted_at,decided_by,decided_at,decision_note,document_snapshot,topics_snapshot,dependency_package').eq('project_id', projectId).eq('document_id', documentId).order('sequence', { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw backendError(result.error);
      return result.data ? checkedReview(result.data, projectId, documentId) : null;
    },
    async submit(projectId, documentId, expectedUpdatedAt) {
      const id = await run('submit_document_review', { p_project_id: projectId, p_document_id: documentId, p_expected_updated_at: expectedUpdatedAt });
      if (typeof id !== 'string' || !id) throw new ServiceError('Submission could not be confirmed. Refresh before trying again.', 'unavailable');
      return id;
    },
    async decide(projectId, documentId, reviewId, decision, note) {
      if (decision === 'changes_requested' && !note.trim()) throw new ServiceError('Enter a decision note before requesting changes.', 'validation');
      await run(decision === 'approved' ? 'approve_document_review' : 'request_document_changes', {
        p_project_id: projectId, p_document_id: documentId, p_review_id: reviewId, p_note: note.trim() || null,
      });
    },
    async startDraft(projectId, documentId, reviewId, expectedUpdatedAt) {
      await run('start_document_draft', { p_project_id: projectId, p_document_id: documentId, p_review_id: reviewId, p_expected_updated_at: expectedUpdatedAt });
    },
  };
}
