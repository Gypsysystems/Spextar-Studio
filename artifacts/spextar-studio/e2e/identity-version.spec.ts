import { test, expect, login, activate, noOverflow, projectPath } from './fixture';

const creator = '11111111-1111-4111-8111-111111111111';
const candidate = '22222222-2222-4222-8222-222222222222';
test.beforeEach(({ backend }) => { backend.management.enabled = true; });

test('owners, creators, saved-by identities and unset versions are readable across implemented views', async ({ page, backend }) => {
  backend.db.profiles.push({ id: creator, display_name: 'Harper Editor', avatar_url: null });
  backend.db.projects[0].created_by = creator;
  backend.db.documents[0].created_by = creator;
  backend.db.documents[0].settings = { version: '—' };
  backend.db.topic_drafts[0].updated_by = creator; backend.captureReview(); backend.db.document_reviews[0].submitted_by = creator;
  backend.db.reusable_contents.push({
    id: 'reuse-a', workspace_id: 'ws-a', project_id: 'project-a', scope: 'project',
    name: 'QA reusable', slug: 'qa-reusable', description: null, settings: {},
    status: 'draft', update_policy: 'notify', tags: [], created_by: creator,
    created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z',
  });
  await login(page, projectPath);
  for (const suffix of ['', '/documents', '/author/doc-a', '/review', '/reusable-content']) {
    if (suffix) await page.goto(projectPath + suffix);
    await expect(page.locator('body')).toContainText('Harper Editor');
    await expect(page.locator('body')).not.toContainText(creator);
    if (suffix !== '/reusable-content') await expect(page.locator('body')).toContainText('Unversioned');
    if (suffix === '/review') await expect(page.getByTestId('text-draft-updated-by')).toHaveText('Harper Editor');
    await noOverflow(page);
  }
  expect(backend.writes).toEqual([]);
});

test('member controls and confirmations use names while retaining internal membership IDs', async ({ page, backend }) => {
  backend.setRole('admin');
  backend.db.profiles.push(
    { id: creator, display_name: 'Harper Editor', avatar_url: null },
    { id: candidate, display_name: 'Taylor Writer', avatar_url: null },
  );
  backend.db.project_members.push({ project_id: 'project-a', user_id: creator, role: 'reviewer' });
  backend.db.workspace_members.push(
    { workspace_id: 'ws-a', user_id: creator, role: 'member' },
    { workspace_id: 'ws-a', user_id: candidate, role: 'member' },
  );
  await login(page, projectPath + '/settings');
  await expect(page.getByTestId(`text-member-id-${creator}`)).toHaveText('Harper Editor');
  await expect(page.getByTestId('select-add-user').locator(`option[value="${candidate}"]`)).toHaveText('Taylor Writer');
  await expect(page.getByTestId(`button-remove-${creator}`)).toHaveAccessibleName('Remove Harper Editor');
  await activate(page, page.getByTestId(`button-remove-${creator}`));
  const dialog = page.getByTestId('dialog-confirm');
  await expect(dialog).toContainText('Harper Editor');
  await expect(dialog).not.toContainText(creator);
  await activate(page, dialog.getByRole('button', { name: 'Cancel', exact: true }));
  await expect(page.locator('body')).not.toContainText(creator);
  await expect(page.locator('body')).not.toContainText(candidate);
  await noOverflow(page);
  expect(backend.writes).toEqual([]);
});
