import { createHash } from 'node:crypto';
import { test, expect, login, activate, noOverflow, projectPath } from './fixture';
import { accessible, tabTo, visibleFocus } from './accessibility-helpers';
type Row = Record<string, unknown>;
function canonical(v: unknown): string {
  return v === null || typeof v !== 'object'
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canonical).join(',')}]`
      : `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical((v as Row)[k])}`)
          .join(',')}}`;
}
const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
function release(r: Row, key: string) {
  const source = {
    schemaVersion: 1,
    rendererVersion: 1,
    reviewId: r.id,
    projectId: r.project_id,
    documentId: r.document_id,
    submittedBy: r.submitted_by,
    submittedAt: r.submitted_at,
    approvedBy: r.decided_by,
    approvedAt: r.decided_at,
    document: r.document_snapshot,
    topics: r.topics_snapshot,
    dependencies: r.dependency_package,
  };
  const row = {
    id: '00000000-0000-4000-8000-000000000001',
    project_id: 'project-a',
    document_id: 'doc-a',
    review_id: r.id,
    sequence: 1,
    state: 'published',
    package_schema_version: 1,
    resolver_version: 1,
    renderer_version: 1,
    canonicalization: 'spextar-json-v1',
    frozen_source: source,
    package_digest: digest(source),
    manifest_digest: '',
    published_by: 'user-a',
    published_at: '2026-10-30T00:00:00Z',
    request_key: key,
    audit: { action: 'publish', publishedAt: '2026-10-30T00:00:00Z' },
  };
  row.manifest_digest = digest({
    schemaVersion: 1,
    releaseId: row.id,
    projectId: row.project_id,
    documentId: row.document_id,
    reviewId: row.review_id,
    sequence: row.sequence,
    packageDigest: row.package_digest,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    requestKey: key,
    audit: row.audit,
  });
  return row;
}
function prepare(backend: import('./fixture').Backend) {
  backend.setRole('admin');
  backend.db.topic_drafts.push({
    topic_id: 'topic-b',
    content: { type: 'doc', version: 1, content: [] },
    revision: 1,
    updated_at: '2026-10-27T10:00:00Z',
    updated_by: 'user-a',
  });
  backend.captureReview();
  const review = backend.db.document_reviews[0];
  Object.assign(review, { status: 'approved', decided_by: 'user-a', decided_at: '2026-10-29T13:00:00Z' });
  backend.db.documents[0].status = 'approved';
  backend.db.document_releases = [];
  return review;
}
test('publish confirmation, numbered success and retained read-only inspection', async ({ page, backend }) => {
  const review = prepare(backend);
  await page.route('**/rest/v1/rpc/publish_document_release', async (route) => {
    const args = route.request().postDataJSON() as Row;
    expect(Object.keys(args).sort()).toEqual(
      ['p_project_id', 'p_document_id', 'p_review_id', 'p_expected_updated_at', 'p_request_key'].sort(),
    );
    const row = release(review, String(args.p_request_key));
    backend.db.document_releases.push(row);
    backend.db.documents[0].status = 'published';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row.id) });
  });
  await login(page, projectPath + '/publish');
  const publish = page.getByRole('button', { name: 'Publish', exact: true });
  await expect(publish).toBeEnabled();
  await tabTo(page, publish);
  await visibleFocus(publish);
  await page.keyboard.press('Enter');
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(publish).toBeFocused();
  await activate(page, publish);
  await activate(page, page.getByRole('button', { name: 'Confirm publish' }));
  await expect(page.getByText('Published Release 1.', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Release 1' })).toContainText('Current saved QA topic');
  expect(backend.db.document_releases).toHaveLength(1);
  backend.db.topic_drafts = [];
  backend.db.project_variables = [];
  backend.reads.length = 0;
  await page.reload();
  await activate(page, page.getByRole('button', { name: 'Release 1', exact: true }));
  await expect(page.getByRole('article')).toContainText('Current saved QA topic');
  expect(
    backend.reads.filter((r) =>
      [
        'topic_drafts',
        'project_variables',
        'condition_categories',
        'condition_values',
        'reusable_contents',
        'reusable_content_drafts',
      ].includes(r.table),
    ),
  ).toEqual([]);
  await noOverflow(page);
  await accessible(page);
});
test('uncertain committed response recovers by request key without another publication', async ({ page, backend }) => {
  const review = prepare(backend);
  let calls = 0;
  await page.route('**/rest/v1/rpc/publish_document_release', async (route) => {
    calls++;
    const args = route.request().postDataJSON() as Row;
    backend.db.document_releases.push(release(review, String(args.p_request_key)));
    backend.db.documents[0].status = 'published';
    await route.abort('connectionfailed');
  });
  await login(page, projectPath + '/publish');
  await activate(page, page.getByRole('button', { name: 'Publish', exact: true }));
  await activate(page, page.getByRole('button', { name: 'Confirm publish' }));
  await expect(page.getByText(/Publication status is uncertain/).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await activate(page, page.getByRole('button', { name: 'Check publication status and retry safely' }));
  await expect(page.getByText('Published Release 1.', { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  expect(backend.db.document_releases).toHaveLength(1);
  await accessible(page);
});
test('stale confirmation fails closed and offers refreshed eligibility', async ({ page, backend }) => {
  prepare(backend);
  await page.route('**/rest/v1/rpc/publish_document_release', (route) =>
    route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '40001' }) }),
  );
  await login(page, projectPath + '/publish');
  await activate(page, page.getByRole('button', { name: 'Publish', exact: true }));
  await activate(page, page.getByRole('button', { name: 'Confirm publish' }));
  await expect(page.getByRole('dialog')).toContainText('approved document changed');
  expect(backend.db.document_releases).toHaveLength(0);
  await accessible(page);
});
for (const role of ['author', 'reviewer', 'viewer'] as const)
  test(`${role} can inspect but cannot publish`, async ({ page, backend }) => {
    prepare(backend);
    backend.setRole(role);
    await login(page, projectPath + '/publish');
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
    await expect(page.getByText('Only an explicit Project Admin may publish.')).toBeVisible();
    await noOverflow(page);
    await accessible(page);
  });
test('legacy package is blocked and empty release history is clear', async ({ page, backend }) => {
  prepare(backend).dependency_package = null;
  await login(page, projectPath + '/publish');
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  await expect(page.getByText('A new approved review with frozen dependencies is required.')).toBeVisible();
  await expect(page.getByText('No releases yet.')).toBeVisible();
  await accessible(page);
});
test('release service errors block publication and recover through Refresh', async ({ page, backend }) => {
  prepare(backend);
  backend.failures.add('document_releases');
  await login(page, projectPath + '/publish');
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
  backend.failures.delete('document_releases');
  await activate(page, page.getByRole('button', { name: /Retry|Try again/i }));
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
  await accessible(page);
});
