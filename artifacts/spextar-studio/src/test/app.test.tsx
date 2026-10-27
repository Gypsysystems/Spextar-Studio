import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { createDemoServices } from '@/services/demo-adapter';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble } from './supabase-double';
import { STORAGE_KEYS } from '@/services/storage';

const base = '/workspaces/product-docs/projects/meridian-x4-user-guide';
async function mount(path = '/workspaces', authenticated = true) {
  const services = createDemoServices({ latencyMs: 0 });
  if (authenticated) await services.auth.enterDemo();
  window.history.replaceState(null, '', path);
  const view = render(<App services={services} />);
  return { ...view, services, user: userEvent.setup() };
}

describe('foundation routes and navigation', () => {
  it('keeps advanced table editing isolated and session-only in demo', async () => {
    const { user, services, unmount } = await mount(base + '/author/mx4-getting-started');
    const save = vi.spyOn(services.topicDrafts, 'save');
    await screen.findByTestId('input-topic-body');
    const storageBefore = { ...localStorage };
    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    const body = screen.getByTestId('input-topic-body');
    expect(body.querySelectorAll('tr')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Select row' }));
    await user.click(screen.getByRole('button', { name: 'Merge selected cells' }));
    expect(body.querySelector('th')).toHaveAttribute('colspan', '3');
    await user.click(screen.getByRole('button', { name: 'Split cell' }));
    expect(body.querySelectorAll('th')).toHaveLength(3);
    expect(save).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(storageBefore);
    unmount();
    await mount(base + '/author/mx4-getting-started');
    expect((await screen.findByTestId('input-topic-body')).querySelector('table')).toBeNull();
  });
  it('keeps semantic callout edits session-only in demo without draft persistence or recovery writes', async () => {
    const { user, services, unmount } = await mount(base + '/author/mx4-getting-started');
    const save = vi.spyOn(services.topicDrafts, 'save');
    await screen.findByTestId('input-topic-body');
    const storageBefore = { ...localStorage };
    await user.click(screen.getByRole('button', { name: 'Tip callout' }));
    expect(screen.getByTestId('input-topic-body').querySelector('[data-callout-kind="tip"]')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find and replace' }));
    await user.type(screen.getByRole('textbox', { name: 'Find in this topic' }), 'guide');
    await user.type(screen.getByRole('textbox', { name: 'Replace with' }), 'manual');
    await user.click(screen.getByRole('button', { name: 'Replace all' }));
    expect(screen.getByTestId('input-topic-body')).toHaveTextContent('This manual describes');
    expect(save).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(storageBefore);
    unmount();
    await mount(base + '/author/mx4-getting-started');
    await screen.findByTestId('input-topic-body');
    expect(screen.getByTestId('input-topic-body').querySelector('aside')).toBeNull();
  });
  it('requires explicit demo entry before application data is fetched', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    const list = vi.spyOn(services.workspaces, 'listWorkspaces');
    window.history.replaceState(null, '', base + '/documents');
    render(<App services={services} />);
    expect(await screen.findByRole('heading', { name: 'Sign in to SPEXTAR' })).toBeVisible();
    expect(list).not.toHaveBeenCalled();
    expect(screen.getByTestId('input-email')).toBeDisabled();
    expect(screen.getByTestId('input-password')).toBeDisabled();
    await userEvent.click(await screen.findByTestId('button-enter-demo'));
    expect(await screen.findByTestId('card-workspace-product-docs')).toBeVisible();
  });
  it('navigates workspace → project → documents → Author with contextual breadcrumbs', async () => {
    const { user } = await mount();
    await user.click(await screen.findByTestId('card-workspace-product-docs'));
    const project = await screen.findByRole('link', { name: /Meridian X4 User Guide/ });
    await user.click(project);
    expect(await screen.findByTestId('nav-documents')).toBeVisible();
    await user.click(screen.getByTestId('nav-documents'));
    await screen.findByText('Getting started with the Meridian X4');
    await user.click(screen.getByTestId('nav-author'));
    await user.click(await screen.findByTestId('link-author-pick-mx4-getting-started'));
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Workspaces')).toBeInTheDocument();
    expect(within(crumbs).getByText('Product Documentation')).toBeInTheDocument();
    expect(within(crumbs).getByText('Meridian X4 User Guide')).toBeInTheDocument();
    expect(within(crumbs).getByText('Getting started with the Meridian X4')).toBeInTheDocument();
  });
  it('remembers the 240px/72px navigation preference across mounts and exposes icon labels', async () => {
    const view = await mount();
    await screen.findByTestId('card-workspace-product-docs');
    expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '240px' });
    await view.user.click(screen.getByTestId('button-toggle-nav'));
    expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '72px' });
    expect(screen.getByTestId('nav-workspaces')).toHaveAccessibleName('Workspaces');
    await view.user.hover(screen.getByTestId('nav-workspaces'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Workspaces');
    expect(localStorage.getItem(STORAGE_KEYS.navCollapsed)).toBe('true');
    view.unmount();
    await mount();
    await screen.findByTestId('card-workspace-product-docs');
    expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '72px' });
    await userEvent.click(screen.getByTestId('button-toggle-nav'));
    expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '240px' });
  });
  it('switches workspaces without carrying the previous project context', async () => {
    const { user } = await mount(base);
    await user.click(await screen.findByTestId('button-workspace-switcher'));
    await user.click(await screen.findByTestId('menu-workspace-field-service'));
    expect(await screen.findByText('Sample Pump Station Maintenance')).toBeVisible();
    expect(window.location.pathname).toBe('/workspaces/field-service/projects');
    expect(screen.queryByTestId('nav-author')).not.toBeInTheDocument();
  });
  it('renders an empty search state and recovers when the search is cleared', async () => {
    const { user } = await mount();
    await screen.findByTestId('card-workspace-product-docs');
    await user.type(screen.getByTestId('input-search-workspaces'), 'no-such-workspace');
    expect(screen.getByTestId('state-empty')).toHaveTextContent('No workspaces match');
    await user.click(screen.getByTestId('button-clear-search'));
    expect(screen.getByTestId('card-workspace-product-docs')).toBeVisible();
  });
  it('shows a service failure and recovers with Retry', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    await services.auth.enterDemo();
    vi.spyOn(services.workspaces, 'listWorkspaces')
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockRejectedValueOnce(new Error('Network unavailable'));
    render(<App services={services} />);
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent('Network unavailable');
    await userEvent.click(screen.getByTestId('button-retry'));
    expect(await screen.findByTestId('card-workspace-product-docs')).toBeVisible();
  });
  it.each([
    '/not-a-real-route',
    '/workspaces/missing/projects',
    '/workspaces/product-docs/projects/missing',
    `${base}/author/missing`,
    '/workspaces/field-service/projects/meridian-x4-user-guide',
  ])('shows not-found safely for %s', async (path) => {
    await mount(path);
    expect(await screen.findByTestId('state-not-found')).toBeVisible();
  });
  it.each(['review', 'publish', 'style-guide', 'history', 'brand-outputs'])(
    'preserves the %s route as a labelled placeholder', async (section) => {
      await mount(`${base}/${section}`);
      expect(await screen.findByText('Route-ready placeholder')).toBeVisible();
      expect(window.location.pathname).toBe(`${base}/${section}`);
    },
  );
  it('signs out, closes project views, and prevents reopening a deep link without demo entry', async () => {
    const view = await mount(base + '/documents');
    await screen.findByText('Getting started with the Meridian X4');
    await view.user.click(screen.getByTestId('button-account'));
    await view.user.click(await screen.findByTestId('button-sign-out'));
    expect(await screen.findByRole('heading', { name: 'Sign in to SPEXTAR' })).toBeVisible();
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEYS.session)).toBeNull());
    expect(screen.queryByText('Getting started with the Meridian X4', { selector: 'a' })).not.toBeInTheDocument();
    view.unmount();
    await mount(base + '/documents', false);
    expect(await screen.findByRole('heading', { name: 'Sign in to SPEXTAR' })).toBeVisible();
  });
  it('keeps backend mode closed even with a stored demo session', async () => {
    await createDemoServices({ latencyMs: 0 }).auth.enterDemo();
    render(<App services={createSupabaseServices(supabaseDouble(null).client)} />);
    expect(await screen.findByTestId('backend-environment')).toBeVisible();
    expect(screen.queryByTestId('button-enter-demo')).not.toBeInTheDocument();
    expect(screen.queryByText('Halvorsen Instruments')).not.toBeInTheDocument();
  });
});
