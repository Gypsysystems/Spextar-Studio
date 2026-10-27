import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  FolderKanban,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/brand/logo';
import { ScopeMarker } from '@/components/states';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { PROJECT_SECTIONS, projectBase } from '@/features/project/sections';
import { useOrganization, useSession, useSignOut, useWorkspaces } from '@/hooks/use-studio-data';
import { STORAGE_KEYS, readJSON, writeJSON } from '@/services/storage';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  href?: string;
}

export interface ShellContext {
  workspaceId?: string;
  workspaceName?: string;
  project?: { id: string; name: string; key: string };
}

export const NAV_EXPANDED = 240;
export const NAV_COLLAPSED = 72;

function useNavCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readJSON<boolean>(STORAGE_KEYS.navCollapsed, false, (v): v is boolean => typeof v === 'boolean'),
  );
  useEffect(() => {
    writeJSON(STORAGE_KEYS.navCollapsed, collapsed);
  }, [collapsed]);
  return [collapsed, setCollapsed] as const;
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  testId,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  collapsed: boolean;
  testId: string;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      data-testid={testId}
      className={cn(
        'relative flex h-9 items-center gap-3 rounded-md text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[hsl(var(--sidebar-ring))]',
        collapsed ? 'mx-auto w-10 justify-center' : 'px-3',
        active
          ? 'bg-[hsl(var(--sidebar-accent))] font-medium text-[hsl(var(--sidebar-foreground))]'
          : 'text-[hsl(var(--muted-foreground))] hover:bg-white/[0.045] hover:text-white',
      )}
    >
      {active && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r bg-primary" aria-hidden />}
      <Icon className={cn('h-[17px] w-[17px] shrink-0', active && 'text-[hsl(253_100%_78%)]')} aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function GroupLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) return <div className="mx-auto my-2 h-px w-6 bg-white/10" aria-hidden />;
  return (
    <div className="px-3 pb-1.5 pt-4 text-[10.5px] font-medium uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]/70">{children}</div>
  );
}

function WorkspaceSwitcher({ ctx, collapsed }: { ctx: ShellContext; collapsed: boolean }) {
  const { data: workspaces } = useWorkspaces();
  const [, navigate] = useLocation();
  const label = ctx.workspaceName ?? 'Select workspace';
  const trigger = (
    <DropdownMenuTrigger
      data-testid="button-workspace-switcher"
      aria-label={`Workspace: ${label}. Switch workspace`}
      className={cn(
        'flex items-center gap-2.5 rounded-md border border-white/[0.07] bg-white/[0.03] text-left text-white transition-colors hover:bg-white/[0.06]',
        collapsed ? 'mx-auto h-10 w-10 justify-center' : 'h-11 w-full px-2.5',
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/10 font-mono text-[11px] font-medium">
        {(ctx.workspaceName ?? 'W').slice(0, 1)}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">Workspace</span>
            <span className="block truncate text-[13px]">{label}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-white/40" aria-hidden />
        </>
      )}
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" side={collapsed ? 'right' : 'bottom'} className="w-64">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Switch workspace
        </DropdownMenuLabel>
        {(workspaces ?? []).map((w) => (
          <DropdownMenuItem
            key={w.id}
            data-testid={`menu-workspace-${w.id}`}
            onSelect={() => navigate(`/workspaces/${w.id}/projects`)}
          >
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === ctx.workspaceId && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/workspaces')} data-testid="menu-all-workspaces">
          <LayoutGrid className="mr-2 h-3.5 w-3.5" /> All workspaces
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionBlock({ collapsed }: { collapsed: boolean }) {
  const { data: session } = useSession();
  const { data: org } = useOrganization();
  const signOut = useSignOut();
  const [, navigate] = useLocation();

  if (!session) {
    const link = (
      <Link
        href="/sign-in"
        data-testid="link-enter-demo"
        aria-label={collapsed ? 'Preview mode. Go to sign in' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-md text-[12.5px] text-white/70 hover:bg-white/[0.05] hover:text-white',
          collapsed ? 'mx-auto h-10 w-10 justify-center' : 'h-10 px-3',
        )}
      >
        <LogIn className="h-4 w-4" aria-hidden />
        {!collapsed && (
          <span>
            Preview mode <span className="text-white/40">· Sign in</span>
          </span>
        )}
      </Link>
    );
    return collapsed ? (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">Preview mode · Sign in</TooltipContent>
      </Tooltip>
    ) : (
      link
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="button-account"
        aria-label={`Account: ${session.name}`}
        className={cn(
          'flex items-center gap-2.5 rounded-md text-left hover:bg-white/[0.05]',
          collapsed ? 'mx-auto h-10 w-10 justify-center' : 'h-12 w-full px-2',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/90 text-[11px] font-semibold text-white">
          {session.initials}
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-white">{session.name}</span>
            <span className="block truncate text-[11px] text-white/45">{org?.name ?? session.role}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? 'right' : 'top'} align="start" className="w-60">
        <DropdownMenuLabel>
          <span className="block text-sm">{session.name}</span>
          <span className="block text-xs font-normal text-muted-foreground">{session.email}</span>
        </DropdownMenuLabel>
        <div className="px-2 pb-2">
          {session.mode === 'demo' ? <ScopeMarker kind="demo">Demo session</ScopeMarker> : <span className="text-xs text-muted-foreground">Supabase session</span>}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="button-sign-out"
          disabled={signOut.isPending}
          onSelect={() => signOut.mutate(undefined, { onSuccess: () => navigate('/sign-in') })}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({
  ctx,
  collapsed,
  onToggle,
  onNavigate,
}: {
  ctx: ShellContext;
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const [location] = useLocation();
  const base = ctx.workspaceId && ctx.project ? projectBase(ctx.workspaceId, ctx.project.id) : null;
  const groups = ['Content', 'Workflow', 'Governance', 'Project'] as const;
  const onWorkspaces = location === '/' || location === '/workspaces';
  const onProjects = !!ctx.workspaceId && location === `/workspaces/${ctx.workspaceId}/projects`;

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 items-center', collapsed ? 'justify-center' : 'px-4')}>
        <Link href="/workspaces" onClick={onNavigate} aria-label="SPEXTAR Studio home" data-testid="link-logo">
          {collapsed ? <LogoMark /> : <Wordmark tone="light" />}
        </Link>
      </div>

      <div className={cn('pb-2', collapsed ? 'px-0' : 'px-3')}>
        <WorkspaceSwitcher ctx={ctx} collapsed={collapsed} />
      </div>

      <nav aria-label="Primary" className={cn('flex-1 overflow-y-auto pb-4', collapsed ? 'px-0' : 'px-3')}>
        <GroupLabel collapsed={collapsed}>Organization</GroupLabel>
        <ul className="space-y-0.5">
          <li>
            <NavItem href="/workspaces" icon={Building2} label="Workspaces" active={onWorkspaces} collapsed={collapsed} testId="nav-workspaces" onNavigate={onNavigate} />
          </li>
          {ctx.workspaceId && (
            <li>
              <NavItem
                href={`/workspaces/${ctx.workspaceId}/projects`}
                icon={FolderKanban}
                label="Projects"
                active={onProjects}
                collapsed={collapsed}
                testId="nav-projects"
                onNavigate={onNavigate}
              />
            </li>
          )}
        </ul>

        {base && ctx.project && (
          <>
            {!collapsed && (
              <div className="mx-0 mt-5 rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                <span className="font-mono text-[10px] text-[hsl(253_100%_80%)]">{ctx.project.key}</span>
                <p className="truncate text-[13px] text-white" title={ctx.project.name}>
                  {ctx.project.name}
                </p>
              </div>
            )}
            {groups.map((g) => (
              <div key={g}>
                <GroupLabel collapsed={collapsed}>{g}</GroupLabel>
                <ul className="space-y-0.5">
                  {PROJECT_SECTIONS.filter((s) => s.group === g).map((s) => {
                    const href = base + s.path;
                    const active = s.path === '' ? location === base : location === href || location.startsWith(href + '/');
                    return (
                      <li key={s.id}>
                        <NavItem href={href} icon={s.icon} label={s.label} active={active} collapsed={collapsed} testId={`nav-${s.id}`} onNavigate={onNavigate} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </>
        )}
      </nav>

      <div className={cn('border-t border-white/[0.06] py-2', collapsed ? 'px-0' : 'px-2')}>
        <SessionBlock collapsed={collapsed} />
        {onToggle && (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggle}
                aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                aria-expanded={!collapsed}
                data-testid="button-toggle-nav"
                className={cn(
                  'mt-1 flex h-9 items-center gap-2.5 rounded-md text-[12.5px] text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white',
                  collapsed ? 'mx-auto w-10 justify-center' : 'w-full px-3',
                )}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                {!collapsed && <span>Collapse</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? 'Expand navigation' : 'Collapse navigation'}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-[13px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className={cn('flex min-w-0 items-center gap-1', !last && 'hidden sm:flex')}>
              {c.href && !last ? (
                <Link href={c.href} className="truncate text-muted-foreground transition-colors hover:text-foreground" data-testid={`crumb-${i}`}>
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="truncate font-medium text-foreground" data-testid={`crumb-${i}`}>
                  {c.label}
                </span>
              )}
              {!last && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function AppShell({
  ctx = {},
  crumbs,
  actions,
  children,
}: {
  ctx?: ShellContext;
  crumbs: Crumb[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useNavCollapsed();
  const { data: activeSession } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const width = collapsed ? NAV_COLLAPSED : NAV_EXPANDED;

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <aside
        data-testid="sidebar"
        data-collapsed={collapsed}
        style={{ width }}
        className="sticky top-0 hidden h-[100dvh] shrink-0 overflow-hidden border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] transition-[width] duration-200 ease-out md:block"
      >
        <SidebarBody ctx={ctx} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[240px] border-none bg-[hsl(var(--sidebar))] p-0 text-white [&>button]:text-white">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Workspace and project navigation</SheetDescription>
          <SidebarBody ctx={ctx} collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            data-testid="button-open-mobile-nav"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Breadcrumbs crumbs={crumbs} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            {activeSession?.mode === 'demo' ? <ScopeMarker kind="demo" className="hidden lg:inline-flex">Demo data</ScopeMarker>
              : <span className="hidden text-xs text-muted-foreground lg:inline-flex">Backend mode</span>}
          </div>
        </header>
        <main id="main" className="flex-1 min-w-0" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
