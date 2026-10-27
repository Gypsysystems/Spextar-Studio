import { describe, expect, it, vi } from 'vitest';
import { categoryInputSchema, categoryEditSchema, conditionValueInputSchema, conditionValueEditSchema,
  conditionInput, parseCategory, parseConditionValue, suggestConditionKey, sortConditionValues,
  type CategoryEdit } from '@/domain/project-conditions';
import { createDemoServices } from '@/services/demo-adapter';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { demoConditions } from '@/services/demo-conditions';
import { ServiceError } from '@/services/contracts';
import { supabaseDouble } from './supabase-double';

const at = '2026-10-27T10:00:00Z';
export const categoryRow = (patch: Record<string, unknown> = {}) => ({
  id: 'category-a', project_id: 'project-a', name: 'Audience', key: 'audience', description: null, settings: {},
  unassigned_behavior: 'include', value_match_mode: 'any', created_at: at, updated_at: at, ...patch,
});
export const conditionValueRow = (patch: Record<string, unknown> = {}) => ({
  id: 'value-a', category_id: 'category-a', name: 'Developer', key: 'developer', sort_order: 0, created_at: at, updated_at: at, ...patch,
});
const input = { name: 'Audience', key: 'audience', description: null, unassignedBehavior: 'include' as const, valueMatchMode: 'any' as const };
const edit: CategoryEdit = { name: 'Target audience', description: 'Readers', unassignedBehavior: 'exclude', valueMatchMode: 'all' };
const valueInput = { name: 'Developer', key: 'developer', sortOrder: 0 };
function backend() {
  const fake = supabaseDouble();
  fake.db.condition_categories.push(categoryRow()); fake.db.condition_values.push(conditionValueRow());
  return { ...fake, service: createSupabaseServices(fake.client).conditions };
}
describe('condition domain contract', () => {
  it('preserves IDs, keys, metadata and nested JSON settings losslessly', () => {
    const raw = categoryRow({ settings: { nested: { enabled: true, values: [null, 5, 'text'] } }, unassigned_behavior: 'exclude', value_match_mode: 'all' });
    const result = parseCategory(raw, 'project-a');
    expect(result).toMatchObject({ id: 'category-a', key: 'audience', settings: raw.settings, unassignedBehavior: 'exclude', valueMatchMode: 'all' });
    expect(parseConditionValue(conditionValueRow(), result.id)).toMatchObject({ id: 'value-a', categoryId: result.id, sortOrder: 0 });
    expect(parseCategory(categoryRow({ settings: null }), 'project-a').settings).toBeNull();
  });
  it.each(['', ' ', 'x'.repeat(121), 'bad\nname'])('rejects invalid category and value names: %j', (name) => {
    expect(() => conditionInput(categoryInputSchema, { ...input, name })).toThrow(ServiceError);
    expect(() => conditionInput(conditionValueInputSchema, { ...valueInput, name })).toThrow(ServiceError);
  });
  it.each(['', 'Audience', '_audience', '2audience', 'audience ', 'a'.repeat(81), 'audience\n'])('rejects invalid keys in rows and writes without coercion: %j', (key) => {
    expect(() => conditionInput(categoryInputSchema, { ...input, key })).toThrow(ServiceError);
    expect(() => conditionInput(conditionValueInputSchema, { ...valueInput, key })).toThrow(ServiceError);
    expect(() => parseCategory(categoryRow({ key }), 'project-a')).toThrow(ServiceError);
    expect(() => parseConditionValue(conditionValueRow({ key }), 'category-a')).toThrow(ServiceError);
  });
  it('supports boundary names/keys and automatic lowercase suggestions without changing display names', () => {
    expect(conditionInput(categoryInputSchema, { ...input, name: 'A'.repeat(120), key: 'a'.repeat(80) }).key).toHaveLength(80);
    expect(suggestConditionKey('Release Channel')).toBe('release_channel');
    expect(suggestConditionKey('2026 Release')).toBe('var_2026_release');
    expect(conditionInput(categoryInputSchema, { ...input, name: 'ReleaseChannel' }).name).toBe('ReleaseChannel');
  });
  it.each([-1, 0.5, '2', null, 2147483648])('rejects non-integer/negative/overflow sort order: %j', (sortOrder) => {
    expect(() => conditionInput(conditionValueInputSchema, { ...valueInput, sortOrder })).toThrow(ServiceError);
    expect(() => parseConditionValue(conditionValueRow({ sort_order: sortOrder }), 'category-a')).toThrow(ServiceError);
  });
  it.each([{ settings: [] }, { settings: 'json' }, { settings: { invalid: undefined } }, { settings: { invalid: Infinity } },
    { unassigned_behavior: 'maybe' }, { value_match_mode: 'boolean-expression' }, { description: {} }, { created_at: 'yesterday' }])(
    'fails closed on unsupported category records: %j', (patch) => {
      expect(() => parseCategory(categoryRow(patch), 'project-a')).toThrow(ServiceError);
    });
  it('rejects missing fields, untrusted audit writes, key changes on edit and foreign rows', () => {
    const missing = categoryRow(); delete (missing as Partial<typeof missing>).key;
    expect(() => parseCategory(missing, 'project-a')).toThrow(ServiceError);
    expect(() => parseCategory(categoryRow(), 'foreign')).toThrow(/does not belong/);
    expect(() => parseConditionValue(conditionValueRow(), 'foreign')).toThrow(/does not belong/);
    expect(() => conditionInput(categoryInputSchema, { ...input, id: 'client-owned' })).toThrow(ServiceError);
    expect(() => conditionInput(categoryEditSchema, { ...edit, key: 'changed' })).toThrow(ServiceError);
    expect(() => conditionInput(conditionValueEditSchema, { name: 'New', sortOrder: 0, key: 'changed' })).toThrow(ServiceError);
  });
  it('sorts values by nonnegative order with stable ID tie breaking without mutating input', () => {
    const rows = [conditionValueRow({ id: 'z', sort_order: 4 }), conditionValueRow({ id: 'b', sort_order: 1 }), conditionValueRow({ id: 'a', sort_order: 1 })]
      .map((r) => parseConditionValue(r, 'category-a'));
    expect(sortConditionValues(rows).map((v) => v.id)).toEqual(['a', 'b', 'z']);
    expect(rows[0].id).toBe('z');
  });
});
describe('authenticated Supabase condition adapter', () => {
  it('reads only the current project/category and never seeds backend rows', async () => {
    const { service, db, calls } = backend();
    db.condition_categories.push(categoryRow({ id: 'foreign', project_id: 'project-b' }));
    db.condition_values.push(conditionValueRow({ id: 'foreign-value', category_id: 'foreign' }));
    expect(await service.listCategories('project-a')).toHaveLength(1);
    expect(await service.listValues('project-a', 'category-a')).toHaveLength(1);
    const reads = calls.filter((c) => c.table.startsWith('condition_'));
    expect(reads.every((c) => c.filters.some(([k,v]) => k === 'project_id' && v === 'project-a' || k === 'category_id' && v === 'category-a'))).toBe(true);
    expect(calls.some((c) => c.insert || c.patch || c.deleted)).toBe(false);
  });
  it('creates and updates categories and values without writing IDs, audits, settings or stable keys', async () => {
    const { service, calls, db } = backend();
    const cat = await service.createCategory('project-a', { ...input, name: 'Platform', key: 'platform' });
    expect(cat.id).toBeTruthy();
    db.condition_categories.find((c) => c.id === cat.id)!.settings = { future: ['preserved'] };
    const updated = await service.updateCategory('project-a', cat.id, edit);
    expect(updated).toMatchObject({ ...edit, key: 'platform', id: cat.id, settings: { future: ['preserved'] } });
    expect((await service.renameCategory('project-a', cat.id, { name: 'ProductPlatform' })).id).toBe(cat.id);
    const val = await service.createValue('project-a', cat.id, valueInput);
    expect(await service.updateValue('project-a', cat.id, val.id, { name: 'Engineer', sortOrder: 5 }))
      .toMatchObject({ id: val.id, key: 'developer', name: 'Engineer', sortOrder: 5 });
    expect(await service.renameValue('project-a', cat.id, val.id, { name: 'Technical writer' })).toMatchObject({ id: val.id, key: 'developer', sortOrder: 5 });
    const writes = calls.filter((c) => c.insert || c.patch);
    expect(writes).toHaveLength(6);
    for (const call of writes) for (const field of ['id', 'created_at', 'updated_at', 'created_by', 'settings'])
      expect(call.insert ?? call.patch).not.toHaveProperty(field);
    for (const call of writes) expect(call.insert ?? call.patch).not.toHaveProperty('settings');
    for (const call of writes.filter((c) => c.patch)) expect(call.patch).not.toHaveProperty('key');
    expect(writes.find((c) => c.table === 'condition_values' && c.patch)?.filters).toEqual([['category_id', cat.id], ['id', val.id]]);
  });
  it.each(['admin', 'author'])('allows explicit project %s mutations', async (role) => {
    const { service, db } = backend(); db.project_members[0].role = role;
    expect(await service.renameCategory('project-a', 'category-a', { name: 'Renamed' })).toMatchObject({ name: 'Renamed' });
  });
  it.each(['reviewer', 'viewer', 'inherited-workspace-admin'])('keeps %s read-only even with workspace admin access', async (role) => {
    const { service, db, calls } = backend();
    if (role === 'inherited-workspace-admin') db.project_members = []; else db.project_members[0].role = role;
    expect(await service.listCategories('project-a')).toHaveLength(1);
    expect(await service.listValues('project-a', 'category-a')).toHaveLength(1);
    const runs = [
      () => service.createCategory('project-a', input), () => service.updateCategory('project-a', 'category-a', edit),
      () => service.renameCategory('project-a', 'category-a', { name: 'New' }),
      () => service.createValue('project-a', 'category-a', valueInput),
      () => service.updateValue('project-a', 'category-a', 'value-a', { name: 'New', sortOrder: 1 }),
      () => service.renameValue('project-a', 'category-a', 'value-a', { name: 'New' }),
    ];
    for (const run of runs) await expect(run()).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls.filter((c) => c.insert || c.patch)).toHaveLength(0);
  });
  it('requires an authenticated identity and a tenant-scoped project/category before reading or writing values', async () => {
    const { service, calls } = backend();
    await expect(service.listCategories('project-b')).rejects.toBeInstanceOf(ServiceError);
    await expect(service.createValue('project-a', 'foreign-category', valueInput)).rejects.toMatchObject({ code: 'not-found' });
    expect(calls.filter((c) => c.table === 'condition_values')).toHaveLength(0);
    const signedOut = supabaseDouble(null);
    await expect(createSupabaseServices(signedOut.client).conditions.listCategories('project-a')).rejects.toMatchObject({ code: 'unauthorized' });
    expect(signedOut.calls.some((c) => c.table.startsWith('condition_'))).toBe(false);
  });
  it('does not read or update a value from a different category', async () => {
    const { service, db, calls } = backend();
    db.condition_values[0].category_id = 'other';
    await expect(service.renameValue('project-a', 'category-a', 'value-a', { name: 'No' })).rejects.toMatchObject({ code: 'not-found' });
    expect(calls.some((c) => c.patch)).toBe(false);
  });
  it.each(['condition_categories', 'condition_values'])('propagates errors without demo fallback for %s', async (table) => {
    const { service, errors } = backend(); errors.set(table, { code: '42501', message: 'RLS denied' });
    await expect(table === 'condition_categories' ? service.listCategories('project-a') : service.listValues('project-a', 'category-a'))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
  it('rejects malformed values and duplicate identities instead of displaying partial data', async () => {
    const { service, db } = backend();
    db.condition_values[0].sort_order = '1';
    await expect(service.listValues('project-a', 'category-a')).rejects.toMatchObject({ code: 'unavailable' });
    db.condition_categories.push(categoryRow());
    await expect(service.listCategories('project-a')).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('maps constraint, duplicate-key and RLS mutation failures consistently', async () => {
    const { service, errors } = backend();
    for (const [code, expected] of [['23505', 'conflict'], ['23514', 'validation'], ['42501', 'forbidden']]) {
      errors.set('write:condition_categories', { code });
      await expect(service.createCategory('project-a', input)).rejects.toMatchObject({ code: expected });
    }
  });
  it('detects a row disappearing before update and never fabricates success', async () => {
    const { service, db, beforeWrite } = backend();
    beforeWrite.mockImplementation((table) => { if (table === 'condition_categories') db.condition_categories = []; });
    await expect(service.renameCategory('project-a', 'category-a', { name: 'No' })).rejects.toMatchObject({ code: 'not-found' });
  });
  it('rejects invalid writes before any database mutation', async () => {
    const { service, calls } = backend();
    await expect(service.createCategory('project-a', { ...input, key: 'Bad' })).rejects.toMatchObject({ code: 'validation' });
    await expect(service.createValue('project-a', 'category-a', { ...valueInput, sortOrder: -1 })).rejects.toMatchObject({ code: 'validation' });
    await expect(service.updateCategory('project-a', 'category-a', { ...edit, id: 'spoofed' } as CategoryEdit)).rejects.toMatchObject({ code: 'validation' });
    expect(calls.some((c) => c.patch || c.insert)).toBe(false);
  });
  it('paginates without truncating categories or values', async () => {
    const { service, db } = backend();
    db.condition_categories = Array.from({ length: 1001 }, (_, i) => categoryRow({ id: `cat-${i}`, key: `cat_${i}` }));
    expect(await service.listCategories('project-a')).toHaveLength(1001);
    db.condition_categories = [categoryRow()];
    db.condition_values = Array.from({ length: 1001 }, (_, i) => conditionValueRow({ id: `val-${i}`, key: `val_${i}`, sort_order: i }));
    expect(await service.listValues('project-a', 'category-a')).toHaveLength(1001);
  });
});
describe('isolated session-only demo conditions', () => {
  it('owns independent deep-cloned samples, never fetches or writes browser storage, and clears them on teardown', async () => {
    const authorize = vi.fn(async () => {});
    const a = demoConditions(authorize), b = demoConditions(authorize);
    const fetch = vi.spyOn(globalThis, 'fetch'), store = vi.spyOn(Storage.prototype, 'setItem');
    const cats = await a.service.listCategories('p'); const original = cats[0];
    await a.service.renameCategory('p', original.id, { name: 'SessionOnly' });
    expect((await b.service.listCategories('p')).some((c) => c.name === 'SessionOnly')).toBe(false);
    cats[0].name = 'external mutation';
    expect((await a.service.listCategories('p')).some((c) => c.name === 'external mutation')).toBe(false);
    const val = await a.service.createValue('p', original.id, { ...valueInput, key: 'technical_writer' });
    await a.service.updateValue('p', original.id, val.id, { name: 'Engineer', sortOrder: 7 });
    expect((await a.service.listValues('p', original.id)).find((v) => v.id === val.id)).toMatchObject({ name: 'Engineer', key: 'technical_writer', sortOrder: 7 });
    await a.service.renameValue('p', original.id, val.id, { name: 'Writer' });
    await a.service.updateCategory('p', original.id, edit);
    a.clear(); expect((await a.service.listCategories('p')).map((c) => c.name)).toContain('Audience');
    expect(fetch).not.toHaveBeenCalled(); expect(store).not.toHaveBeenCalled();
    fetch.mockRestore(); store.mockRestore();
  });
  it('does not allow foreign category or value IDs and enforces unique keys', async () => {
    const { service } = demoConditions(async () => {});
    const cat = await service.createCategory('p', { ...input, key: 'new_audience' });
    await expect(service.createCategory('p', input)).rejects.toMatchObject({ code: 'conflict' });
    const val = await service.createValue('p', cat.id, valueInput);
    await expect(service.createValue('p', cat.id, valueInput)).rejects.toMatchObject({ code: 'conflict' });
    await expect(service.listValues('other-project', cat.id)).rejects.toMatchObject({ code: 'not-found' });
    const other = (await service.listCategories('p')).find((c) => c.id !== cat.id)!;
    await expect(service.updateValue('p', other.id, val.id, { name: 'No', sortOrder: 0 })).rejects.toMatchObject({ code: 'not-found' });
  });
  it('checks authorization before every operation and preserves demo/backend separation across sign-out', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    await expect(services.conditions.listCategories('meridian-x4-user-guide')).rejects.toMatchObject({ code: 'unauthorized' });
    await services.auth.enterDemo();
    const original = (await services.conditions.listCategories('meridian-x4-user-guide'))[0];
    await services.conditions.renameCategory('meridian-x4-user-guide', original.id, { name: 'Temporary' });
    await services.auth.signOut(); await services.auth.enterDemo();
    expect((await services.conditions.listCategories('meridian-x4-user-guide')).some((c) => c.name === 'Temporary')).toBe(false);
    const fake = supabaseDouble();
    expect(await createSupabaseServices(fake.client).conditions.listCategories('project-a')).toEqual([]);
    const deny = demoConditions(async () => { throw new ServiceError('Read only', 'forbidden'); });
    await expect(deny.service.createCategory('p', input)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
