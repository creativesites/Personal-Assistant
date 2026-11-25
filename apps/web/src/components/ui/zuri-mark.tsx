import { cn } from '@/lib/cn'

/** Zuri's symbol (the logo without the wordmark) — use wherever Zuri itself is acting or speaking. */
export function ZuriMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/zuri-mark.png"
      alt="Zuri"
      width={size}
      height={size}
      className={cn('inline-block flex-shrink-0 select-none object-contain', className)}
      draggable={false}
    />
  )
}
