import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:3000'

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const url = `${API_URL}/${path.join('/')}${req.nextUrl.search}`

  const headers: Record<string, string> = {}
  const auth = req.headers.get('Authorization')
  if (auth) headers['Authorization'] = auth

  // Only read and forward a body for methods that carry one
  const bodyText = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined
  // Don't forward empty bodies — Fastify rejects Content-Type: application/json with empty body
  const body = bodyText && bodyText.length > 0 ? bodyText : undefined
  const ct = req.headers.get('Content-Type')
  if (ct && body !== undefined) headers['Content-Type'] = ct

  try {
    const res = await fetch(url, { method: req.method, headers, body })
    // Read as raw bytes, not .text() — decoding a binary response (a PDF,
    // an image) as UTF-8 text and re-encoding it corrupts it silently. This
    // is what made the CV Studio PDF preview iframe render a blank/broken
    // PDF even once auth was fixed: the bytes reaching the browser were
    // already mangled by this route. ArrayBuffer forwarding is correct for
    // JSON/text bodies too, so this isn't a binary-only special case.
    const bytes = await res.arrayBuffer()
    return new NextResponse(bytes, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
