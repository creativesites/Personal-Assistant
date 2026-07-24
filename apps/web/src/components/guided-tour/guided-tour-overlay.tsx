'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Sparkles,
  Search,
  Building2,
  MessageSquare,
  Smartphone,
  Brain,
  FileText,
  Briefcase,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
} from 'lucide-react'
import { TourStep } from './tour-steps'
import { ChampagneConfettiCanvas } from '@/components/ui/celebration-effects'

interface TargetRect {
  x: number
  y: number
  width: number
  height: number
}

interface GuidedTourOverlayProps {
  currentStep: TourStep
  currentStepIndex: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

const STEP_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Sparkles,
  Search,
  Building2,
  MessageSquare,
  Smartphone,
  Brain,
  FileText,
  Briefcase,
  HelpCircle,
}

export function GuidedTourOverlay({
  currentStep,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrev,
  onClose,
}: GuidedTourOverlayProps) {
  const [rect, setRect] = useState<TargetRect | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === totalSteps - 1

  // Measure target DOM element and scroll into view
  const updateRect = useCallback(() => {
    if (typeof window === 'undefined') return
    const element = document.querySelector(currentStep.targetSelector)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      const clientRect = element.getBoundingClientRect()
      setRect({
        x: clientRect.left,
        y: clientRect.top,
        width: clientRect.width,
        height: Math.min(clientRect.height, window.innerHeight - 120),
      })
    } else {
      // If target element is not found, fallback to screen center
      setRect(null)
    }
  }, [currentStep.targetSelector])

  useEffect(() => {
    updateRect()

    // Re-measure after CSS drawer transitions (e.g. mobile sidebar sliding open)
    const t1 = setTimeout(updateRect, 100)
    const t2 = setTimeout(updateRect, 350)

    const handleResize = () => updateRect()
    const handleScroll = () => updateRect()

    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [updateRect])

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (isLastStep) {
          handleFinish()
        } else {
          onNext()
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLastStep, onNext, onPrev, onClose])

  const handleFinish = () => {
    setShowCelebration(true)
    setTimeout(() => {
      onClose()
    }, 1800)
  }

  // Calculate popover positioning relative to target rect
  const getPopoverStyle = () => {
    if (!rect || typeof window === 'undefined') {
      // Center fallback
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }

    const padding = 16
    const popoverWidth = 360
    const popoverHeight = popoverRef.current?.offsetHeight || 280
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    const preferredPlacement = currentStep.placement || 'bottom'

    let top = 0
    let left = 0

    if (preferredPlacement === 'right') {
      left = rect.x + rect.width + padding
      top = rect.y + Math.max(0, (rect.height - popoverHeight) / 2)

      if (left + popoverWidth > windowWidth - 16) {
        left = rect.x - popoverWidth - padding
      }
    } else if (preferredPlacement === 'left') {
      left = rect.x - popoverWidth - padding
      top = rect.y + Math.max(0, (rect.height - popoverHeight) / 2)

      if (left < 16) {
        left = rect.x + rect.width + padding
      }
    } else if (preferredPlacement === 'top') {
      top = rect.y - popoverHeight - padding
      left = rect.x + rect.width / 2 - popoverWidth / 2

      if (top < 16) {
        top = rect.y + rect.height + padding
      }
    } else {
      // 'bottom' placement
      top = rect.y + rect.height + padding
      left = rect.x + rect.width / 2 - popoverWidth / 2

      if (top + popoverHeight > windowHeight - 16 && rect.y - popoverHeight - padding > 16) {
        top = rect.y - popoverHeight - padding
      }
    }

    // STRICT VIEWPORT SAFETY CLAMP:
    // Guarantees popover card and action buttons (Next, Back, Skip) remain 100% visible inside viewport!
    if (top + popoverHeight > windowHeight - 16) {
      top = windowHeight - popoverHeight - 16
    }
    if (top < 16) {
      top = 16
    }

    if (left + popoverWidth > windowWidth - 16) {
      left = windowWidth - popoverWidth - 16
    }
    if (left < 16) {
      left = 16
    }

    return {
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
    }
  }

  const IconComponent = STEP_ICONS[currentStep.iconName] || Sparkles
  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100)

  return (
    <>
      {showCelebration && <ChampagneConfettiCanvas />}

      <div className="fixed inset-0 z-[9999] pointer-events-auto overflow-hidden">
        {/* SVG Spotlight Mask */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="zuri-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={rect.x - 6}
                  y={rect.y - 6}
                  width={rect.width + 12}
                  height={rect.height + 12}
                  rx="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(3, 7, 18, 0.72)"
            mask="url(#zuri-spotlight-mask)"
            className="transition-all duration-300 ease-out"
          />
        </svg>

        {/* Highlighted Target Aura Glow */}
        {rect && (
          <div
            className="absolute pointer-events-none rounded-xl border-2 border-indigo-500/80 shadow-[0_0_30px_rgba(99,102,241,0.6)] transition-all duration-300 ease-out animate-pulse"
            style={{
              top: `${rect.y - 6}px`,
              left: `${rect.x - 6}px`,
              width: `${rect.width + 12}px`,
              height: `${rect.height + 12}px`,
            }}
          />
        )}

        {/* Floating Glassmorphic Popover Card */}
        <div
          ref={popoverRef}
          style={getPopoverStyle()}
          className="absolute z-10 w-[min(360px,calc(100vw-32px))] bg-gray-950/95 text-white border border-indigo-500/30 rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all duration-300 ease-out animate-in fade-in zoom-in-95"
        >
          {/* Top Bar: Badge, Progress & Close */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
              {currentStep.badge}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-semibold text-gray-400">
                {currentStepIndex + 1} / {totalSteps}
              </span>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                title="Exit Tour (Esc)"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1 bg-gray-800 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Body Content */}
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex-shrink-0">
              <IconComponent className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-white tracking-tight leading-snug">
                {currentStep.title}
              </h3>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed font-normal">
                {currentStep.description}
              </p>
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-800/80">
            <button
              onClick={onClose}
              className="text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors px-1"
            >
              Skip
            </button>

            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <button
                  onClick={onPrev}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-300 bg-gray-900 border border-gray-800 hover:bg-gray-800 hover:text-white transition-all flex items-center gap-1"
                >
                  <ChevronLeft size={13} />
                  Back
                </button>
              )}

              <button
                onClick={isLastStep ? handleFinish : onNext}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5"
              >
                {isLastStep ? (
                  <>
                    <CheckCircle2 size={13} />
                    Finish Tour
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight size={13} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Keyboard Hint */}
          <div className="mt-3 pt-2 text-[10px] text-gray-500 flex items-center justify-between font-mono">
            <span>Use ← → keys to navigate</span>
            <span>Esc to exit</span>
          </div>
        </div>
      </div>
    </>
  )
}
