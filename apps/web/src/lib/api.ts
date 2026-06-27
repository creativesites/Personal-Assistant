const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiClient<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options

  // POST/PUT/PATCH with no explicit body: send '{}' so Fastify's JSON parser
  // sees a valid object instead of a null body that fails Zod validation.
  const method = (rest.method || 'GET').toUpperCase()
  const isWrite = method === 'POST' || method === 'PUT' || method === 'PATCH'
  const body = rest.body !== undefined ? rest.body : (isWrite ? '{}' : undefined)

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    body,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`)
  }

  return res.json().catch(() => {
    throw new Error(`Non-JSON response from server (HTTP ${res.status})`)
  }) as Promise<T>
}
