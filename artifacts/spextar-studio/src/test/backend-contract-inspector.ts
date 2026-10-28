/** Offline inspection only. Never imports runtime adapters or opens a network connection. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

export const repositoryRoot = resolve(import.meta.dirname, '../../../..');
export const serviceDirectory = 'artifacts/spextar-studio/src/services';
export const domainDirectory = 'artifacts/spextar-studio/src/domain';
export const readSource = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8');
export interface TableContract {
  columns: string[];
  operations: string[];
  scope: string[];
  insertFields?: string[];
  updateFields?: string[];
  concurrency?: string[];
}
export interface BackendContract {
  tables: Record<string, TableContract>;
  rpcs: { documentTopicOperations: Record<string, string[]> };
}
const queryMethods = new Set(['from', 'select', 'eq', 'in', 'order', 'range', 'insert', 'update', 'delete', 'rpc']);
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

export function adapterFiles() {
  // New backend modules must enter the reviewed inventory, including ones with dynamic helpers.
  return readdirSync(resolve(repositoryRoot, serviceDirectory))
    .filter(name => /^supabase.*\.ts$/.test(name)).sort().map(name => `${serviceDirectory}/${name}`);
}
export function sourceUnit(path: string, text = readSource(path)) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
export function semanticDigest(path: string, text = readSource(path)) {
  // Conservative review gate: ignores comments/trivia, but even a non-query semantic
  // change requires review. This is not live-schema introspection or an RLS proof.
  return createHash('sha256').update(printer.printFile(sourceUnit(path, text))).digest('hex');
}
export function querySurface(path: string, text = readSource(path)) {
  const unit = sourceUnit(path, text);
  const surface: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && queryMethods.has(node.expression.name.text)) {
      surface.push(printer.printNode(ts.EmitHint.Expression, node, unit).replace(/\s+/g, ' '));
    }
    ts.forEachChild(node, visit);
  }
  visit(unit);
  return surface;
}

/** Read literal declaration data, never eval or import production modules. */
export function declarationValue(path: string, name: string) {
  const unit = sourceUnit(path);
  let found: unknown;
  function literal(node: ts.Expression): unknown {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(value => literal(value as ts.Expression));
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(prop => {
      if (!ts.isPropertyAssignment(prop) || !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)))
        throw new Error(`Nonliteral ${name} declaration; review inspector support.`);
      return [prop.name.text, literal(prop.initializer)];
    }));
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'enum' && node.arguments[0]) return literal(node.arguments[0]);
    throw new Error(`Nonliteral ${name} declaration; review inspector support.`);
  }
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer)
      found = literal(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(unit);
  if (found === undefined) throw new Error(`Missing reviewed declaration ${name} in ${path}`);
  return found;
}

/** Check statically resolvable query chains; dynamic helper bodies are pinned by
 * semantic digests and covered by adapter tests, not falsely treated as proven. */
export function inspectQueries(path: string, contract: BackendContract, text = readSource(path)) {
  const unit = sourceUnit(path, text);
  const issues: string[] = [];
  const strings = new Map<string, string>();
  const directTables = new Set<string>();
  const usedTables = new Set<string>();
  function constants(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && ts.isStringLiteral(node.initializer)) strings.set(node.name.text, node.initializer.text);
    ts.forEachChild(node, constants);
  }
  constants(unit);
  const literal = (node: ts.Node | undefined) => node && ts.isStringLiteral(node)
    ? node.text : node && ts.isIdentifier(node) ? strings.get(node.text) : undefined;
  function origin(node: ts.Node): string | undefined {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return undefined;
    if (node.expression.name.text === 'from') return literal(node.arguments[0]);
    return origin(node.expression.expression);
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /(?:demo|fixture|supabase-double)/.test(node.moduleSpecifier.text)) {
      issues.push(`${path}: backend must not import demo/test data`);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === 'from' && node.expression.expression.getText(unit) === 'client') {
        const table = literal(node.arguments[0]);
        if (table) {
          usedTables.add(table);
          if (!contract.tables[table]) issues.push(`${path}: undocumented table ${table}`);
        }
      }
      const table = origin(node);
      const spec = table ? contract.tables[table] : undefined;
      if (spec && ['select', 'insert', 'update', 'delete'].includes(method)) {
        directTables.add(table!);
        if (!spec.operations.includes(method)) issues.push(`${path}: undocumented ${table}.${method}`);
      }
      if (spec && ['select', 'eq', 'in', 'order'].includes(method)) {
        const value = literal(node.arguments[0]);
        if (value) for (const column of value.split(',')) {
          if (!spec.columns.includes(column)) issues.push(`${path}: undocumented ${table}.${column}`);
        }
      }
      if (spec && ['insert', 'update'].includes(method) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        const allowed = method === 'insert' ? spec.insertFields : spec.updateFields;
        for (const prop of node.arguments[0].properties) {
          if (!ts.isSpreadAssignment(prop) && prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
            && !allowed?.includes(prop.name.text)) issues.push(`${path}: undocumented ${table}.${method} field ${prop.name.text}`);
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'rpc') {
      const name = literal(node.arguments[0]);
      if (name && !contract.rpcs.documentTopicOperations[name]) issues.push(`${path}: undocumented RPC ${name}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(unit);
  return { issues, usedTables: [...usedTables].sort(), directTables: [...directTables].sort() };
}
