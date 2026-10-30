import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ReleaseBodyV1 from '@/features/publishing/release-body-v1';
import { packageFixture } from './review-package-fixtures';
import type { TopicContent } from '@/domain/topic-content';
const render = (content: TopicContent) =>
  renderToStaticMarkup(<ReleaseBodyV1 content={content} frozenPackage={packageFixture()} />);
describe('pinned release HTML safety and structure', () => {
  it('preserves ordered lists, marks and escaped text without executing HTML', () => {
    const html = render({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'orderedList',
          attrs: { start: 4, type: 'a' },
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: '<script>alert(1)</script>', marks: [{ type: 'bold' }, { type: 'italic' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(html).toContain('<ol start="4" type="a"><li>');
    expect(html).toContain('<em><strong>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
  it('preserves safe links and table spans/width/alignment', () => {
    const link = { type: 'text', text: 'Link', marks: [{ type: 'link', attrs: { href: 'https://example.test' } }] };
    const cell = {
      type: 'tableHeader',
      attrs: { colspan: 2, rowspan: 1, colwidth: [100, 120], align: 'center' },
      content: [{ type: 'paragraph', content: [link] }],
    };
    const html = render({
      type: 'doc',
      version: 1,
      content: [{ type: 'table', content: [{ type: 'tableRow', content: [cell] }] }],
    });
    expect(html).toContain('<table><tbody><tr><th colSpan="2" rowSpan="1"');
    expect(html).toContain('text-align:center;width:220px');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it('renders neutral frozen condition labels and callouts', () => {
    const html = render({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'callout',
          attrs: {
            kind: 'warning',
            conditions: { version: 1, values: [{ categoryId: 'category-a', valueId: 'value-a' }] },
          },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep this content' }] }],
        },
      ],
    });
    expect(html).toContain('role="note"');
    expect(html).toContain('Audience: Technician');
    expect(html).toContain('Keep this content');
  });
  it('fails closed on unsupported nodes and unsafe links', () => {
    expect(() => render({ type: 'doc', content: [{ type: 'futureNode' }] })).toThrow();
    expect(() =>
      render({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'unsafe', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});
