import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Locator, test } from '@playwright/test';

export async function accessible(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  if (result.violations.length || result.incomplete.length) {
    await test.info().attach('accessibility-results', {
      body: JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2),
      contentType: 'application/json',
    });
  }
  expect(result.violations.map(v => ({
    id: v.id, impact: v.impact,
    nodes: v.nodes.map(n => ({ target: n.target, html: n.html, summary: n.failureSummary })),
  })), 'No automated WCAG A/AA or best-practice accessibility violations').toEqual([]);
}
/** Native keyboard traversal only; no DOM focus injection or forced clicks. */
export async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 120; i++) {
    if (await target.evaluate(el => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Control is not reachable through the native tab order');
}
export async function visibleFocus(target: Locator) {
  await expect(target).toBeFocused();
  expect(await target.evaluate(el => {
    const style = getComputedStyle(el);
    return el.matches(':focus-visible') && (
      (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0)
       // A normal drop shadow is not a focus indicator: require a zero-blur
       // outline-like shadow with a positive spread (the computed focus ring).
       || /0px 0px 0px (?:[1-9]\d*(?:\.\d+)?|0\.\d+)px/.test(style.boxShadow)
    );
  }), 'Keyboard focus has a visible outline or ring').toBe(true);
}
/** Input boundaries must remain distinguishable even before keyboard focus.
 * Compute solid/alpha ancestor backgrounds, not a guessed page background. */
export async function inputBoundaryContrast(target: Locator) {
  const ratio = await target.evaluate(el => {
    const rgba = (value: string) => {
      const values = value.match(/[\d.]+/g)?.map(Number);
      if (!/^rgba?\(/.test(value) || !values || values.length < 3 || values.length > 4) {
        throw new Error('Unsupported computed color in contrast assertion');
      }
      return [values[0] / 255, values[1] / 255, values[2] / 255, values[3] ?? 1];
    };
    const stack: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) stack.push(node);
    let background = [1, 1, 1];
    for (const node of stack.reverse()) {
      const color = rgba(getComputedStyle(node).backgroundColor);
      background = background.map((channel, i) => color[i] * color[3] + channel * (1 - color[3]));
    }
    const border = rgba(getComputedStyle(el).borderTopColor);
    const foreground = background.map((channel, i) => border[i] * border[3] + channel * (1 - border[3]));
    const luminance = (color: number[]) => color
      .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  expect(ratio, 'Unfocused input boundary has at least 3:1 contrast against its actual background').toBeGreaterThanOrEqual(3);
}
export async function trapped(page: Page, dialog: Locator) {
  const count = await dialog.locator('button:enabled, input:enabled, select:enabled, textarea:enabled, a[href], [tabindex="0"]').count();
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < count + 2; i++) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate(el => el.contains(document.activeElement)), 'Modal traps native keyboard focus').toBe(true);
    }
  }
}
