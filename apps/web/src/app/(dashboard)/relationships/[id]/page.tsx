'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// This page has been merged into /contacts/[id] (its unique content — the
// Clocks tab — now lives there as one more tab). See
// docs/RELATIONSHIP_OS_PLAN.md §3/§7: this route was fully built but nothing
// linked to it, since /relationships already routes its cards to
// /contacts/[id]. One contact-detail page, not two.
export default function RelationshipDetailRedirect() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  useEffect(() => { router.replace(`/contacts/${id}`) }, [router, id])
  return null
}
