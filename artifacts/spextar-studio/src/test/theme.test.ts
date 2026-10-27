import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const fonts = readFileSync('src/fonts.css', 'utf8');
const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)![1];
const dark = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)![1];

function token(name: string): string {
  const declaration = new RegExp(`${name}:\\s*([^;]+);`);
  const value = (dark.match(declaration) ?? root.match(declaration))?.[1].trim();
  if (!value) throw new Error(`Missing theme token ${name}`);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  return alias ? token(alias[1]) : value;
}

function hex(hsl: string): string {
  const [h, saturation, lightness] = hsl.split(/\s+/).map(Number.parseFloat);
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

describe('Studio dark theme and local typography', () => {
  it('defaults the document to dark without locking out light semantic tokens', () => {
    expect(html).toMatch(/<html[^>]+class="dark"/);
    expect(html).toContain('hsl(var(--background,');
    expect(html).toContain('hsl(var(--foreground,');
    expect(root).toContain('color-scheme: light');
    expect(dark).toContain('color-scheme: dark');
    expect(root).toContain('--background: 250 22% 98%');
    expect(html).not.toContain('maximum-scale');
  });

  it.each([
    ['--background', '#111114'],
    ['--sidebar', '#111114'],
    ['--card', '#1C1C21'],
    ['--surface-raised', '#27272D'],
    ['--foreground', '#F7F8FA'],
    ['--muted-foreground', '#A7A7B0'],
    ['--primary', '#6236FF'],
  ])('resolves %s to the approved %s colour', (name, expected) => {
    expect(hex(token(name))).toBe(expected);
  });

  it('distinguishes stronger input borders from subtle surface borders', () => {
    const lightness = (name: string) => Number.parseFloat(token(name).split(/\s+/)[2]);
    expect(lightness('--input')).toBeGreaterThan(lightness('--border'));
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('uses locally served Inter for all font aliases and authoring prose', () => {
    expect(css).toContain("@import './fonts.css'");
    expect(css).toContain("--app-font-sans: 'Inter'");
    expect(css).toContain('--app-font-serif: var(--app-font-sans)');
    expect(css).toContain('--app-font-mono: var(--app-font-sans)');
    expect(css).toMatch(/\.prose-doc\s*\{[^}]*font-family: var\(--app-font-sans\)/);
    expect(css + html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|Instrument Sans|Newsreader|JetBrains Mono/);
  });

  it('ships licensed upright and italic variable fonts with local URLs', () => {
    for (const name of ['InterVariable.woff2', 'InterVariable-Italic.woff2']) {
      expect(fonts).toContain(`url('./assets/fonts/${name}')`);
      expect(readFileSync(`src/assets/fonts/${name}`).subarray(0, 4).toString()).toBe('wOF2');
    }
    expect(fonts.match(/font-weight: 100 900/g)).toHaveLength(2);
    expect(fonts).toContain('font-style: italic');
    const license = readFileSync('src/assets/fonts/OFL.txt', 'utf8');
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(readFileSync('public/fonts/OFL.txt', 'utf8')).toBe(license);
  });
});
