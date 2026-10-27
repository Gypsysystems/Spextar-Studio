import type { TopicContent } from '@/domain/topic-content';

export function tableFixture(rows = 3, cols = 3, headers = false): TopicContent {
  return { type: 'doc', version: 1, metadata: { language: 'en', untouched: true }, content: [
    { type: 'table', attrs: { id: 'table' }, content: Array.from({ length: rows }, (_, r) => ({
      type: 'tableRow', attrs: { id: `row-${r}` }, content: Array.from({ length: cols }, (_, c) => ({
        type: headers && r === 0 ? 'tableHeader' : 'tableCell',
        attrs: { id: `cell-${r}-${c}`, colspan: 1, rowspan: 1 },
        content: [{ type: 'paragraph', attrs: { id: `p-${r}-${c}` }, content: [
          { type: 'text', text: `${r}:${c}`, marks: [{ type: r === 0 ? 'bold' : 'italic' }] },
        ] }],
      })),
    })) },
  ] };
}
