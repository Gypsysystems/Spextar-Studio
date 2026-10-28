import { Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Approved local vectors with optically strengthened X centers. Never recreate the wordmark in text. */
const brandAsset = (name: string) => `${import.meta.env.BASE_URL}brand/${name}.svg`;

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const isDarkTheme = () => document.documentElement.classList.contains('dark');
const defaultServerTheme = () => true;
type BrandTone = 'auto' | 'dark' | 'light';

function useLightInk(tone: BrandTone) {
  const darkTheme = useSyncExternalStore(subscribeToTheme, isDarkTheme, defaultServerTheme);
  return tone === 'auto' ? darkTheme : tone === 'light';
}

function VectorWordmark({ lightInk, inline = false }: { lightInk: boolean; inline?: boolean }) {
  return (
    <img
      src={brandAsset(lightInk ? 'spextar-wordmark-reversed' : 'spextar-wordmark-primary')}
      width={115}
      height={20}
      className={cn('shrink-0', inline ? 'h-[1em] w-[5.75em]' : 'h-[20px] w-[115px]')}
      alt=""
      aria-hidden="true"
      data-testid={inline ? 'spextar-inline-wordmark' : 'spextar-vector-wordmark'}
    />
  );
}

/** Inline product name: official vector lettering, never a text-rendered X. */
export function BrandedName({ tone = 'auto' }: { tone?: BrandTone }) {
  const lightInk = useLightInk(tone);
  return (
    <span role="img" aria-label="SPEXTAR" className="inline-flex items-baseline whitespace-nowrap align-baseline" data-testid="spextar-branded-name">
      <span className="sr-only">SPEXTAR</span>
      <VectorWordmark lightInk={lightInk} inline />
    </span>
  );
}

/** Application-owned copy only; leaves editable content, URLs and technical identifiers intact. */
export function BrandedText({ children, tone = 'auto' }: { children: ReactNode; tone?: BrandTone }): ReactNode {
  if (Array.isArray(children)) return children.map((child, index) => <Fragment key={index}><BrandedText tone={tone}>{child}</BrandedText></Fragment>);
  if (typeof children !== 'string') return children;
  // A domain/email/path/identifier is not a visual product-name occurrence.
  return children.split(/((?<![\w@./-])SPEXTAR(?:[ \t]+Studio)?(?![\w@/-]|\.[\w]))/gi).map((part, index) =>
    /^SPEXTAR[ \t]+Studio$/i.test(part) ? <Wordmark key={index} tone={tone} className="align-baseline" /> :
      /^SPEXTAR$/i.test(part) ? <BrandedName key={index} tone={tone} /> : part);
}

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

export function Wordmark({ className, tone = 'auto' }: { className?: string; tone?: BrandTone }) {
  // Explicit tones describe ink, not the background. Keep the dark sidebar's
  // reversed lockup independent of a future page-theme preference.
  const lightInk = useLightInk(tone);
  return (
    <span
      role="img"
      aria-label="SPEXTAR Studio"
      className={cn('inline-flex h-[20px] shrink-0 items-end gap-[6px] whitespace-nowrap', className)}
      data-testid="spextar-lockup"
    >
      <span className="sr-only">SPEXTAR Studio</span>
      <VectorWordmark lightInk={lightInk} />
      <span
        // Inter Medium's "Studio" ink is 12px high at 16px. A tight line box
        // removes invisible descender space so frame, ink and vector end together.
        className={cn('text-[16px] font-medium leading-[12px]', lightInk ? 'text-[#A7A7B0]' : 'text-[#5F5F6B]')}
        style={{ fontFamily: 'Inter, sans-serif' }}
        aria-hidden="true"
        data-testid="spextar-studio-suffix"
      >
        Studio
      </span>
    </span>
  );
}
