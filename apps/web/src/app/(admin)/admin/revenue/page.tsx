'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient, ApiError } from '@/lib/api'

// Membership Platform Phase 8 — Revenue Intelligence: MRR/DRR/WRR + trial
// conversion + churn + renewals, plus the paste-and-match "Intelligent
// Payment Detection" tool (see docs/MEMBERSHIP_PLATFORM_PLAN.md §Phase 8 —
// honestly scoped as a text-paste parser, not a live SMS integration).

interface Revenue {
  mrrNgwee: number
  wrrNgwee: number
  drrNgwee: number
  trialConversionRate: number
  trialStarted: number
  trialConverted: number
  churnRate: number
  renewalsDueToday: number
  failedRenewalsLast7Days: number
  subscribersByFamily: { planFamily: string; count: number }[]
}

interface MatchCandidate {
  paymentRequestId: string
  referenceCode: string
  amountNgwee: number
  userEmail: string
  userName: string | null
  planName: string
  createdAt: string
  confidence: number
  reasons: string[]
}

function formatNgwee(ngwee: number): string {
  return `K${(ngwee / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <p className="text-gray-500 text-xs font-medium">{label}</p>
      <p className="text-white text-xl font-extrabold mt-1">{value}</p>
      {sublabel && <p className="text-gray-600 text-[11px] mt-0.5">{sublabel}</p>}
    </div>
  )
}

export default function AdminRevenuePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data: revenue, loading } = useApi<Revenue>('/api/admin/revenue', token)

  const [pasteText, setPasteText] = useState('')
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<{ amountNgwee: number | null; phoneFragment: string | null; referenceCode: string | null } | null>(null)
  const [candidates, setCandidates] = useState<MatchCandidate[]>([])
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const runMatch = async () => {
    if (!token || !pasteText.trim()) return
    setMatching(true)
    setMatchError(null)
    try {
      const res = await apiClient<{ parsed: typeof parsed; candidates: MatchCandidate[] }>('/api/admin/payments/match', {
        method: 'POST', token, body: JSON.stringify({ text: pasteText }),
      })
      setParsed(res.parsed)
      setCandidates(res.candidates)
    } catch (e) {
      setMatchError(e instanceof ApiError ? e.message : 'Could not parse this text')
    } finally {
      setMatching(false)
    }
  }

  const approve = async (paymentRequestId: string) => {
    if (!token) return
    setApprovingId(paymentRequestId)
    try {
      await apiClient(`/api/admin/payments/${paymentRequestId}/approve`, { method: 'POST', token })
      setCandidates((cs) => cs.filter((c) => c.paymentRequestId !== paymentRequestId))
    } catch (e) {
      setMatchError(e instanceof ApiError ? e.message : 'Approve failed')
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-white mb-1">Revenue</h1>
        <p className="text-gray-500 text-sm">MRR/DRR/WRR, trial conversion, churn, renewals, and payment matching</p>
      </div>

      {loading || !revenue ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatTile label="MRR" value={formatNgwee(revenue.mrrNgwee)} />
            <StatTile label="WRR" value={formatNgwee(revenue.wrrNgwee)} />
            <StatTile label="DRR" value={formatNgwee(revenue.drrNgwee)} />
            <StatTile
              label="Trial conversion"
              value={`${(revenue.trialConversionRate * 100).toFixed(1)}%`}
              sublabel={`${revenue.trialConverted}/${revenue.trialStarted} converted`}
            />
            <StatTile label="Churn (30d)" value={`${(revenue.churnRate * 100).toFixed(1)}%`} />
            <StatTile label="Renewals due today" value={String(revenue.renewalsDueToday)} />
            <StatTile label="Failed renewals (7d)" value={String(revenue.failedRenewalsLast7Days)} />
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <p className="text-white text-sm font-semibold mb-3">Subscribers by plan family</p>
            <div className="flex flex-wrap gap-2">
              {revenue.subscribersByFamily.map((f) => (
                <span key={f.planFamily} className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium capitalize">
                  {f.planFamily}: <span className="text-white font-bold">{f.count}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
        <div>
          <p className="text-white text-sm font-semibold">Intelligent Payment Detection</p>
          <p className="text-gray-500 text-xs mt-1">
            Paste the raw mobile-money confirmation text (SMS/notification) you received — we&apos;ll extract the
            amount, phone fragment, and reference code, and fuzzy-match it against pending payment requests.
          </p>
        </div>
        <textarea
          value={pasteText} onChange={(e) => setPasteText(e.target.value)}
          placeholder="e.g. You have received K249.00 from 0977123456. Ref: ZURI-AB12CD. Bal: K1,204.50"
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={runMatch} disabled={matching || !pasteText.trim()}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
        >
          {matching ? 'Matching…' : 'Find matches'}
        </button>
        {matchError && <p className="text-xs text-red-400">{matchError}</p>}

        {parsed && (
          <p className="text-xs text-gray-500">
            Parsed: {parsed.amountNgwee !== null ? formatNgwee(parsed.amountNgwee) : '—'} ·
            {' '}{parsed.phoneFragment ?? '—'} · {parsed.referenceCode ?? '—'}
          </p>
        )}

        {candidates.length > 0 && (
          <div className="divide-y divide-gray-800 border-t border-gray-800 mt-2">
            {candidates.map((c) => (
              <div key={c.paymentRequestId} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{c.userName || c.userEmail} — {c.planName}</p>
                  <p className="text-gray-500 text-xs">
                    {c.referenceCode} · {formatNgwee(c.amountNgwee)} · {c.reasons.join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                    c.confidence >= 80 ? 'bg-green-950/60 text-green-400' : c.confidence >= 40 ? 'bg-amber-950/60 text-amber-400' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {c.confidence}%
                  </span>
                  <button
                    onClick={() => approve(c.paymentRequestId)} disabled={approvingId === c.paymentRequestId}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 transition-colors"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
