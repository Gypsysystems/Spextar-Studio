import { expect, type Locator } from '@playwright/test';

/** Rasterize the actual local asset; an SVG fill string alone cannot prove visibility. */
export async function expectVisibleSignatureCenter(image: Locator) {
  await expect(image).toHaveCSS('opacity', '1');
  await expect(image).toHaveCSS('filter', 'none');
  const samples = await image.evaluate(async element => {
    const img = element as HTMLImageElement;
    await img.decode();
    const results: { height: number; density: number; background: string; purplePixels: number }[] = [];
    for (const height of [16, 20, 24]) for (const density of [1, 2]) for (const background of ['#111114', '#FFFFFF']) {
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
    const minimum = sample.height === 16 ? 4 : sample.height === 20 ? 8 : 12;
    expect(sample.purplePixels, JSON.stringify(sample)).toBeGreaterThanOrEqual(minimum * sample.density ** 2);
  }
}
