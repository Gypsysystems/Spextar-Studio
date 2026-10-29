import { useParams, Link } from 'wouter';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/providers/services-provider';
import type { DemoReferenceDraft } from '@/services/reference-reads';
import type { ReferenceKind } from '@/domain/semantic-references';
import { useConditionValues } from '@/hooks/use-project-conditions';

export function ReferenceUsage({ kind, id }: { kind: ReferenceKind; id: string }) {
  const { workspaceId, projectId } = useParams<{ workspaceId?: string; projectId?: string }>();
  if (!workspaceId || !projectId) return <p className="mt-2 text-xs text-muted-foreground">Open a project to inspect saved references. Deletion remains unavailable.</p>;
  return <ScopedUsage key={`${workspaceId}-${projectId}-${kind}-${id}`} workspaceId={workspaceId} projectId={projectId} kind={kind} id={id} />;
}
function ScopedUsage({ workspaceId, projectId, kind, id }: { workspaceId: string; projectId: string; kind: ReferenceKind; id: string }) {
  const services = useServices();
  const client = useQueryClient();
  const [valueId, setValueId] = useState('');
  const values = useConditionValues(projectId, kind === 'category' ? id : null);
  const query = useQuery({ queryKey: ['reference-usage', workspaceId, projectId, kind, id, valueId], enabled: false, retry: false,
    queryFn: async () => {
      const { readReferenceUsage } = await import('@/services/reference-reads');
      return readReferenceUsage(services, { workspaceId, projectId }, { kind: valueId ? 'condition' : kind, id: valueId || id },
        client.getQueriesData<DemoReferenceDraft>({ queryKey: ['semantic-demo-draft'] }).flatMap(([, draft]) => draft ? [draft] : []));
    } });
  return <div className="mt-2 space-y-2 text-xs" data-testid="saved-reference-usage">
    <p className="text-muted-foreground">{services.mode === 'backend' ? 'Only saved drafts in projects you can access are checked. This does not authorize deletion.' : 'Session-only demo topics opened in this session; not a complete library count.'}</p>
    {kind === 'category' && <label className="block">Inspect category or value
      <select aria-label="Reference usage condition value" className="mt-1 block max-w-full rounded border bg-background p-1.5" value={valueId} onChange={e => setValueId(e.target.value)}>
        <option value="">Entire category</option>{values.data?.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
      </select>
      {values.isError && <button type="button" onClick={() => void values.refetch()}>Reload reference value list</button>}
    </label>}
    <button type="button" className="rounded border px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Checking references…' : 'Find saved references'}</button>
    {query.isError && <p role="alert">Saved references could not be fully checked. Retry above; no complete count is available.</p>}
    {!query.isFetching && !query.isError && query.data && <div role="status">
      <p>{query.data.length} saved reference occurrence(s) found.</p>
      <p className="text-muted-foreground">Read-through results, including linked content. Refresh after changes; revisions identify the drafts read.</p>
      <ul className="mt-2 space-y-2">{query.data.map((location, index) => <li key={`${location.topicId}-${location.nodeId}-${index}`}>
        <Link className="break-words text-primary underline" href={`/workspaces/${workspaceId}/projects/${location.projectId}/author/${location.documentId}?topic=${encodeURIComponent(location.topicId)}`}>
          {location.projectName} / {location.documentTitle} / {location.topicTitle}
        </Link>{location.revision !== null && <span> · revision {location.revision}</span>}{location.viaLinkedContent && <span> · via linked content</span>}
      </li>)}</ul>
    </div>}
    <p className="text-muted-foreground">Renaming preserves reference identities. Permanent definition deletion remains unavailable; a partial usage scan never authorizes deletion.</p>
  </div>;
}
