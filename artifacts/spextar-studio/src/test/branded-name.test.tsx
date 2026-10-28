import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Folder } from 'lucide-react';
import { BrandedName, BrandedText } from '@/components/brand/logo';
import { EmptyState, ErrorState, NotFoundPanel } from '@/components/states';
import { Toaster } from '@/components/ui/toaster';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toasts: [{ id: 'branding', open: true, title: 'SPEXTAR', description: 'Welcome to SPEXTAR Studio.' }] }),
}));

function visibleCopy(element: HTMLElement) {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.sr-only').forEach(node => node.remove());
  return copy.textContent;
}

describe('visual product names', () => {
  afterEach(() => document.documentElement.classList.remove('dark'));

  it('keeps the sign-in heading accessible without a visible text-rendered product name', () => {
    render(<h1><BrandedText>Sign in to SPEXTAR</BrandedText></h1>);
    const heading = screen.getByRole('heading', { name: 'Sign in to SPEXTAR' });
    expect(visibleCopy(heading)).toBe('Sign in to ');
    expect(within(heading).getByText('SPEXTAR')).toHaveClass('sr-only');
    expect(within(heading).getByRole('img', { name: 'SPEXTAR' })).toBeVisible();
    const image = screen.getByTestId('spextar-inline-wordmark');
    expect(image).toHaveAttribute('width', '115');
    expect(image).toHaveAttribute('height', '20');
    expect(image).toHaveClass('h-[1em]', 'w-[5.75em]');
  });

  it('uses the official wordmark for mixed-case names and the unchanged Studio lockup', () => {
    const { container } = render(<BrandedText>Welcome to Spextar and SPEXTAR Studio.</BrandedText>);
    expect(screen.getByRole('img', { name: 'SPEXTAR' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'SPEXTAR Studio' })).toHaveClass('items-end', 'h-[20px]', 'gap-[6px]');
    expect(screen.getByTestId('spextar-studio-suffix')).toHaveClass('text-[16px]', 'leading-[12px]');
    expect(visibleCopy(container)).toBe('Welcome to  and Studio.');
    expect(container.querySelector('svg, text')).toBeNull();
  });

  it('follows theme changes while keeping explicit reversed ink on dark selection surfaces', async () => {
    render(<><BrandedName /><BrandedName tone="light" /></>);
    const images = screen.getAllByTestId('spextar-inline-wordmark');
    expect(images[0]).toHaveAttribute('src', '/brand/spextar-wordmark-primary.svg');
    expect(images[1]).toHaveAttribute('src', '/brand/spextar-wordmark-reversed.svg');
    await act(async () => { document.documentElement.classList.add('dark'); });
    expect(images[0]).toHaveAttribute('src', '/brand/spextar-wordmark-reversed.svg');
  });

  it('does not rewrite URLs, emails, paths, file names, or technical identifiers', () => {
    const text = 'https://spextar.example support@spextar.example /SPEXTAR/file SPEXTAR.json spextar_key';
    const { container } = render(<BrandedText>{text}</BrandedText>);
    expect(container.textContent).toBe(text);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('handles arrays, absent content and existing elements without changing their behavior', () => {
    render(<BrandedText>{[null, 'SPEXTAR', <button key="button">Continue</button>]}</BrandedText>);
    expect(screen.getByRole('img', { name: 'SPEXTAR' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('brands shared empty, error and missing-page copy rather than leaking a plain X', () => {
    render(<>
      <EmptyState icon={Folder} title="SPEXTAR library" body="Create a SPEXTAR project." />
      <ErrorState error={new Error('Invalid SPEXTAR file.')} title="SPEXTAR import failed" onRetry={() => {}} />
      <NotFoundPanel what="Page" detail="This SPEXTAR Studio page is unavailable." />
    </>);
    expect(screen.getAllByRole('img', { name: 'SPEXTAR' })).toHaveLength(4);
    expect(screen.getByRole('img', { name: 'SPEXTAR Studio' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('preserves the product name in toast live announcements as well as vector copy', async () => {
    render(<Toaster />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Welcome to SPEXTAR Studio.'));
    expect(screen.getByRole('img', { name: 'SPEXTAR' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'SPEXTAR Studio' })).toBeVisible();
  });
});
