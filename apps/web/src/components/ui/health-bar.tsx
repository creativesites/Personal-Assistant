interface HealthBarProps {
  score: number
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

function colorForScore(score: number) {
  if (score >= 80) return { bar: 'bg-green-500',   text: 'text-green-700',  label: 'Strong'  }
  if (score >= 60) return { bar: 'bg-emerald-400', text: 'text-emerald-700', label: 'Good'    }
  if (score >= 40) return { bar: 'bg-amber-400',   text: 'text-amber-700',  label: 'Fair'    }
  if (score >= 20) return { bar: 'bg-orange-400',  text: 'text-orange-700', label: 'Weak'    }
  return             { bar: 'bg-red-400',     text: 'text-red-700',    label: 'At Risk' }
}

export function HealthBar({ score, showLabel = false, size = 'md', className = '' }: HealthBarProps) {
  const pct = Math.min(100, Math.max(0, score))
  const { bar, text, label } = colorForScore(pct)
  const height = size === 'sm' ? 'h-1' : 'h-1.5'

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 bg-gray-100 rounded-full overflow-hidden ${height}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${bar}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Health score: ${pct}`}
        />
      </div>
      {showLabel && (
        <span className={`text-xs font-medium tabular-nums flex-shrink-0 ${text}`}>
          {pct} · {label}
        </span>
      )}
    </div>
  )
}
