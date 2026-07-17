'use client'

// Membership Platform Phase 5 — a plain SVG ring, no charting library
// pulled in for one shape (matching this codebase's "arrows over a new
// dependency" judgment from CV Studio's Web Editor reorder panel).

export function ProgressRing({
  daysRemaining, totalDays, label,
}: {
  daysRemaining: number
  totalDays: number
  label: string
}) {
  const size = 108
  const stroke = 8
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = totalDays > 0 ? Math.max(0, Math.min(1, daysRemaining / totalDays)) : 0
  const offset = circumference * (1 - pct)
  const isLow = pct <= 0.2

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={isLow ? '#fbbf24' : '#ffffff'}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black tracking-tight text-white tabular-nums">{daysRemaining}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-white/70 text-center leading-tight px-2">{label}</span>
      </div>
    </div>
  )
}
