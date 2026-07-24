'use client'

import React from 'react'
import { HelpCircle, Sparkles } from 'lucide-react'
import { useGuidedTour } from './guided-tour-provider'

interface TourTriggerButtonProps {
  variant?: 'button' | 'icon' | 'badge' | 'menu-item'
  className?: string
}

export function TourTriggerButton({
  variant = 'button',
  className = '',
}: TourTriggerButtonProps) {
  const { startTour } = useGuidedTour()

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={startTour}
        data-tour="tour-trigger"
        title="Product Tour"
        className={`p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors ${className}`}
      >
        <HelpCircle size={18} />
      </button>
    )
  }

  if (variant === 'badge') {
    return (
      <button
        type="button"
        onClick={startTour}
        data-tour="tour-trigger"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all ${className}`}
      >
        <Sparkles size={11} className="text-indigo-400 fill-indigo-400/20" />
        <span>Product Tour</span>
      </button>
    )
  }

  if (variant === 'menu-item') {
    return (
      <button
        type="button"
        onClick={startTour}
        data-tour="tour-trigger"
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-colors text-left ${className}`}
      >
        <HelpCircle size={14} className="text-indigo-400" />
        <span>Take Product Tour</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={startTour}
      data-tour="tour-trigger"
      className={`px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${className}`}
    >
      <Sparkles size={13} className="text-indigo-400" />
      <span>Product Tour</span>
    </button>
  )
}
