import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ChevronDown, Files, PenLine, Search } from 'lucide-react';
import { ProjectScope, PageHeader } from '@/features/project/project-scope';
import { EmptyState, ErrorState, ListSkeleton, ScopeMarker } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDocuments } from '@/hooks/use-studio-data';
import { DOC_STATUS_LABEL, DOC_TYPE_LABEL, relative } from '@/lib/format';
import type { ProjectSummary } from '@/domain/types';
import { cn } from '@/lib/utils';
import { useServices } from '@/providers/services-provider';
import { ContentDialog, DocumentMetadataDialog } from '@/features/content/content-dialogs';

function DocumentsBody({ project, base }: { project: ProjectSummary; base: string }) {
  const backend = useServices().mode === 'backend';
  const canEdit = backend && project.canEditContent === true;
  const docs = useDocuments(project.id);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs.data ?? []).filter(
      (d) =>
        (status === 'all' || d.status === status) &&
        (!q || d.title.toLowerCase().includes(q) || d.topics.some((t) => t.title.toLowerCase().includes(q))),
    );
  }, [docs.data, query, status]);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-10">
      <PageHeader
        eyebrow={<ScopeMarker kind={backend ? 'connected' : 'demo'}>{backend ? canEdit ? 'Live documents · metadata persistence' : 'Live documents · read-only access' : 'Isolated demo · local preview'}</ScopeMarker>}
        title="Documents"
        description="Documents assemble topics into a deliverable. Expand a document to see its topic outline."
        actions={
          <>
          {canEdit && <ContentDialog action="document" projectId={project.id} />}
          <Button asChild data-testid="link-documents-author">
            <Link href={`${base}/author`}><PenLine className="mr-1.5 h-4 w-4" /> Open Author</Link>
          </Button>
          </>
        }
      />
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents and topics" aria-label="Search documents" className="pl-9" data-testid="input-search-documents" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status" data-testid="select-document-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in-review">In review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5">
        {docs.isLoading ? (
          <ListSkeleton />
        ) : docs.isError ? (
          <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
        ) : (docs.data ?? []).length === 0 ? (
          <EmptyState icon={Files} title="This project has no documents" body={canEdit ? 'Create a document to begin its topic outline.' : backend ? 'A project admin or author can create documents.' : 'Import a demo project file to populate this list.'} />
        ) : list.length === 0 ? (
          <EmptyState icon={Search} title="No documents match" body="Adjust the search or status filter.">
            <Button variant="outline" onClick={() => { setQuery(''); setStatus('all'); }}>Reset filters</Button>
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {list.map((d) => {
              const open = expanded === d.id;
              return (
                <li key={d.id} className="rounded-lg border bg-card" data-testid={`row-document-${d.id}`}>
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : d.id)}
                      aria-expanded={open}
                      aria-controls={`outline-${d.id}`}
                      aria-label={`${open ? 'Collapse' : 'Expand'} outline for ${d.title}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-muted"
                      data-testid={`button-expand-${d.id}`}
                    >
                      <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.title}</p>
                      <p className="truncate text-[12.5px] text-muted-foreground">
                        {DOC_TYPE_LABEL[d.type]} · {d.topics.length} topics · {d.version === '—' ? 'Unversioned' : `v${d.version}`} · {d.owner} · {relative(d.updatedAt)}
                      </p>
                    </div>
                    <StatusPill status={d.status} label={DOC_STATUS_LABEL[d.status]} className="hidden sm:inline-flex" />
                    {backend && <div className="hidden lg:flex gap-2"><DocumentMetadataDialog doc={d} />{d.canEdit && <ContentDialog action="duplicate-document" projectId={project.id} doc={d} />}</div>}
                    <Button variant="ghost" size="sm" asChild data-testid={`link-author-${d.id}`}>
                      <Link href={`${base}/author/${d.id}`}>Author</Link>
                    </Button>
                  </div>
                  {open && (
                    <ol id={`outline-${d.id}`} className="border-t bg-muted/30 px-4 py-3 font-mono text-[12.5px]">
                      {d.topics.length === 0 && <li className="text-muted-foreground">No topics</li>}
                      {d.topics.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 py-1" style={{ paddingLeft: (t.level - 1) * 20 }}>
                          <span className="w-16 text-[10.5px] uppercase text-muted-foreground">{t.kind}</span>
                          <Link href={`${base}/author/${d.id}?topic=${t.id}`} className="truncate hover:text-primary">{t.title}</Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  return (
    <ProjectScope workspaceId={workspaceId} projectId={projectId} title="Documents" trail={[{ label: 'Documents' }]}>
      {({ project, base }) => <DocumentsBody project={project} base={base} />}
    </ProjectScope>
  );
}
