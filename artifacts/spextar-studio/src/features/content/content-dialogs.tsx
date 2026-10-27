import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { useServices } from '@/providers/services-provider';
import { useContentMutation } from '@/hooks/use-content-mutation';
import { slugify } from '@/domain/project-identifiers';
import type { DocumentRecord, Topic } from '@/domain/types';
import { topicDescendants } from '@/domain/topic-tree';
import { MetadataEditor } from './metadata-editor';

export function DocumentMetadataDialog({ doc }: { doc: DocumentRecord }) {
  return <Dialog><DialogTrigger asChild><Button size="sm" variant="outline">Document metadata</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Document metadata</DialogTitle><DialogDescription>Metadata saves automatically. Topic bodies are not saved.</DialogDescription></DialogHeader>
      <MetadataEditor projectId={doc.projectId} doc={doc} />
    </DialogContent></Dialog>;
}

type Action = 'document' | 'topic' | 'duplicate-document' | 'duplicate-topic' | 'move';
export function ContentDialog({ action, projectId, doc, topic, onTopic }: {
  action: Action; projectId: string; doc?: DocumentRecord; topic?: Topic; onTopic?: (id: string) => void;
}) {
  const { documents } = useServices();
  const [, navigate] = useLocation();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const mutation = useContentMutation(projectId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [parent, setParent] = useState('');
  const [position, setPosition] = useState('0');
  const label = { document: 'Create document', topic: 'Create topic', 'duplicate-document': 'Duplicate document', 'duplicate-topic': 'Duplicate topic subtree', move: 'Move topic' }[action];
  const excluded = topic && doc && action === 'move' ? topicDescendants(doc.topics, topic.id) : new Set<string>();
  return <Dialog open={open} onOpenChange={(next) => {
    if (mutation.isPending) return;
    setOpen(next);
    if (next) {
      const value = action.startsWith('duplicate') ? `${topic?.title ?? doc?.title ?? ''} copy` : '';
      setTitle(value); setSlug(slugify(value)); setSlugEdited(false); setDescription('');
      setParent(action === 'move' ? topic?.parentTopicId ?? '' : topic?.id ?? '');
      setPosition(String(topic?.sortOrder ?? 0)); mutation.reset();
    }
  }}>
    <DialogTrigger asChild><Button size="sm" variant={action === 'document' ? 'default' : 'outline'}>{label}</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{action === 'move' ? 'The database validates hierarchy and sibling ordering.' : 'Created copies start as drafts. Topic bodies are not persisted in F2.'}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(async () => {
          if (action === 'move') return documents.moveTopic(projectId, doc!.id, topic!.id, parent || null, Number(position));
          if (action === 'document') return documents.createDocument(projectId, { title, slug, description: description || null });
          if (action === 'topic') return documents.createTopic(projectId, doc!.id, { title, slug, parentTopicId: parent || null });
          if (action === 'duplicate-document') return documents.duplicateDocument(projectId, doc!.id, { title, slug });
          return documents.duplicateTopicSubtree(projectId, doc!.id, topic!.id, { title, slug });
        }, { onSuccess: (result) => {
          setOpen(false);
          if (typeof result === 'string' && result) {
            if (action === 'document' || action === 'duplicate-document') {
              navigate(`/workspaces/${workspaceId}/projects/${projectId}/author/${result}`);
            } else onTopic?.(result);
          }
        } });
      }}>
        {action !== 'move' && <>
          <label className="block text-sm">Title<Input aria-label={`${label} title`} required maxLength={500} value={title} onChange={(e) => { setTitle(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); }} /></label>
          <label className="block text-sm">Slug<Input aria-label={`${label} slug`} required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }} /></label>
        </>}
        {action === 'document' && <label className="block text-sm">Description<Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>}
        {(action === 'topic' || action === 'move') && <label className="block text-sm">Parent topic
          <select aria-label="Parent topic" className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Document root</option>
            {doc!.topics.filter((t) => !excluded.has(t.id)).map((t) => <option key={t.id} value={t.id}>{'— '.repeat(Math.min(t.level - 1, 10))}{t.title}</option>)}
          </select>
        </label>}
        {action === 'move' && <label className="block text-sm">Sibling sort order<Input aria-label="Sibling sort order" type="number" min={0} step={1} required value={position} onChange={(e) => setPosition(e.target.value)} /></label>}
        {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : label}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
