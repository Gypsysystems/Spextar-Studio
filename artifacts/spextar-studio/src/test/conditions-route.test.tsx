import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { createDemoServices } from '@/services/demo-adapter';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble } from './supabase-double';

const at = '2026-10-27T10:00:00Z';
const cat = (patch: Record<string, unknown> = {}) => ({ id: 'cat-a', project_id: 'project-a', name: 'Audience', key: 'audience', description: null,
  settings: { future: { flags: ['preserve'] } }, unassigned_behavior: 'include', value_match_mode: 'any', created_at: at, updated_at: at, ...patch });
const value = (patch: Record<string, unknown> = {}) => ({ id: 'val-a', category_id: 'cat-a', name: 'Developer', key: 'developer',
  sort_order: 10, created_at: at, updated_at: at, ...patch });
async function openTab(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Variables & Conditions' });
  await user.click(screen.getByRole('tab', { name: 'Conditional tags' }));
  await screen.findByTestId('panel-conditions');
}
async function backend(role: string | null = 'author', empty = false, configure?: (fake: ReturnType<typeof supabaseDouble>) => void) {
  const fake = supabaseDouble();
  fake.db.project_members = role ? [{ project_id: 'project-a', user_id: 'user-a', role }] : [];
  if (!empty) { fake.db.condition_categories.push(cat()); fake.db.condition_values.push(value()); }
  configure?.(fake);
  const services = createSupabaseServices(fake.client);
  window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a/variables-conditions');
  const user = userEvent.setup(); const result = render(<App services={services} />);
  await openTab(user);
  return { ...fake, services, user, ...result };
}
const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
async function replace(user: ReturnType<typeof userEvent.setup>, id: string, text: string) {
  await user.clear(screen.getByTestId(id));
  if (text) await user.type(screen.getByTestId(id), text);
}
describe('Conditional tags route and management', () => {
  it('wraps maximum-length unbroken category names in resolution guidance without changing their data', async () => {
    const name = 'M'.repeat(120);
    const key = 'a'.repeat(80);
    await backend('author', false, ({ db }) => {
      Object.assign(db.condition_categories[0], { name, key });
    });
    expect(await screen.findByTestId('text-category-name')).toHaveTextContent(name);
    expect(screen.getByTestId('text-category-key')).toHaveTextContent(key);
    expect(screen.getByTestId('text-condition-resolution-rules')).toHaveTextContent(`Untagged for ${name}:`);
    expect(screen.getByTestId('text-condition-resolution-rules')).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByTestId('button-rename-category')).toBeEnabled();
  });
  it('renders the frozen three-column shell, stored defaults and honest no-reference state without publishing controls', async () => {
    const { user } = await backend();
    expect(await screen.findByTestId('text-category-name')).toHaveTextContent('Audience');
    expect(screen.getByRole('tab', { name: 'Conditional tags' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('text-category-unassigned')).toHaveTextContent('Included (default)');
    expect(screen.getByTestId('text-category-match')).toHaveTextContent('Match any (OR)');
    expect(screen.getByText(/Different categories always combine with AND/)).toBeVisible();
    expect(screen.getByTestId('text-condition-assignment')).toHaveTextContent('Apply or remove values on supported blocks in Author');
    expect(screen.getByText(/Output filtering is not applied yet/)).toBeVisible();
    expect(screen.getByText(/Permanent deletion remains unavailable/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /delete|publish|apply tags/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-validate-project')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-new-variable')).not.toBeInTheDocument();
    expect(screen.getByTestId('panel-conditions')).toHaveClass('grid');
    expect(screen.getByTestId('panel-condition-rail')).toHaveClass('min-w-0');
    await user.click(screen.getByRole('tab', { name: 'Output preview' }));
    expect(screen.getByTestId('panel-output-preview')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Variables' }));
    expect(screen.getByTestId('button-new-variable')).toBeVisible();
    expect(screen.getByTestId('button-validate-project')).toBeVisible();
  });
  it('creates, edits and renames a category while preserving its key, ID, settings and selection', async () => {
    const { user, services, db } = await backend();
    const list = vi.spyOn(services.conditions, 'listCategories');
    await user.click(screen.getByTestId('button-new-category'));
    await user.type(screen.getByTestId('input-category-name'), 'ReleaseChannel');
    expect(screen.getByTestId('input-category-key')).toHaveValue('releasechannel');
    await replace(user, 'input-category-key', 'release_channel');
    await user.type(screen.getByTestId('input-category-description'), 'Release variants');
    await user.click(screen.getByTestId('button-category-save')); await closed();
    expect(screen.getByTestId('text-category-name')).toHaveTextContent('ReleaseChannel');
    expect(screen.getByTestId('text-category-key')).toHaveTextContent('release_channel');
    const record = db.condition_categories.find((c) => c.key === 'release_channel')!;
    record.settings = { future: 'unchanged' };
    await user.click(screen.getByTestId('button-edit-category'));
    expect(screen.queryByTestId('input-category-key')).not.toBeInTheDocument();
    await replace(user, 'input-category-description', 'Updated release variants');
    await user.click(screen.getByTestId('select-category-unassigned'));
    await user.click(screen.getByRole('option', { name: 'Exclude' }));
    await user.click(screen.getByTestId('select-category-match'));
    await user.click(screen.getByRole('option', { name: 'Match all (AND)' }));
    await user.click(screen.getByTestId('button-category-save')); await closed();
    expect(screen.getByTestId('text-category-unassigned')).toHaveTextContent('Excluded');
    expect(screen.getByTestId('text-category-match')).toHaveTextContent('Match all (AND)');
    await user.type(screen.getByTestId('input-search-categories'), 'ReleaseChannel');
    await user.click(screen.getByTestId('button-rename-category'));
    await replace(user, 'input-rename-category-name', 'Edition'); await user.click(screen.getByTestId('button-rename-category-save')); await closed();
    expect(screen.getByTestId('input-search-categories')).toHaveValue('');
    expect(screen.getByTestId('text-category-name')).toHaveTextContent('Edition');
    expect(record).toMatchObject({ key: 'release_channel', name: 'Edition', settings: { future: 'unchanged' } });
    expect(record.id).toBeTruthy();
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
  it('adds, edits, reorders and renames values using single-row writes and invalidated category-specific caches', async () => {
    const { user, services, db, calls } = await backend();
    await screen.findByTestId('row-value-val-a');
    const list = vi.spyOn(services.conditions, 'listValues');
    await user.click(screen.getByTestId('button-add-value'));
    expect(screen.getByTestId('input-value-order')).toHaveValue(20);
    await user.type(screen.getByTestId('input-value-name'), 'Administrator');
    await user.click(screen.getByTestId('button-value-save')); await closed();
    const record = db.condition_values.find((v) => v.key === 'administrator')!;
    const id = String(record.id);
    await user.click(screen.getByTestId(`button-edit-value-${id}`));
    expect(screen.getByTestId('text-value-form-key')).toHaveTextContent('administrator');
    await replace(user, 'input-value-name', 'System Admin'); await replace(user, 'input-value-order', '0');
    await user.click(screen.getByTestId('button-value-save')); await closed();
    expect(within(screen.getByTestId('list-values')).getAllByRole('listitem')[0]).toHaveAttribute('data-testid', `row-value-${id}`);
    await user.click(screen.getByTestId(`button-rename-value-${id}`));
    await replace(user, 'input-rename-value-name', 'Maintainer'); await user.click(screen.getByTestId('button-rename-value-save')); await closed();
    expect(screen.getByTestId(`text-value-name-${id}`)).toHaveTextContent('Maintainer');
    expect(record).toMatchObject({ id, key: 'administrator', sort_order: 0 });
    const patches = calls.filter((c) => c.table === 'condition_values' && c.patch);
    expect(patches).toHaveLength(2);
    expect(patches.every((c) => c.filters.some(([k,v]) => k === 'id' && v === id))).toBe(true);
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
  it('searches/selects categories and keeps value lists correctly scoped', async () => {
    const { user, services } = await backend('author', false, ({ db }) => {
      db.condition_categories.push(cat({ id: 'cat-b', name: 'Platform', key: 'platform' }));
      db.condition_values.push(value({ id: 'val-b', category_id: 'cat-b', key: 'web', name: 'Web' }));
    });
    await user.click(await screen.findByTestId('card-category-cat-b'));
    expect(await screen.findByTestId('row-value-val-b')).toBeVisible();
    expect(screen.queryByTestId('row-value-val-a')).not.toBeInTheDocument();
    await user.type(screen.getByTestId('input-search-categories'), 'audience');
    expect(screen.getByTestId('text-category-name')).toHaveTextContent('Audience');
    await user.clear(screen.getByTestId('input-search-categories'));
    await user.type(screen.getByTestId('input-search-categories'), 'missing');
    expect(screen.getByText('No categories match')).toBeVisible();
    expect(screen.queryByTestId('panel-category-details')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('button-clear-category-search'));
    expect(screen.getByTestId('text-category-name')).toBeVisible();
    expect(services.mode).toBe('backend');
  });
  it.each(['reviewer', 'viewer', null])('keeps %s role or inherited workspace admin fully read-only with search available', async (role) => {
    const { calls } = await backend(role);
    await screen.findByTestId('row-value-val-a');
    for (const id of ['button-new-category', 'button-edit-category', 'button-rename-category', 'button-add-value', 'button-edit-value-val-a', 'button-rename-value-val-a'])
      expect(screen.getByTestId(id)).toBeDisabled();
    expect(screen.getByTestId('input-search-categories')).toBeEnabled();
    expect(screen.getByTestId('text-readonly-note')).toHaveTextContent('conditional tags');
    expect(calls.some((c) => c.patch || c.insert)).toBe(false);
  });
  it('shows a real backend empty state without seeding demo categories and supports first creation', async () => {
    const { user, db } = await backend('author', true);
    expect(await screen.findByText('No condition categories yet')).toBeVisible();
    expect(screen.queryByText('Audience', { exact: true })).not.toBeInTheDocument();
    expect(db.condition_categories).toEqual([]);
    await user.click(screen.getByTestId('button-empty-new-category'));
    await user.type(screen.getByTestId('input-category-name'), 'Audience');
    await user.click(screen.getByTestId('button-category-save')); await closed();
    expect(screen.getByTestId('text-category-name')).toHaveTextContent('Audience');
    expect(await screen.findByTestId('text-values-empty')).toBeVisible();
  });
  it('rejects invalid keys/order without writes and keeps manually entered keys unchanged', async () => {
    const { user, calls } = await backend();
    await screen.findByTestId('row-value-val-a');
    await user.click(screen.getByTestId('button-new-category'));
    await user.type(screen.getByTestId('input-category-name'), 'Release');
    await replace(user, 'input-category-key', '_INVALID');
    await replace(user, 'input-category-name', 'ReleaseChannel');
    expect(screen.getByTestId('input-category-key')).toHaveValue('_INVALID');
    await user.click(screen.getByTestId('button-category-save'));
    expect(screen.getByTestId('text-category-form-error')).toHaveTextContent('lowercase letter');
    expect(calls.some((c) => c.insert)).toBe(false);
    await user.click(screen.getByTestId('button-category-cancel'));
    await user.click(screen.getByTestId('button-add-value'));
    await user.type(screen.getByTestId('input-value-name'), 'New');
    await replace(user, 'input-value-order', '-1');
    await user.click(screen.getByTestId('button-value-save'));
    expect(screen.getByTestId('text-value-form-error')).toHaveTextContent('whole number');
    expect(calls.some((c) => c.insert)).toBe(false);
  });
  it('retains fields after a mutation failure and allows an explicit retry', async () => {
    const { user, errors } = await backend();
    await screen.findByTestId('text-category-name');
    await user.click(screen.getByTestId('button-rename-category'));
    await replace(user, 'input-rename-category-name', 'Renamed');
    errors.set('write:condition_categories', { code: '42501' });
    await user.click(screen.getByTestId('button-rename-category-save'));
    expect(await screen.findByTestId('text-condition-mutation-error')).toHaveTextContent('permission');
    expect(screen.getByTestId('input-rename-category-name')).toHaveValue('Renamed');
    errors.delete('write:condition_categories');
    await user.click(screen.getByTestId('button-rename-category-save')); await closed();
    expect(screen.getByTestId('text-category-name')).toHaveTextContent('Renamed');
  });
  it('surfaces malformed rows with retry and never renders the invalid category', async () => {
    const fake = supabaseDouble(); fake.db.condition_categories.push(cat({ key: 'BAD_KEY' }));
    const services = createSupabaseServices(fake.client);
    window.history.replaceState(null, '', '/workspaces/ws-a/projects/project-a/variables-conditions');
    const user = userEvent.setup(); render(<App services={services} />); await openTab(user);
    expect(await screen.findByText('Condition categories did not load')).toBeVisible();
    expect(screen.queryByTestId('text-category-name')).not.toBeInTheDocument();
    fake.db.condition_categories[0].key = 'audience';
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('text-category-name')).toHaveTextContent('Audience');
  });
  it('shows a value-load error independently, disables Add, and supports retry without fake values', async () => {
    const { user, errors } = await backend('author', false, ({ errors }) => {
      errors.set('condition_values', { code: '42501' });
    });
    expect(await screen.findByText('Values did not load')).toBeVisible();
    expect(screen.queryByTestId('row-value-val-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('button-add-value')).toBeDisabled();
    errors.delete('condition_values');
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByTestId('row-value-val-a')).toBeVisible();
  });
  it('keeps an edit target snapshot if a refetch removes the selected category; never converts edit into create', async () => {
    const { user, db, services } = await backend();
    await screen.findByTestId('text-category-name');
    const create = vi.spyOn(services.conditions, 'createCategory');
    await user.click(screen.getByTestId('button-edit-category'));
    await replace(user, 'input-category-name', 'Still editing original');
    db.condition_categories = [];
    await user.click(screen.getByTestId('button-category-save'));
    expect(await screen.findByTestId('text-condition-mutation-error')).toHaveTextContent('Category was removed');
    expect(screen.getByTestId('input-category-name')).toHaveValue('Still editing original');
    expect(create).not.toHaveBeenCalled();
  });
  it('provides the same management experience with session-only demo data', async () => {
    const services = createDemoServices({ latencyMs: 0 }); await services.auth.enterDemo();
    window.history.replaceState(null, '', '/workspaces/product-docs/projects/meridian-x4-user-guide/variables-conditions');
    const user = userEvent.setup(); render(<App services={services} />); await openTab(user);
    expect(await screen.findByTestId('text-category-name')).toHaveTextContent('Audience');
    expect(screen.getByText('Demo · session-only changes')).toBeVisible();
    await user.click(screen.getByTestId('button-rename-category'));
    await replace(user, 'input-rename-category-name', 'DemoAudience');
    await user.click(screen.getByTestId('button-rename-category-save')); await closed();
    expect(screen.getByTestId('text-category-name')).toHaveTextContent('DemoAudience');
  });
});
