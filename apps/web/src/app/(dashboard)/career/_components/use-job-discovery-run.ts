'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSocket } from '@/lib/socket'
import { apiClient } from '@/lib/api'

// Career OS Living Companion redesign — the frontend half of job_discovery.py's
// restructured per-pass loop. Subscribes to the career.job_discovery.progress
// socket event (job_discovery.py publishes one per pass boundary) and falls
// back to polling GET /api/career/job-discovery/run/:runId every few seconds
// if no socket event shows up (a disconnected socket, or events arriving
// before the listener attaches) — same graceful-degradation posture
// history:progress-consuming code already established elsewhere.

export type JobDiscoveryStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface JobDiscoveryRunState {
  runId: string | null
  status: JobDiscoveryStatus
  phase: string | null
  passesCompleted: number
  passesTotal: number
  opportunitiesFound: number
  errorMessage: string | null
}

const PHASE_COPY: Record<string, string> = {
  planning: 'Setting up your search...',
  searching_local: 'Searching Zambian employers...',
  searching_regional: 'Searching regional opportunities...',
  searching_remote: 'Searching remote opportunities...',
  searching_freelance: 'Searching freelance & contract work...',
  searching_hidden: 'Searching hidden opportunities...',
  searching_beyond_jobs: 'Searching partnerships & consulting...',
  scoring: 'Matching jobs to your skills...',
  done: 'Done',
  failed: 'Search failed',
}

export function jobDiscoveryPhaseLabel(phase: string | null): string {
  if (!phase) return 'Working on it...'
  return PHASE_COPY[phase] ?? `Searching (${phase.replace(/^searching_/, '').replace(/_/g, ' ')})...`
}

const IDLE_STATE: JobDiscoveryRunState = {
  runId: null, status: 'idle', phase: null,
  passesCompleted: 0, passesTotal: 0, opportunitiesFound: 0, errorMessage: null,
}

const POLL_MS = 3000

type RunStatusResponse = {
  runId: string
  status: JobDiscoveryStatus
  phase: string | null
  passesCompleted: number
  passesTotal: number
  opportunitiesFound: number
  errorMessage: string | null
}

export function useJobDiscoveryRun(token: string | null | undefined, onProgress?: () => void) {
  const [state, setState] = useState<JobDiscoveryRunState>(IDLE_STATE)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gotSocketEventRef = useRef(false)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollStatus = useCallback((runId: string) => {
    if (!token) return
    apiClient<RunStatusResponse>(`/api/career/job-discovery/run/${runId}`, { token })
      .then(data => {
        setState(prev => (prev.runId && prev.runId !== runId ? prev : {
          runId: data.runId, status: data.status, phase: data.phase,
          passesCompleted: data.passesCompleted, passesTotal: data.passesTotal,
          opportunitiesFound: data.opportunitiesFound, errorMessage: data.errorMessage,
        }))
        onProgressRef.current?.()
        if (data.status !== 'running') stopPolling()
      })
      .catch(() => {})
  }, [token, stopPolling])

  const startRun = useCallback(async (): Promise<{ runId: string }> => {
    if (!token) throw new Error('Not authenticated')
    stopPolling()
    gotSocketEventRef.current = false
    const result = await apiClient<{ runId: string; status: string; cap: number; usedToday: number; remaining: number }>(
      '/api/career/job-discovery/run', { method: 'POST', token },
    )
    setState({
      runId: result.runId, status: 'running', phase: 'planning',
      passesCompleted: 0, passesTotal: 0, opportunitiesFound: 0, errorMessage: null,
    })
    pollRef.current = setInterval(() => {
      if (!gotSocketEventRef.current) pollStatus(result.runId)
    }, POLL_MS)
    return { runId: result.runId }
  }, [token, stopPolling, pollStatus])

  useEffect(() => {
    if (!token) return
    const socket = getSocket(token)
    if (!socket) return

    const handler = (payload: string | RunStatusResponse) => {
      try {
        const data: RunStatusResponse = typeof payload === 'string' ? JSON.parse(payload) : payload
        gotSocketEventRef.current = true
        setState(prev => (prev.runId && data.runId !== prev.runId ? prev : {
          runId: data.runId, status: data.status, phase: data.phase,
          passesCompleted: data.passesCompleted ?? 0, passesTotal: data.passesTotal ?? 0,
          opportunitiesFound: data.opportunitiesFound ?? 0, errorMessage: data.errorMessage ?? null,
        }))
        onProgressRef.current?.()
        if (data.status !== 'running') stopPolling()
      } catch {
        // ignore malformed payload
      }
    }
    socket.on('career.job_discovery.progress', handler)
    return () => {
      socket.off('career.job_discovery.progress', handler)
    }
  }, [token, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  return { state, startRun }
}
