import { Link } from 'wouter';
import { canManageProject } from '@/features/project/permissions';
import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ProjectSummary } from '@/domain/types';
import type { ProjectSettings } from '@/domain/project-settings';
import { useServices } from '@/providers/services-provider';
import { useProjectSettingsMutation } from '@/hooks/use-project-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Snapshot metadata on edit; preserve slug/status and compare the original timestamp. */
export function InlineProjectName({ project, href }: { project: ProjectSummary; href?: string }) {
  const scope = { workspaceId: project.workspaceId, projectId: project.id };
  const services = useServices();
  const mutation = useProjectSettingsMutation(scope);
  const [baseline, setBaseline] = useState<ProjectSettings | null>(null);
  const [name, setName] = useState(project.name);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const opener = useRef<HTMLButtonElement>(null);
  const close = () => { setBaseline(null); requestAnimationFrame(() => opener.current?.focus()); };
  return <span className="inline-flex max-w-full flex-wrap items-center gap-2">
    {baseline ? <span className="flex min-w-0 flex-wrap items-center gap-2">
      <Input autoFocus aria-label="Project name" value={name} minLength={2} maxLength={160}
        disabled={mutation.isPending} className="w-full max-w-72" onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape' && !mutation.isPending) { e.preventDefault(); setMessage(''); close(); }
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[data-save-name]')?.click(); }
        }} />
      <Button data-save-name type="button" size="sm" disabled={mutation.isPending || name.trim().length < 2} onClick={() => {
        setMessage('');
        mutation.mutate({ kind: 'metadata', value: { name: name.trim(), slug: baseline.slug, description: baseline.description, status: baseline.status }, expectedUpdatedAt: baseline.updatedAt }, {
          onSuccess: () => { setMessage('Project name saved.'); close(); },
          onError: error => setMessage(error.message),
        });
      }}>{mutation.isPending ? 'Saving…' : 'Save'}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => { setMessage(''); close(); }}>Cancel</Button>
    </span> : <>{href ? <Link href={href} className="min-w-0 font-medium hover:text-primary [overflow-wrap:anywhere]">{project.name}</Link> : <span className="min-w-0 [overflow-wrap:anywhere]">{project.name}</span>}
      {canManageProject(project) && <Tooltip><TooltipTrigger asChild><Button ref={opener} type="button" size="icon" variant="ghost" disabled={loading}
        aria-label="Edit project name" onClick={async () => {
          setLoading(true); setLoadError(false); setMessage(''); mutation.reset();
          try {
            const current = await services.projectSettings.get(scope);
            if (!current.canAdminister) throw new Error('Only a Project Admin can rename this project.');
            setName(current.name); setBaseline(current);
          } catch (error) { setLoadError(true); setMessage(error instanceof Error ? error.message : 'Could not load project details.'); }
          finally { setLoading(false); }
        }}><Pencil className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit project name</TooltipContent></Tooltip>}
    </>}
    {(message || loading) && <span role={mutation.isError || loadError ? 'alert' : 'status'} className="basis-full text-sm font-normal text-muted-foreground">{loading ? 'Preparing name editor…' : message}</span>}
  </span>;
}
