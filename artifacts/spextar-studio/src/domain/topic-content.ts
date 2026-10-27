import { ServiceError } from '@/services/contracts';

export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export type TopicContent = { [key: string]: JSONValue };
export interface DraftScope { userId: string; projectId: string; documentId: string; topicId: string }
export interface TopicDraft {
  topicId: string;
  content: TopicContent;
  revision: number;
  updatedAt: string;
  updatedBy: string | null;
}

export function checkedContent(value: unknown): TopicContent {
  const valid = (v: unknown, depth = 0): boolean => depth < 100 && (
    v === null || typeof v === 'string' || typeof v === 'boolean'
    || (typeof v === 'number' && Number.isFinite(v))
    || (Array.isArray(v) && v.every((item) => valid(item, depth + 1)))
    || (typeof v === 'object' && v !== null && [Object.prototype, null].includes(Object.getPrototypeOf(v))
      && Object.values(v).every((item) => valid(item, depth + 1)))
  );
  if (!value || Array.isArray(value) || typeof value !== 'object' || !valid(value)) {
    throw new ServiceError('Topic content must be a structured JSON object.', 'validation');
  }
  return value as TopicContent;
}

export const emptyContent = (): TopicContent => ({ type: 'doc', version: 1, content: [] });
/** JSONB may reorder object keys. Equality must not depend on serialization order. */
export function contentKey(content: TopicContent): string {
  const sorted = (value: JSONValue): JSONValue => Array.isArray(value) ? value.map(sorted)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])])) : value;
  return JSON.stringify(sorted(content));
}

/** Plain paragraphs are the intentionally small, lossless editing subset for Slice 1.
 * Unknown nodes/marks remain intact and view-only, never silently flattened on save.
 */
export function supportsTextEditing(content: TopicContent): boolean {
  if (content.type !== 'doc' || (content.version !== undefined && content.version !== 1) || !Array.isArray(content.content)) return false;
  return content.content.every((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || node.type !== 'paragraph'
      || Object.keys(node).some((key) => !['type', 'content'].includes(key))) return false;
    return node.content === undefined || (Array.isArray(node.content) && node.content.every((text) =>
      text !== null && typeof text === 'object' && !Array.isArray(text) && text.type === 'text'
      && typeof text.text === 'string' && Object.keys(text).every((key) => ['type', 'text'].includes(key))));
  });
}
export function contentText(content: TopicContent): string {
  const text = (value: JSONValue): string => {
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) return value.map(text).join('');
    if (typeof value.text === 'string') return value.text;
    if (value.type === 'hardBreak') return '\n';
    const separator = ['paragraph', 'heading', 'codeBlock'].includes(String(value.type)) ? '' : '\n\n';
    return Array.isArray(value.content) ? value.content.map(text).join(separator) : '';
  };
  return Array.isArray(content.content) ? content.content.map(text).join('\n\n') : '';
}
export function withText(content: TopicContent, value: string): TopicContent {
  if (!supportsTextEditing(content)) throw new ServiceError('This structured draft requires a later editor. Its original JSON has not been changed.', 'validation');
  return { ...content, content: value === '' ? [] : value.split('\n\n').map((paragraph) => ({
    type: 'paragraph', content: paragraph ? [{ type: 'text', text: paragraph }] : [],
  })) };
}
