import { useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import type { DocumentRecord, Topic } from '@/domain/types';
import { useServices } from '@/providers/services-provider';
import { useContentDeletion } from '@/hooks/use-content-deletion';

export function DeleteContentDialog({ doc, topic, onTopicDeleted }: {
  doc: DocumentRecord; topic?: Topic; onTopicDeleted?: (id: string) => void;
}) {
  const { mode } = useServices();
  const [, navigate] = useLocation();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [snapshot, setSnapshot] = useState({ doc, topic });
  const cancel = useRef<HTMLButtonElement>(null);
  const mutation = useContentDeletion(doc.projectId, (target) => {
    setOpen(false);
    if (target.topicId) onTopicDeleted?.(target.topicId);
    else navigate(`/workspaces/${workspaceId}/projects/${doc.projectId}`, { replace: true });
  });
  if (mode !== 'backend' || !doc.canEdit) return null;
  const label = topic ? 'Delete topic' : 'Delete document';
  const title = snapshot.topic?.title ?? snapshot.doc.title;
  const hasDependencies = snapshot.topic
    ? snapshot.doc.topics.some((item) => item.parentTopicId === snapshot.topic!.id)
    : snapshot.doc.topics.length > 0;
  const blocked = snapshot.topic
    ? 'Move or delete this topic’s children first. Only leaf topics can be deleted.'
    : 'Delete all topics in this document first, starting with leaf topics. Only empty documents can be deleted.';
  return <Dialog open={open} onOpenChange={(next) => {
    if (mutation.isPending) return;
    setOpen(next);
    if (next) { setSnapshot({ doc, topic }); setConfirmation(''); mutation.reset(); }
  }}>
    <DialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive">{label}</Button></DialogTrigger>
    <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}>
      <DialogHeader><DialogTitle>{label}?</DialogTitle>
        <DialogDescription>This permanently deletes “{title}”. It cannot be undone. Unsaved local edits for this item will be discarded. Other documents and topics are not selected for deletion.</DialogDescription>
      </DialogHeader>
      {hasDependencies ? <p role="alert" className="text-sm">{blocked}</p> : <p className="text-sm text-muted-foreground">If this item is used elsewhere, deletion may be blocked. Check with your team before continuing.</p>}
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        if (confirmation !== title || hasDependencies || mutation.isPending) return;
        mutation.mutate({ documentId: snapshot.doc.id, topicId: snapshot.topic?.id,
          expectedUpdatedAt: snapshot.topic ? snapshot.topic.updatedAt ?? '' : snapshot.doc.updatedAt });
      }}>
        <label className="block text-sm">Type the exact title to confirm
          <Input aria-label="Title to confirm deletion" autoComplete="off" required disabled={mutation.isPending || hasDependencies} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </label>
        {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button ref={cancel} type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={hasDependencies || confirmation !== title || mutation.isPending}>{mutation.isPending ? 'Deleting…' : label}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
