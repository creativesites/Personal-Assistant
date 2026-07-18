'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Search } from 'lucide-react'
import { apiClient } from '@/lib/api'

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
}

interface ScraperStatus {
  poolSize: number
  sources: { source: string; lastRun: string | null; lastSuccess: boolean }[]
}

const SOURCE_LABELS: Record<string, string> = {
  gozambia: 'GoZambia',
  jobsearchzm: 'JobSearchZM',
  jobberman_zm: 'Jobberman',
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function JobCard({ job }: { job: ScrapedJob }) {
  const displaySkills = job.skills.slice(0, 4)
  const extraSkills = job.skills.length - displaySkills.length

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-950 leading-snug line-clamp-2">{job.title}</p>
          {job.company && (
            <p className="text-xs text-gray-600 mt-0.5">{job.company}</p>
          )}
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 ring-1 ring-indigo-100">
          {SOURCE_LABELS[job.source] ?? job.source}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs text-gray-500">
        {job.location && (
          <span className="flex items-center gap-1">📍 {job.location}</span>
        )}
        {job.job_type && (
          <span className="flex items-center gap-1">· {job.job_type}</span>
        )}
        {job.salary_range && (
          <span className="flex items-center gap-1">· {job.salary_range}</span>
        )}
      </div>

      {displaySkills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {displaySkills.map(skill => (
            <span key={skill} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
              {skill}
            </span>
          ))}
          {extraSkills > 0 && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              +{extraSkills} more
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[10px] text-gray-400">
          {job.posted_at ? `Posted ${formatRelative(job.posted_at)}` : `Scraped ${formatRelative(job.scraped_at)}`}
        </span>
        <a
          href={job.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 text-white px-3 py-1.5 text-[11px] font-bold shadow-sm shadow-indigo-500/20 hover:bg-indigo-500 min-h-[36px]"
        >
          View Job <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

interface Props {
  token: string
  refreshSignal: number
}

export function ScrapedJobsBrowser({ token, refreshSignal }: Props) {
  const [jobs, setJobs] = useState<ScrapedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [scraperStatus, setScraperStatus] = useState<ScraperStatus | null>(null)

  const PAGE_SIZE = 12

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 350)
    return () => clearTimeout(t)
  }, [searchText])

  const fetchJobs = (reset = true) => {
    if (!token) return
    const newOffset = reset ? 0 : offset + PAGE_SIZE
    if (reset) {
      setLoading(true)
      setOffset(0)
    } else {
      setLoadingMore(true)
    }

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(newOffset) })
    if (sourceFilter !== 'all') params.set('source', sourceFilter)
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())

    apiClient<{ jobs: ScrapedJob[]; total: number }>(`/api/career/scraped-jobs?${params}`, { token })
      .then(data => {
        if (reset) {
          setJobs(data.jobs)
        } else {
          setJobs(prev => [...prev, ...data.jobs])
          setOffset(newOffset)
        }
        setTotal(data.total)
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setLoadingMore(false) })
  }

  const fetchStatus = () => {
    if (!token) return
    apiClient<ScraperStatus>('/api/career/scraper-status', { token })
      .then(setScraperStatus)
      .catch(() => {})
  }

  // Reset and refetch on filter/search/refresh changes
  useEffect(() => { fetchJobs(true) }, [token, sourceFilter, debouncedSearch, refreshSignal])
  useEffect(fetchStatus, [token, refreshSignal])

  const sources = ['all', 'gozambia', 'jobsearchzm', 'jobberman_zm']

  const lastScrape = scraperStatus?.sources
    .filter(s => s.lastRun)
    .sort((a, b) => new Date(b.lastRun!).getTime() - new Date(a.lastRun!).getTime())[0]

  if (!loading && total === 0 && sourceFilter === 'all' && !debouncedSearch) {
    return null // Don't render the section at all until the pool has data
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Browse Jobs</h2>
          {scraperStatus && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              {scraperStatus.poolSize} live
            </span>
          )}
          {lastScrape?.lastRun && (
            <span className="text-[10px] text-gray-400">updated {formatRelative(lastScrape.lastRun)}</span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search jobs…"
            className="rounded-xl border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 min-h-[36px]"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {sources.map(src => (
          <button
            key={src}
            onClick={() => setSourceFilter(src)}
            className={`shrink-0 inline-flex min-h-10 items-center rounded-2xl px-3 text-xs font-bold transition-colors ${
              sourceFilter === src
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
            }`}
          >
            {src === 'all' ? 'All Sources' : SOURCE_LABELS[src]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm h-36 animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm shadow-gray-200/60">
          <p className="text-sm font-semibold text-gray-700">No jobs match your search</p>
          <p className="text-xs text-gray-500 mt-1">Try a different filter or click Fetch Jobs to refresh the pool.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {jobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
          {jobs.length < total && (
            <div className="mt-4 text-center">
              <button
                onClick={() => fetchJobs(false)}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-bold text-gray-700 ring-1 ring-gray-200 shadow-sm hover:bg-gray-50 min-h-[44px] disabled:opacity-60"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                Load more ({total - jobs.length} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
