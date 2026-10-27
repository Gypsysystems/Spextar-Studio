import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

/** Frozen Figma vectors, saved verbatim locally. Never recreate the wordmark in text. */
const brandAsset = (name: string) => `${import.meta.env.BASE_URL}brand/${name}.svg`;

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const isDarkTheme = () => document.documentElement.classList.contains('dark');
const defaultServerTheme = () => true;

export function LogoMark({ className, title = 'SPEXTAR' }: { className?: string; title?: string }) {
  return (
    <img
      src={brandAsset('spextar-signature-x')}
      width={32}
      height={32}
      className={cn('h-8 w-8 shrink-0', className)}
      alt={title}
    />
  );
}

export function Wordmark({ className, tone = 'auto' }: { className?: string; tone?: 'auto' | 'dark' | 'light' }) {
  const darkTheme = useSyncExternalStore(subscribeToTheme, isDarkTheme, defaultServerTheme);
  // Explicit tones describe ink, not the background. Keep the dark sidebar's
  // reversed lockup independent of a future page-theme preference.
  const lightInk = tone === 'auto' ? darkTheme : tone === 'light';
  return (
    <span
      role="img"
      aria-label="SPEXTAR Studio"
      className={cn('inline-flex shrink-0 items-center gap-[6px] whitespace-nowrap', className)}
      data-testid="spextar-lockup"
    >
      <img
        src={brandAsset(lightInk ? 'spextar-wordmark-reversed' : 'spextar-wordmark-primary')}
        width={115}
        height={20}
        className="h-[20px] w-[115px] shrink-0"
        alt=""
        aria-hidden="true"
        data-testid="spextar-vector-wordmark"
      />
      <span
        className={cn('text-[12px] font-medium leading-[16px]', lightInk ? 'text-[#A7A7B0]' : 'text-[#5F5F6B]')}
        style={{ fontFamily: 'Inter, sans-serif' }}
        aria-hidden="true"
      >
        Studio
      </span>
    </span>
  );
}
