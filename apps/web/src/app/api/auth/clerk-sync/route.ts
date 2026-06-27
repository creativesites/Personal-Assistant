import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const email = user.emailAddresses[0]?.emailAddress
  if (!email) {
    return NextResponse.json({ error: 'No email address' }, { status: 400 })
  }

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'User'

  const apiUrl = process.env.API_URL || 'http://localhost:3000'
  const internalSecret = process.env.INTERNAL_API_SECRET || ''

  const payload = { clerkUserId: userId, email, name }
  console.log('[clerk-sync] sending to API:', { apiUrl, email, hasSecret: !!internalSecret, secretPrefix: internalSecret.slice(0, 8) })

  const res = await fetch(`${apiUrl}/api/auth/clerk-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': internalSecret,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[clerk-sync] API error:', { status: res.status, body: text })
    return NextResponse.json(
      { error: 'Sync failed', detail: text },
      { status: res.status },
    )
  }

  const data = await res.json()
  return NextResponse.json(data)
}
