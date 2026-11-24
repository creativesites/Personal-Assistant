import crypto from 'crypto'

/**
 * Verifies a Clerk session token (RS256 JWT) against the instance's public
 * JWKS. The Clerk instance comes from CLERK_PUBLISHABLE_KEY
 * ("pk_live_<base64 of '<frontend-api-host>$'>"), so no Clerk secret is needed.
 * Used by clerk-sync (web) and reusable for a mobile token exchange.
 */

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }

const JWKS_TTL_MS = 60 * 60 * 1000
const CLOCK_SKEW_S = 60
let jwksCache: { at: number; keys: Jwk[] } | null = null

export class ClerkTokenError extends Error {}

export function clerkIssuer(): string | null {
  const pk = process.env.CLERK_PUBLISHABLE_KEY
  if (!pk) return null
  const encoded = pk.replace(/^pk_(live|test)_/, '')
  const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '')
  return host ? `https://${host}` : null
}

async function getJwks(issuer: string, forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys
  const res = await fetch(`${issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new ClerkTokenError(`JWKS fetch failed (${res.status})`)
  const body = (await res.json()) as { keys?: Jwk[] }
  jwksCache = { at: Date.now(), keys: body.keys ?? [] }
  return jwksCache.keys
}

function b64urlJson<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T
}

/** Returns the verified Clerk user id (`sub`). Throws ClerkTokenError otherwise. */
export async function verifyClerkSessionToken(token: string): Promise<{ userId: string }> {
  const issuer = clerkIssuer()
  if (!issuer) throw new ClerkTokenError('CLERK_PUBLISHABLE_KEY is not configured')

  const parts = token.split('.')
  if (parts.length !== 3) throw new ClerkTokenError('malformed token')
  const [h, p, sig] = parts
  const header = b64urlJson<{ alg?: string; kid?: string }>(h)
  if (header.alg !== 'RS256' || !header.kid) throw new ClerkTokenError('unsupported token header')

  let jwk = (await getJwks(issuer)).find((k) => k.kid === header.kid)
  if (!jwk) jwk = (await getJwks(issuer, true)).find((k) => k.kid === header.kid)
  if (!jwk) throw new ClerkTokenError('unknown signing key')

  const publicKey = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' })
  const valid = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, 'base64url'))
  if (!valid) throw new ClerkTokenError('bad signature')

  const claims = b64urlJson<{ iss?: string; sub?: string; exp?: number; nbf?: number }>(p)
  const now = Math.floor(Date.now() / 1000)
  if (claims.iss !== issuer) throw new ClerkTokenError('wrong issuer')
  if (!claims.exp || claims.exp + CLOCK_SKEW_S < now) throw new ClerkTokenError('token expired')
  if (claims.nbf && claims.nbf - CLOCK_SKEW_S > now) throw new ClerkTokenError('token not yet valid')
  if (!claims.sub) throw new ClerkTokenError('missing subject')
  return { userId: claims.sub }
}
