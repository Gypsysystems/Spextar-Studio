import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

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
  it('preserves each downloaded Figma vector byte-for-byte and uses Signature X for the favicon', () => {
    const approved = {
      'spextar-signature-x': '0d9bd10bf42e19f95751b19588e16d95fb87e5b6b6307b590ec3ff2e93d5e2d5',
      'spextar-wordmark-primary': 'a99658ceeb7c5a380c5a3c5c3ce4c80d606decb593e1a2d2848a7e36080fd377',
      'spextar-wordmark-reversed': '5741b9d7fbeb2b3752dacc858b8e2dc05a57cb5b6c05abe5025323d9d97c2c14',
    };
    for (const [name, hash] of Object.entries(approved)) {
      expect(createHash('sha256').update(readFileSync(`public/brand/${name}.svg`)).digest('hex')).toBe(hash);
    }
    expect(readFileSync('public/favicon.svg')).toEqual(readFileSync('public/brand/spextar-signature-x.svg'));
  });
});
