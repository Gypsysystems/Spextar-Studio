import { Link, useParams } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { ProjectScope, PageHeader } from '@/features/project/project-scope';
import { SECTION_BY_ID, type SectionId } from '@/features/project/sections';
import { ErrorState, ListSkeleton, ScopeMarker } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { useDocuments } from '@/hooks/use-studio-data';
import { DOC_STATUS_LABEL, relative } from '@/lib/format';
import type { DocumentStatus, ProjectSummary } from '@/domain/types';

/** Review and Publish show the documents that would enter that stage, read-only. */
const STAGE_FILTER: Partial<Record<SectionId, DocumentStatus>> = { review: 'in-review', publish: 'approved' };

function StageDocuments({ project, base, status }: { project: ProjectSummary; base: string; status: DocumentStatus }) {
  const docs = useDocuments(project.id);
  const list = (docs.data ?? []).filter((d) => d.status === status);
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold">{status === 'approved' ? 'Approved, ready to publish' : 'Waiting for review'}</h2>
      <div className="mt-3">
        {docs.isLoading ? (
          <ListSkeleton rows={2} />
        ) : docs.isError ? (
          <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
        ) : list.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">No documents in this state.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {list.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`${base}/author/${d.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary" data-testid={`link-stage-doc-${d.id}`}>
                  {d.title}
                </Link>
                <span className="hidden text-xs text-muted-foreground sm:block">{relative(d.updatedAt)}</span>
                <StatusPill status={d.status} label={DOC_STATUS_LABEL[d.status]} />
                <Button size="sm" variant="outline" disabled title="Not available yet" data-testid={`button-stage-action-${d.id}`}>
                  {status === 'approved' ? 'Publish' : 'Review'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function SectionPlaceholderPage({ section }: { section: SectionId }) {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  const meta = SECTION_BY_ID[section];
  const stage = STAGE_FILTER[section];
  return (
    <ProjectScope workspaceId={workspaceId} projectId={projectId} title={meta.label} trail={[{ label: meta.label }]}>
      {({ project, base }) => (
        <div className="mx-auto w-full max-w-4xl px-5 py-8 md:px-10 md:py-10">
          <PageHeader
            eyebrow={
              <>
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary"><meta.icon className="h-4 w-4" aria-hidden /></span>
                <ScopeMarker kind="placeholder">Coming soon</ScopeMarker>
              </>
            }
            title={meta.label}
            description={meta.description}
            actions={
              <Button variant="outline" asChild data-testid="link-back-home">
                <Link href={base}><ArrowLeft className="mr-1.5 h-4 w-4" /> Project Home</Link>
              </Button>
            }
          />
          <div className="mt-8 grid-paper rounded-lg border p-6 fade-up fade-up-2">
            <p className="text-sm text-muted-foreground">
              {meta.label} isn’t available yet for <span className="font-medium text-foreground">{project.name}</span>.
              {section === 'publish' ? ' No content can be published from this page.' : ' Nothing on this page changes content.'}
            </p>
          </div>
          {stage && <StageDocuments project={project} base={base} status={stage} />}
        </div>
      )}
    </ProjectScope>
  );
}
