'use client'

export function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const sw = 6
  const r = (size - sw * 2) / 2
  const cx = size / 2
  const circumference = 2 * Math.PI * r
  const color = score >= 70 ? '#4f46e5' : score >= 40 ? '#f59e0b' : '#ef4444'
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold text-gray-900 leading-none">{score}</span>
        <span className="text-[9px] font-bold leading-none mt-0.5" style={{ color }}>{grade}</span>
      </div>
    </div>
  )
}
