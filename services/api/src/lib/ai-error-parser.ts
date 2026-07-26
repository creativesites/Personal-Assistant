export interface AiErrorResult {
  answer: string
  errorMeta: {
    is_error: boolean
    error_type: 'rate_limit' | 'auth_error' | 'timeout' | 'connection_error' | 'service_error' | 'no_response'
    error_detail: string
    http_status?: number
  }
}

export async function parseAiErrorResponse(res: Response | null, catchError?: any): Promise<AiErrorResult> {
  if (catchError) {
    const catchMsg = catchError?.message || 'Network or connection failure'
    return {
      answer: `⚠️ **AI Service Offline**: Unable to connect to the intelligence service (${catchMsg}). Please check system diagnostics or verify that your local service is running.`,
      errorMeta: { is_error: true, error_type: 'connection_error', error_detail: catchMsg },
    }
  }

  if (!res) {
    return {
      answer: `⚠️ **AI Service Error**: No response received from intelligence service.`,
      errorMeta: { is_error: true, error_type: 'no_response', error_detail: 'No response object' },
    }
  }

  const rawText = await res.text().catch(() => '')
  let detailStr = rawText
  try {
    const jsonErr = JSON.parse(rawText)
    detailStr = jsonErr.detail || jsonErr.error || jsonErr.message || rawText
  } catch {
    /* fallback to raw text */
  }

  const cleanDetail = (detailStr || `HTTP ${res.status}`).trim()
  const lower = (cleanDetail + ' ' + res.status).toLowerCase()

  if (
    res.status === 429 ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('too many requests')
  ) {
    return {
      answer: `⚠️ **AI Capacity Limit Reached**: The default AI provider is currently rate-limited or at quota capacity. You can get instant dedicated speed with zero waiting by adding your free Google Gemini API key in **Settings → Bring Your Own AI (BYOK)**.`,
      errorMeta: {
        is_error: true,
        error_type: 'rate_limit',
        error_detail: cleanDetail,
        http_status: res.status,
      },
    }
  }

  if (
    res.status === 401 ||
    res.status === 403 ||
    lower.includes('invalid_api_key') ||
    lower.includes('unauthorized') ||
    lower.includes('authentication')
  ) {
    return {
      answer: `⚠️ **AI Authentication Issue**: The AI provider returned an invalid key or authentication error (${cleanDetail.slice(0, 120)}). Please check your API key in **Settings → Bring Your Own AI (BYOK)**.`,
      errorMeta: {
        is_error: true,
        error_type: 'auth_error',
        error_detail: cleanDetail,
        http_status: res.status,
      },
    }
  }

  if (res.status === 504 || lower.includes('timeout') || lower.includes('timed out')) {
    return {
      answer: `⚠️ **AI Request Timed Out**: The AI engine took too long to generate a response. Please try again or simplify your request.`,
      errorMeta: {
        is_error: true,
        error_type: 'timeout',
        error_detail: cleanDetail,
        http_status: res.status,
      },
    }
  }

  return {
    answer: `⚠️ **AI Service Error** (HTTP ${res.status}): ${cleanDetail.slice(0, 160)}. Please try again or check system diagnostics.`,
    errorMeta: {
      is_error: true,
      error_type: 'service_error',
      error_detail: cleanDetail,
      http_status: res.status,
    },
  }
}
