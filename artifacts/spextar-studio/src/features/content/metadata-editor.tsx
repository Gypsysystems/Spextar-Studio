import { useImperativeHandle, useState, type Ref } from 'react';
import type { DocumentRecord, DocumentStatus, Topic } from '@/domain/types';
import { useServices } from '@/providers/services-provider';
import { useMetadataAutosave } from '@/hooks/use-metadata-autosave';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DOC_STATUS_LABEL } from '@/lib/format';

export interface TopicMetadataControls { changeTitle(value: string): void; changeKind(value: string): void }
export function MetadataEditor({ projectId, doc, topic, controls }: { projectId: string; doc: DocumentRecord; topic?: Topic; controls?: Ref<TopicMetadataControls> }) {
  const { documents } = useServices();
  const initial = topic
    ? { title: topic.title, slug: topic.slug ?? '', status: topic.status ?? 'draft' as DocumentStatus, settings: topic.settings ?? {} }
    : { title: doc.title, slug: doc.slug ?? '', status: doc.status, settings: doc.settings ?? {}, description: doc.summary };
  const save = useMetadataAutosave(initial, (value) => topic
    ? documents.updateTopic(projectId, doc.id, topic.id, value)
    : documents.updateDocument(projectId, doc.id, { ...value, description: ('description' in value ? value.description : '') || null }), projectId, { documentId: doc.id, topicId: topic?.id });
  const [json, setJSON] = useState<string | null>(null);
  const [jsonError, setJSONError] = useState('');
  const disabled = !doc.canEdit;
  const update = (patch: Partial<typeof initial>) => save.change({ ...save.draft, ...patch });
  useImperativeHandle(controls, () => ({
    changeTitle: (title) => { if (!disabled) update({ title }); },
    changeKind: (kind) => { if (!disabled) update({ settings: { ...save.draft.settings, kind } }); },
  }));
  return (
    <div role="group" className="space-y-3" onBlur={() => void save.flush()} aria-label={topic ? 'Topic metadata' : 'Document metadata'}>
      {!controls && <label className="block text-xs">Title<Input aria-label={topic ? 'Persisted topic title' : 'Document title'} value={save.draft.title} disabled={disabled} onChange={(e) => update({ title: e.target.value })} /></label>}
      <label className="block text-xs">Status
        <select className="mt-1 h-9 w-full rounded-md border bg-background px-2" aria-label={topic ? 'Topic status' : 'Document status'} disabled value={save.draft.status}>
          {Object.entries(DOC_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {!topic && <label className="block text-xs">Description<Textarea aria-label="Document description" value={'description' in save.draft ? save.draft.description : ''} disabled={disabled} onChange={(e) => update({ description: e.target.value })} /></label>}
      {topic && !controls && <label className="block text-xs">Topic kind
        <select className="mt-1 h-9 w-full rounded-md border bg-background px-2" aria-label="Persisted topic kind" disabled={disabled} value={String(save.draft.settings.kind ?? topic.kind)} onChange={(e) => update({ settings: { ...save.draft.settings, kind: e.target.value } })}>
          {['concept', 'task', 'reference'].map((kind) => <option key={kind}>{kind}</option>)}
        </select>
      </label>}
      <details><summary className="cursor-pointer text-xs text-muted-foreground">JSON metadata settings</summary>
        <Textarea aria-label={topic ? 'Topic settings' : 'Document settings'} disabled={disabled} className="mt-2 font-mono text-xs" value={json ?? JSON.stringify(save.draft.settings, null, 2)} onChange={(e) => { setJSON(e.target.value); setJSONError('Settings have not been validated.'); }} onBlur={() => {
          if (json === null) return;
          try {
            const value = JSON.parse(json);
            if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
            if ('body' in value || 'content' in value) { setJSONError('Body/content belongs in topic drafts, not metadata settings.'); return; }
            update({ settings: value }); setJSONError(''); setJSON(null);
          } catch { setJSONError('Settings must be a valid JSON object.'); }
        }} />
      </details>
      {jsonError && <p role="alert" className="text-xs text-destructive">{jsonError}</p>}
      {!disabled && <div role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {jsonError ? 'Settings not saved' : save.state === 'saved' ? 'Metadata saved' : save.state === 'pending' ? 'Unsaved metadata…' : save.state === 'saving' ? 'Saving metadata…' : 'Metadata not saved'}
      </div>}
      {save.error && <div role="alert" className="text-xs text-destructive">{save.error.message} <Button size="sm" variant="outline" onClick={save.retry}>Retry metadata save</Button></div>}
      {disabled && <p className="text-xs text-muted-foreground">{doc.status === 'draft' ? 'Read-only · project admins and authors can edit metadata.' : `Read-only · ${DOC_STATUS_LABEL[doc.status]}. Return to Draft through the review actions before editing.`}</p>}
    </div>
  );
}
