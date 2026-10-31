import { canManageProject } from '@/features/project/permissions';
import { Link, useParams } from 'wouter';
import { Settings } from 'lucide-react';
import { ProjectScope, PageHeader } from '@/features/project/project-scope';
import { InlineProjectName } from '@/features/project/inline-project-name';
import { DocumentsBody } from './documents';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';
import { UserIdentity } from '@/components/user-identity';
import { useActivity, useDocuments } from '@/hooks/use-studio-data';
import { DOC_STATUS_LABEL, relative } from '@/lib/format';
import type { ProjectSummary } from '@/domain/types';

function HomeBody({ project, base }: { project: ProjectSummary; base: string }) {
  const docs = useDocuments(project.id);
  const activity = useActivity(project.id);
  return <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-10">
    <PageHeader titleLabel={project.name} title={<InlineProjectName project={project} />} description={project.description || 'No description yet.'}
      actions={canManageProject(project) ? <Button asChild variant="outline"><Link href={`${base}/settings`}><Settings className="mr-1.5 h-4 w-4" />Settings</Link></Button> : undefined} />
    <section aria-labelledby="project-stats" className="mt-6 rounded-lg border bg-card p-5">
      <h2 id="project-stats" className="text-sm font-semibold">Project Stats</h2>
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div><dt className="text-sm text-muted-foreground">Total documents</dt><dd className="text-xl font-semibold" data-testid="text-doc-count">{docs.isSuccess ? docs.data.length : '—'}</dd></div>
        {(['draft', 'in-review', 'approved', 'published'] as const).map(status => <div key={status}><dt className="text-sm text-muted-foreground">{DOC_STATUS_LABEL[status]}</dt><dd className="text-xl font-semibold">{docs.isSuccess ? docs.data.filter(d => d.status === status).length : '—'}</dd></div>)}
      </dl>
    </section>
    <DocumentsBody key={project.id} project={project} base={base} />
    <section aria-labelledby="activity" className="mt-8 border-t pt-6">
      <h2 id="activity" className="text-sm font-semibold">Activity</h2>
      {activity.isLoading ? <Skeleton className="mt-3 h-16 w-full" /> : activity.isError ? <ErrorState error={activity.error} onRetry={() => void activity.refetch()} /> : !activity.data?.length ? <p className="mt-3 text-sm text-muted-foreground">No activity recorded.</p> : <ol className="mt-3 space-y-2 text-sm">{activity.data.map(a => <li key={a.id}><UserIdentity name={a.actor} /> {a.action} {a.target} <span className="text-muted-foreground">· {relative(a.at)}</span></li>)}</ol>}
    </section>
  </div>;
}
export default function ProjectHomePage() {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  return <ProjectScope workspaceId={workspaceId} projectId={projectId} title="Project Home">{({ project, base }) => <HomeBody project={project} base={base} />}</ProjectScope>;
}
