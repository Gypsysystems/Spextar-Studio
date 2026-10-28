import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const opticalCenter = '<circle id="signature-x-center" cx="56.5" cy="10" r="2.4" fill="#6236FF"/>';
const originalCenter = '<path id="Vector_16" d="M56.5 11.71C57.4444 11.71 58.21 10.9444 58.21 10C58.21 9.05559 57.4444 8.29 56.5 8.29C55.5556 8.29 54.79 9.05559 54.79 10C54.79 10.9444 55.5556 11.71 56.5 11.71Z" fill="#6236FF"/>';

describe('frozen branding regression', () => {
  it('keeps exact SPEXTAR Violet in the primary tokens, logo, and favicon', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toContain('--spextar-violet: #6236FF;');
    expect(css.match(/--primary: var\(--spextar-violet-hsl\);/g)).toHaveLength(2);
    expect(css).not.toContain('--primary: 253 100% 61%');
    const values = css.match(/--spextar-violet-hsl: ([\d.]+) 100% ([\d.]+)%/)!;
    const hue = Number(values[1]) / 60;
    const lightness = Number(values[2]) / 100;
    const chroma = 1 - Math.abs(2 * lightness - 1);
    const red = chroma * (hue - 4) + lightness - chroma / 2;
    const green = lightness - chroma / 2;
    expect([red, green, lightness + chroma / 2].map((n) => Math.round(n * 255))).toEqual([98, 54, 255]);
    expect(readFileSync('public/brand/spextar-signature-x.svg', 'utf8')).toContain('#6236FF');
  });
  it('preserves the original vectors byte-for-byte except the authorized optical center, and keeps the favicon unchanged', () => {
    const approved = {
      'spextar-signature-x': '0d9bd10bf42e19f95751b19588e16d95fb87e5b6b6307b590ec3ff2e93d5e2d5',
      'spextar-wordmark-primary': 'a99658ceeb7c5a380c5a3c5c3ce4c80d606decb593e1a2d2848a7e36080fd377',
      'spextar-wordmark-reversed': '5741b9d7fbeb2b3752dacc858b8e2dc05a57cb5b6c05abe5025323d9d97c2c14',
    };
    for (const [name, hash] of Object.entries(approved)) {
      const svg = readFileSync(`public/brand/${name}.svg`, 'utf8');
      if (name !== 'spextar-signature-x') expect(svg).toContain(opticalCenter);
      // Restoring just the original center must reproduce the original approved
      // checksum: no X segment, other letter, ink, dimension or spacing may drift.
      expect(createHash('sha256').update(svg.replace(opticalCenter, originalCenter)).digest('hex')).toBe(hash);
    }
    expect(readFileSync('public/favicon.svg')).toEqual(readFileSync('public/brand/spextar-signature-x.svg'));
  });
  it.each(['primary', 'reversed'])('keeps the %s wordmark center violet, circular and separate from all four X segments', variant => {
    const svg = new DOMParser().parseFromString(readFileSync(`public/brand/spextar-wordmark-${variant}.svg`, 'utf8'), 'image/svg+xml');
    const center = svg.querySelector('#signature-x-center')!;
    expect(center.tagName).toBe('circle');
    expect(center.getAttribute('fill')).toBe('#6236FF');
    expect(center.getAttribute('cx')).toBe('56.5');
    expect(center.getAttribute('cy')).toBe('10');
    expect(center.getAttribute('r')).toBe('2.4');
    expect(center.hasAttribute('filter')).toBe(false);
    expect(svg.querySelectorAll('#Group_4 > path')).toHaveLength(4);
    expect(svg.querySelectorAll('text')).toHaveLength(0);
    // Closest arm tips must retain visible clearance around the enlarged dot.
    expect(Math.hypot(56.5 - 55.015, 10 - 5.92) - 2.4).toBeGreaterThan(1.5);
    expect(Math.hypot(56.5 - 53.525, 10 - 6.84) - 2.4).toBeGreaterThan(1.5);
  });
});
