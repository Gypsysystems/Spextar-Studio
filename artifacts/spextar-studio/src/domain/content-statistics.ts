import type { JSONValue, TopicContent } from './topic-content';
import { supportsStructuredEditing } from './structured-content';

export interface ContentStatistics { words: number; paragraphs: number }
/** Count current canonical body text, never metadata, IDs or a legacy text projection.
 * Adjacent inline marks do not introduce word boundaries. Empty paragraphs are
 * excluded; headings/code contribute words but are not paragraph nodes.
 * Unsupported documents have unknown statistics, not a fabricated zero.
 */
export function contentStatistics(content: TopicContent): ContentStatistics | null {
  if (!supportsStructuredEditing(content)) return null;
  let paragraphs = 0;
  const text = (value: JSONValue): string => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    if (value.type === 'text') return String(value.text);
    if (value.type === 'hardBreak') return '\n';
    const children = Array.isArray(value.content) ? value.content.map(text) : [];
    const result = children.join(['paragraph', 'heading', 'codeBlock'].includes(String(value.type)) ? '' : '\n');
    if (value.type === 'paragraph' && result.trim()) paragraphs++;
    return result;
  };
  const value = text(content).trim();
  return { words: value ? value.split(/\s+/u).length : 0, paragraphs };
}
