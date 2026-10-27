import { describe, expect, it } from 'vitest';
import { VARIABLE_KEY_RULE, variableKeySchema, suggestVariableKey, suggestDuplicateVariableKey, parseVariableRow, resolveVariable, validateVariableInput, validateVariableIdentity, validateVariableRows } from '@/domain/project-variables';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { createDemoServices } from '@/services/demo-adapter';
import { ServiceError } from '@/services/contracts';
import { supabaseDouble } from './supabase-double';

const at = '2026-10-27T10:00:00Z';
export const variableRow = (patch: Record<string, unknown> = {}) => ({
  id: 'variable-a', project_id: 'project-a', name: 'ProductName', key: 'productname', value_type: 'text',
  value: 'Meridian X4', description: null, required: false, output_values: {},
  created_at: at, updated_at: at, ...patch,
});
export const variableInput = { name: 'ProductName', key: 'productname', value: 'Meridian X4', description: null,
  required: false, outputValues: {} };

describe('live lowercase variable key constraint', () => {
  const invalid = ['', 'ProductName', 'productName', '_product', '2product', ' product', 'product ', 'product-name',
    'café', 'product\n', 'product\r', 'product\u2028', 'a'.repeat(81)];
  it.each(invalid)('rejects %j consistently without normalization', (key) => {
    expect(variableKeySchema.safeParse(key).success).toBe(false);
    for (const validate of [
      () => validateVariableInput({ ...variableInput, key }),
      () => validateVariableIdentity({ name: 'ProductName', key }),
      () => parseVariableRow(variableRow({ key }), 'project-a'),
    ]) {
      try { validate(); throw new Error('Invalid key accepted'); }
      catch (error) {
        expect(error).toBeInstanceOf(ServiceError);
        expect((error as ServiceError).issues.join(' ')).toContain(VARIABLE_KEY_RULE);
      }
    }
    const raw = variableRow({ key });
    const report = validateVariableRows([raw], 'project-a');
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].message).toContain(VARIABLE_KEY_RULE);
    expect(raw.key).toBe(key);
  });
  it.each(['a', 'productname', 'product_name', 'version_2_', 'a'.repeat(80)])('accepts database-compatible %j with unchanged human name', (key) => {
    const result = validateVariableInput({ ...variableInput, key });
    expect(result.name).toBe('ProductName'); expect(result.key).toBe(key);
    expect(parseVariableRow(variableRow({ key }), 'project-a').key).toBe(key);
  });
  it.each(['ProductName', '2026 Release', '__2026Release', '_ProductName', '!!!', '日本語', 'A'.repeat(120)])(
    'suggests a lowercase database-compatible key from %j', (name) => {
      const key = suggestVariableKey(name);
      expect(variableKeySchema.safeParse(key).success).toBe(true);
      expect(key.length).toBeLessThanOrEqual(80);
    },
  );
  it('preserves familiar suggestions and leaves an empty name empty', () => {
    expect(suggestVariableKey('ProductName')).toBe('productname');
    expect(suggestVariableKey('2026 Release')).toBe('var_2026_release');
    expect(suggestVariableKey('   ')).toBe('');
  });
  it('reserves suffix space for 80-character keys and collision-safe duplicates', () => {
    const source = 'a'.repeat(80);
    const copy = suggestDuplicateVariableKey(source, [source]);
    const second = suggestDuplicateVariableKey(source, [source, copy]);
    const third = suggestDuplicateVariableKey(source, [copy, second]);
    expect(copy).toHaveLength(80); expect(copy).toMatch(/_copy$/);
    expect(second).toHaveLength(80); expect(second).toMatch(/_copy_2$/);
    expect(third).toHaveLength(80); expect(third).toMatch(/_copy_3$/);
    for (const key of [copy, second, third]) expect(variableKeySchema.safeParse(key).success).toBe(true);
  });
  it.each(['backend', 'demo'])('blocks invalid keys in every %s mutation before any writes', async (mode) => {
    const fake = supabaseDouble();
    fake.db.project_variables.push(variableRow());
    const services = mode === 'backend' ? createSupabaseServices(fake.client) : createDemoServices({ latencyMs: 0 });
    if (mode === 'demo') await services.auth.enterDemo();
    const pid = mode === 'backend' ? 'project-a' : 'meridian-x4-user-guide';
    const original = (await services.variables.list(pid))[0];
    for (const key of invalid) {
      for (const run of [
        () => services.variables.create(pid, { ...variableInput, key }),
        () => services.variables.update(pid, original.id, { ...variableInput, key }),
        () => services.variables.rename(pid, original.id, { name: 'ProductName', key }),
        () => services.variables.duplicate(pid, original.id, { name: 'ProductName Copy', key }),
      ]) await expect(run()).rejects.toMatchObject({ code: 'validation', issues: expect.arrayContaining([expect.stringContaining(VARIABLE_KEY_RULE)]) });
    }
    expect(fake.calls.filter((call) => call.insert || call.patch)).toHaveLength(0);
    expect((await services.variables.list(pid))[0]).toEqual(original);
    expect((await services.variables.validate(pid)).issues).toEqual([]);
  });
  it('explains live database constraint rejection using the same key rule', async () => {
    const fake = supabaseDouble();
    fake.errors.set('write:project_variables', { code: '23514' });
    await expect(createSupabaseServices(fake.client).variables.create('project-a', variableInput))
      .rejects.toMatchObject({ code: 'validation', issues: [VARIABLE_KEY_RULE] });
  });
});

describe('owned Text variable contract', () => {
  it('preserves literal JSON strings, metadata and supported overrides', () => {
    const variable = parseVariableRow(variableRow({ value: '"literal" <script>not executed</script>', output_values: {
      'web-help': 'Web edition', 'pdf-manual': '', 'word-review': '   ',
    } }), 'project-a');
    expect(variable.value).toBe('"literal" <script>not executed</script>');
    expect(resolveVariable(variable, 'web-help')).toBe('Web edition');
    expect(resolveVariable(variable, 'pdf-manual')).toBe(variable.value);
    expect(resolveVariable(variable, 'word-review')).toBe(variable.value);
  });
  it.each([
    { value: null }, { value: 42 }, { value: { text: 'wrong' } }, { value_type: 'number' },
    { output_values: null }, { output_values: [] }, { output_values: { 'web-help': 12 } },
    { output_values: { 'web-help': null } }, { output_values: { unknown: 'must not drop' } },
    { required: 'false' }, { key: 'bad key' }, { key: '{{key}}' }, { name: '' },
    { description: {} }, { created_at: null },
  ])('rejects unsupported/malformed backend data without coercion: %j', (patch) => {
    expect(() => parseVariableRow(variableRow(patch), 'project-a')).toThrow(ServiceError);
  });
  it('rejects cross-project returned rows, even if backend filters were ignored', () => {
    expect(() => parseVariableRow(variableRow(), 'another-project')).toThrow('does not belong');
  });
  it('validates required defaults and identities while allowing optional empty text', () => {
    expect(validateVariableInput({ ...variableInput, value: '' }).value).toBe('');
    expect(() => validateVariableInput({ ...variableInput, required: true, value: ' ' })).toThrow(/required variable/);
    for (const key of ['', 'spaces here', '1startsWithNumber', '<html>']) {
      expect(() => validateVariableInput({ ...variableInput, key })).toThrow(ServiceError);
    }
    expect(() => validateVariableInput({ ...variableInput, id: 'client-audit-field' })).toThrow(ServiceError);
    expect(() => validateVariableInput({ ...variableInput, outputValues: { 'word-review': false } })).toThrow(ServiceError);
  });
  it('reports all required/malformed/unsupported rows without changing original data', () => {
    const rows = [variableRow({ required: true, value: '' }), variableRow({ id: 'bad-value', value_type: 'number', value: 1 }),
      variableRow({ id: 'bad-override', output_values: { 'web-help': [] } })];
    const before = structuredClone(rows);
    const report = validateVariableRows(rows, 'project-a');
    expect(report.variableCount).toBe(3); expect(report.issues).toHaveLength(3);
    expect(report.issues[0].message).toContain('missing required default');
    expect(rows).toEqual(before);
    expect(validateVariableRows([variableRow()], 'project-a').issues).toEqual([]);
  });
});

describe('Supabase Variables service boundary', () => {
  function setup(role: string | null = 'author') {
    const fake = supabaseDouble();
    fake.db.project_variables.push(variableRow());
    fake.db.project_members = role ? [{ project_id: 'project-a', user_id: 'user-a', role }] : [];
    return { ...fake, services: createSupabaseServices(fake.client) };
  }
  it('reads tenant-scoped real rows only, without demo keys or fixtures', async () => {
    const { services, calls, db } = setup('viewer');
    db.project_variables.push(variableRow({ id: 'other', project_id: 'project-b', key: 'other' }));
    const result = await services.variables.list('project-a');
    expect(result).toHaveLength(1); expect(result[0].id).toBe('variable-a');
    expect(calls.filter((call) => call.table === 'project_variables').every((call) => call.filters.some(([key, value]) => key === 'project_id' && value === 'project-a'))).toBe(true);
    await expect(services.variables.list('project-b')).rejects.toMatchObject({ code: 'not-found' });
  });
  it.each(['admin', 'author'])('supports %s create/edit/rename/duplicate with server-controlled fields', async (role) => {
    const { services, db, calls, client } = setup(role);
    const created = await services.variables.create('project-a', { ...variableInput, key: 'new_name', outputValues: { 'pdf-manual': 'Manual edition' } });
    expect(created.projectId).toBe('project-a'); expect(created.id).not.toBe('variable-a');
    const insert = calls.find((call) => call.table === 'project_variables' && call.insert)!.insert!;
    expect(insert).toEqual({ project_id: 'project-a', name: 'ProductName', key: 'new_name', value_type: 'text',
      value: 'Meridian X4', description: null, required: false, output_values: { 'pdf-manual': 'Manual edition' } });
    for (const key of ['id', 'created_at', 'updated_at', 'created_by', 'updated_by']) expect(insert).not.toHaveProperty(key);
    const updated = await services.variables.update('project-a', created.id, { ...variableInput, key: 'new_name', value: 'X5', required: true, description: 'Product label' });
    expect(updated.value).toBe('X5');
    const renamed = await services.variables.rename('project-a', created.id, { name: 'New display name', key: 'renamed' });
    expect(renamed.value).toBe('X5'); expect(renamed.key).toBe('renamed');
    const copy = await services.variables.duplicate('project-a', created.id, { name: 'Copy', key: 'renamed_copy' });
    expect(copy.id).not.toBe(created.id); expect(copy.value).toBe('X5'); expect(copy.required).toBe(true);
    expect(db.project_variables).toHaveLength(3);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(calls.filter((call) => call.patch).every((call) => call.filters.some(([key, value]) => key === 'project_id' && value === 'project-a'))).toBe(true);
  });
  it.each(['reviewer', 'viewer', null])('fails closed on %s mutations including inherited Workspace Admin without explicit membership', async (role) => {
    const { services, calls } = setup(role);
    expect((await services.variables.list('project-a'))[0].key).toBe('productname');
    for (const run of [
      () => services.variables.create('project-a', variableInput),
      () => services.variables.update('project-a', 'variable-a', variableInput),
      () => services.variables.rename('project-a', 'variable-a', { name: 'Other', key: 'other' }),
      () => services.variables.duplicate('project-a', 'variable-a', { name: 'Copy', key: 'copy' }),
    ]) await expect(run()).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls.filter((call) => call.patch || call.insert || call.deleted)).toHaveLength(0);
  });
  it('reports RLS/database errors, stale scope, invalid JSON and conflicts without demo fallback', async () => {
    const { services, db, errors, calls } = setup();
    errors.set('project_variables', { code: '42501' });
    await expect(services.variables.list('project-a')).rejects.toMatchObject({ code: 'forbidden' });
    errors.clear(); db.project_variables[0].value = { not: 'a string' };
    await expect(services.variables.list('project-a')).rejects.toMatchObject({ code: 'unavailable' });
    const report = await services.variables.validate('project-a');
    expect(report.issues).toHaveLength(1);
    await expect(services.variables.update('project-a', 'variable-a', variableInput)).rejects.toMatchObject({ code: 'unavailable' });
    await expect(services.variables.rename('project-a', 'missing', { name: 'Other', key: 'other' })).rejects.toMatchObject({ code: 'not-found' });
    errors.set('write:project_variables', { code: '23505' });
    await expect(services.variables.create('project-a', variableInput)).rejects.toMatchObject({ code: 'conflict' });
    expect(calls.some((call) => call.deleted)).toBe(false);
    expect('delete' in services.variables).toBe(false);
  });
  it('reads every page and validates required defaults without writes', async () => {
    const { services, db, calls } = setup();
    db.project_variables = Array.from({ length: 1002 }, (_, i) => variableRow({ id: `v-${i}`, key: `v${i}`, required: i === 1001, value: i === 1001 ? '' : 'Text' }));
    expect(await services.variables.list('project-a')).toHaveLength(1002);
    expect((await services.variables.validate('project-a')).issues).toHaveLength(1);
    expect(calls.filter((call) => call.patch || call.insert)).toHaveLength(0);
  });
  it('rejects unauthenticated access', async () => {
    const { client } = supabaseDouble(null);
    await expect(createSupabaseServices(client).variables.list('project-a')).rejects.toMatchObject({ code: 'unauthorized' });
  });
  it('honors RLS rejection even after the client permission check passes, with no retry/fallback write', async () => {
    const { services, errors, calls } = setup();
    errors.set('write:project_variables', { code: '42501' });
    await expect(services.variables.update('project-a', 'variable-a', variableInput)).rejects.toMatchObject({ code: 'forbidden' });
    expect(calls.filter((call) => call.patch)).toHaveLength(1);
    errors.set('write:project_variables', { code: 'FETCH_ERROR', message: 'connection lost' });
    await expect(services.variables.create('project-a', variableInput)).rejects.toMatchObject({ code: 'network' });
    expect(calls.filter((call) => call.insert)).toHaveLength(1);
  });
});

describe('isolated session-only demo variables', () => {
  it('supports parity but never persists changes to storage or another adapter/session/project', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    const project = 'meridian-x4-user-guide';
    await expect(services.variables.list(project)).rejects.toMatchObject({ code: 'unauthorized' });
    await services.auth.enterDemo();
    const storage = { ...localStorage };
    expect(await services.variables.list(project)).toHaveLength(5);
    const created = await services.variables.create(project, { ...variableInput, key: 'test' });
    await services.variables.update(project, created.id, { ...variableInput, key: 'test', value: 'Edit' });
    await services.variables.rename(project, created.id, { name: 'Rename', key: 'rename' });
    const copy = await services.variables.duplicate(project, created.id, { name: 'Copy', key: 'copy' });
    expect(copy.value).toBe('Edit');
    expect((await services.variables.validate(project)).issues).toEqual([]);
    expect({ ...localStorage }).toEqual(storage);
    const other = createDemoServices({ latencyMs: 0 });
    expect(await other.variables.list(project)).toHaveLength(5);
    await expect(services.variables.list('not-a-project')).rejects.toMatchObject({ code: 'not-found' });
    await services.auth.signOut(); await services.auth.enterDemo();
    expect(await services.variables.list(project)).toHaveLength(5);
  });
});
