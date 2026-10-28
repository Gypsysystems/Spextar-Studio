import { describe, expect, it } from 'vitest';
import { contentStatistics } from '@/domain/content-statistics';
import type { TopicContent } from '@/domain/topic-content';

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const doc = (...content: object[]) => ({ type: 'doc', version: 1, content }) as TopicContent;
describe('canonical body statistics', () => {
  it('counts empty bodies and blank paragraphs honestly', () => {
    expect(contentStatistics(doc())).toEqual({ words: 0, paragraphs: 0 });
    expect(contentStatistics(doc(paragraph(), paragraph(text('   '))))).toEqual({ words: 0, paragraphs: 0 });
  });
  it('joins adjacent marked text without inventing word boundaries and respects hard breaks', () => {
    expect(contentStatistics(doc(paragraph(text('tech'), { type: 'text', text: 'nical', marks: [{ type: 'bold' }] },
      { type: 'hardBreak' }, text(' writing'))))).toEqual({ words: 2, paragraphs: 1 });
  });
  it('walks callouts, lists and tables; headings and code add words, not paragraph counts', () => {
    expect(contentStatistics(doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Technical guide')] },
      { type: 'callout', attrs: { kind: 'note' }, content: [paragraph(text('Read this'))] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('First step'))] }] },
      { type: 'table', content: [{ type: 'tableRow', content: [
        { type: 'tableCell', content: [paragraph(text('Cell content'))] },
      ] }] },
      { type: 'codeBlock', content: [text('npm run build')] },
    ))).toEqual({ words: 11, paragraphs: 3 });
  });
  it('ignores root metadata and IDs and never mutates content', () => {
    const body = { ...doc({ ...paragraph(text('Saved body')), attrs: { id: 'stable' } }), metadata: { title: 'Not body text' } };
    const before = JSON.stringify(body);
    expect(contentStatistics(body)).toEqual({ words: 2, paragraphs: 1 });
    expect(JSON.stringify(body)).toBe(before);
  });
  it.each([
    { type: 'doc', version: 2, content: [] },
    { type: 'doc', content: [{ type: 'futureNode', text: 'Do not guess' }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'unknown' }] }] }] },
  ])('returns unavailable for unsupported content instead of flattening it', value => {
    expect(contentStatistics(value as TopicContent)).toBeNull();
  });
});
