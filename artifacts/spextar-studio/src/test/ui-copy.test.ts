import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'src');
const engineeringLabels = /\bSupabase\b|\bbackend mode\b|\bF0\/F1\b|\bfoundation build\b|\broute-ready\b|Secure organization workspace|Secure workspace\s*·/i;

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function inspect(directories: string[], collect: (node: ts.Node) => string | undefined, forbidden = engineeringLabels) {
  const violations: string[] = [];
  for (const directory of directories) for (const file of files(join(root, directory))) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      const text = collect(node);
      if (text && forbidden.test(text)) violations.push(`${file.replace(root, '')}: ${text.trim()}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations;
}

describe('customer-facing product language', () => {
  it('requires the shared vector treatment for literal product names in visible JSX copy', () => {
    expect(inspect(['components', 'features', 'pages'], node => {
      if (!ts.isJsxText(node) && !ts.isStringLiteralLike(node)) return undefined;
      const attribute = ts.findAncestor(node, ts.isJsxAttribute);
      if (attribute && ts.isJsxAttribute(attribute)) {
        const name = attribute.name.getText();
        if (/^(aria-|data-|on[A-Z])/.test(name) || ['className', 'src', 'alt', 'href', 'title', 'id', 'key', 'name', 'type', 'value', 'defaultValue', 'placeholder', 'download', 'htmlFor'].includes(name)) return undefined;
        const opening = attribute.parent.parent;
        if ((ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) && ['EmptyState', 'ErrorState', 'NotFoundPanel'].includes(opening.tagName.getText())) return undefined;
      }
      if (!ts.isJsxText(node) && !attribute && !ts.findAncestor(node, ts.isJsxElement)) return undefined;
      const branded = ts.findAncestor(node, parent => {
        if (!ts.isJsxElement(parent)) return false;
        if (parent.openingElement.tagName.getText() === 'BrandedText') return true;
        return parent.openingElement.attributes.properties.some(property =>
          ts.isJsxAttribute(property) && property.name.getText() === 'className' &&
          property.initializer && ts.isStringLiteral(property.initializer) && property.initializer.text.split(/\s+/).includes('sr-only'));
      });
      return branded ? undefined : node.text;
    }, /\bSPEXTAR\b/i)).toEqual([]);
  });

  it('keeps environment and implementation labels out of application JSX', () => {
    expect(inspect(['components', 'features', 'pages'], node => {
      if (ts.isJsxText(node)) return node.text;
      if (!ts.isStringLiteralLike(node)) return undefined;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxAttribute(parent)) return node.text;
      }
      return undefined;
    })).toEqual([]);
  });

  it('keeps surfaced service errors actionable without provider or build jargon', () => {
    expect(inspect(['domain', 'services', 'providers'], node => {
      if (!ts.isNewExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== 'ServiceError') return undefined;
      const message = node.arguments?.[0];
      if (message && ts.isStringLiteralLike(message)) return message.text;
      return undefined;
    })).toEqual([]);
  });
});
