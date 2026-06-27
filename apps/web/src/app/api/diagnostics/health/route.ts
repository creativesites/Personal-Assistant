import { NextResponse } from 'next/server'

export async function GET() {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(`${apiUrl}/health`, { signal: controller.signal })
    clearTimeout(timeout)

    const body = await res.json().catch(() => null)
    return NextResponse.json({ reachable: true, status: res.status, body }, { status: 200 })
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError'
    return NextResponse.json(
      {
        reachable: false,
        error: isTimeout ? 'Timed out after 5s' : err.message,
      },
      { status: 200 },
    )
  }
}
