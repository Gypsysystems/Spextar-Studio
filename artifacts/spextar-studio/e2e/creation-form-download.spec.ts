import { test, expect, login, activate, noOverflow } from './fixture';
import { creationChunkUrl, rejectCreationChunk } from './management-chunk-fixture';

for (const target of ['workspace', 'project'] as const) {
  const path = target === 'workspace' ? '/workspaces' : '/workspaces/ws-a/projects';
  const title = `Create ${target}`;
  const opener = `button-create-${target}`;
  const input = `input-${target}-name`;

  test(`${title}: form-only code is deferred, keyboard-accessible and preserves validation`, async ({ page, backend }) => {
    const url = await creationChunkUrl(target);
    await login(page, path);
    await expect(page.getByTestId(opener)).toBeVisible();
    expect(backend.scripts.filter(request => request === url)).toHaveLength(0);
    await page.getByTestId(opener).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId(input)).toBeFocused();
    await page.getByTestId(input).fill('x');
    await activate(page, dialog.getByRole('button', { name: title, exact: true }));
    await expect(dialog.getByText('Use at least 3 characters')).toBeVisible();
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await activate(page, page.getByTestId(opener));
    await expect(page.getByTestId(input)).toHaveValue('');
    await expect.poll(() => backend.scripts.filter(request => request === url).length).toBe(1);
    expect(backend.writes).toHaveLength(0);
  });

  test(`${title}: failed download can be closed safely and explicitly reloaded`, async ({ page, backend }) => {
    const fault = await rejectCreationChunk(page, target);
    try {
      await login(page, path);
      await activate(page, page.getByTestId(opener));
      await expect(page.getByRole('dialog', { name: `${title} unavailable` })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveText('No changes were made.');
      await noOverflow(page);
      await activate(page, page.getByRole('button', { name: 'Cancel', exact: true }));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId(opener)).toBeFocused();
      await fault.restore();
      await activate(page, page.getByTestId(opener));
      await expect(page.getByRole('button', { name: 'Reload Studio' })).toBeVisible();
      expect(fault.attempts).toBe(1);
      await activate(page, page.getByRole('button', { name: 'Reload Studio' }));
      await expect(page.getByTestId(opener)).toBeVisible();
      await activate(page, page.getByTestId(opener));
      await expect(page.getByTestId(input)).toBeVisible();
      expect(backend.writes).toHaveLength(0);
    } finally { await fault.restore(); }
  });
}
