import { UserIdentity } from '@/components/user-identity';
import { documentVersionLabel } from '@/lib/presentation';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useParams, useSearch } from 'wouter';
import { ArrowLeftToLine, ArrowRightToLine, FileText, Files, RotateCcw } from 'lucide-react';
import { ProjectScope } from '@/features/project/project-scope';
import { EmptyState, ErrorState, ListSkeleton, NotFoundPanel, ScopeMarker } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StructuredEditor } from '@/features/editor/structured-editor';
import { contentText, emptyContent, withText, type TopicContent } from '@/domain/topic-content';
import { contentStatistics, type ContentStatistics } from '@/domain/content-statistics';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDocument, useDocuments } from '@/hooks/use-studio-data';
import { DOC_STATUS_LABEL, DOC_TYPE_LABEL, relative } from '@/lib/format';
import type { DocumentRecord, ProjectSummary, Topic } from '@/domain/types';
import { cn } from '@/lib/utils';
import { useServices } from '@/providers/services-provider';
import { ContentDialog, DocumentMetadataDialog } from '@/features/content/content-dialogs';
import { DeleteContentDialog } from '@/features/content/delete-content-dialog';
import { MetadataEditor, type TopicMetadataControls } from '@/features/content/metadata-editor';
import { useContentMutation } from '@/hooks/use-content-mutation';
import { TopicBodyEditor } from '@/features/content/topic-body-editor';

const KIND_STYLE: Record<Topic['kind'], string> = {
  concept: 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-400/10 dark:border-sky-400/25',
  task: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-400/10 dark:border-emerald-400/25',
  reference: 'text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-400/10 dark:border-amber-400/25',
};

function numbering(topics: Topic[]): string[] {
  const counters: number[] = [];
  return topics.map((t) => {
    counters[t.level - 1] = (counters[t.level - 1] ?? 0) + 1;
    counters.length = t.level;
    return counters.slice(0, t.level).map((n) => Math.max(n, 1)).join('.');
  });
}

function AuthorWorkspace({ doc, base }: { doc: DocumentRecord; base: string }) {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const services = useServices();
  const [, navigate] = useLocation();
  const backend = services.mode === 'backend';
  const canEdit = !backend || doc.canEdit === true;
  const mutation = useContentMutation(doc.projectId);
  const search = useSearch();
  const initialTopic = new URLSearchParams(search).get('topic');
  const [topics, setTopics] = useState<Topic[]>(doc.topics);
  const [selectedId, setSelectedId] = useState<string | null>(
    doc.topics.find((t) => t.id === initialTopic)?.id ?? doc.topics[0]?.id ?? null,
  );
  const initFor = useRef(doc.id);
  const outlineRef = useRef<HTMLOListElement>(null);
  const bodies = useRef(new Map<string, string[]>());
  const demoDocuments = useRef(new Map<string, TopicContent>());
  const metadataControls = useRef<TopicMetadataControls | null>(null);
  const [bodyStatistics, setBodyStatistics] = useState<{ topicId: string; value: ContentStatistics | null; loading: boolean } | null>(null);

  useEffect(() => {
    if (initFor.current !== doc.id) {
      initFor.current = doc.id;
      setTopics(doc.topics);
      setSelectedId(doc.topics[0]?.id ?? null);
    } else {
      // Refresh persisted metadata/tree without clobbering unsaved F3 body drafts.
      setTopics(doc.topics.map((topic) => ({ ...topic, body: bodies.current.get(topic.id) ?? topic.body })));
      setSelectedId((id) => doc.topics.some((t) => t.id === id) ? id : doc.topics[0]?.id ?? null);
    }
  }, [doc]);
  useEffect(() => {
    if (initialTopic && doc.topics.some((t) => t.id === initialTopic)) setSelectedId(initialTopic);
  }, [initialTopic, doc.id]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!backend && bodies.current.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  const nums = useMemo(() => numbering(topics), [topics]);
  const index = topics.findIndex((t) => t.id === selectedId);
  const selected = index >= 0 ? topics[index] : null;
  const dirty = !backend && (demoDocuments.current.size > 0 || JSON.stringify(topics) !== JSON.stringify(doc.topics));

  const siblings = selected ? topics.filter((t) => (t.parentTopicId ?? null) === (selected.parentTopicId ?? null)) : [];
  const siblingIndex = siblings.findIndex((t) => t.id === selected?.id);
  const canPromote = canEdit && !mutation.isPending && !!selected && selected.level > 1;
  const canDemote = canEdit && !mutation.isPending && !!selected && (backend ? siblingIndex > 0 : index > 0 && selected.level < 4 && selected.level <= topics[index - 1].level);

  const patch = (id: string, change: Partial<Topic>) =>
    setTopics((ts) => ts.map((t) => (t.id === id ? { ...t, ...change } : t)));
  const promote = () => {
    if (selected && canPromote) backend ? mutation.mutate(() => services.documents.promoteTopic(doc.projectId, doc.id, selected.id)) : patch(selected.id, { level: selected.level - 1 });
  };
  const demote = () => {
    if (selected && canDemote) backend ? mutation.mutate(() => services.documents.demoteTopic(doc.projectId, doc.id, selected.id)) : patch(selected.id, { level: selected.level + 1 });
  };

  const onOutlineKey = (e: KeyboardEvent) => {
    if (!topics.length) return;
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); promote(); return; }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); demote(); return; }
    let next = index;
    if (e.key === 'ArrowDown') next = Math.min(topics.length - 1, index + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = topics.length - 1;
    else return;
    e.preventDefault();
    setSelectedId(topics[next].id);
    outlineRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
  };

  const toolButton = (label: string, hint: string, onClick: () => void, enabled: boolean, Icon: typeof ArrowLeftToLine, id: string) => (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 flex-1 px-2 text-[12.5px]" onClick={onClick} disabled={!enabled} data-testid={`button-${id}`}>
          <Icon className="mr-1 h-3.5 w-3.5" /> {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );

  return (
    <>
      {/* Outline */}
      <section aria-label="Topic outline" className="flex min-h-0 flex-col border-b bg-card lg:border-b-0 lg:border-r">
        <div className="border-b px-4 py-3">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Topics · {topics.length}</p>
          <div className="mt-2.5 flex gap-1.5 rounded-md border border-border bg-background p-1">
            {toolButton('Promote', 'Promote topic (Alt + Left)', promote, canPromote, ArrowLeftToLine, 'promote')}
            {toolButton('Demote', 'Demote topic (Alt + Right)', demote, canDemote, ArrowRightToLine, 'demote')}
          </div>
          {backend && canEdit && <div className="mt-2 flex flex-wrap gap-1.5">
            <ContentDialog action="topic" projectId={doc.projectId} doc={doc} topic={selected ?? undefined} onTopic={setSelectedId} />
            {selected && <>
              <ContentDialog action="move" projectId={doc.projectId} doc={doc} topic={selected} />
              <ContentDialog action="duplicate-topic" projectId={doc.projectId} doc={doc} topic={selected} onTopic={setSelectedId} />
              <DeleteContentDialog doc={doc} topic={selected} onTopicDeleted={(id) => {
                bodies.current.delete(id);
                setSelectedId(topics.find((topic) => topic.id !== id)?.id ?? null);
                navigate(`${base}/author/${doc.id}`, { replace: true });
              }} />
              <Button size="sm" variant="outline" disabled={mutation.isPending || siblingIndex <= 0} onClick={() => mutation.mutate(() => services.documents.moveTopic(doc.projectId, doc.id, selected.id, selected.parentTopicId ?? null, siblings[siblingIndex - 1].sortOrder!))}>Move up</Button>
              <Button size="sm" variant="outline" disabled={mutation.isPending || siblingIndex < 0 || siblingIndex >= siblings.length - 1} onClick={() => mutation.mutate(() => services.documents.moveTopic(doc.projectId, doc.id, selected.id, selected.parentTopicId ?? null, siblings[siblingIndex + 1].sortOrder!))}>Move down</Button>
            </>}
          </div>}
          {mutation.isPending && <p role="status" className="mt-2 text-xs">Saving topic hierarchy…</p>}
          {mutation.isSuccess && !mutation.isPending && <p role="status" className="mt-2 text-xs text-muted-foreground">Topic hierarchy saved</p>}
          {mutation.error && <p role="alert" className="mt-2 text-xs text-destructive">{mutation.error.message}</p>}
        </div>
        {topics.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">This document has no topics.</p>
        ) : (
          <ol
            ref={outlineRef}
            role="listbox"
            aria-label="Topics"
            aria-activedescendant={selectedId ? `topic-${selectedId}` : undefined}
            onKeyDown={onOutlineKey}
            className="max-h-72 flex-1 overflow-y-auto py-2 lg:max-h-none"
          >
            {topics.map((t, i) => (
              <li
                key={t.id}
                id={`topic-${t.id}`}
                role="option"
                aria-selected={t.id === selectedId}
                tabIndex={t.id === selectedId ? 0 : -1}
                data-index={i}
                data-testid={`outline-topic-${t.id}`}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  'relative mx-2 flex cursor-pointer items-baseline gap-2 rounded px-2 py-1.5 text-[13px] outline-none transition-colors',
                  t.id === selectedId ? 'bg-primary text-primary-foreground [&_.topic-num]:text-primary-foreground/75' : 'text-foreground/85 hover:bg-[hsl(var(--surface-raised))]',
                  'focus-visible:ring-2 focus-visible:ring-ring',
                )}
                style={{ paddingLeft: 8 + (t.level - 1) * 14 }}
              >
                <span className="topic-num shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">{nums[i]}</span>
                <span className={cn('truncate', t.level === 1 && 'font-medium')}>{t.title || 'Untitled topic'}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">Arrow keys move · Alt+Arrow to Promote / Demote</p>
      </section>

      {/* Editor canvas */}
      <section aria-label="Topic editor" className="min-h-0 overflow-y-auto bg-[hsl(var(--surface-raised))]">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-card px-6 py-2.5">
          <ScopeMarker kind={backend ? 'status' : 'demo'}>{backend ? 'Draft body · autosave' : 'Session-only edits · not saved'}</ScopeMarker>
          {dirty && (
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => {
              bodies.current.clear();
              demoDocuments.current.clear();
              setTopics(backend ? topics.map((topic) => ({ ...topic, body: doc.topics.find((t) => t.id === topic.id)?.body ?? [] })) : doc.topics);
            }} data-testid="button-discard-edits">
              <RotateCcw className="mr-1 h-3 w-3" /> {backend ? 'Discard body edits' : 'Discard changes'}
            </Button>
          )}
        </div>
        {selected ? (
          <div className="px-4 py-6 md:px-8 md:py-8"><article className="mx-auto max-w-[720px] rounded-xl border border-border bg-card px-6 py-8 shadow-[0_18px_48px_-30px_rgba(0,0,0,0.7)] md:px-10 md:py-10 fade-up" key={selected.id}>
            <div className="flex items-center gap-2">
              <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider', KIND_STYLE[selected.kind])}>{selected.kind}</span>
              <span className="font-mono text-xs text-muted-foreground">{nums[index]} · Level {selected.level}</span>
            </div>
            <label htmlFor="topic-title" className="sr-only">Topic title</label>
            <Input
              id="topic-title"
              value={selected.title}
              readOnly={!canEdit}
              onChange={(e) => { patch(selected.id, { title: e.target.value }); if (backend) metadataControls.current?.changeTitle(e.target.value); }}
              className="mt-3 h-auto border-none bg-transparent px-0 py-1 text-[28px] md:text-[28px] font-semibold leading-tight tracking-tight shadow-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0"
              data-testid="input-topic-title"
            />
            {backend ? <TopicBodyEditor key={selected.id} doc={doc} topic={selected}
              onStatistics={(topicId, value, loading) => setBodyStatistics({ topicId, value, loading })}
              onBody={(id, body) => {
              bodies.current.set(id, body);
              patch(id, { body });
            }} /> : <StructuredEditor referenceContext={{workspaceId,projectId:doc.projectId}}
              content={demoDocuments.current.get(selected.id) ?? withText(emptyContent(), selected.body.join('\n\n'))}
              editable={canEdit}
              onChange={(content) => {
                demoDocuments.current.set(selected.id, content);
                const text = contentText(content);
                const body = text ? text.split(/\n{2,}/) : [];
                bodies.current.set(selected.id, body);
                patch(selected.id, { body });
              }}
            />}
          </article></div>
        ) : (
          <div className="p-10"><EmptyState icon={FileText} title="No topic selected" body="Choose a topic from the outline." /></div>
        )}
      </section>

      {/* Inspector */}
      <aside aria-label="Document properties" className="min-h-0 overflow-y-auto border-t bg-card px-5 py-5 lg:col-start-2 xl:col-start-auto xl:border-l xl:border-t-0">
        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Document</h2>
        <p className="mt-2 font-medium leading-snug">{doc.title}</p>
        {backend && <div className="mt-3 space-y-2"><DocumentMetadataDialog doc={doc} />{canEdit && <><ContentDialog action="duplicate-document" projectId={doc.projectId} doc={doc} /><DeleteContentDialog doc={doc} /></>}</div>}
        <dl className="mt-4 grid grid-cols-[88px_1fr] gap-y-2.5 text-[13px]">
          <dt className="text-muted-foreground">Status</dt><dd><StatusPill status={doc.status} label={DOC_STATUS_LABEL[doc.status]} /></dd>
          <dt className="text-muted-foreground">Type</dt><dd>{DOC_TYPE_LABEL[doc.type]}</dd>
          <dt className="text-muted-foreground">Version</dt><dd className="font-mono text-xs">{documentVersionLabel(doc.version)}</dd>
          <dt className="text-muted-foreground">Owner</dt><dd><UserIdentity userId={doc.ownerId} name={doc.owner} /></dd>
          <dt className="text-muted-foreground">Updated</dt><dd>{relative(doc.updatedAt)}</dd>
        </dl>
        {selected && (
          <>
            <h2 className="mt-7 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Topic</h2>
            <div className="mt-3 space-y-1.5">
              <label htmlFor="topic-kind" className="text-[13px] text-muted-foreground">Topic type</label>
              <Select disabled={!canEdit} value={selected.kind} onValueChange={(v) => {
                patch(selected.id, { kind: v as Topic['kind'] });
                if (backend) metadataControls.current?.changeKind(v);
              }}>
                <SelectTrigger id="topic-kind" className="h-9" data-testid="select-topic-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concept">Concept</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="reference">Reference</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {backend && <div className="mt-4"><MetadataEditor key={selected.id} controls={metadataControls} projectId={doc.projectId} doc={doc} topic={selected} /></div>}
            <p className="mt-3 text-[12.5px] text-muted-foreground" data-testid="topic-statistics"
              title="Current structured body, including unsaved edits. Words use whitespace boundaries; paragraphs count non-empty paragraph nodes.">
              {(() => {
                if (backend && (bodyStatistics?.topicId !== selected.id || bodyStatistics.loading)) return 'Loading body statistics…';
                const counts = backend ? bodyStatistics?.value : contentStatistics(demoDocuments.current.get(selected.id)
                  ?? withText(emptyContent(), selected.body.join('\n\n')));
                return counts ? `${counts.words} words · ${counts.paragraphs} paragraphs` : 'Body statistics unavailable';
              })()}
            </p>
          </>
        )}
        <h2 className="mt-7 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Workflow</h2>
        <div className="mt-3 flex flex-col gap-2">
          <Button variant="outline" size="sm" asChild data-testid="link-inspector-review">
            <Link href={`${base}/review`}>Go to Review</Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="link-inspector-history">
            <Link href={`${base}/history`}>View History</Link>
          </Button>
          <p className="text-[12px] text-muted-foreground" data-testid="author-workflow-scope">
            {backend ? 'Draft bodies autosave. Submission for review is not available yet.' : 'Demo edits are session-only. Submission for review is not available yet.'}
          </p>
        </div>
      </aside>
    </>
  );
}

function AuthorBody({ project, base, documentId }: { project: ProjectSummary; base: string; documentId?: string }) {
  const docs = useDocuments(project.id);
  const doc = useDocument(project.id, documentId ?? '');
  const [, navigate] = useLocation();
  const hasDoc = !!documentId;

  if (hasDoc && !doc.isLoading && !doc.isError && !doc.data) {
    return <NotFoundPanel what="Document" detail={`No document with this address exists in ${project.name}.`} backHref={`${base}/documents`} backLabel="Back to Documents" />;
  }

  return (
    <div className="flex flex-col xl:h-[calc(100dvh-56px)]">
      <h1 className="sr-only">Author workspace</h1>
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2.5 md:px-6">
        <label htmlFor="author-doc" className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Author</label>
        {docs.isLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : (
          <Select value={documentId ?? ''} onValueChange={(v) => navigate(`${base}/author/${v}`)}>
            <SelectTrigger id="author-doc" className="h-8 w-full max-w-sm text-[13px]" data-testid="select-author-document">
              <SelectValue placeholder="Select a document" />
            </SelectTrigger>
            <SelectContent>
              {(docs.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!hasDoc ? (
        <div className="mx-auto w-full max-w-3xl px-5 py-10">
          {docs.isLoading ? (
            <ListSkeleton rows={3} />
          ) : docs.isError ? (
            <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
          ) : (docs.data ?? []).length === 0 ? (
            <EmptyState icon={Files} title="Nothing to author yet" body="This project has no documents. Open Documents to create a document or view the demo import options." />
          ) : (
            <>
              <h1 className="text-xl font-semibold">Choose a document to author</h1>
              <ul className="mt-4 divide-y rounded-lg border bg-card">
                {(docs.data ?? []).map((d) => (
                  <li key={d.id}>
                    <Link href={`${base}/author/${d.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent/40" data-testid={`link-author-pick-${d.id}`}>
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="flex-1 truncate">{d.title}</span>
                      <StatusPill status={d.status} label={DOC_STATUS_LABEL[d.status]} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_272px]">
          {doc.isLoading ? (
            <div className="space-y-3 p-6 lg:col-span-2 xl:col-span-3"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-64 w-full" /></div>
          ) : doc.isError ? (
            <div className="p-6 lg:col-span-2 xl:col-span-3"><ErrorState error={doc.error} onRetry={() => doc.refetch()} /></div>
          ) : doc.data ? (
            <AuthorWorkspace key={doc.data.id} doc={doc.data} base={base} />
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function AuthorPage() {
  const { workspaceId = '', projectId = '', documentId } = useParams<{ workspaceId: string; projectId: string; documentId?: string }>();
  const docQuery = useDocument(projectId, documentId ?? '');
  const docTitle = documentId ? docQuery.data?.title : undefined;
  const base = `/workspaces/${workspaceId}/projects/${projectId}`;
  const trail = documentId
    ? [{ label: 'Author', href: `${base}/author` }, { label: docTitle ?? (docQuery.isLoading ? 'Loading' : 'Document') }]
    : [{ label: 'Author' }];
  return (
    <ProjectScope workspaceId={workspaceId} projectId={projectId} title={docTitle ? `Author · ${docTitle}` : 'Author'} trail={trail}>
      {({ project, base: b }) => <AuthorBody project={project} base={b} documentId={documentId} />}
    </ProjectScope>
  );
}
