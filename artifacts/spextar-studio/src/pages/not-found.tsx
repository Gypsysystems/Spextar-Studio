import { AppShell } from '@/components/shell/app-shell';
import { NotFoundPanel } from '@/components/states';
import { usePageTitle } from '@/hooks/use-studio-data';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <AppShell crumbs={[{ label: 'Workspaces', href: '/workspaces' }, { label: 'Not found' }]}>
      <NotFoundPanel what="Page" detail="This address does not match any SPEXTAR Studio route." />
    </AppShell>
  );
}
