import { test, expect, login, navigate, noOverflow, projectPath } from './fixture';

const pages = [
  { slug: 'reusable-content', title: 'Reusable Content', marker: 'reusable-page' },
  { slug: 'variables-conditions', title: 'Variables & Conditions', marker: 'text-variable-default' },
  { slug: 'settings', chunk: 'project-settings', title: 'Project settings', marker: 'project-settings-page' },
  { slug: 'review', title: 'Review', marker: 'review-page' },
] as const;
const chunkName = (item: typeof pages[number]) => 'chunk' in item ? item.chunk : item.slug;
const downloaded = (scripts: string[], name: string) => scripts.some(url => new RegExp(`/assets/${name}-[^/]+\\.js(?:\\?|$)`).test(url));

test('management chunks stay absent until sidebar navigation, preserve refresh and do not preload each other', async ({ page, backend, theme }) => {
  await login(page, projectPath);
  await expect(page.getByRole('heading', { name: 'Project A', exact: true })).toBeVisible();
  for (const item of pages) expect(downloaded(backend.scripts, chunkName(item))).toBe(false);
  expect(downloaded(backend.scripts, 'author')).toBe(false);
  expect(downloaded(backend.scripts, 'structured-editor')).toBe(false);
  for (const [index, item] of pages.entries()) {
    await navigate(page, `nav-${item.slug}`);
    await expect(page.getByTestId(item.marker)).toBeVisible();
    expect(downloaded(backend.scripts, chunkName(item))).toBe(true);
    for (const later of pages.slice(index + 1)) expect(downloaded(backend.scripts, chunkName(later))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
    await noOverflow(page);
  }
  expect(downloaded(backend.scripts, 'author')).toBe(false);
  expect(backend.writes).toHaveLength(0);
});

for (const item of pages) {
  test(`${item.title}: protected deep link, delayed chunk shell, refresh and lazy editor boundary`, async ({ page, backend, theme }) => {
    // Missing draft deliberately keeps Review's structured viewer unrequested.
    backend.db.topic_drafts = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/assets/${chunkName(item)}-*.js`, async route => { await gate; await route.continue(); });
    try {
      await page.goto(`${projectPath}/${item.slug}`);
      await expect(page.getByTestId('button-sign-in')).toBeVisible();
      for (const other of pages) expect(downloaded(backend.scripts, chunkName(other))).toBe(false);
      await login(page, `${projectPath}/${item.slug}`);
      await expect(page.getByRole('status', { name: `Loading ${item.title}` })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(item.title);
      await noOverflow(page);
    } finally { release(); }
    await expect(page.getByTestId(item.marker)).toBeVisible();
    expect(downloaded(backend.scripts, chunkName(item))).toBe(true);
    for (const other of pages.filter(other => other.slug !== item.slug)) expect(downloaded(backend.scripts, chunkName(other))).toBe(false);
    expect(downloaded(backend.scripts, 'structured-editor')).toBe(false);
    expect(downloaded(backend.scripts, 'review-draft-viewer')).toBe(false);
    expect(downloaded(backend.scripts, 'author')).toBe(false);
    await page.reload();
    await expect(page.getByTestId(item.marker)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
    await noOverflow(page);
    expect(backend.writes).toHaveLength(0);
  });
}
