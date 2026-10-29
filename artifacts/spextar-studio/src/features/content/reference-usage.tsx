import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useServices } from '@/providers/services-provider';
import { whereUsed, type ReferenceTarget } from '@/services/semantic-references';
import type { ReferenceScope } from '@/domain/semantic-references';
import { Button } from '@/components/ui/button';

export function ReferenceUsage({
  scope,
  target,
  testId = 'reference-usage',
}: {
  scope: ReferenceScope;
  target: ReferenceTarget;
  testId?: string;
}) {
  const services = useServices();
  const usage = useQuery({
    queryKey: [
      'reference-usage',
      scope.workspaceId,
      scope.projectId,
      target.kind,
      target.definitionId,
      target.categoryId,
    ],
    queryFn: () => whereUsed(services, scope, target),
    retry: false,
    staleTime: 0,
  });
  return (
    <div className="mt-2 space-y-2 text-[12.5px] text-muted-foreground" data-testid={testId}>
      {usage.isLoading ? (
        <p role="status">Loading saved references…</p>
      ) : usage.isError ? (
        <p role="alert">Saved references could not be checked. No count is available.</p>
      ) : (
        <>
          <p>
            {usage.data?.length ?? 0} saved reference{usage.data?.length === 1 ? '' : 's'} in accessible locations.
          </p>
          {!!usage.data?.length && (
            <ul className="list-disc space-y-1 pl-4">
              {usage.data.map((u, i) => (
                <li key={i} className="break-words [overflow-wrap:anywhere]">
                  <Link
                    className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={
                      u.documentId
                        ? `/workspaces/${scope.workspaceId}/projects/${u.projectId}/author/${u.documentId}?topic=${encodeURIComponent(u.topicId!)}`
                        : `/workspaces/${scope.workspaceId}/projects/${u.projectId}/reusable-content`
                    }
                  >
                    {u.projectName} · {u.documentTitle ? `${u.documentTitle} · ${u.topicTitle}` : u.reusableName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Button size="sm" variant="outline" disabled={usage.isFetching} onClick={() => void usage.refetch()}>
        {usage.isError ? 'Retry references' : 'Refresh references'}
      </Button>
      <p>
        Saved bodies only; unsaved edits are excluded. Shared content may have uses in projects you cannot read.
        Deletion is unavailable; rename preserves references.
      </p>
      {services.mode === 'demo' && (
        <p>Demo topics are not persisted. Counts include saved session reusable drafts only.</p>
      )}
    </div>
  );
}
export function ValueReferenceUsage({
  scope,
  id,
  categoryId,
  name,
}: {
  scope: ReferenceScope;
  id: string;
  categoryId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="rounded-md border p-2" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Where used: {name}
      </summary>
      {open && <ReferenceUsage scope={scope} target={{ kind: 'condition', definitionId: id, categoryId }} />}
    </details>
  );
}
