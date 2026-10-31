import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'wouter';
import { Archive, ArchiveRestore, RefreshCw, Save, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { ProjectScope, PageHeader } from '@/features/project/project-scope';
import { ErrorState, ScopeMarker } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useServices } from '@/providers/services-provider';
import { useProjectSettings, useProjectSettingsMutation, type SettingsAction } from '@/hooks/use-project-settings';
import { projectMetadataSchema, settingsRole, type ProjectSettings, type SettingsRole, type SettingsScope } from '@/domain/project-settings';
import { LifecycleControl } from '@/features/workspaces/lifecycle-control';
import { useIdentityLabels } from '@/components/user-identity';

const ROLES = settingsRole.options;
const roleLabel: Record<SettingsRole, string> = { admin: 'Admin', author: 'Author', reviewer: 'Reviewer', viewer: 'Viewer' };
const selectCls = 'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'The change could not be saved.');
const isConflict = (e: unknown) => !!e && typeof e === 'object' && (e as { code?: string }).code === 'conflict';

interface Form { name: string; slug: string; description: string }
interface Confirm { title: string; body: ReactNode; label: string; destructive?: boolean; run: () => Promise<void> | void }
const toForm = (s: ProjectSettings): Form => ({ name: s.name, slug: s.slug, description: s.description ?? '' });

function Section({ title, description, children, testId }: { title: string; description: string; children: ReactNode; testId: string }) {
  return (
    <section className="grid gap-4 border-b py-8 last:border-b-0 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:gap-10" data-testid={testId}>
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function SettingsBody({ scope }: { scope: SettingsScope }) {
  const backend = useServices().mode === 'backend';
  const q = useProjectSettings(scope);
  const m = useProjectSettingsMutation(scope);
  const data = q.data;
  const memberLabel = useIdentityLabels(data ? [...data.members.map(m => m.userId), ...data.candidates] : []);
  const pending = m.isPending;
  const admin = !!data?.canAdminister;

  const [form, setForm] = useState<Form>({ name: '', slug: '', description: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const baseline = useRef<Form | null>(null);
  const savedBaseline = useRef<ProjectSettings | null>(null);
  const resync = useRef(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<{ msg: string; conflict: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [addUser, setAddUser] = useState('');
  const [addRole, setAddRole] = useState<SettingsRole>('viewer');
  const [roleDraft, setRoleDraft] = useState<Record<string, SettingsRole>>({});

  // Initialise the form only on first load, after own saves, or on explicit reload — never on background refetches.
  useEffect(() => {
    if (data && resync.current) {
      resync.current = false;
      const f = toForm(data);
      baseline.current = f; savedBaseline.current = data; setForm(f); setErrors({});
    }
  }, [data]);

  const dirty = !!baseline.current && (form.name !== baseline.current.name || form.slug !== baseline.current.slug || form.description !== baseline.current.description);

  const act = async (a: SettingsAction, ok: string, after?: () => void) => {
    setStatus(null); setError(null);
    try {
      await m.mutateAsync(a);
      if (a.kind === 'metadata') {
        const latest = await q.refetch();
        if (latest.error || !latest.data) throw latest.error ?? new Error('Saved, but the latest project could not be read. Reload before editing again.');
        const f = toForm(latest.data);
        baseline.current = f; savedBaseline.current = latest.data; setForm(f); setErrors({});
      }
      after?.();
      setStatus(ok);
    } catch (e) {
      setError({ msg: errMsg(e), conflict: isConflict(e) });
    }
  };

  const reload = () => {
    const go = async () => {
      setStatus(null);
      const latest = await q.refetch();
      if (latest.error || !latest.data) { setError({ msg: errMsg(latest.error), conflict: false }); return; }
      const f = toForm(latest.data);
      baseline.current = f; savedBaseline.current = latest.data; setForm(f); setErrors({}); setRoleDraft({}); setError(null);
    };
    if (dirty) setConfirm({ title: 'Discard unsaved edits?', body: 'Reloading replaces your unsaved project details with the latest saved values.', label: 'Discard and reload', destructive: true, run: go });
    else go();
  };

  const save = () => {
    if (!data || !savedBaseline.current || !admin || pending) return;
    const parsed = projectMetadataSchema.safeParse({ name: form.name, slug: form.slug, description: form.description.trim() ? form.description : null, status: savedBaseline.current.status });
    if (!parsed.success) {
      const next: Partial<Record<keyof Form, string>> = {};
      for (const i of parsed.error.issues) { const k = i.path[0] as keyof Form; if (!next[k]) next[k] = i.message; }
      setErrors(next); return;
    }
    setErrors({});
    void act({ kind: 'metadata', value: parsed.data, expectedUpdatedAt: savedBaseline.current.updatedAt }, 'Project details saved.');
  };

  if (q.isLoading) return (
    <div className="mt-8 space-y-4" data-testid="settings-loading">
      <Skeleton className="h-6 w-48" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" />
    </div>
  );
  if (!data) return <div className="mt-8"><ErrorState error={q.error} onRetry={() => { resync.current = true; void q.refetch(); }} title="Project settings did not load" /></div>;

  const admins = data.members.filter((x) => x.role === 'admin').length;
  const archived = data.status === 'archived';
  const ro = !admin || pending;
  const field = (k: keyof Form, label: string, hint: string, multi = false) => {
    const id = `settings-${k}`;
    const props = {
      id, value: form[k], disabled: ro, readOnly: !admin, 'aria-invalid': !!errors[k], 'aria-describedby': `${id}-hint${errors[k] ? ` ${id}-error` : ''}`,
      onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })), 'data-testid': `input-${k}`,
    };
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] font-medium">{label}</label>
        <div className="mt-1.5">{multi ? <Textarea rows={4} {...props} /> : <Input {...props} className={k === 'slug' ? 'font-mono' : undefined} />}</div>
        <p id={`${id}-hint`} className="mt-1 text-[12px] text-muted-foreground">{hint}</p>
        {errors[k] && <p id={`${id}-error`} className="mt-1 text-[12.5px] text-destructive" data-testid={`error-${k}`}>{errors[k]}</p>}
      </div>
    );
  };

  return (
    <div className="mt-2">
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
        <span data-testid="text-project-status" className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${archived ? 'border-amber-500/40 text-amber-700 dark:text-amber-300' : 'text-foreground'}`}>{archived ? 'Archived' : 'Active'}</span>
        <span data-testid="text-updated-at">Last updated {new Date(data.updatedAt).toLocaleString()}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={reload} disabled={pending || q.isFetching} data-testid="button-reload"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${q.isFetching ? 'animate-spin' : ''}`} />Reload</Button>
      </div>
      {!admin && <p className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground" data-testid="text-readonly">Read-only. Only an explicit Project Admin can change these settings.</p>}
      {q.isError && <p role="alert" className="mt-3 text-sm text-destructive">Latest settings could not be refreshed. Your edits are kept. Use Reload to retry.</p>}
      <div aria-live="polite" role="status" className="sr-only">{status}</div>
      {status && <p className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-800 dark:text-emerald-200" data-testid="status-success">{status}</p>}
      {error && (
        <div role="alert" className="mt-3 flex flex-wrap items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive" data-testid="alert-error">
          <p className="min-w-0 [overflow-wrap:anywhere]">{error.msg}{error.conflict && ' Your edits are kept. Reload to see the latest values.'}</p>
          {error.conflict && <Button size="sm" variant="outline" onClick={reload} data-testid="button-conflict-reload">Reload latest</Button>}
        </div>
      )}

      <Section title="Project details" description="Project name and description. Saved only when you press Save." testId="section-details">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          {field('name', 'Name', '2 to 160 characters.')}

          {field('description', 'Description', 'Optional.', true)}
          {admin && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || !dirty} data-testid="button-save-details"><Save className="mr-1.5 h-4 w-4" />{pending ? 'Saving…' : 'Save details'}</Button>
              <Button type="button" variant="ghost" disabled={pending || !dirty} onClick={() => { if (baseline.current) setForm(baseline.current); setErrors({}); }} data-testid="button-reset-details">Discard edits</Button>
            </div>
          )}
        </form>
      </Section>

      <Section title="Members" description="Project roles for people already in this workspace." testId="section-members">
        <ul className="divide-y rounded-lg border" data-testid="list-members">
          {data.members.map((mb) => {
            const self = mb.userId === data.currentUserId;
            const lastAdmin = mb.role === 'admin' && admins <= 1;
            const locked = self || lastAdmin;
            const draft = roleDraft[mb.userId] ?? mb.role;
            return (
              <li key={mb.userId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center" data-testid={`row-member-${mb.userId}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] [overflow-wrap:anywhere]" data-testid={`text-member-id-${mb.userId}`}>{memberLabel(mb.userId)}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                    {mb.role === 'admin' && <ShieldCheck className="h-3 w-3" aria-hidden />}{roleLabel[mb.role]}{self && ' · You'}
                  </p>
                  {admin && locked && <p className="mt-0.5 text-[12px] text-muted-foreground" data-testid={`text-member-locked-${mb.userId}`}>{self ? 'Ask another Project Admin to change or remove your membership.' : 'Keep at least one Project Admin. Promote another member first.'}</p>}
                </div>
                {admin && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${mb.userId}`}>Role for {memberLabel(mb.userId)}</label>
                    <select id={`role-${mb.userId}`} className={`${selectCls} w-32`} value={draft} disabled={pending}
                      onChange={(e) => setRoleDraft((d) => ({ ...d, [mb.userId]: e.target.value as SettingsRole }))} data-testid={`select-role-${mb.userId}`}>
                      {ROLES.map((r) => <option key={r} value={r} disabled={locked && r !== 'admin'}>{roleLabel[r]}</option>)}
                    </select>
                    <Button size="sm" variant="outline" disabled={pending || draft === mb.role} data-testid={`button-save-role-${mb.userId}`}
                      onClick={() => setConfirm({ title: 'Change role?', body: <>Change <span className="[overflow-wrap:anywhere]">{memberLabel(mb.userId)}</span> from {roleLabel[mb.role]} to {roleLabel[draft]}.</>, label: 'Change role',
                        run: () => act({ kind: 'role', userId: mb.userId, role: draft, expectedRole: mb.role }, 'Role updated.', () => setRoleDraft((d) => { const n = { ...d }; delete n[mb.userId]; return n; })) })}>Save role</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pending || locked} aria-label={`Remove ${memberLabel(mb.userId)}`} data-testid={`button-remove-${mb.userId}`}
                      onClick={() => setConfirm({ title: 'Remove member?', destructive: true, label: 'Remove member', body: <>Remove <span className="[overflow-wrap:anywhere]">{memberLabel(mb.userId)}</span> ({roleLabel[mb.role]}) from this project. Their workspace membership is unchanged.</>,
                        run: () => act({ kind: 'remove', userId: mb.userId, expectedRole: mb.role }, 'Member removed.') })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {admin && (
          <div className="mt-5 rounded-lg border border-dashed p-4" data-testid="panel-add-member">
            <h3 className="text-[14px] font-semibold">Add a workspace member</h3>
            {data.candidates.length === 0 ? (
              <p className="mt-1 text-[12.5px] text-muted-foreground" data-testid="text-no-candidates">Everyone in this workspace is already a member of this project.</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
                <div className="min-w-0">
                  <label htmlFor="add-user" className="text-[12.5px] font-medium">Workspace user</label>
                  <select id="add-user" className={`${selectCls} mt-1`} value={addUser} disabled={pending} onChange={(e) => setAddUser(e.target.value)} data-testid="select-add-user">
                    <option value="">Choose a workspace member</option>
                    {data.candidates.map((c) => <option key={c} value={c}>{memberLabel(c)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="add-role" className="text-[12.5px] font-medium">Role</label>
                  <select id="add-role" className={`${selectCls} mt-1`} value={addRole} disabled={pending} onChange={(e) => setAddRole(e.target.value as SettingsRole)} data-testid="select-add-role">
                    {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                  </select>
                </div>
                <Button disabled={pending || !addUser} data-testid="button-add-member"
                  onClick={() => void act({ kind: 'add', userId: addUser, role: addRole }, 'Member added.', () => setAddUser(''))}><UserPlus className="mr-1.5 h-4 w-4" />Add member</Button>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Project status" description="Changes the saved status only. This screen does not delete content, publish outputs, or introduce additional archive locking." testId="section-status">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-[13.5px]">This project is <strong data-testid="text-status-value">{archived ? 'archived' : 'active'}</strong>.</p>
          {admin && (archived ? (
            <Button variant="outline" disabled={pending || dirty} data-testid="button-restore"
              onClick={() => setConfirm({ title: 'Restore project?', label: 'Restore to active', body: 'The status changes back to active. Nothing else changes.', run: () => act({ kind: 'metadata', value: { name: data.name, slug: data.slug, description: data.description, status: 'active' }, expectedUpdatedAt: data.updatedAt }, 'Project restored to active.') })}>
              <ArchiveRestore className="mr-1.5 h-4 w-4" />Restore</Button>
          ) : (
            <Button variant="outline" disabled={pending || dirty} data-testid="button-archive"
              onClick={() => setConfirm({ title: 'Archive project?', label: 'Archive', body: 'The saved status changes to archived. No content is deleted and no publishing operation runs. You can restore the status to active here.', run: () => act({ kind: 'metadata', value: { name: data.name, slug: data.slug, description: data.description, status: 'archived' }, expectedUpdatedAt: data.updatedAt }, 'Project archived.') })}>
              <Archive className="mr-1.5 h-4 w-4" />Archive</Button>
          ))}
        </div>
        {admin && dirty && <p className="mt-2 text-xs text-muted-foreground">Save or discard detail edits before changing project status.</p>}
        {!backend && <p className="mt-3 text-[12px] text-muted-foreground">Project deletion is not available.</p>}
      </Section>

      {backend && <Section title="Permanent deletion" description="Permanently removes this project and may remove all related content. This cannot be undone." testId="settings-delete">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Archive the project first. Save or discard detail edits before continuing.</p>
          <LifecycleControl scope={{ kind: 'project', id: scope.projectId, parentId: scope.workspaceId }}
            label="Delete project permanently" deleteOnly disabled={!admin || !archived || pending || dirty} />
        </div>
      </Section>}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent className="z-[51] max-w-[min(32rem,calc(100vw-2rem))]" data-testid="dialog-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild><div className="[overflow-wrap:anywhere]">{confirm?.body}</div></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm" disabled={pending}
              className={confirm?.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
              onClick={() => { const c = confirm; setConfirm(null); void c?.run(); }}>{confirm?.label}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function ProjectSettingsPage() {
  const { workspaceId = '', projectId = '' } = useParams<{ workspaceId: string; projectId: string }>();
  const backend = useServices().mode === 'backend';
  return (
    <ProjectScope workspaceId={workspaceId} projectId={projectId} title="Project settings" trail={[{ label: 'Project settings' }]}>
      {({ workspace, project }) => (
        <div className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-10 md:py-10" data-testid="project-settings-page">
          <PageHeader
            eyebrow={backend ? undefined : <ScopeMarker kind="demo">Demo · session-only changes</ScopeMarker>}
            title="Project settings"
            description="Project details, membership and status."
          />
          <SettingsBody key={project.id} scope={{ workspaceId: workspace.id, projectId: project.id }} />
        </div>
      )}
    </ProjectScope>
  );
}
