import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LogoMark, Wordmark } from '@/components/brand/logo';
import { createDemoServices } from '@/services/demo-adapter';
import App from '@/App';
import userEvent from '@testing-library/user-event';

describe('approved vector lockup', () => {
  afterEach(() => document.documentElement.classList.remove('dark'));
  it.each([
    ['light', 'reversed'],
    ['dark', 'primary'],
  ] as const)('uses %s ink without text-rendering SPEXTAR', (tone, asset) => {
    const { container } = render(<Wordmark tone={tone} />);
    const lockup = screen.getByRole('img', { name: 'SPEXTAR Studio' });
    const vector = screen.getByTestId('spextar-vector-wordmark');
    expect(vector).toHaveAttribute('src', `/brand/spextar-wordmark-${asset}.svg`);
    expect(vector).toHaveAttribute('width', '115');
    expect(vector).toHaveAttribute('height', '20');
    expect(lockup).toHaveClass('inline-flex', 'items-baseline', 'gap-[6px]');
    const suffix = screen.getByText('Studio');
    expect(suffix).toHaveClass('text-[16px]', 'font-medium', 'leading-[20px]');
    expect(suffix).toHaveClass(tone === 'light' ? 'text-[#A7A7B0]' : 'text-[#5F5F6B]');
    expect(suffix.style.fontFamily).toContain('Inter');
    expect(container.textContent).toBe('Studio');
    expect(container.querySelector('svg')).toBeNull();
  });
  it('renders one reversed vector in dark mode and follows future light-theme changes', async () => {
    document.documentElement.classList.add('dark');
    render(<Wordmark />);
    expect(screen.getAllByTestId('spextar-vector-wordmark')).toHaveLength(1);
    expect(screen.getByTestId('spextar-vector-wordmark')).toHaveAttribute('src', '/brand/spextar-wordmark-reversed.svg');
    await act(async () => { document.documentElement.classList.remove('dark'); });
    expect(screen.getByTestId('spextar-vector-wordmark')).toHaveAttribute('src', '/brand/spextar-wordmark-primary.svg');
  });
  it('uses only reversed lockups on the default dark sign-in screen', async () => {
    document.documentElement.classList.add('dark');
    window.history.replaceState(null, '', '/sign-in');
    render(<App services={createDemoServices({ latencyMs: 0 })} />);
    await screen.findByRole('heading', { name: 'Sign in to SPEXTAR' });
    for (const vector of screen.getAllByTestId('spextar-vector-wordmark')) {
      expect(vector).toHaveAttribute('src', '/brand/spextar-wordmark-reversed.svg');
    }
  });
  it('loads the approved standalone Signature X for compact contexts', () => {
    render(<LogoMark />);
    expect(screen.getByRole('img', { name: 'SPEXTAR' })).toHaveAttribute('src', '/brand/spextar-signature-x.svg');
  });
  it('uses primary on light sign-in and reversed on its dark panel', async () => {
    window.history.replaceState(null, '', '/sign-in');
    render(<App services={createDemoServices({ latencyMs: 0 })} />);
    await screen.findByRole('heading', { name: 'Sign in to SPEXTAR' });
    const logos = screen.getAllByTestId('spextar-vector-wordmark');
    expect(logos[0].closest('section')).toHaveClass('bg-[hsl(var(--sidebar))]', 'dark:bg-card', 'text-white');
    expect(logos.map((logo) => logo.getAttribute('src'))).toEqual([
      '/brand/spextar-wordmark-reversed.svg', '/brand/spextar-wordmark-primary.svg',
    ]);
  });
  it('uses reversed in expanded navigation and Signature X when collapsed', async () => {
    const services = createDemoServices({ latencyMs: 0 });
    await services.auth.enterDemo();
    render(<App services={services} />);
    await screen.findByTestId('card-workspace-product-docs');
    expect(screen.getByTestId('spextar-vector-wordmark')).toHaveAttribute('src', '/brand/spextar-wordmark-reversed.svg');
    await userEvent.click(screen.getByTestId('button-toggle-nav'));
    expect(screen.getByRole('img', { name: 'SPEXTAR' })).toHaveAttribute('src', '/brand/spextar-signature-x.svg');
    expect(screen.queryByTestId('spextar-vector-wordmark')).not.toBeInTheDocument();
  });
});
