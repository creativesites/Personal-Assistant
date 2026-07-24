'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  EXECUTIVE_MILESTONES,
  getUnlockedMilestones,
  unlockMilestone,
  Milestone,
  UnlockedMilestoneState,
} from '@/lib/celebrations'

export interface ActiveCelebration {
  milestone: Milestone
  customData?: Record<string, any>
  timestamp: number
}

export function useCelebration() {
  const [activeCelebration, setActiveCelebration] = useState<ActiveCelebration | null>(null)
  const [unlockedState, setUnlockedState] = useState<Record<string, UnlockedMilestoneState>>({})

  useEffect(() => {
    setUnlockedState(getUnlockedMilestones())

    const handleUnlockEvent = (event: Event) => {
      const customEv = event as CustomEvent<{ milestone: Milestone; customData?: Record<string, any> }>
      if (customEv.detail?.milestone) {
        setActiveCelebration({
          milestone: customEv.detail.milestone,
          customData: customEv.detail.customData,
          timestamp: Date.now(),
        })
        setUnlockedState(getUnlockedMilestones())
      }
    }

    window.addEventListener('zuri:milestone_unlocked', handleUnlockEvent)
    return () => {
      window.removeEventListener('zuri:milestone_unlocked', handleUnlockEvent)
    }
  }, [])

  const triggerMilestone = useCallback((milestoneId: string, customData?: Record<string, any>) => {
    const isNew = unlockMilestone(milestoneId, customData)
    if (!isNew && EXECUTIVE_MILESTONES[milestoneId]) {
      // Re-trigger celebration banner briefly even if unlocked
      setActiveCelebration({
        milestone: EXECUTIVE_MILESTONES[milestoneId],
        customData,
        timestamp: Date.now(),
      })
    }
  }, [])

  const clearCelebration = useCallback(() => {
    setActiveCelebration(null)
  }, [])

  return {
    activeCelebration,
    unlockedState,
    triggerMilestone,
    clearCelebration,
    allMilestones: EXECUTIVE_MILESTONES,
  }
}
