import '@/features/review/review-draft-viewer';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { createReviewViewer } from '@/pages/review';

import { createDemoServices } from '@/services/demo-adapter';

import { emptyContent } from '@/domain/topic-content';


describe('Review demo inspection', () => {
  it('keeps demo inspection explicitly sample-only and isolated from persistence/recovery', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    await services.auth.enterDemo();
    const get = vi.spyOn(services.topicDrafts, 'get'), save = vi.spyOn(services.topicDrafts, 'save');
    const fetch = vi.spyOn(globalThis, 'fetch');
    window.history.replaceState(null, '', '/workspaces/product-docs/projects/meridian-x4-user-guide/review?document=mx4-measurement');
    render(<App services={services} />);
    expect(await screen.findByTestId('review-demo-note')).toHaveTextContent('Not a saved draft, no revision exists');
    expect(await screen.findByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'false');
    expect(screen.queryByTestId('review-draft-revision')).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});

describe('Review viewer download boundary', () => {
  it('delays loading the engine behind a visible fallback', async () => {
    let release!: (value: { default: () => React.ReactNode }) => void;
    const load = vi.fn(() => new Promise<{ default: () => React.ReactNode }>((resolve) => { release = resolve; }));
    const Viewer = createReviewViewer(load);
    expect(load).not.toHaveBeenCalled();
    render(<Viewer content={emptyContent()} />);
    expect(screen.getByTestId('review-viewer-loading')).toBeVisible();
    release({ default: () => <p>Loaded read-only viewer</p> });
    expect(await screen.findByText('Loaded read-only viewer')).toBeVisible();
  });
  it('provides explicit page reload recovery after a failed module download', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const Viewer = createReviewViewer(async () => { throw new Error('Download offline'); });
      render(<Viewer content={emptyContent()} />);
      expect(await screen.findByTestId('review-viewer-error')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Reload page' })).toBeEnabled();
      expect(screen.queryByRole('textbox', { name: 'Topic body' })).not.toBeInTheDocument();
    } finally { log.mockRestore(); }
  });
});
