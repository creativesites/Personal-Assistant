'use client'

import { useState, useEffect } from 'react'
import {
  Globe,
  Eye,
  Users,
  Download,
  MessageSquare,
  Copy,
  Check,
  Sparkles,
  Shield,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Layout,
  FileText,
} from 'lucide-react'
import type { PortfolioThemeKey } from '@/app/p/[slug]/page'

interface PortfolioStudioPanelProps {
  token: string
}

export function PortfolioStudioPanel({ token }: PortfolioStudioPanelProps) {
  const [slug, setSlug] = useState('winston-zulu')
  const [themeKey, setThemeKey] = useState<PortfolioThemeKey>('pearl-executive')
  const [allowCvDownload, setAllowCvDownload] = useState(true)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [siteOrigin, setSiteOrigin] = useState('')

  // Analytics data
  const [analytics, setAnalytics] = useState({
    views: 1,
    uniqueVisitors: 1,
    downloads: 0,
    inquiries: 0,
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSiteOrigin(window.location.origin)
    }

    // Fetch factual portfolio analytics
    fetch(`/api/p/${slug}`)
      .then((res) => res.json())
      .then((d) => {
        if (d.portfolio) {
          if (d.portfolio.settings?.themeKey) setThemeKey(d.portfolio.settings.themeKey)
          if (d.portfolio.settings?.allowCvDownload !== undefined) setAllowCvDownload(d.portfolio.settings.allowCvDownload)
          if (d.portfolio.analytics) setAnalytics(d.portfolio.analytics)
        }
      })
      .catch(() => {})
  }, [slug])

  const publicUrl = `${siteOrigin || 'http://localhost:3000'}/p/${slug}`

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveSettings = (newTheme?: PortfolioThemeKey, newAllowDownload?: boolean) => {
    const updatedTheme = newTheme ?? themeKey
    const updatedAllow = newAllowDownload ?? allowCvDownload
    setSaving(true)
    fetch(`/api/p/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_settings',
        themeKey: updatedTheme,
        allowCvDownload: updatedAllow,
      }),
    }).finally(() => setSaving(false))
  }

  const themeOptions: Array<{
    key: PortfolioThemeKey
    name: string
    category: 'Dark' | 'Light'
    desc: string
    bgPreview: string
  }> = [
    {
      key: 'obsidian-dark',
      name: 'Obsidian Dark Glass',
      category: 'Dark',
      desc: 'Dark charcoal glassmorphism with glowing amber accents.',
      bgPreview: 'bg-slate-900 border-amber-400/50 text-white',
    },
    {
      key: 'midnight-tech',
      name: 'Midnight Cyber Tech',
      category: 'Dark',
      desc: 'Deep navy developer layout with code chips & emerald status.',
      bgPreview: 'bg-slate-950 border-emerald-500/50 text-emerald-400',
    },
    {
      key: 'pearl-executive',
      name: 'Pearl Executive',
      category: 'Light',
      desc: 'Crisp white executive layout with royal indigo headings.',
      bgPreview: 'bg-white border-indigo-500/50 text-slate-900',
    },
    {
      key: 'minimal-luxe',
      name: 'Minimal Editorial Luxe',
      category: 'Light',
      desc: 'Clean warm alabaster aesthetic with refined typography.',
      bgPreview: 'bg-[#faf8f5] border-amber-200 text-slate-800',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Public Living Portfolio Banner */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Public Living Portfolio</h2>
              <p className="text-xs text-slate-500">Your dynamic web presence continuously synced from CV Studio.</p>
            </div>
          </div>

          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Live Portfolio</span>
          </a>
        </div>

        {/* Custom Vanity Slug Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 block">Custom Vanity Portfolio URL</label>
          <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1.5 focus-within:border-indigo-500">
            <span className="text-xs text-slate-500 font-mono pl-3 pr-1">{siteOrigin || 'http://localhost:3000'}/p/</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="flex-1 bg-transparent text-xs font-bold text-slate-900 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Theme Selection Cards */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-900">
          <Layout className="w-5 h-5 text-indigo-600" />
          <h2 className="text-sm font-bold">Portfolio Themes (2 Dark, 2 Light)</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {themeOptions.map((t) => {
            const isSelected = themeKey === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setThemeKey(t.key)
                  handleSaveSettings(t.key, allowCvDownload)
                }}
                className={`p-4 rounded-2xl border text-left transition-all relative space-y-2 ${
                  isSelected
                    ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{t.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    t.category === 'Dark' ? 'bg-slate-900 text-amber-400' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                  }`}>
                    {t.category}
                  </span>
                </div>

                <div className={`p-2.5 rounded-xl border text-[10px] font-mono leading-tight ${t.bgPreview}`}>
                  {t.desc}
                </div>

                {isSelected && (
                  <div className="absolute top-2 right-2 text-indigo-600">
                    <CheckCircle2 className="w-4 h-4 fill-indigo-600 text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Recruiter CV Download Toggle Setting */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-slate-900">
          <FileText className="w-5 h-5 text-indigo-600" />
          <h2 className="text-sm font-bold">Recruiter Resume Download Setting</h2>
        </div>

        <label className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer">
          <input
            type="checkbox"
            checked={allowCvDownload}
            onChange={(e) => {
              setAllowCvDownload(e.target.checked)
              handleSaveSettings(themeKey, e.target.checked)
            }}
            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
          />
          <div className="text-xs">
            <span className="font-bold text-slate-900 block">Allow Recruiter Resume (PDF) Download</span>
            <span className="text-slate-500">Renders a prominent "Download Resume" button on your web portfolio.</span>
          </div>
        </label>
      </div>

      {/* Factual Recruiter Engagement Analytics */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">Factual Recruiter Engagement Analytics</h2>
          </div>
          <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            Real-Time Tracking
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
            <Eye className="w-4 h-4 text-indigo-500 mx-auto" />
            <span className="text-lg font-black text-slate-900 block">{analytics.views}</span>
            <span className="text-[11px] font-semibold text-slate-500 block">Total Views</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
            <Users className="w-4 h-4 text-emerald-500 mx-auto" />
            <span className="text-lg font-black text-slate-900 block">{analytics.uniqueVisitors}</span>
            <span className="text-[11px] font-semibold text-slate-500 block">Unique Visitors</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
            <Download className="w-4 h-4 text-amber-500 mx-auto" />
            <span className="text-lg font-black text-slate-900 block">{analytics.downloads}</span>
            <span className="text-[11px] font-semibold text-slate-500 block">CV Downloads</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
            <MessageSquare className="w-4 h-4 text-sky-500 mx-auto" />
            <span className="text-lg font-black text-slate-900 block">{analytics.inquiries}</span>
            <span className="text-[11px] font-semibold text-slate-500 block">Recruiter Inquiries</span>
          </div>
        </div>

        {/* Factual AI Networking Co-Pilot Insights */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white space-y-2">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
            <Sparkles className="w-4 h-4" />
            <span>Factual AI Networking Intelligence</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">
            {analytics.views === 0
              ? 'Your portfolio has not received views yet. Share your vanity URL on LinkedIn and GitHub to start receiving recruiter analytics.'
              : `Your portfolio has logged ${analytics.views} factual view(s) from ${analytics.uniqueVisitors} unique visitor(s). ${
                  analytics.downloads > 0
                    ? `Recruiters have downloaded your CV ${analytics.downloads} time(s).`
                    : 'Ensure "Allow Resume Download" is enabled so hiring managers can grab your PDF.'
                }`}
          </p>
        </div>
      </div>
    </div>
  )
}
