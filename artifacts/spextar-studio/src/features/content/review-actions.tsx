import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';
import { useStudioSession } from '@/providers/session-provider';
import { readRecovery } from '@/services/topic-draft-recovery';
import { useContentMutation } from '@/hooks/use-content-mutation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { documentDraftsReady, disposeDeletedDrafts } from './topic-draft-registry';
import type { DocumentRecord } from '@/domain/types';

export function ReviewActions({ doc, canAct }: { doc: DocumentRecord; canAct: boolean }) {
  const services = useServices();
  const session = useStudioSession();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{ status: DocumentRecord['status']; updatedAt: string; reviewId: string | null } | null>(null);
  const [error, setError] = useState('');
  const mutation = useContentMutation(doc.projectId);
  const latest = useQuery({ queryKey: ['document-review', doc.projectId, doc.id], queryFn: () => services.reviews!.latest(doc.projectId, doc.id), enabled: !!services.reviews, retry: false, staleTime: 0 });
  // canEdit is intentionally false in Approved. Explicit project permission comes from the parent.
  if (!services.reviews) return null;
  const targetStatus = open && confirmation ? confirmation.status : doc.status;
  const action = targetStatus === 'draft' ? 'Submit for review' : ['approved','published'].includes(targetStatus) ? 'Start new draft' : null;
  return <div className="space-y-2 text-sm">
    <p className="text-muted-foreground">{doc.status === 'draft' ? 'Only saved content is submitted. Save all topic and metadata changes first.' : doc.status === 'in-review' ? 'In review · Author is read-only while the submitted content is reviewed.' : doc.status === 'approved' ? 'Reviewed · Start a new draft to edit this document.' : 'Published · Start a new draft to edit. Existing releases stay unchanged.'}</p>
    {latest.data?.status === 'changes_requested' && <p className="rounded-md border bg-muted p-3">Changes Recommended: {latest.data.decision_note}</p>}
    {latest.isError && <p role="alert">Review status could not load. <Button variant="outline" size="sm" onClick={() => void latest.refetch()}>Refresh review status</Button></p>}
    {action && canAct && <Dialog open={open} onOpenChange={value => { if (!mutation.isPending) {
      setConfirmation(value ? { status: doc.status, updatedAt: doc.updatedAt, reviewId: latest.data?.id ?? null } : null);
      setOpen(value); setError(''); mutation.reset();
    } }}>
      <DialogTrigger asChild><Button size="sm" disabled={latest.isPending || latest.isError}>{action}</Button></DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>{action}</DialogTitle><DialogDescription>{targetStatus === 'draft' ? 'Submit the saved document outline and topic bodies as an immutable review. Author becomes read-only until a decision.' : 'Create an editable draft from the latest approved content. The approved review stays unchanged.'}</DialogDescription></DialogHeader>
        {(error || mutation.error) && <p role="alert" className="text-sm text-destructive">{error || mutation.error?.message}</p>}
        <div className="flex flex-wrap gap-2"><Button disabled={mutation.isPending} onClick={() => {
          if (!confirmation || doc.status !== confirmation.status || doc.updatedAt !== confirmation.updatedAt
            || (['approved','published'].includes(confirmation.status) && latest.data?.id !== confirmation.reviewId)) {
            setError('This document or review changed. Close this confirmation and refresh before continuing.'); return;
          }
          if (doc.status === 'draft') {
            try {
              const userId = session.data?.userId;
              if (!userId || !documentDraftsReady(client, doc.projectId, doc.id) || doc.topics.some(topic => readRecovery({ userId, projectId: doc.projectId, documentId: doc.id, topicId: topic.id }).length > 0)) {
                setError('Save or resolve all topic and metadata changes before continuing. Browser recovery copies are not submitted.'); return;
              }
            } catch { setError('Browser recovery could not be checked. Keep this tab open and resolve recovery before submitting.'); return; }
          }
          setError('');
          mutation.mutate(async () => {
            if (confirmation.status === 'draft') await services.reviews!.submit(doc.projectId, doc.id, confirmation.updatedAt);
            else if (latest.data?.status === 'approved' && confirmation.reviewId) await services.reviews!.startDraft(doc.projectId, doc.id, confirmation.reviewId, confirmation.updatedAt);
            else throw new Error('Refresh the latest approved review before continuing.');
            // Stop retained controllers without deleting identity-scoped recovery.
            // A new Draft must read its new revision, never reuse a pre-review editor.
            disposeDeletedDrafts(client, doc.projectId, doc.id);
            await client.invalidateQueries({ queryKey: ['document-review', doc.projectId, doc.id] });
          }, { onSuccess: () => setOpen(false) });
        }}>{mutation.isPending ? 'Saving…' : `Confirm ${action.toLowerCase()}`}</Button><Button variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Cancel</Button></div>
      </DialogContent>
    </Dialog>}
  </div>;
}
