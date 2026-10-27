import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { VariableOutputPreview } from '@/features/variables/variable-output-preview';
import { ServicesProvider } from '@/providers/services-provider';
import { createDemoServices } from '@/services/demo-adapter';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { ServiceError, type Services } from '@/services/contracts';
import { supabaseDouble } from './supabase-double';

const at = '2026-10-27T10:00:00Z';
const row = (patch: Record<string, unknown> = {}) => ({
  id: 'v-a', project_id: 'project-a', name: 'ProductName', key: 'product_name', value_type: 'text',
  value: 'Default product', description: null, required: false,
  output_values: { 'pdf-manual': 'Manual product', 'word-review': '' },
  created_at: at, updated_at: at, ...patch,
});
function panel(services: Services, projectId = 'project-a') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (id: string) => <ServicesProvider services={services}><QueryClientProvider client={client}>
    <VariableOutputPreview key={id} projectId={id} />
  </QueryClientProvider></ServicesProvider>;
  return { ...render(tree(projectId)), client, tree, user: userEvent.setup() };
}
function backend() {
  const fake = supabaseDouble();
  fake.db.project_variables = [row()];
  const services = createSupabaseServices(fake.client);
  return { ...fake, services };
}
function noWrites(services: Services) {
  return (['create', 'update', 'rename', 'duplicate'] as const).map((op) => vi.spyOn(services.variables, op));
}
describe('Read-only project-wide variable output preview', () => {
  it('uses existing output resolution for all profiles, preserving display names and stable-key tokens', async () => {
    const { services } = backend();
    const writes = noWrites(services);
    const { user } = panel(services);
    expect(await screen.findByTestId('text-preview-token-v-a')).toHaveTextContent('{{product_name}}');
    expect(screen.getByTestId('text-preview-name-v-a')).toHaveTextContent('ProductName');
    expect(screen.getByTestId('text-preview-default-v-a')).toHaveTextContent('Default product');
    expect(screen.getByTestId('text-preview-override-v-a')).toHaveTextContent('Not set');
    expect(screen.getByTestId('status-preview-source-v-a')).toHaveTextContent('Default value');
    await user.selectOptions(screen.getByLabelText('Output'), 'pdf-manual');
    expect(screen.getByTestId('text-preview-override-v-a')).toHaveTextContent('Manual product');
    expect(screen.getByTestId('text-preview-resolved-v-a')).toHaveTextContent('Manual product');
    expect(screen.getByTestId('status-preview-source-v-a')).toHaveTextContent('Output override');
    await user.selectOptions(screen.getByLabelText('Output'), 'word-review');
    expect(screen.getByTestId('text-preview-override-v-a')).toHaveTextContent('Set but empty');
    expect(screen.getByTestId('text-preview-resolved-v-a')).toHaveTextContent('Default product');
    expect(screen.getByTestId('status-preview-source-v-a')).toHaveTextContent('Default value');
    writes.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
  it('treats whitespace-only overrides as default and renders text as text, not markup', async () => {
    const { services, db } = backend();
    db.project_variables = [row({ value: '<script>unsafe()</script>', output_values: { 'web-help': '   ' } })];
    panel(services);
    expect(await screen.findByTestId('text-preview-override-v-a')).toHaveTextContent('Set but blank');
    expect(screen.getByTestId('text-preview-resolved-v-a')).toHaveTextContent('<script>unsafe()</script>');
    expect(screen.getByTestId('panel-output-preview').querySelector('script')).toBeNull();
  });
  it('shows service validation findings across the project even when search hides the affected variable', async () => {
    const { services, db } = backend();
    db.project_variables.push(row({ id: 'v-b', name: 'SupportEmail', key: 'support_email', value: '', required: true, output_values: { 'web-help': 'help@example.test' } }));
    const validate = vi.spyOn(services.variables, 'validate');
    const { user } = panel(services);
    expect(await screen.findByTestId('text-preview-validation')).toHaveTextContent('1 issue');
    expect(screen.getByTestId('text-preview-validation')).toHaveTextContent('SupportEmail: missing required default value');
    expect(screen.getByTestId('text-preview-resolved-v-b')).toHaveTextContent('help@example.test');
    await user.type(screen.getByLabelText('Search'), 'product_name');
    expect(screen.queryByTestId('card-preview-variable-v-b')).not.toBeInTheDocument();
    expect(screen.getByTestId('text-preview-validation')).toHaveTextContent('SupportEmail');
    expect(validate).toHaveBeenCalledWith('project-a');
    await user.clear(screen.getByLabelText('Search'));
    await user.type(screen.getByLabelText('Search'), 'no-match');
    expect(screen.getByText('No variables match')).toBeVisible();
    await user.click(screen.getByTestId('button-clear-output-preview-search'));
    expect(screen.getAllByTestId(/^card-preview-variable-/)).toHaveLength(2);
  });
  it('shows genuine empty data and explicitly limits preview claims', async () => {
    const { services, db } = backend();
    db.project_variables = [];
    panel(services);
    expect(await screen.findByText('No variables yet')).toBeVisible();
    expect(await screen.findByTestId('text-preview-validation')).toHaveTextContent('0 checked');
    expect(screen.getByTestId('text-preview-scope')).toHaveTextContent('Read-only');
    expect(screen.getByTestId('text-preview-scope')).toHaveTextContent('publishing are not included');
    expect(screen.queryByRole('button', { name: /create|edit|publish|generate|delete/i })).not.toBeInTheDocument();
  });
  it('keeps list and validation loading scoped until reads finish', async () => {
    const { services } = backend();
    let release!: () => void;
    const delay = new Promise<void>((resolve) => { release = resolve; });
    const list = services.variables.list, validate = services.variables.validate;
    vi.spyOn(services.variables, 'list').mockImplementation(async (id) => { await delay; return list(id); });
    vi.spyOn(services.variables, 'validate').mockImplementation(async (id) => { await delay; return validate(id); });
    panel(services);
    expect(screen.getByTestId('status-preview-validation-loading')).toBeVisible();
    expect(within(screen.getByTestId('panel-output-preview-list')).getByLabelText('Loading')).toBeVisible();
    release();
    expect(await screen.findByTestId('text-preview-name-v-a')).toBeVisible();
  });
  it('surfaces a list failure and retries without demo fallback or mutations', async () => {
    const { services } = backend();
    const read = services.variables.list;
    vi.spyOn(services.variables, 'list').mockRejectedValueOnce(new ServiceError('Access denied.', 'forbidden')).mockImplementation(read);
    const { user } = panel(services);
    const list = screen.getByTestId('panel-output-preview-list');
    expect(await within(list).findByRole('button', { name: /retry/i })).toBeVisible();
    expect(screen.queryByTestId('card-preview-variable-v-a')).not.toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: /retry/i }));
    expect(await screen.findByTestId('text-preview-name-v-a')).toBeVisible();
  });
  it('does not report validation success on failure, and retries independently', async () => {
    const { services } = backend();
    const read = services.variables.validate;
    vi.spyOn(services.variables, 'validate').mockRejectedValueOnce(new ServiceError('Validation offline.', 'network')).mockImplementation(read);
    const { user } = panel(services);
    const validation = screen.getByTestId('panel-output-preview-validation');
    expect(await within(validation).findByText('Validation did not complete')).toBeVisible();
    expect(screen.queryByTestId('text-preview-validation')).not.toBeInTheDocument();
    expect(await screen.findByTestId('text-preview-name-v-a')).toBeVisible();
    await user.click(within(validation).getByRole('button', { name: /retry/i }));
    expect(await screen.findByTestId('text-preview-validation')).toHaveTextContent('no issues');
  });
  it.each([
    { value: { bad: true } }, { value_type: 'number' }, { output_values: { unknown: 'bad' } },
    { output_values: { 'web-help': 42 } },
  ])('fails closed for unsupported backend data %j while exposing validation findings', async (patch) => {
    const { services, db } = backend();
    db.project_variables = [row(patch)];
    panel(services);
    expect(await screen.findByTestId('text-preview-validation')).toHaveTextContent('invalid or unsupported');
    expect(screen.queryByTestId('card-preview-variable-v-a')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('panel-output-preview-list')).getByRole('button', { name: /retry/i })).toBeVisible();
    expect(screen.queryByText('Meridian X4')).not.toBeInTheDocument();
  });
  it('does not retain cached cards after a failed refresh', async () => {
    const { services } = backend();
    const { client } = panel(services);
    await screen.findByTestId('text-preview-name-v-a');
    vi.spyOn(services.variables, 'list').mockRejectedValue(new ServiceError('Permission changed.', 'forbidden'));
    await client.invalidateQueries({ queryKey: ['variables'] });
    await waitFor(() => expect(screen.queryByTestId('card-preview-variable-v-a')).not.toBeInTheDocument());
  });
  it('scopes both read contracts and cache entries by project without leaking prior values', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    const variable = { id: 'v', projectId: 'a', name: 'A', key: 'a', valueType: 'text' as const, value: 'Secret A', description: null, required: false, outputValues: {}, createdAt: at, updatedAt: at };
    const list = vi.spyOn(services.variables, 'list').mockImplementation(async (id) => id === 'a' ? [variable] : []);
    const validate = vi.spyOn(services.variables, 'validate').mockResolvedValue({ variableCount: 0, issues: [] });
    const { rerender, tree } = panel(services, 'a');
    expect(await screen.findByTestId('text-preview-resolved-v')).toHaveTextContent('Secret A');
    rerender(tree('b'));
    expect(await screen.findByText('No variables yet')).toBeVisible();
    expect(screen.queryByText('Secret A')).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledWith('b');
    expect(validate).toHaveBeenCalledWith('b');
  });
  it.each(['admin', 'author', 'reviewer', 'viewer', null])('renders the real route read-only for role %s with zero writes', async (role) => {
    const { services, db } = backend();
    db.project_members = role ? [{ project_id: 'project-a', user_id: 'user-a', role }] : [];
    const writes = noWrites(services);
    window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a/variables-conditions');
    render(<App services={services} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Output preview' }));
    expect(await screen.findByTestId('text-preview-name-v-a')).toBeVisible();
    await user.selectOptions(screen.getByTestId('select-output-preview'), 'pdf-manual');
    expect(screen.getByTestId('text-preview-resolved-v-a')).toHaveTextContent('Manual product');
    expect(screen.queryByTestId('button-new-variable')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-validate-project')).not.toBeInTheDocument();
    writes.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
  it('uses isolated session-only demo data without calling the backend', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    await services.auth.enterDemo();
    const writes = noWrites(services), fetch = vi.spyOn(globalThis, 'fetch');
    panel(services, 'meridian-x4-user-guide');
    expect(await screen.findByText('ProductName')).toBeVisible();
    expect(await screen.findByTestId('text-preview-validation')).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    writes.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    fetch.mockRestore();
  });
});
