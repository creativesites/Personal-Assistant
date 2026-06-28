'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient, ApiError } from '@/lib/api'

export interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<T>(
  path: string | null,
  token: string | null | undefined,
): ApiState<T> & { refetch: () => void } {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: !!(path && token),
    error: null,
  })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!path || !token) {
      setState(s => ({ ...s, loading: false }))
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))
    apiClient<T>(path, { token })
      .then(data => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch(e => {
        if (!cancelled)
          setState({
            data: null,
            loading: false,
            error: e instanceof ApiError ? e.message : 'Something went wrong',
          })
      })
    return () => { cancelled = true }
  }, [path, token, tick])

  const refetch = useCallback(() => setTick(t => t + 1), [])
  return { ...state, refetch }
}
