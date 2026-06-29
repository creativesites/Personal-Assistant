'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// The /agents page has been merged into the AI Workforce hub at /automation.
export default function AgentsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/automation') }, [router])
  return null
}
