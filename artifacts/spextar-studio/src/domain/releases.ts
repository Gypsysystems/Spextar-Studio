import { z } from 'zod';
import { checkedReview, type Review } from './reviews';
import { canonicalReviewJson } from './review-package';
import { ServiceError } from '@/services/contracts';

export const RELEASE_VERSION = 1;
export interface PublishRequest {
  projectId: string;
  documentId: string;
  reviewId: string;
  expectedUpdatedAt: string;
  requestKey: string;
}
const sourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    rendererVersion: z.literal(1),
    reviewId: z.string(),
    projectId: z.string(),
    documentId: z.string(),
    submittedBy: z.string(),
    submittedAt: z.string(),
    approvedBy: z.string(),
    approvedAt: z.string(),
    document: z.unknown(),
    topics: z.unknown(),
    dependencies: z.unknown(),
  })
  .strict();
const releaseSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string(),
  document_id: z.string(),
  review_id: z.string(),
  sequence: z.number().int().positive(),
  state: z.literal('published'),
  package_schema_version: z.literal(1),
  resolver_version: z.literal(1),
  renderer_version: z.literal(1),
  canonicalization: z.literal('spextar-json-v1'),
  frozen_source: sourceSchema,
  package_digest: z.string().regex(/^[a-f0-9]{64}$/),
  manifest_digest: z.string().regex(/^[a-f0-9]{64}$/),
  published_by: z.string(),
  published_at: z.string(),
  request_key: z.string().uuid(),
  audit: z.record(z.string(), z.unknown()),
});
export type Release = z.infer<typeof releaseSchema> & { review: Review };
export interface ReleaseService {
  list(projectId: string, documentId: string): Promise<Release[]>;
  publish(request: PublishRequest): Promise<string>;
  findRequest(request: PublishRequest): Promise<Release | null>;
}
export async function sha256Canonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalReviewJson(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function publishCandidate(review: Review | null): Review {
  if (!review || review.status !== 'approved' || !review.dependency_package)
    throw new ServiceError('A new approved review with frozen dependencies is required.', 'validation');
  const valid = checkedReview(review, review.project_id, review.document_id);
  if (valid.topics_snapshot.some((t) => t.content === null))
    throw new ServiceError(
      'Every approved topic needs a saved body. Create a new Draft and submit again.',
      'validation',
    );
  return valid;
}
export async function checkedRelease(raw: unknown, projectId: string, documentId: string): Promise<Release> {
  const parsed = releaseSchema.safeParse(raw);
  const fail = (): never => {
    throw new ServiceError('This release could not be verified. Refresh or contact your Project Admin.', 'unavailable');
  };
  if (!parsed.success) return fail();
  const r = parsed.data,
    s = r.frozen_source;
  if (
    r.project_id !== projectId ||
    r.document_id !== documentId ||
    s.projectId !== projectId ||
    s.documentId !== documentId ||
    s.reviewId !== r.review_id
  )
    return fail();
  const reviewSequence = r.audit.reviewSequence;
  if (typeof reviewSequence !== 'number' || !Number.isSafeInteger(reviewSequence) || reviewSequence < 1) return fail();
  const review = publishCandidate(
    checkedReview(
      {
        id: s.reviewId,
        project_id: projectId,
        document_id: documentId,
        sequence: reviewSequence,
        status: 'approved',
        submitted_by: s.submittedBy,
        submitted_at: s.submittedAt,
        decided_by: s.approvedBy,
        decided_at: s.approvedAt,
        decision_note: null,
        document_snapshot: s.document,
        topics_snapshot: s.topics,
        dependency_package: s.dependencies,
      },
      projectId,
      documentId,
    ),
  );
  if ((await sha256Canonical(s)) !== r.package_digest) return fail();
  if (typeof r.audit.publishedAt !== 'string' || Date.parse(r.audit.publishedAt) !== Date.parse(r.published_at))
    return fail();
  const manifest = {
    schemaVersion: 1,
    releaseId: r.id,
    projectId,
    documentId,
    reviewId: r.review_id,
    sequence: r.sequence,
    packageDigest: r.package_digest,
    publishedBy: r.published_by,
    publishedAt: r.audit.publishedAt,
    requestKey: r.request_key,
    audit: r.audit,
  };
  if ((await sha256Canonical(manifest)) !== r.manifest_digest) return fail();
  return { ...r, review };
}
