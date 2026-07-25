'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { TOUR_STEPS, TourStep } from './tour-steps'
import { GuidedTourOverlay } from './guided-tour-overlay'

const STORAGE_KEY = 'zuri_tour_completed_v1'

interface GuidedTourContextType {
  isOpen: boolean
  currentStepIndex: number
  currentStep: TourStep
  totalSteps: number
  hasCompletedTour: boolean
  startTour: (stepIndexOrId?: number | string) => void
  startCustomTour: (steps: TourStep[]) => void
  endTour: () => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
  restartTour: () => void
}

const GuidedTourContext = createContext<GuidedTourContextType | null>(null)

export function GuidedTourProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeSteps, setActiveSteps] = useState<TourStep[]>(TOUR_STEPS)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [hasCompletedTour, setHasCompletedTour] = useState(true) // default true until client checks
  const router = useRouter()
  const pathname = usePathname()

  // Initialize completed state & check auto-trigger
  useEffect(() => {
    try {
      const completed = window.localStorage.getItem(STORAGE_KEY) === 'true'
      setHasCompletedTour(completed)

      if (!completed) {
        // First-time user auto-trigger after gentle initial delay
        const timer = setTimeout(() => {
          setActiveSteps(TOUR_STEPS)
          setIsOpen(true)
          setCurrentStepIndex(0)
        }, 1200)
        return () => clearTimeout(timer)
      }
    } catch {
      // Storage unavailable fallback
    }
  }, [])

  const currentStep = activeSteps[currentStepIndex] || activeSteps[0]
  const totalSteps = activeSteps.length

  const markTourCompleted = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Storage error
    }
    setHasCompletedTour(true)
  }, [])

  const startTour = useCallback((stepIndexOrId?: number | string) => {
    setActiveSteps(TOUR_STEPS)
    if (typeof stepIndexOrId === 'number') {
      setCurrentStepIndex(Math.max(0, Math.min(stepIndexOrId, TOUR_STEPS.length - 1)))
    } else if (typeof stepIndexOrId === 'string') {
      const idx = TOUR_STEPS.findIndex(s => s.id === stepIndexOrId)
      setCurrentStepIndex(idx >= 0 ? idx : 0)
    } else {
      setCurrentStepIndex(0)
    }
    setIsOpen(true)
  }, [])

  const startCustomTour = useCallback((steps: TourStep[]) => {
    if (!steps || steps.length === 0) return
    setActiveSteps(steps)
    setCurrentStepIndex(0)
    setIsOpen(true)
  }, [])

  const restartTour = useCallback(() => {
    setActiveSteps(TOUR_STEPS)
    setCurrentStepIndex(0)
    setIsOpen(true)
  }, [])

  const endTour = useCallback(() => {
    setIsOpen(false)
    markTourCompleted()
  }, [markTourCompleted])

  const goToStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= activeSteps.length) return
      const targetStep = activeSteps[index]

      // Optional route navigation if step specifies a route
      if (targetStep.route && pathname !== targetStep.route) {
        router.push(targetStep.route)
      }

      setCurrentStepIndex(index)
    },
    [activeSteps, pathname, router]
  )

  const nextStep = useCallback(() => {
    if (currentStepIndex < activeSteps.length - 1) {
      goToStep(currentStepIndex + 1)
    } else {
      endTour()
    }
  }, [currentStepIndex, activeSteps.length, goToStep, endTour])

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      goToStep(currentStepIndex - 1)
    }
  }, [currentStepIndex, goToStep])

  return (
    <GuidedTourContext.Provider
      value={{
        isOpen,
        currentStepIndex,
        currentStep,
        totalSteps,
        hasCompletedTour,
        startTour,
        startCustomTour,
        endTour,
        nextStep,
        prevStep,
        goToStep,
        restartTour,
      }}
    >
      {children}
      {isOpen && (
        <GuidedTourOverlay
          currentStep={currentStep}
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
          onNext={nextStep}
          onPrev={prevStep}
          onClose={endTour}
        />
      )}
    </GuidedTourContext.Provider>
  )
}

export function useGuidedTour() {
  const context = useContext(GuidedTourContext)
  if (!context) {
    throw new Error('useGuidedTour must be used within a GuidedTourProvider')
  }
  return context
}
