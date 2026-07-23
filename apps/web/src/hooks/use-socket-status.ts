'use client'

import { useEffect, useState } from 'react'
import {
  getSocketStatusState,
  subscribeSocketStatus,
  type SocketStatusState,
} from '@/lib/socket'

export function useSocketStatus(): SocketStatusState {
  const [state, setState] = useState<SocketStatusState>(getSocketStatusState())

  useEffect(() => {
    const unsubscribe = subscribeSocketStatus(newState => {
      setState({ ...newState })
    })
    return () => {
      unsubscribe()
    }
  }, [])

  return state
}
