import { cn } from '@/lib/utils';

/** Frozen Figma vectors, saved verbatim locally. Never recreate the wordmark in text. */
const brandAsset = (name: string) => `${import.meta.env.BASE_URL}brand/${name}.svg`;

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

export function Wordmark({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <span
      role="img"
      aria-label="SPEXTAR Studio"
      className={cn('inline-flex shrink-0 items-center gap-[6px] whitespace-nowrap', className)}
      data-testid="spextar-lockup"
    >
      <img
        src={brandAsset(tone === 'light' ? 'spextar-wordmark-reversed' : 'spextar-wordmark-primary')}
        width={115}
        height={20}
        className="h-[20px] w-[115px] shrink-0"
        alt=""
        aria-hidden="true"
        data-testid="spextar-vector-wordmark"
      />
      <span
        className="text-[12px] font-medium leading-[16px] text-[#A7A7B0]"
        style={{ fontFamily: "'Inter', sans-serif" }}
        aria-hidden="true"
      >
        Studio
      </span>
    </span>
  );
}
