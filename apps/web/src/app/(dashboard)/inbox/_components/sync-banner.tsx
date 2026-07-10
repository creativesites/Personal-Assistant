'use client'

import { CheckCircle, X } from 'lucide-react'

export function SyncBanner({
  syncing,
  done,
  convCount,
  onDismiss,
}: {
  syncing: boolean
  done: boolean
  convCount: number
  onDismiss: () => void
}) {
  if (!syncing && !done) return null

  if (done) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-b border-emerald-100 animate-in fade-in duration-300">
        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <CheckCircle size={10} className="text-white" />
        </div>
        <span className="text-xs text-emerald-700 flex-1 font-medium">
          Sync complete — {convCount.toLocaleString()} conversation{convCount !== 1 ? 's' : ''} ready
        </span>
        <button onClick={onDismiss} className="text-emerald-400 hover:text-emerald-600 transition-colors p-0.5">
          <X size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 py-2.5 bg-indigo-50 border-b border-indigo-100">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse flex-shrink-0" />
          <span className="text-xs font-semibold text-indigo-800">Syncing WhatsApp history</span>
        </div>
        {convCount > 0 && (
          <span className="text-[10px] text-indigo-500 font-medium tabular-nums">
            {convCount.toLocaleString()} conv{convCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="h-1 bg-indigo-100 rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-indigo-300 via-indigo-500 to-indigo-300 rounded-full animate-[indeterminate_1.4s_ease-in-out_infinite]" />
      </div>
      <p className="text-[10px] text-indigo-500 mt-1.5 leading-none">
        Loading conversations as we go — keep working normally
      </p>
    </div>
  )
}
