'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, EyeOff, Loader2, Sparkles } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'
import { OpportunityCard, type CareerOpportunity } from './opportunity-card'

// Career OS Living Companion redesign, Phase 3 — replaces the previous
// "Opportunities section + separate Browse Jobs pool" split with one
// continuous feed. Scope decision confirmed with the user: this is a
// frontend merge (career_opportunities + scraped_jobs, deduped and sorted
// together with source badges), not real backend scoring for the whole
// scraped pool — a scraped-only card shows relevance, never a fabricated
// match score, until it's actually promoted into a real career_opportunities
// row (Save/Apply).

interface ScrapedJob {
  id: string
  source: string
  source_url: string
  title: string
  company: string | null
  location: string | null
  job_type: string | null
  salary_range: string | null
  skills: string[]
  posted_at: string | null
  scraped_at: string
  contact_email?: string | null
  contact_phone?: string | null
  application_url?: string | null
  freshness_score?: number | null
  expiration_probability?: number | null
  source_reliability?: number | null
  canonical_job_id?: string | null
}

const SOURCE_LABELS: Record<string, string> = {
  gozambia: 'GoZambia',
  jobsearchzm: 'JobSearchZM',
  jobberman_zm: 'Jobberman',
}

const ZM_SOURCES = new Set(['gozambia', 'jobsearchzm', 'jobberman_zm'])

// Same normalization job_discovery.py's _normalize_key uses server-side —
// ported to TS so the frontend dedup agrees with what the backend already
// decided is "the same listing" (career_opportunities rows job_discovery.py
// itself inserted are deduped against existing_keys the same way).
function normalizeKey(title: string | null | undefined, company: string | null | undefined): string {
  const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return `${norm(title)}|${norm(company)}`
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

function formatRelative(iso: string): string {
  const hours = hoursSince(iso)
  if (hours == null) return ''
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.floor(hours)}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface Badge { emoji: string; label: string }

function opportunityBadges(opp: CareerOpportunity): Badge[] {
  const badges: Badge[] = []
  if (opp.isRemote) badges.push({ emoji: '🌐', label: 'Remote' })
  else if ((opp.location ?? '').toLowerCase().includes('zambia') || /lusaka|ndola|kitwe|kabwe|livingstone/i.test(opp.location ?? '')) {
    badges.push({ emoji: '🇿🇲', label: 'Zambia' })
  }
  const hours = hoursSince(opp.createdAt)
  if (hours != null && hours < 24) badges.push({ emoji: '⚡', label: 'Fresh today' })
  if (opp.confidence != null && opp.confidence >= 0.8) badges.push({ emoji: '✨', label: `High Confidence (${Math.round(opp.confidence * 100)}%)` })
  if (opp.source === 'web_search') badges.push({ emoji: '🌍', label: 'AI Search' })
  if (opp.source === 'whatsapp_detected') badges.push({ emoji: '🤝', label: 'Referral' })
  return badges
}

function scrapedBadges(job: ScrapedJob): Badge[] {
  const badges: Badge[] = []
  const isRemote = job.job_type === 'remote' || /remote/i.test(job.location ?? '')
  if (isRemote) badges.push({ emoji: '🌐', label: 'Remote' })
  else if (ZM_SOURCES.has(job.source) || /zambia|lusaka|ndola|kitwe|kabwe|livingstone/i.test(job.location ?? '')) {
    badges.push({ emoji: '🇿🇲', label: 'Zambia' })
  }
  const hours = hoursSince(job.posted_at ?? job.scraped_at)
  if (hours != null && hours < 24) badges.push({ emoji: '⚡', label: 'Fresh today' })
  if (job.freshness_score && job.freshness_score >= 80) badges.push({ emoji: '🔥', label: 'Hot' })
  if (job.source_reliability && job.source_reliability >= 80) badges.push({ emoji: '✅', label: 'Verified Source' })
  badges.push({ emoji: '🏢', label: SOURCE_LABELS[job.source] ?? job.source })
  return badges
}

function BadgeRow({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {badges.map(b => (
        <span key={b.label} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-100">
          {b.emoji} {b.label}
        </span>
      ))}
    </div>
  )
}

function ScrapedJobCard({
  job, token, onSaved, onHide,
}: {
  job: ScrapedJob
  token: string
  onSaved: () => void
  onHide: (jobId: string) => void
}) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState<'save' | 'hide' | null>(null)
  const displaySkills = job.skills.slice(0, 4)

  const createFromJob = async (status: 'shortlisted' | 'withdrawn') => {
    setBusy(status === 'shortlisted' ? 'save' : 'hide')
    try {
      const created = await apiClient<{ opportunity: CareerOpportunity }>('/api/career/opportunities', {
        method: 'POST', token,
        body: JSON.stringify({
          category: 'job', title: job.title, companyOrOrg: job.company ?? undefined,
          location: job.location ?? undefined, source: 'manual', 
          applicationUrl: job.application_url ?? job.source_url,
          contactEmail: job.contact_email ?? undefined,
          contactPhone: job.contact_phone ?? undefined,
        }),
      })
      await apiClient(`/api/career/opportunities/${created.opportunity.id}`, {
        method: 'PATCH', token, body: JSON.stringify({ status }),
      })
      onHide(job.id)
      if (status === 'shortlisted') {
        addToast({ variant: 'success', title: 'Saved to your opportunities' })
        onSaved()
      }
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not update this job', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-950 leading-snug line-clamp-2">{job.title}</p>
          {job.company && <p className="text-xs text-gray-600 mt-0.5">{job.company}</p>}
        </div>
        <span className="shrink-0 text-[10px] font-semibold text-gray-400">
          {job.posted_at ? formatRelative(job.posted_at) : formatRelative(job.scraped_at)}
        </span>
      </div>

      <BadgeRow badges={scrapedBadges(job)} />

      <div className="flex flex-wrap gap-1.5 text-xs text-gray-500">
        {job.location && <span>📍 {job.location}</span>}
        {job.salary_range && <span>· {job.salary_range}</span>}
      </div>

      {(job.contact_email || job.contact_phone) && (
        <div className="flex flex-col gap-1 text-xs bg-slate-50 border border-slate-100/50 rounded-xl p-2 mt-1">
          <span className="font-semibold text-gray-700">Contact details:</span>
          {job.contact_email && (
            <div className="flex items-center gap-1 text-gray-600">
              <span>📧</span>
              <a href={`mailto:${job.contact_email}`} className="text-indigo-600 hover:underline font-medium break-all">
                {job.contact_email}
              </a>
            </div>
          )}
          {job.contact_phone && (
            <div className="flex items-center gap-1 text-gray-600">
              <span>📞</span>
              <a href={`tel:${job.contact_phone}`} className="text-indigo-600 hover:underline font-medium">
                {job.contact_phone}
              </a>
            </div>
          )}
        </div>
      )}

      {displaySkills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {displaySkills.map(skill => (
            <span key={skill} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">{skill}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-50 mt-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => createFromJob('shortlisted')}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-60"
          >
            {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Save
          </button>
          <button
            onClick={() => createFromJob('withdrawn')}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 disabled:opacity-60"
          >
            {busy === 'hide' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
            Hide
          </button>
        </div>
        <div className="flex items-center gap-2">
          {job.application_url && job.application_url !== job.source_url && (
            <a
              href={job.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 min-h-[32px]"
            >
              Apply <ExternalLink className="w-3 h-3 text-indigo-600" />
            </a>
          )}
          <a
            href={job.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 min-h-[32px]"
          >
            View <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

type FeedEntry =
  | { kind: 'opportunity'; key: string; sortScore: number; freshnessMs: number; data: CareerOpportunity }
  | { kind: 'scraped'; key: string; sortScore: number; freshnessMs: number; data: ScrapedJob }

export function JobFeed({
  token, opportunities, onStatusChange, onApplied, onOpportunitySaved, refreshSignal,
  isSearching, hasEverSearched, onFetchNow, onImproveProfile, onBroadenSearch,
  preferredCategories,
}: {
  token: string
  opportunities: CareerOpportunity[]
  onStatusChange: (opp: CareerOpportunity, status: string) => void
  onApplied: (opp: CareerOpportunity, projectId: string) => void
  onOpportunitySaved: () => void
  refreshSignal: number
  // Career OS Living Companion redesign, Phase 4 — three real empty states
  // instead of one generic message: a run currently in progress, a profile
  // that's never actually been searched yet, and "searched today but
  // nothing matched well" (the only one that gets concrete next-action
  // suggestions, since the other two aren't the user's fault).
  isSearching: boolean
  hasEverSearched: boolean
  onFetchNow: () => void
  onImproveProfile: () => void
  onBroadenSearch: () => void
  // Phase 5 — freelancer/business_owner modes softly boost these
  // categories to the top rather than hiding everything else, so a
  // straggler job listing is never silently filtered out of existence.
  preferredCategories?: string[]
}) {
  const [scrapedJobs, setScrapedJobs] = useState<ScrapedJob[]>([])
  const [scrapedLoading, setScrapedLoading] = useState(true)
  const [locallyHidden, setLocallyHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!token) return
    setScrapedLoading(true)
    apiClient<{ jobs: ScrapedJob[]; total: number }>('/api/career/scraped-jobs?limit=50', { token })
      .then(data => { setScrapedJobs(data.jobs); setScrapedLoading(false) })
      .catch(() => setScrapedLoading(false))
  }, [token, refreshSignal])

  const feed = useMemo<FeedEntry[]>(() => {
    const opportunityKeys = new Set(opportunities.map(o => normalizeKey(o.title, o.companyOrOrg)))

    const categoryBoost = preferredCategories?.length ? new Set(preferredCategories) : null
    const opportunityEntries: FeedEntry[] = opportunities.map(o => ({
      kind: 'opportunity',
      key: normalizeKey(o.title, o.companyOrOrg),
      sortScore: (o.matchScore ?? -1) + (categoryBoost?.has(o.category) ? 1000 : 0),
      freshnessMs: new Date(o.createdAt).getTime(),
      data: o,
    }))

    const scrapedEntries: FeedEntry[] = scrapedJobs
      .filter(j => !locallyHidden.has(j.id))
      .filter(j => !opportunityKeys.has(normalizeKey(j.title, j.company)))
      .map(j => ({
        kind: 'scraped',
        key: normalizeKey(j.title, j.company),
        sortScore: -1,
        freshnessMs: new Date(j.posted_at ?? j.scraped_at).getTime(),
        data: j,
      }))

    const seen = new Set<string>()
    const merged = [...opportunityEntries, ...scrapedEntries].filter(e => {
      if (seen.has(e.key)) return false
      seen.add(e.key)
      return true
    })

    return merged.sort((a, b) => {
      if (a.sortScore !== b.sortScore) return b.sortScore - a.sortScore
      return b.freshnessMs - a.freshnessMs
    })
  }, [opportunities, scrapedJobs, locallyHidden])

  if (scrapedLoading && opportunities.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm h-40 animate-pulse" />
        ))}
      </div>
    )
  }

  if (feed.length === 0 && isSearching) {
    return (
      <div className="rounded-[2rem] border border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center shadow-sm shadow-emerald-100/60">
        <p className="text-sm font-semibold text-emerald-800">Zuri is searching for opportunities right now</p>
        <p className="text-xs text-emerald-600 mt-1">Matches will appear here as they're found — no need to wait.</p>
      </div>
    )
  }

  if (feed.length === 0 && !hasEverSearched) {
    return (
      <div className="rounded-[2rem] border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm shadow-gray-200/60">
        <p className="text-sm font-semibold text-gray-700">We&apos;re still searching for opportunities that match your profile</p>
        <p className="text-xs text-gray-500 mt-1 mb-3">Zuri hasn&apos;t run a search for you yet.</p>
        <button onClick={onFetchNow} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">Search now →</button>
      </div>
    )
  }

  if (feed.length === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm shadow-gray-200/60">
        <p className="text-sm font-semibold text-gray-700">We&apos;ve searched today&apos;s jobs but couldn&apos;t find strong matches yet</p>
        <p className="text-xs text-gray-500 mt-1 mb-3">A few things that usually help:</p>
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold">
          <button onClick={onImproveProfile} className="text-indigo-600 hover:text-indigo-700">Improve your profile</button>
          <span className="text-gray-300">·</span>
          <button onClick={onBroadenSearch} className="text-indigo-600 hover:text-indigo-700">Broaden location & allow remote</button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {feed.map(entry => entry.kind === 'opportunity' ? (
        <OpportunityCard
          key={entry.data.id}
          opp={entry.data}
          token={token}
          onStatusChange={onStatusChange}
          onApplied={onApplied}
          badges={opportunityBadges(entry.data)}
        />
      ) : (
        <ScrapedJobCard
          key={entry.data.id}
          job={entry.data}
          token={token}
          onSaved={onOpportunitySaved}
          onHide={id => setLocallyHidden(prev => new Set(prev).add(id))}
        />
      ))}
    </div>
  )
}
