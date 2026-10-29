import { documentVersionLabel } from '@/lib/presentation';
import { UserIdentity } from '@/components/user-identity';
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileSearch, FileText, RefreshCw, RotateCw } from 'lucide-react';
import { ProjectScope, PageHeader } from '@/features/project/project-scope';
import { EmptyState, ErrorState, ListSkeleton, ScopeMarker } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useServices } from '@/providers/services-provider';
import { useStudioSession } from '@/providers/session-provider';
import { useDocuments } from '@/hooks/use-studio-data';
import type { DocumentRecord, Topic } from '@/domain/types';
import type { TopicContent } from '@/domain/topic-content';
import { cn } from '@/lib/utils';

const fmt = (iso?: string) => {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};
const label = (s: string) => s.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Demo-only sample content built from the topic's owned paragraphs. Never persisted. */
function sampleContent(topic: Topic): TopicContent {
  return {
    type: 'doc', version: 1,
    content: topic.body.map((text) => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } as TopicContent : { type: 'paragraph' } as TopicContent)),
  };
}

class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-5" data-testid="review-viewer-error">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
        <p className="text-sm">The read-only viewer could not load. Reload the page to try again.</p>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()} data-testid="button-reload-page">
          <RotateCw className="mr-1.5 h-3.5 w-3.5" />Reload page
        </Button>
      </div>
    );
  }
}

function ViewerLoading() {
  return (
    <div role="status" className="space-y-2.5 rounded-lg border bg-card p-5" aria-busy="true" aria-label="Loading viewer" data-testid="review-viewer-loading">
      <Skeleton className="h-3.5 w-4/5" /><Skeleton className="h-3.5 w-3/5" /><Skeleton className="h-3.5 w-2/3" />
    </div>
  );
}

/** Injectable download boundary; rejected module imports require a real page reload. */
export function createReviewViewer(load: () => Promise<{ default: ComponentType<{ content: TopicContent }> }>) {
  const Viewer = lazy(load);
  return function LazyReviewViewer({ content }: { content: TopicContent }) {
    return <ViewerBoundary><Suspense fallback={<ViewerLoading />}><Viewer content={content} /></Suspense></ViewerBoundary>;
  };
}
const ReviewDraftViewer = createReviewViewer(() => import('@/features/review/review-draft-viewer'));

function Meta({ k, v, testId }: { k: string; v: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 text-[13px] [overflow-wrap:anywhere]" data-testid={testId}>{v}</dd>
    </div>
  );
}

function DraftPanel({ projectId, doc, topic, refreshKey }: { projectId: string; doc: DocumentRecord; topic: Topic; refreshKey: number }) {
  const services = useServices();
  const session = useStudioSession();
  const backend = services.mode === 'backend';
  const userId = session.data?.mode === 'backend' ? session.data.userId : '';
  const draft = useQuery({
    queryKey: ['review-draft', userId, projectId, doc.id, topic.id, refreshKey],
    queryFn: () => services.topicDrafts.get({ userId, projectId, documentId: doc.id, topicId: topic.id }),
    enabled: backend && !!userId,
    staleTime: 0,
    retry: false,
  });

  if (!backend) {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-primary/25 bg-accent px-3 py-2 text-[12.5px] text-accent-foreground" data-testid="review-demo-note">
          Demo sample: paragraphs from this topic's demo body, shown read-only. Not a saved draft, no revision exists, and nothing is stored.
        </p>
        <ReviewDraftViewer key={`demo-${topic.id}`} content={sampleContent(topic)} />
      </div>
    );
  }
  if (!userId) return <p role="alert" className="text-sm text-destructive">No signed-in session is available to read this draft.</p>;
  if (draft.isLoading) return <ViewerLoading />;
  if (draft.isError) return <ErrorState error={draft.error} onRetry={() => void draft.refetch()} title="Current draft did not load" />;
  const d = draft.data;
  if (!d) {
    return (
      <div className="rounded-lg border border-dashed px-5 py-8 text-center" data-testid="review-draft-missing">
        <p className="font-medium">No current draft for this topic</p>
        <p className="mt-1 text-sm text-muted-foreground">Nothing has been saved to this topic's draft yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Meta k="Draft revision" v={d.revision} testId="review-draft-revision" />
        <Meta k="Saved" v={fmt(d.updatedAt)} testId="text-draft-updated" />
        <Meta k="Saved by" v={<UserIdentity userId={d.updatedBy} />} testId="text-draft-updated-by" />
      </dl>
      <ReviewDraftViewer key={`${d.topicId}-${d.revision}-${d.updatedAt}`} content={d.content} />
    </div>
  );
}

function ReviewBody({ projectId, onDoc }: { projectId: string; onDoc: (d: DocumentRecord | null) => void }) {
  const docs = useDocuments(projectId);
  const [docId, setDocId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const eligible = useMemo(() => (docs.data ?? []).filter((d) => d.status === 'in-review'), [docs.data]);
  const doc = docs.isError ? null : eligible.find((d) => d.id === docId) ?? eligible[0] ?? null;
  const topic = doc ? doc.topics.find((t) => t.id === topicId) ?? doc.topics[0] ?? null : null;
  useEffect(() => { onDoc(doc); }, [doc, onDoc]);

  const refresh = async () => {
    const result = await docs.refetch();
    if (!result.isError) setRefreshKey((k) => k + 1);
  };

  const toolbar = (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground" data-testid="review-scope-note">
        Current-draft inspection only. This is not a submitted snapshot or a completed review; there are no assignments, comments, approvals or status changes here.
      </p>
      <Button size="sm" variant="outline" onClick={refresh} disabled={docs.isFetching} data-testid="button-refresh">
        <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', docs.isFetching && 'animate-spin')} />Refresh
      </Button>
    </div>
  );

  if (docs.isLoading) return <>{toolbar}<div className="mt-6"><ListSkeleton rows={3} /></div></>;
  if (docs.isError) return <>{toolbar}<div className="mt-6"><ErrorState error={docs.error} onRetry={() => void docs.refetch()} title="Documents did not load" /></div></>;
  if (!doc) return <>{toolbar}<div className="mt-6"><EmptyState icon={FileSearch} title="No documents in review" body="Documents appear here once their status is In review." /></div></>;

  return (
    <>
      {toolbar}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <aside aria-label="Review selection" className="min-w-0 space-y-6">
          <nav aria-label="Documents in review">
            <h2 className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">In review · {eligible.length}</h2>
            <ul className="space-y-1">
              {eligible.map((d) => (
                <li key={d.id}>
                  <button type="button" aria-current={d.id === doc.id} onClick={() => { setDocId(d.id); setTopicId(null); }} data-testid={`review-document-${d.id}`}
                    className={cn('w-full rounded-md border px-3 py-2 text-left text-[13px] transition-colors [overflow-wrap:anywhere]', d.id === doc.id ? 'border-primary/40 bg-accent text-accent-foreground' : 'border-transparent hover:bg-muted')}>
                    <span className="flex items-start gap-2"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{d.title}</span>
                    <span className="mt-0.5 block pl-5 text-[11.5px] text-muted-foreground">{d.topics.length} topics</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={`Topics in ${doc.title}`}>
            <h2 className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">Outline</h2>
            {doc.topics.length === 0 ? (
              <p className="text-[13px] text-muted-foreground" data-testid="review-topics-empty">This document has no topics.</p>
            ) : (
              <ol className="space-y-0.5">
                {doc.topics.map((t) => {
                  const lvl = Math.min(Math.max(Number.isFinite(t.level) ? t.level : 1, 1), 4);
                  return (
                    <li key={t.id} style={{ paddingLeft: `${(lvl - 1) * 12}px` }}>
                      <button type="button" aria-current={t.id === topic?.id} onClick={() => setTopicId(t.id)} data-testid={`review-topic-${t.id}`}
                        className={cn('w-full rounded px-2 py-1.5 text-left text-[13px] [overflow-wrap:anywhere]', t.id === topic?.id ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-muted')}>
                        {t.title}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </nav>
        </aside>

        <section className="min-w-0 space-y-5" aria-label="Current draft">
          <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
            <Meta k="Document" v={doc.title} testId="text-review-doc-title" />
            <Meta k="Status" v={label(doc.status)} testId="text-review-doc-status" />
            <Meta k="Version" v={documentVersionLabel(doc.version)} />
            <Meta k="Updated" v={fmt(doc.updatedAt)} />
          </dl>
          {topic ? (
            <article className="min-w-0 space-y-4">
              <header>
                <h2 className="text-[20px] font-semibold [overflow-wrap:anywhere]" data-testid="text-review-topic-title">{topic.title}</h2>
                <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Meta k="Kind" v={label(topic.kind)} />
                  <Meta k="Level" v={topic.level} />
                  <Meta k="Topic status" v={topic.status ? label(topic.status) : 'Not set'} />
                  <Meta k="Topic updated" v={fmt(topic.updatedAt)} />
                </dl>
              </header>
              <DraftPanel key={`${doc.id}:${topic.id}`} projectId={projectId} doc={doc} topic={topic} refreshKey={refreshKey} />
            </article>
          ) : (
            <EmptyState icon={FileSearch} title="No topics to inspect" body="This document has no topics yet." />
          )}
        </section>
      </div>
    </>
  );
}

export default function ReviewPage() {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  const backend = useServices().mode === 'backend';
  const [selection, setSelection] = useState<{ projectId: string; id: string; title: string } | null>(null);
  const doc = selection?.projectId === projectId ? selection : null;
  const onDoc = useCallback((d: DocumentRecord | null) => {
    setSelection((old) => old?.projectId === projectId && old?.id === d?.id && old?.title === d?.title
      ? old : d ? { projectId, id: d.id, title: d.title } : null);
  }, [projectId]);
  const trail = doc ? [{ label: 'Review' }, { label: doc.title }] : [{ label: 'Review' }];
  return (
    <ProjectScope workspaceId={workspaceId} projectId={projectId} title="Review" trail={trail}>
      {({ project }) => (
        <div className="mx-auto w-full max-w-[1200px] px-5 py-8 md:px-10 md:py-10" data-testid="review-page">
          <PageHeader
            eyebrow={backend ? <ScopeMarker kind="read-only">Read-only · current drafts</ScopeMarker>
              : <ScopeMarker kind="demo">Read-only · sample content</ScopeMarker>}
            title="Review"
            description="Inspect the current draft of documents marked In review. Nothing on this page can change content."
          />
          <ReviewBody key={project.id} projectId={project.id} onDoc={onDoc} />
        </div>
      )}
    </ProjectScope>
  );
}
