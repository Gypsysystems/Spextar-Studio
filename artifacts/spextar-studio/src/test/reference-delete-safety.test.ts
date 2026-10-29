import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDemoServices } from '@/services/demo-adapter';
import { createSupabaseServices } from '@/services/supabase-adapter';
import { supabaseDouble } from './supabase-double';

/** Tests source guarantees only; no connection to a live database. */
describe('conservative referenced-definition deletion boundary', () => {
  it.each(['backend', 'demo'])(
    '%s exposes no destructive definition action even when a visible count is zero',
    (mode) => {
      const services =
        mode === 'backend' ? createSupabaseServices(supabaseDouble().client) : createDemoServices({ latencyMs: 0 });
      for (const service of [services.variables, services.conditions, services.reusable]) {
        expect(Object.keys(service).filter((k) => /delete|remove|replace/i.test(k))).toEqual([]);
      }
    },
  );
  it('keeps source DELETE grants and policies absent for definitions, protecting against direct client deletion', () => {
    const root = resolve(import.meta.dirname, '../../../../supabase/migrations');
    const sql = readdirSync(root)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(resolve(root, f), 'utf8'))
      .join('\n')
      .replace(/--[^\n]*/g, '');
    const statements = sql.split(';');
    for (const table of ['project_variables', 'condition_categories', 'condition_values', 'reusable_contents']) {
      const grants = statements.filter(
        (s) =>
          /\bgrant\b/i.test(s) &&
          new RegExp(`\\bpublic\\.${table}\\b`).test(s) &&
          /\bto\s+(?:anon|authenticated)\b/i.test(s),
      );
      expect(grants.length).toBeGreaterThan(0);
      expect(grants.some((s) => /\b(delete|all)\b/i.test(s))).toBe(false);
      expect(
        statements.some(
          (s) =>
            /\bcreate\s+policy\b/i.test(s) &&
            new RegExp(`\\bon\\s+public\\.${table}\\b[\\s\\S]*\\bfor\\s+delete\\b`, 'i').test(s),
        ),
      ).toBe(false);
    }
  });
});
