import { useEffect, useState, type ComponentType } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDocuments } from '@/hooks/use-studio-data';
import { useContentMutation } from '@/hooks/use-content-mutation';
import { useServices } from '@/providers/services-provider';
import { UserIdentity } from '@/components/user-identity';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ErrorState, EmptyState, ListSkeleton } from '@/components/states';
import { FileSearch } from 'lucide-react';
import { orderTopics } from '@/domain/topic-tree';
import type { TopicContent } from '@/domain/topic-content';
import type { DocumentRecord, ProjectSummary, Topic } from '@/domain/types';
import type { Review } from '@/domain/reviews';
import { cn } from '@/lib/utils';
import { documentVersionLabel } from '@/lib/presentation';

function Decision({ review, decision }: { review: Review; decision: 'approved' | 'changes_requested' }) {
  const services = useServices();
  const client = useQueryClient();
  const mutation = useContentMutation(review.project_id);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const title = decision === 'approved' ? 'Approve' : 'Request changes';
  return <Dialog open={open} onOpenChange={v => { if (!mutation.isPending) { setOpen(v); setNote(''); mutation.reset(); } }}>
    <DialogTrigger asChild><Button size="sm" variant={decision === 'approved' ? 'default' : 'outline'}>{title}</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{decision === 'approved' ? 'Approve the immutable submitted content. Editing requires a new draft.' : 'Return the working document to Draft. Explain the changes needed.'}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault();
        if (decision === 'changes_requested' && !note.trim()) return;
        mutation.mutate(async () => {
          await services.reviews!.decide(review.project_id, review.document_id, review.id, decision, note);
          await client.invalidateQueries({ queryKey: ['document-review', review.project_id, review.document_id] });
        }, { onSuccess: () => setOpen(false) });
      }}>
        <label className="block text-sm">Decision note {decision === 'approved' ? '(optional)' : '(required)'}
          <Textarea aria-label="Decision note" required={decision === 'changes_requested'} value={note} onChange={e => setNote(e.target.value)} disabled={mutation.isPending} />
        </label>
        {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={mutation.isPending || (decision === 'changes_requested' && !note.trim())}>{mutation.isPending ? 'Saving…' : `Confirm ${title.toLowerCase()}`}</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Cancel</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function SubmittedReview({ project, Viewer, onDoc }: { project: ProjectSummary; Viewer: ComponentType<{ content: TopicContent }>; onDoc?: (doc: DocumentRecord | null) => void }) {
  const docs = useDocuments(project.id);
  const [selection, setSelection] = useState('');
  const eligible = (docs.data ?? []).filter(d => d.status !== 'published');
  const doc = eligible.find(d => d.id === selection) ?? eligible.find(d => d.status === 'in-review') ?? eligible[0];
  const services = useServices();
  const [topicId, setTopicId] = useState('');
  const query = useQuery({ queryKey: ['document-review', project.id, doc?.id], queryFn: () => services.reviews!.latest(project.id, doc!.id), enabled: !!doc && !!services.reviews, retry: false, staleTime: 0 });
  const review = query.data;
  useEffect(() => {
    onDoc?.(doc && !query.isError ? { ...doc, title: review?.document_snapshot.title ?? doc.title } : null);
  }, [doc, review?.document_snapshot.title, query.isError, onDoc]);
  const topics = review ? orderTopics(review.topics_snapshot.map(t => ({ id: t.id, title: t.title, parentTopicId: t.parent_topic_id, sortOrder: t.sort_order, level: 1, kind: t.settings.kind as Topic['kind'] || 'concept', body: [] }))) : [];
  const topic = topics.find(t => t.id === topicId) ?? topics[0];
  const body = review?.topics_snapshot.find(t => t.id === topic?.id);
  const canDecide = project.canReview === true;
  if (docs.isLoading) return <ListSkeleton rows={3} />;
  if (docs.isError) return <ErrorState error={docs.error} onRetry={() => void docs.refetch()} title="Documents did not load" />;
  if (!doc) return <EmptyState icon={FileSearch} title="No documents to review" body="Submit a saved draft from Author to begin a review." />;
  if (!services.reviews) return <p role="alert">Review is unavailable. Contact your administrator.</p>;
  return <div className="mt-5 space-y-5">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm">Document<select aria-label="Review document" className="mt-1 block h-10 w-full rounded-md border bg-background px-2" value={doc.id} onChange={e => { setSelection(e.target.value); setTopicId(''); }}>
        {eligible.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
      </select></label>
      <Button variant="outline" size="sm" data-testid="button-refresh" disabled={query.isFetching || docs.isFetching} onClick={() => { void docs.refetch(); void query.refetch(); }}>Refresh</Button>
    </div>
    {query.isPending ? <ListSkeleton rows={3} /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Submitted review did not load" /> : !review ? <EmptyState icon={FileSearch} title="No submitted review" body="This document has no submitted snapshot. Submit its saved Draft from Author." /> : <>
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{review.document_snapshot.title}</h2>
        <p className="text-sm text-muted-foreground">{documentVersionLabel(typeof review.document_snapshot.settings.version === 'string' ? review.document_snapshot.settings.version : undefined)}</p>
        <p className="text-sm" role="status">{review.status === 'in_review' ? 'In review' : review.status === 'approved' ? 'Approved' : 'Changes requested'} · Review {review.sequence}</p>
        <p className="text-sm text-muted-foreground">Submitted by <span data-testid="text-draft-updated-by"><UserIdentity userId={review.submitted_by} /></span> · {new Date(review.submitted_at).toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">Immutable submitted content. Working draft changes do not alter this review.</p>
        {review.decided_at && <p className="text-sm">Decision by <UserIdentity userId={review.decided_by ?? undefined} /> · {new Date(review.decided_at).toLocaleString()}</p>}
        {review.decision_note && <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{review.decision_note}</p>}
        {canDecide && review.status === 'in_review' && <div className="flex flex-wrap gap-2"><Decision key={`${review.id}-approve`} review={review} decision="approved" /><Decision key={`${review.id}-changes`} review={review} decision="changes_requested" /></div>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label={`Submitted outline for ${review.document_snapshot.title}`}><ol className="space-y-1">{topics.map(t => <li key={t.id} style={{ paddingLeft: `${Math.min(t.level - 1, 4) * 12}px` }}><button data-testid={`review-topic-${t.id}`} className={cn('w-full rounded px-3 py-2 text-left text-sm [overflow-wrap:anywhere]', topic?.id === t.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')} aria-current={topic?.id === t.id} onClick={() => setTopicId(t.id)}>{t.title}</button></li>)}</ol></nav>
        <section className="min-w-0 space-y-3" aria-label="Submitted topic">
          {body ? <><h3 className="text-xl font-semibold [overflow-wrap:anywhere]">{body.title}</h3>{body.content === null ? <p data-testid="review-draft-missing">No saved body was submitted for this topic.</p> : <><p className="text-sm text-muted-foreground">Submitted revision <span data-testid="review-draft-revision">{body.revision}</span></p><Viewer key={`${review.id}-${body.id}`} content={body.content} /></>}</> : <p>No topics were submitted.</p>}
        </section>
      </div>
    </>}
  </div>;
}
