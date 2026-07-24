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
  startTour: () => void
  endTour: () => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
  restartTour: () => void
}

const GuidedTourContext = createContext<GuidedTourContextType | null>(null)

export function GuidedTourProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
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
          setIsOpen(true)
          setCurrentStepIndex(0)
        }, 1200)
        return () => clearTimeout(timer)
      }
    } catch {
      // Storage unavailable fallback
    }
  }, [])

  const currentStep = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0]
  const totalSteps = TOUR_STEPS.length

  const markTourCompleted = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Storage error
    }
    setHasCompletedTour(true)
  }, [])

  const startTour = useCallback(() => {
    setCurrentStepIndex(0)
    setIsOpen(true)
  }, [])

  const restartTour = useCallback(() => {
    setCurrentStepIndex(0)
    setIsOpen(true)
  }, [])

  const endTour = useCallback(() => {
    setIsOpen(false)
    markTourCompleted()
  }, [markTourCompleted])

  const goToStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= TOUR_STEPS.length) return
      const targetStep = TOUR_STEPS[index]

      // Optional route navigation if step specifies a route
      if (targetStep.route && pathname !== targetStep.route) {
        router.push(targetStep.route)
      }

      setCurrentStepIndex(index)
    },
    [pathname, router]
  )

  const nextStep = useCallback(() => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      goToStep(currentStepIndex + 1)
    } else {
      endTour()
    }
  }, [currentStepIndex, goToStep, endTour])

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
