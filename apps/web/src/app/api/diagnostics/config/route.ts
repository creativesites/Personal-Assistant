import { NextResponse } from 'next/server'

function mask(val: string | undefined): string {
  if (!val) return '(not set)'
  if (val.length <= 8) return '***'
  return `${val.slice(0, 8)}…${val.slice(-4)}`
}

export async function GET() {
  const secret = process.env.INTERNAL_API_SECRET
  const apiUrl = process.env.API_URL
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL

  return NextResponse.json({
    INTERNAL_API_SECRET: {
      set: !!secret,
      length: secret?.length ?? 0,
      masked: mask(secret),
    },
    API_URL: {
      value: apiUrl || '(not set)',
      note: 'Server-side only — used by Next.js API routes to reach the backend',
    },
    NEXT_PUBLIC_API_URL: {
      value: publicApiUrl || '(not set)',
      note: 'Client-side — used by the browser to call the backend directly',
    },
    // /api/proxy is intentionally different — not a mismatch
    match: apiUrl && publicApiUrl && !publicApiUrl.startsWith('/api/proxy')
      ? apiUrl === publicApiUrl
      : null,
  })
}
