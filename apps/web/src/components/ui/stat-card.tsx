import { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  delta?: number
  icon?: ReactNode
  className?: string
}

export function StatCard({ label, value, delta, icon, className = '' }: StatCardProps) {
  const positive = delta !== undefined && delta > 0
  const negative = delta !== undefined && delta < 0

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 truncate">{label}</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{value}</p>
          {delta !== undefined && (
            <p className={`text-xs mt-2 font-medium ${positive ? 'text-green-600' : negative ? 'text-red-500' : 'text-gray-400'}`}>
              {positive ? '↑' : negative ? '↓' : '→'} {Math.abs(delta)}% vs last period
            </p>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
