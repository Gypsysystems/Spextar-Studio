import { expect, type Locator, type Page } from '@playwright/test';

/** Check painted glyph alignment and the unmodified boxes, not just a baseline marker. */
export async function expectBottomAlignedStudio(lockup: Locator) {
  await expect(lockup).toHaveCSS('height', '20px');
  const suffix = lockup.getByTestId('spextar-studio-suffix');
  await expect(suffix).toHaveCSS('font-size', '16px');
  const alignment = await suffix.evaluate(async el => {
    await document.fonts.ready;
    const frame = el.parentElement!;
    const image = frame.querySelector<HTMLImageElement>('[data-testid="spextar-vector-wordmark"]')!;
    await image.decode();
    const imageBottom = image.getBoundingClientRect().bottom;
    // Record the normal layout before adding the diagnostic marker.
    const boxDifference = Math.abs(el.getBoundingClientRect().bottom - imageBottom);
    const frameDifference = Math.abs(frame.getBoundingClientRect().bottom - imageBottom);
    const style = getComputedStyle(el);
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = context.measureText('Studio');
    const baseline = document.createElement('span');
    Object.assign(baseline.style, { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' });
    el.append(baseline);
    const glyphBottom = baseline.getBoundingClientRect().top + metrics.actualBoundingBoxDescent;
    baseline.remove();
    return { boxDifference, frameDifference, inkDifference: Math.abs(glyphBottom - imageBottom) };
  });
  expect(alignment.boxDifference).toBeLessThanOrEqual(0.5);
  expect(alignment.frameDifference).toBeLessThanOrEqual(0.5);
  expect(alignment.inkDifference).toBeLessThanOrEqual(0.5);
}

export async function expectNoPlainProductName(page: Page) {
  const plainNames = await page.evaluate(() => {
    const result: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, textarea, option, .sr-only, [aria-hidden="true"], [contenteditable]')) continue;
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 1 && rect.height <= 1) continue; // Clipped live-announcement text is non-visual.
      if (parent.checkVisibility() && /\bSPEXTAR\b/i.test(node.textContent ?? '')) result.push(node.textContent!);
    }
    return result;
  });
  expect(plainNames).toEqual([]);
}

/** Rasterize the actual local asset; an SVG fill string alone cannot prove visibility. */
export async function expectVisibleSignatureCenter(image: Locator) {
  await expect(image).toHaveCSS('opacity', '1');
  await expect(image).toHaveCSS('filter', 'none');
  const samples = await image.evaluate(async element => {
    const img = element as HTMLImageElement;
    await img.decode();
    const results: { height: number; density: number; background: string; purplePixels: number }[] = [];
    for (const height of [12, 14, 16, 20, 24]) for (const density of [1, 2]) for (const background of ['#111114', '#FFFFFF']) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(115 * height / 20 * density);
      canvas.height = height * density;
      const context = canvas.getContext('2d')!;
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let purplePixels = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i] - 98) <= 1 && Math.abs(pixels[i + 1] - 54) <= 1 && pixels[i + 2] === 255 && pixels[i + 3] === 255) purplePixels++;
      }
      results.push({ height, density, background, purplePixels });
    }
    return results;
  });
  for (const sample of samples) {
    const minimum = sample.height === 12 ? 1 : sample.height === 14 ? 2 : sample.height === 16 ? 4 : sample.height === 20 ? 8 : 12;
    expect(sample.purplePixels, JSON.stringify(sample)).toBeGreaterThanOrEqual(minimum * sample.density ** 2);
  }
}
