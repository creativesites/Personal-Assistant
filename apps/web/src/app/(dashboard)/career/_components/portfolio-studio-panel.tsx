'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Globe,
  Eye,
  Download,
  MessageSquare,
  Users,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  QrCode,
  Share2,
} from 'lucide-react'

interface PortfolioStudioPanelProps {
  token: string
  initialSlug?: string
}

export function PortfolioStudioPanel({ token, initialSlug = 'winston-zulu' }: PortfolioStudioPanelProps) {
  const [slug, setSlug] = useState(initialSlug)
  const [copied, setCopied] = useState(false)
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public')

  const portfolioUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/p/${slug}`
    : `https://zuri.ai/p/${slug}`

  const handleCopy = () => {
    navigator.clipboard.writeText(portfolioUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Link & Vanity Slug Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Living Web Portfolio</h2>
              <p className="text-xs text-slate-500">Your public networking URL & recruiter landing page.</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>

        {/* Vanity URL Editor */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Custom Vanity Slug</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">zuri.ai/p/</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <Link
              href={`/p/${slug}`}
              target="_blank"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View</span>
            </Link>
          </div>
        </div>

        {/* Visibility Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
          <span className="font-bold text-slate-700 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            Visibility Mode:
          </span>
          <div className="flex items-center gap-1">
            {[
              { id: 'public', label: 'Public' },
              { id: 'unlisted', label: 'Unlisted' },
              { id: 'private', label: 'Private' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVisibility(v.id as any)}
                className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                  visibility === v.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recruiter Engagement Analytics Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            Recruiter Engagement Analytics
          </h3>
          <span className="text-[11px] text-slate-400 font-medium">Last 30 Days</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Portfolio Views', value: '142', icon: Eye, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Unique Visitors', value: '89', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'CV Downloads', value: '38', icon: Download, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Recruiter Inquiries', value: '12', icon: MessageSquare, color: 'text-sky-600', bg: 'bg-sky-50' },
          ].map((stat, i) => {
            const Icon = stat.icon
            return (
              <div key={i} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-2">
                <div className={`w-8 h-8 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{stat.value}</p>
                  <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{stat.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* AI Networking Intelligence Co-Pilot */}
      <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50/80 via-amber-50/30 to-white p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-amber-900">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <h3 className="text-xs font-extrabold uppercase tracking-wider">AI Networking Intelligence</h3>
        </div>

        <ul className="space-y-2 text-xs text-slate-700">
          <li className="flex items-start gap-2">
            <span className="text-amber-600 font-bold">•</span>
            <span>
              <strong>Recruiter Spike Detected:</strong> You received 5 profile views from tech recruiters in London over the last 48 hours. Consider sending follow-ups!
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-600 font-bold">•</span>
            <span>
              <strong>Portfolio Improvement:</strong> Adding quantifiable metrics to your 2 latest projects can boost recruiter inquiry rates by up to 28%.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
