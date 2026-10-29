import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { createDemoServices } from '@/services/demo-adapter';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { ServiceError } from '@/services/contracts';
import { supabaseDouble } from './supabase-double';
import { VARIABLE_KEY_RULE } from '@/domain/project-variables';

const demoPath = '/workspaces/product-docs/projects/meridian-x4-user-guide/variables-conditions';
const backendPath = '/workspaces/ws-a/projects/project-a/variables-conditions';
const at = '2026-10-27T10:00:00Z';
const row = (patch: Record<string, unknown> = {}) => ({
  id: 'v-a', project_id: 'project-a', name: 'ProductName', key: 'productname', value_type: 'text',
  value: 'Product', description: null, required: false, output_values: { 'pdf-manual': 'Manual product' },
  created_at: at, updated_at: at, ...patch,
});
async function demo() {
  const services = createDemoServices({ latencyMs: 0 });
  await services.auth.enterDemo();
  window.history.replaceState(null, '', demoPath);
  return { services, user: userEvent.setup(), ...render(<App services={services} />) };
}
function backend(role: string | null = 'author') {
  const fake = supabaseDouble();
  fake.db.project_members = role ? [{ project_id: 'project-a', user_id: 'user-a', role }] : [];
  fake.db.project_variables = [row()];
  const services = createSupabaseServices(fake.client);
  window.history.replaceState(null, '', backendPath);
  return { ...fake, services, user: userEvent.setup(), ...render(<App services={services} />) };
}
describe('Variables & Conditions project route', () => {
  it.each(['create', 'edit', 'rename', 'duplicate'] as const)('rejects uppercase keys in the %s form without changing the display name or calling mutations', async (action) => {
    const { user, services } = await demo();
    const run = vi.spyOn(services.variables, action === 'edit' ? 'update' : action);
    await screen.findByTestId('text-variable-default');
    await user.click(screen.getByTestId(action === 'create' ? 'button-new-variable' : `button-${action}-variable`));
    const identity = action === 'rename' || action === 'duplicate';
    const keyInput = screen.getByTestId(identity ? 'input-identity-key' : 'input-variable-key');
    if (action === 'create') await user.type(screen.getByTestId('input-variable-name'), 'ProductName');
    await user.clear(keyInput); await user.type(keyInput, 'InvalidKey');
    await user.click(screen.getByTestId(identity ? 'button-identity-save' : 'button-variable-save'));
    expect(screen.getByText(VARIABLE_KEY_RULE)).toBeVisible();
    expect(keyInput).toHaveValue('InvalidKey');
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
  });
  it('suggests lowercase bounded keys for digit-leading names and keeps manually chosen keys untouched', async () => {
    const { user } = await demo();
    await screen.findByTestId('text-variable-default');
    await user.click(screen.getByTestId('button-new-variable'));
    const name = screen.getByTestId('input-variable-name');
    await user.type(name, '2026 ProductName');
    expect(screen.getByTestId('input-variable-key')).toHaveValue('var_2026_productname');
    expect(name).toHaveValue('2026 ProductName');
    await user.clear(screen.getByTestId('input-variable-key'));
    await user.type(screen.getByTestId('input-variable-key'), 'custom_key');
    await user.clear(name); await user.type(name, 'ProductName');
    expect(screen.getByTestId('input-variable-key')).toHaveValue('custom_key');
  });
  it('renders the frozen shell, honest reference state and coming-next tabs, with searchable selectable demo data', async () => {
    const { user } = await demo();
    expect(await screen.findByRole('heading', { name: 'Variables & Conditions' })).toBeVisible();
    await screen.findByText('ProductName', { selector: 'button p' });
    await waitFor(() => expect(screen.getByTestId('text-where-used')).toHaveTextContent('saved references in accessible locations'));
    expect(screen.getByTestId('text-where-used')).toHaveTextContent('unsaved edits are excluded');
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('panel-variable-details')).getByText(/Deletion is unavailable/i)).toBeVisible();
    expect(screen.getByText('Demo · session-only changes')).toBeVisible();
    await user.type(screen.getByLabelText('Search'), 'ProductVersion');
    expect(screen.getByTestId('text-variable-name')).toHaveTextContent('ProductVersion');
    expect(screen.getByTestId('text-variable-token')).toHaveTextContent('{{productversion}}');
    await user.clear(screen.getByLabelText('Search'));
    await user.type(screen.getByLabelText('Search'), 'no-matches');
    expect(screen.getByText('No variables match')).toBeVisible();
    await user.click(screen.getByTestId('button-clear-variable-search'));
    await user.click(screen.getByRole('tab', { name: 'Conditional tags' }));
    expect(await screen.findByTestId('panel-conditions')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Output preview' }));
    expect(screen.getByTestId('panel-output-preview')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Variables' }));
    expect(screen.getByTestId('panel-variable-list')).toBeVisible();
  });
  it('creates, edits, renames and duplicates with query invalidation and selected returned records', async () => {
    const { user, services } = backend();
    const list = vi.spyOn(services.variables, 'list');
    await screen.findByTestId('text-variable-default');
    await user.click(screen.getByTestId('button-new-variable'));
    await user.type(screen.getByLabelText('Name', { exact: true }), 'ReleaseName');
    await user.clear(screen.getByLabelText('Key', { exact: true }));
    await user.type(screen.getByLabelText('Key', { exact: true }), 'release_name');
    await user.type(screen.getByLabelText('Default value', { exact: true }), 'Release A');
    await user.type(screen.getByLabelText('PDF Manual', { exact: true }), 'PDF Release A');
    await user.click(screen.getByTestId('button-variable-save'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('text-variable-default')).toHaveTextContent('Release A');
    expect(screen.getByTestId('text-variable-token')).toHaveTextContent('{{release_name}}');
    await user.click(screen.getByTestId('button-edit-variable'));
    await user.clear(screen.getByLabelText('Default value', { exact: true }));
    await user.type(screen.getByLabelText('Default value', { exact: true }), 'Release B');
    await user.type(screen.getByLabelText('Description'), 'Release label');
    await user.click(screen.getByTestId('button-variable-save'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('text-variable-default')).toHaveTextContent('Release B');
    await user.click(screen.getByTestId('button-rename-variable'));
    await user.clear(screen.getByTestId('input-identity-name')); await user.type(screen.getByTestId('input-identity-name'), 'Release label');
    await user.clear(screen.getByTestId('input-identity-key')); await user.type(screen.getByTestId('input-identity-key'), 'release_label');
    await user.click(screen.getByTestId('button-identity-save'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('text-variable-token')).toHaveTextContent('{{release_label}}');
    await user.click(screen.getByTestId('button-duplicate-variable'));
    await user.click(screen.getByTestId('button-identity-save'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('text-variable-token')).toHaveTextContent('{{release_label_copy}}');
    expect(screen.getByTestId('text-variable-default')).toHaveTextContent('Release B');
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
  it.each(['reviewer', 'viewer', null])('keeps %s and inherited Workspace Admin read-only, without blocking search/validation', async (role) => {
    const { user, calls } = backend(role);
    await screen.findByTestId('text-variable-default');
    for (const id of ['button-new-variable', 'button-edit-variable', 'button-rename-variable', 'button-duplicate-variable'])
      expect(screen.getByTestId(id)).toBeDisabled();
    expect(screen.getByTestId('text-readonly-note')).toBeVisible();
    await user.type(screen.getByLabelText('Search'), 'Product');
    await user.click(screen.getByTestId('button-validate-project'));
    expect(await screen.findByTestId('text-validation-summary')).toHaveTextContent('Variables valid: 1 checked, no issues.');
    expect(calls.filter((call) => call.insert || call.patch || call.deleted)).toHaveLength(0);
  });
  it('resolves output overrides, missing defaults and required validation honestly, without claiming reference validation', async () => {
    const { user, db } = backend();
    await screen.findByTestId('text-preview-resolved');
    expect(screen.getByTestId('text-preview-resolved')).toHaveTextContent('Product');
    expect(screen.getByTestId('text-output-value-web-help')).toHaveTextContent('Product');
    expect(screen.getByTestId('text-output-value-pdf-manual')).toHaveTextContent('Manual product');
    await user.click(screen.getByRole('combobox', { name: 'Output profile' }));
    await user.click(screen.getByRole('option', { name: 'PDF Manual' }));
    expect(screen.getByTestId('text-preview-resolved')).toHaveTextContent('Manual product');
    db.project_variables[0].required = true; db.project_variables[0].value = '';
    await user.click(screen.getByTestId('button-validate-project'));
    expect(await screen.findByTestId('text-validation-summary')).toHaveTextContent('1 issue in 1 variables.');
    expect(screen.getByText(/missing required default value/)).toBeVisible();
    expect(screen.getByText('Checks variable definitions only. References are not validated.')).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('text-variable-default')).toHaveTextContent('Empty'));
  });
  it('preserves form input after errors, rejects required blank defaults, and prevents duplicate keys', async () => {
    const { user, services } = await demo();
    const create = vi.spyOn(services.variables, 'create').mockRejectedValueOnce(new ServiceError('Connection interrupted. Retry.', 'network'));
    await screen.findByTestId('text-variable-default');
    await user.click(screen.getByTestId('button-new-variable'));
    await user.type(screen.getByLabelText('Name', { exact: true }), 'TestName');
    await user.click(screen.getByTestId('checkbox-variable-required'));
    await user.click(screen.getByTestId('button-variable-save'));
    expect(screen.getByTestId('text-variable-form-error')).toHaveTextContent('required variable needs a default');
    expect(create).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Default value', { exact: true }), 'Preserved');
    await user.click(screen.getByTestId('button-variable-save'));
    expect(await screen.findByText('Connection interrupted. Retry.')).toBeVisible();
    expect(screen.getByLabelText('Default value', { exact: true })).toHaveValue('Preserved');
    await user.clear(screen.getByLabelText('Key', { exact: true })); await user.type(screen.getByLabelText('Key', { exact: true }), 'productname');
    await user.click(screen.getByTestId('button-variable-save'));
    expect(await screen.findByText('This variable key is already in use in this project.')).toBeVisible();
    expect(screen.getByLabelText('Default value', { exact: true })).toHaveValue('Preserved');
  });
  it('reports backend malformed data and validation issues without fixtures or destructive normalization', async () => {
    const { db, user } = backend();
    db.project_variables[0].value = { unsupported: 'json object' };
    expect(await screen.findByText('Variables did not load')).toBeVisible();
    expect(screen.queryByText('Meridian X4')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-variable-details')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('button-validate-project'));
    expect(await screen.findByTestId('text-validation-summary')).toHaveTextContent('1 issue');
    expect(db.project_variables[0].value).toEqual({ unsupported: 'json object' });
  });
  it('has an honest backend empty state and no fabricated sample values', async () => {
    const { db } = backend();
    db.project_variables = [];
    expect(await screen.findByText('No variables yet')).toBeVisible();
    expect(screen.queryByText('ProductName', { selector: 'button p' })).not.toBeInTheDocument();
  });
  it('permits explicit retry after a backend data error', async () => {
    const { services, user, errors } = backend();
    const realList = services.variables.list;
    const list = vi.spyOn(services.variables, 'list');
    let release!: () => void;
    // A read failure is never replaced with demo samples.
    errors.set('project_variables', { code: '42501' });
    expect(await screen.findByText('Variables did not load')).toBeVisible();
    errors.clear();
    const nextRead = new Promise<void>((resolve) => { release = resolve; });
    list.mockImplementationOnce(async () => {
      await nextRead;
      return realList('project-a');
    });
    await user.click(screen.getByRole('button', { name: /try again|retry/i }));
    release();
    expect(await screen.findByTestId('text-variable-default')).toHaveTextContent('Product');
  });
  it('shows scoped loading while variables are delayed', async () => {
    const { services } = backend();
    const read = services.variables.list;
    let release!: () => void;
    const delay = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(services.variables, 'list').mockImplementationOnce(async (pid) => { await delay; return read(pid); });
    const panel = await screen.findByTestId('panel-variable-list');
    expect(within(panel).getByLabelText('Loading')).toHaveAttribute('aria-busy', 'true');
    release();
    expect(await screen.findByTestId('text-variable-default')).toBeVisible();
  });
  it('remounts the responsive route with light tokens and preserves project navigation', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    document.documentElement.classList.remove('dark');
    const { user } = await demo();
    await screen.findByTestId('text-variable-default');
    expect(screen.getByTestId('panel-variable-list')).toBeVisible();
    expect(screen.getByTestId('panel-variable-details')).toBeVisible();
    expect(screen.getByTestId('panel-variable-rail')).toBeVisible();
    await user.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Meridian X4 User Guide'));
    expect(await screen.findByRole('heading', { name: 'Meridian X4 User Guide' })).toBeVisible();
  });
});
