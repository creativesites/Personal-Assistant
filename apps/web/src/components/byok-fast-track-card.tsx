'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Key, Zap, ExternalLink, Check, ShieldCheck, ArrowRight } from 'lucide-react'
import { useToast } from '@/components/ui'
import { apiClient } from '@/lib/api'

export function ByokFastTrackCard({
  token,
  onSaved,
  compact = false,
}: {
  token?: string | null
  onSaved?: () => void
  compact?: boolean
}) {
  const { addToast } = useToast()
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasKey, setHasKey] = useState<boolean | null>(null)

  useEffect(() => {
    if (!token) return
    let isMounted = true
    apiClient<{ keys?: unknown[] }>('/api/byok/keys', { token })
      .then((res) => {
        if (!isMounted) return
        if (Array.isArray(res?.keys) && res.keys.length > 0) {
          setHasKey(true)
        } else {
          setHasKey(false)
        }
      })
      .catch(() => {
        if (isMounted) setHasKey(false)
      })
    return () => {
      isMounted = false
    }
  }, [token])

  const handleSave = async () => {
    if (!apiKey.trim()) {
      addToast({ title: 'Please enter a valid API key', variant: 'error' })
      return
    }

    setLoading(true)
    try {
      await apiClient(
        '/api/settings/byok',
        {
          method: 'POST',
          token: token ?? undefined,
          body: JSON.stringify({ provider: 'google', apiKey: apiKey.trim(), model: 'gemini-3.6-flash' }),
        }
      )
      setSaved(true)
      setHasKey(true)
      addToast({ title: '⚡ Dedicated Gemini API Key Saved!', description: 'Your AI requests will now run at maximum speed with zero shared queues.', variant: 'success' })
      if (onSaved) onSaved()
    } catch (err: any) {
      addToast({ title: 'Failed to save API key', description: err.message || 'Check your key and try again', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  // Do not show prompt card if key is already added or saved
  if (hasKey === true || saved) {
    return null
  }

  if (compact) {
    return (
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 text-white rounded-2xl p-4 border border-indigo-500/30 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider uppercase text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                  Fast-Track Speed
                </span>
                <span className="text-xs text-indigo-200 font-medium">100% Free Gemini Key</span>
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-0.5">
                Bypass shared rate limits &amp; enjoy dedicated 1:1 AI speed in 30 seconds.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors border border-white/10"
            >
              <span>Get Free Key</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
            </a>
            <input
              type="password"
              placeholder="Paste AI key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1 md:w-48 px-3 py-2 rounded-xl bg-slate-900/80 border border-indigo-500/40 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saved}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {saved ? <Check className="w-4 h-4 text-emerald-400 inline" /> : loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 border border-indigo-500/30 shadow-2xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
              <Zap className="w-3 h-3 text-amber-400" />
              BYOK Fast-Track Guide
            </span>
            <span className="text-xs text-slate-400 font-medium">Bring Your Own Key</span>
          </div>
          <h3 className="text-lg font-black text-white tracking-tight">
            Get Dedicated 1:1 AI Speed at $0 Cost
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
            During Zuri’s public testing phase, all users share a common API key pool. By adding your own <b>100% Free Google Gemini API Key</b>, your AI requests route directly with zero queue waiting, maximum privacy, and no rate limit bottlenecks.
          </p>
        </div>
      </div>

      {/* 3 Step Setup Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
        <div className="bg-slate-900/80 rounded-2xl p-3.5 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-400/40 text-indigo-300 font-black text-xs flex items-center justify-center">1</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <h4 className="text-xs font-bold text-white">Get Free Key</h4>
          <p className="text-[11px] text-slate-300 leading-normal">
            Open Google AI Studio. No credit card required.
          </p>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-300 hover:text-indigo-200 pt-1"
          >
            <span>Open AI Studio</span>
            <ArrowRight className="w-3 h-3" />
          </a>
        </div>

        <div className="bg-slate-900/80 rounded-2xl p-3.5 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-400/40 text-indigo-300 font-black text-xs flex items-center justify-center">2</span>
            <Key className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <h4 className="text-xs font-bold text-white">Click "Create API Key"</h4>
          <p className="text-[11px] text-slate-300 leading-normal">
            Generate your secret key string in 1 click.
          </p>
        </div>

        <div className="bg-slate-900/80 rounded-2xl p-3.5 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-400/40 text-indigo-300 font-black text-xs flex items-center justify-center">3</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <h4 className="text-xs font-bold text-white">Paste Below &amp; Save</h4>
          <p className="text-[11px] text-slate-300 leading-normal">
            Zuri instantly routes all your AI requests through your key.
          </p>
        </div>
      </div>

      {/* Input row */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
        <div className="relative flex-1 w-full">
          <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="password"
            placeholder="Paste your Gemini API key (e.g. AIzaSy...)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-900 border border-indigo-500/40 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saved}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-xs font-extrabold text-white transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {saved ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Key Saved!</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{loading ? 'Validating & Saving...' : 'Save Gemini Key'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
