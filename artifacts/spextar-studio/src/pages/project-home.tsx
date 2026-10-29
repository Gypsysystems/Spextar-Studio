import { UserIdentity } from '@/components/user-identity';
import { documentVersionLabel } from '@/lib/presentation';
import { Link, useParams } from 'wouter';
import { ArrowRight, Files, PenLine } from 'lucide-react';
import { ProjectScope, PageHeader } from '@/features/project/project-scope';
import { PROJECT_SECTIONS } from '@/features/project/sections';
import { EmptyState, ErrorState, ListSkeleton, ScopeMarker } from '@/components/states';
import { KeyChip, StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivity, useDocuments } from '@/hooks/use-studio-data';
import { DOC_STATUS_LABEL, DOC_TYPE_LABEL, PROJECT_STATUS_LABEL, relative, shortDate } from '@/lib/format';
import type { ProjectSummary } from '@/domain/types';

function HomeBody({ project, base }: { project: ProjectSummary; base: string }) {
  const docs = useDocuments(project.id);
  const activity = useActivity(project.id);
  const list = docs.data ?? [];
  const stages = [
    { id: 'author', label: 'Author', hint: 'Drafts', count: list.filter((d) => d.status === 'draft').length, href: `${base}/author` },
    { id: 'review', label: 'Review', hint: 'In review', count: list.filter((d) => d.status === 'in-review').length, href: `${base}/review` },
    { id: 'publish', label: 'Publish', hint: 'Approved', count: list.filter((d) => d.status === 'approved').length, href: `${base}/publish` },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-10">
      <PageHeader
        eyebrow={
          <>
            <KeyChip value={project.key} />
            <StatusPill status={project.status} label={PROJECT_STATUS_LABEL[project.status]} />
            {project.source !== 'fixture' && project.source !== 'backend' && <ScopeMarker kind="demo">{project.source === 'imported' ? 'Imported locally' : 'Created locally'}</ScopeMarker>}
          </>
        }
        title={project.name}
        description={project.description || 'No description yet.'}
        meta={
          <>
            {project.product && <span>Product: <span className="text-foreground">{project.product}</span></span>}
            <span>Owner: <span className="text-foreground"><UserIdentity userId={project.ownerId} name={project.owner} /></span></span>
            <span>Updated {relative(project.updatedAt)}</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild data-testid="link-home-documents">
              <Link href={`${base}/documents`}><Files className="mr-1.5 h-4 w-4" /> Documents</Link>
            </Button>
            <Button asChild data-testid="link-home-author">
              <Link href={`${base}/author`}><PenLine className="mr-1.5 h-4 w-4" /> Open Author</Link>
            </Button>
          </>
        }
      />

      <section aria-labelledby="lifecycle" className="mt-8 fade-up fade-up-2">
        <div className="flex items-center justify-between">
          <h2 id="lifecycle" className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Document lifecycle</h2>
          <ScopeMarker kind="placeholder">Actions unavailable</ScopeMarker>
        </div>
        <ol className="mt-3 grid overflow-hidden rounded-lg border bg-card sm:grid-cols-3">
          {stages.map((s, i) => (
            <li key={s.id} className="border-b last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <Link href={s.href} data-testid={`link-stage-${s.id}`} className="group flex items-center gap-4 p-5 transition-colors hover:bg-accent/40">
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                <span className="flex-1">
                  <span className="block font-medium">{s.label}</span>
                  <span className="text-[13px] text-muted-foreground">{s.hint}</span>
                </span>
                {docs.isLoading ? (
                  <Skeleton className="h-8 w-8" />
                ) : (
                  <span className="text-[28px] font-semibold tabular-nums text-primary" data-testid={`text-stage-count-${s.id}`}>{s.count}</span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px] fade-up fade-up-3">
        <section aria-labelledby="recent-docs">
          <div className="flex items-center justify-between">
            <h2 id="recent-docs" className="text-[15px] font-semibold">Recent documents</h2>
            <Link href={`${base}/documents`} className="text-sm text-primary hover:underline" data-testid="link-all-documents">View all</Link>
          </div>
          <div className="mt-3">
            {docs.isLoading ? (
              <ListSkeleton rows={3} />
            ) : docs.isError ? (
              <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
            ) : list.length === 0 ? (
              <EmptyState icon={Files} title="No documents yet" body="Open Documents to get started. An explicit project Admin or Author can create the first document.">
                <Button variant="outline" asChild><Link href={`${base}/documents`}>Open Documents</Link></Button>
                <Button variant="outline" asChild><Link href={`/workspaces/${project.workspaceId}/projects`}>Back to Projects</Link></Button>
              </EmptyState>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {list.slice(0, 5).map((d) => (
                  <li key={d.id}>
                    <Link href={`${base}/author/${d.id}`} data-testid={`link-recent-doc-${d.id}`} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-accent/40">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.title}</span>
                        <span className="text-[12.5px] text-muted-foreground">{DOC_TYPE_LABEL[d.type]} · {d.topics.length} topics · {documentVersionLabel(d.version, true)}</span>
                      </span>
                      <StatusPill status={d.status} label={DOC_STATUS_LABEL[d.status]} />
                      <ArrowRight className="hidden h-4 w-4 text-muted-foreground group-hover:text-primary sm:block" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside aria-label="Project summary" className="space-y-8">
          <section aria-labelledby="facts" className="rounded-lg border bg-card p-5">
            <h2 id="facts" className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Project facts</h2>
            <dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Documents</dt><dd className="text-right font-medium" data-testid="text-doc-count">{project.documentCount}</dd>
              <dt className="text-muted-foreground">Topics</dt><dd className="text-right font-medium">{project.topicCount}</dd>
              <dt className="text-muted-foreground">Created</dt><dd className="text-right">{shortDate(project.createdAt)}</dd>
              <dt className="text-muted-foreground">Key</dt><dd className="text-right font-mono">{project.key}</dd>
            </dl>
          </section>
          <section aria-labelledby="activity">
            <h2 id="activity" className="text-[15px] font-semibold">Activity</h2>
            {activity.isLoading ? (
              <div className="mt-3 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : activity.isError ? (
              <div className="mt-3"><ErrorState error={activity.error} onRetry={() => activity.refetch()} /></div>
            ) : (activity.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No activity recorded.</p>
            ) : (
              <ol className="mt-3 space-y-4 border-l pl-4">
                {(activity.data ?? []).map((a) => (
                  <li key={a.id} className="relative text-[13px]">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-background bg-primary" aria-hidden />
                    <p><span className="font-medium"><UserIdentity name={a.actor} /></span> {a.action} <span className="text-foreground/80">{a.target}</span></p>
                    <p className="text-xs text-muted-foreground">{relative(a.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <section aria-labelledby="areas" className="mt-10">
        <h2 id="areas" className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Project areas</h2>
        <ul className="mt-3 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {PROJECT_SECTIONS.filter((s) => s.id !== 'home').map((s) => (
            <li key={s.id} className="bg-card">
              <Link href={base + s.path} data-testid={`link-area-${s.id}`} className="flex h-full items-center gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-accent/40">
                <s.icon className="h-4 w-4 text-primary" aria-hidden />
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function ProjectHomePage() {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  return (
    <ProjectScope workspaceId={workspaceId} projectId={projectId} title="Project Home">
      {({ project, base }) => <HomeBody project={project} base={base} />}
    </ProjectScope>
  );
}
