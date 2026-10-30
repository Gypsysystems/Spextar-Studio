import { lazy, Suspense, useState, useRef, useMemo } from 'react';
import { useParams } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProjectScope, PageHeader } from '@/features/project/project-scope';
import { useServices } from '@/providers/services-provider';
import { useDocuments } from '@/hooks/use-studio-data';
import { ErrorBoundary } from '@/components/error-boundary';
import { ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { UserIdentity } from '@/components/user-identity';
import { BrandedText } from '@/components/brand/logo';
import { publishCandidate, type PublishRequest, type Release } from '@/domain/releases';
import { renderReleaseV1 } from '@/domain/release-renderer';
import type { DocumentRecord, ProjectSummary } from '@/domain/types';
import { ServiceError } from '@/services/contracts';
const Viewer = lazy(() => import('@/features/publishing/release-body-v1'));

function ReleaseInspector({ release }: { release: Release }) {
  const rendered = renderReleaseV1(release.review);
  return (
    <article className="min-w-0 space-y-4 rounded-lg border bg-card p-4" aria-label={`Release ${release.sequence}`}>
      <h3 className="text-lg font-semibold">
        <BrandedText>{release.review.document_snapshot.title}</BrandedText> · Release {release.sequence}
      </h3>
      <p className="text-sm text-muted-foreground">
        Published {new Date(release.published_at).toLocaleString()} by <UserIdentity userId={release.published_by} />.
        Immutable, read-only content.
      </p>
      <p className="text-sm text-muted-foreground">
        Frozen default variable values · Conditions shown neutrally, with all tagged content included.
      </p>
      <ErrorBoundary>
        <Suspense fallback={<ListSkeleton rows={2} />}>
          {rendered.warnings.map((w) => (
            <p key={w} className="text-sm text-muted-foreground">
              {w}
            </p>
          ))}
          {rendered.topics.map((t) => (
            <section key={t.id} className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
              <h4 className="font-semibold">
                <BrandedText>{t.title}</BrandedText>
              </h4>
              <Viewer content={t.content!} frozenPackage={release.review.dependency_package!} />
            </section>
          ))}
        </Suspense>
      </ErrorBoundary>
    </article>
  );
}
function DocumentPublishing({ project, document }: { project: ProjectSummary; document: DocumentRecord }) {
  const services = useServices(),
    client = useQueryClient();
  const statusRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false);
  const [request, setRequest] = useState<PublishRequest | null>(null);
  const [message, setMessage] = useState(''),
    [uncertain, setUncertain] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const latest = useQuery({
    queryKey: ['document-review', project.id, document.id],
    queryFn: () => services.reviews!.latest(project.id, document.id),
    retry: false,
    staleTime: 0,
  });
  const releases = useQuery({
    queryKey: ['document-releases', project.id, document.id],
    queryFn: () => services.releases!.list(project.id, document.id),
    retry: false,
    staleTime: 0,
  });
  const preflight = useMemo(() => {
    if (document.status !== 'approved')
      return { blocked: 'Approve a new review before publishing.', warnings: [] as string[] };
    try {
      const resolved = renderReleaseV1(publishCandidate(latest.data ?? null));
      return { blocked: '', warnings: resolved.warnings };
    } catch (error) {
      return {
        blocked: error instanceof Error ? error.message : 'Approved content is unavailable.',
        warnings: [] as string[],
      };
    }
  }, [latest.data, document.status]);
  const blocked = preflight.blocked;
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['documents', project.id] }),
      latest.refetch(),
      releases.refetch(),
    ]);
  };
  const execute = async (r: PublishRequest, recover = false) => {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      const existing = recover ? await services.releases!.findRequest(r) : null;
      const id = existing?.id ?? (await services.releases!.publish(r));
      const result = await releases.refetch();
      const confirmed = result.data?.find((v) => v.id === id) ?? (await services.releases!.findRequest(r));
      if (!confirmed) throw new ServiceError('Publication could not be confirmed.', 'network');
      setSelected(confirmed.id);
      setMessage(`Published Release ${confirmed.sequence}.`);
      setUncertain(false);
      setRequest(null);
      setOpen(false);
      await refresh();
    } catch (error) {
      const known =
        error instanceof ServiceError && ['conflict', 'validation', 'forbidden', 'unauthorized'].includes(error.code);
      setUncertain(!known);
      setMessage(
        known
          ? error.message
          : 'Publication status is uncertain. Check status and safely retry this same publication request.',
      );
      if (known) {
        setRequest(null);
        await refresh();
      }
    } finally {
      setPending(false);
    }
  };
  const selectedRelease = releases.data?.find((r) => r.id === selected);
  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label={document.title}>
      <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">
        <BrandedText>{document.title}</BrandedText>
      </h2>
      {latest.isLoading || releases.isLoading ? (
        <ListSkeleton rows={1} />
      ) : latest.isError || releases.isError ? (
        <ErrorState error={latest.error ?? releases.error} onRetry={() => void refresh()} />
      ) : (
        <>
          {project.role !== 'admin' && (
            <p className="text-sm text-muted-foreground">Only an explicit Project Admin may publish.</p>
          )}
          {blocked && <p className="text-sm text-muted-foreground">{blocked}</p>}
          {preflight.warnings.length > 0 && (
            <ul aria-label="Publishing warnings" className="space-y-1 text-sm text-muted-foreground">
              {preflight.warnings.map((w) => (
                <li key={w}>
                  <BrandedText>{w}</BrandedText>
                </li>
              ))}
            </ul>
          )}
          <Dialog
            open={open}
            onOpenChange={(v) => {
              if (!pending) {
                if (v && latest.data)
                  setRequest({
                    projectId: project.id,
                    documentId: document.id,
                    reviewId: latest.data.id,
                    expectedUpdatedAt: document.updatedAt,
                    requestKey: crypto.randomUUID(),
                  });
                setOpen(v);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button disabled={project.role !== 'admin' || !!blocked || uncertain || pending}>Publish</Button>
            </DialogTrigger>
            <DialogContent
              onCloseAutoFocus={(event) => {
                if (selected) {
                  event.preventDefault();
                  statusRef.current?.focus();
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>Publish approved document</DialogTitle>
                <DialogDescription>
                  Create an immutable release of the latest approved content and its frozen dependencies. Default
                  variable values are used; conditions remain neutral. Release history is retained and can prevent
                  deletion of this document and its parents.
                </DialogDescription>
              </DialogHeader>
              {message && open && (
                <p role="status" className="text-sm">
                  {message}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending || uncertain || !!blocked || !request}
                  onClick={() => {
                    if (
                      !request ||
                      request.reviewId !== latest.data?.id ||
                      request.expectedUpdatedAt !== document.updatedAt
                    ) {
                      setMessage(
                        'The approved document changed. Close this confirmation and refresh before publishing.',
                      );
                      return;
                    }
                    void execute(request);
                  }}
                >
                  {pending ? 'Publishing…' : 'Confirm publish'}
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <div
            ref={statusRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            aria-busy={pending}
            className="space-y-2 rounded text-sm focus-visible:ring-2 focus-visible:ring-ring"
          >
            {message && !open && <p>{message}</p>}
            {uncertain && request && (
              <Button variant="outline" disabled={pending} onClick={() => void execute(request, true)}>
                {pending ? 'Checking…' : 'Check publication status and retry safely'}
              </Button>
            )}
          </div>
          <h3 className="font-semibold">Releases</h3>
          {!releases.data?.length ? (
            <p className="text-sm text-muted-foreground">No releases yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Release history">
              {releases.data.map((r) => (
                <li key={r.id}>
                  <Button variant="outline" aria-pressed={r.id === selected} onClick={() => setSelected(r.id)}>
                    Release {r.sequence}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {selectedRelease && <ReleaseInspector key={selectedRelease.id} release={selectedRelease} />}
        </>
      )}
    </section>
  );
}
function Publishing({ project }: { project: ProjectSummary }) {
  const services = useServices(),
    docs = useDocuments(project.id);
  if (!services.releases || !services.reviews)
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Publishing requires an authenticated backend with release support. Demo content cannot be published.
      </p>
    );
  if (docs.isLoading) return <ListSkeleton />;
  if (docs.isError) return <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />;
  return (
    <div className="mt-6 space-y-6">
      {!docs.data?.length && (
        <p className="text-sm text-muted-foreground">
          No documents yet. Create a document and complete review to publish.
        </p>
      )}
      {docs.data?.map((document) => (
        <DocumentPublishing key={document.id} project={project} document={document} />
      ))}
    </div>
  );
}
export default function PublishPage() {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  return (
    <ProjectScope workspaceId={workspaceId} projectId={projectId} title="Publish" trail={[{ label: 'Publish' }]}>
      {({ project }) => (
        <div className="mx-auto w-full max-w-4xl px-5 py-8 md:px-10 md:py-10">
          <PageHeader title="Publish" description="Create and inspect immutable releases of approved documents." />
          <Publishing key={project.id} project={project} />
        </div>
      )}
    </ProjectScope>
  );
}
