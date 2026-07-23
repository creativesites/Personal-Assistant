'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  User, Smartphone, Settings, CreditCard, Wrench, LogOut, Sparkles,
  Briefcase, Building2, Globe, Mail, Phone, ShieldCheck, Check, Edit3,
  Loader2, Zap, Users, MessageSquare, ArrowRight, Bot, ExternalLink
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { ModeBadge, PageHeader, SkeletonCard, useToast } from '@/components/ui'

interface WhatsAppStatus {
  connected: boolean
  phone?: string
  sessionState?: string
  lastConnectedAt?: string
}

interface UserStats {
  totalContacts: number
  totalMessages: number
  totalSuggestions: number
}

interface BusinessProfile {
  id: string
  companyName: string | null
  tagline: string | null
  industry: string | null
  brandVoice: string | null
  email: string | null
  phone: string | null
  website: string | null
}

export default function ProfilePage() {
  const session = useZuriSession()
  const { addToast } = useToast()
  const token = session.data?.accessToken

  const { data: waData, refetch: refetchWA } = useApi<WhatsAppStatus>('/api/whatsapp/status', token)
  const { data: statsData } = useApi<{ stats: UserStats }>('/api/users/me/stats', token)
  const { data: profileData, refetch: refetchProfile } = useApi<BusinessProfile>('/api/business-profile', token)

  const [disconnecting, setDisconnecting] = useState(false)
  const [isEditingBrand, setIsEditingBrand] = useState(false)
  const [savingBrand, setSavingBrand] = useState(false)

  // Edit form state
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [brandVoice, setBrandVoice] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')

  useEffect(() => {
    if (profileData) {
      setCompanyName(profileData.companyName || '')
      setIndustry(profileData.industry || '')
      setBrandVoice(profileData.brandVoice || 'Professional & Consultative')
      setBusinessEmail(profileData.email || session.data?.user?.email || '')
      setBusinessPhone(profileData.phone || '')
    }
  }, [profileData, session.data?.user?.email])

  const user = session.data?.user
  const mode = session.data?.mode ?? 'business'
  const stats = statsData?.stats

  const initials = (() => {
    const name = user?.name
    if (!name) return user?.email?.charAt(0).toUpperCase() ?? '?'
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  })()

  const disconnectWA = async () => {
    if (!token) return
    setDisconnecting(true)
    try {
      await apiClient('/api/whatsapp/connect', { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'WhatsApp disconnected' })
      refetchWA()
    } catch {
      addToast({ variant: 'error', title: 'Failed to disconnect', description: 'Please try again.' })
    } finally {
      setDisconnecting(false)
    }
  }

  const handleSaveBrandProfile = async () => {
    if (!token) return
    setSavingBrand(true)
    try {
      await apiClient('/api/business-profile', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          companyName: companyName.trim() || undefined,
          industry: industry.trim() || undefined,
          brandVoice: brandVoice.trim() || undefined,
          email: businessEmail.trim() || undefined,
          phone: businessPhone.trim() || undefined,
        }),
      })
      addToast({ variant: 'success', title: 'AI Identity Profile Updated', description: 'Zuri will use these details when drafting replies and briefs.' })
      setIsEditingBrand(false)
      refetchProfile()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not update identity profile', description: 'Please check your inputs and try again.' })
    } finally {
      setSavingBrand(false)
    }
  }

  if (session.status === 'loading') {
    return (
      <div className="flex flex-col h-full bg-slate-950">
        <PageHeader title="Profile & Account" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl mx-auto w-full">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100">
      <PageHeader title="Profile & Account" description="Manage your Zuri AI identity, business context, connected WhatsApp sessions, and workspace preferences." />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* 1. Hero Identity Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              
              <div className="flex items-center gap-5">
                <div className="relative flex-shrink-0">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-400 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-indigo-600/30 ring-2 ring-white/10">
                    {initials}
                  </div>
                  <span
                    className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-slate-950 ${
                      waData?.connected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-amber-500 animate-pulse'
                    }`}
                    title={waData?.connected ? 'WhatsApp Connected' : 'WhatsApp Disconnected'}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-white tracking-tight">{user?.name || user?.email}</h2>
                    <ModeBadge mode={mode} />
                  </div>
                  {user?.email && <p className="text-sm text-slate-400 font-medium">{user.email}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold">
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      Zuri OS Member
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-medium">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" /> Clerk SSO
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <Link
                  href="/settings"
                  className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors border border-slate-700"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  Settings
                </Link>
                <Link
                  href="/diagnostics"
                  className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-lg shadow-indigo-600/20"
                >
                  <Wrench className="w-4 h-4" />
                  Diagnostics
                </Link>
              </div>

            </div>

            {/* Live Metrics Row */}
            <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-3 gap-4 text-center">
              <div className="bg-slate-900/50 rounded-2xl p-3 border border-slate-800/50">
                <p className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1">
                  <Users className="w-3.5 h-3.5 text-indigo-400" /> Contacts
                </p>
                <p className="text-lg font-bold text-white mt-1 tabular-nums">
                  {stats?.totalContacts.toLocaleString() ?? '—'}
                </p>
              </div>
              <div className="bg-slate-900/50 rounded-2xl p-3 border border-slate-800/50">
                <p className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-400" /> Messages
                </p>
                <p className="text-lg font-bold text-white mt-1 tabular-nums">
                  {stats?.totalMessages.toLocaleString() ?? '—'}
                </p>
              </div>
              <div className="bg-slate-900/50 rounded-2xl p-3 border border-slate-800/50">
                <p className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> AI Moves
                </p>
                <p className="text-lg font-bold text-white mt-1 tabular-nums">
                  {stats?.totalSuggestions.toLocaleString() ?? '—'}
                </p>
              </div>
            </div>
          </div>

          {/* 2. AI Identity & Business Context Card */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">AI Identity & Business Context</h3>
                  <p className="text-xs text-slate-400">
                    Zuri uses these facts when drafting replies, briefings, and quotes.
                  </p>
                </div>
              </div>

              {!isEditingBrand ? (
                <button
                  onClick={() => setIsEditingBrand(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                  Edit Profile
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEditingBrand(false)}
                    disabled={savingBrand}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveBrandProfile}
                    disabled={savingBrand}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-colors"
                  >
                    {savingBrand ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save Changes
                  </button>
                </div>
              )}
            </div>

            {!isEditingBrand ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Company / Work Name</span>
                  <p className="text-sm font-semibold text-slate-200">{companyName || 'Not specified'}</p>
                </div>
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Industry / Domain</span>
                  <p className="text-sm font-semibold text-slate-200">{industry || 'General Professional Services'}</p>
                </div>
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Brand Tone & Voice</span>
                  <p className="text-sm font-semibold text-indigo-300">{brandVoice}</p>
                </div>
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Business Contact Info</span>
                  <p className="text-sm font-semibold text-slate-200">
                    {businessEmail || 'None'} {businessPhone ? `• +${businessPhone}` : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">Company / Work Name</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="e.g. Acme Consultancy"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">Industry / Field</label>
                    <input
                      type="text"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      placeholder="e.g. Digital Marketing, Solar Energy"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">AI Brand Voice & Tone</label>
                  <select
                    value={brandVoice}
                    onChange={e => setBrandVoice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Professional & Consultative">Professional & Consultative</option>
                    <option value="Friendly & Warm">Friendly & Warm</option>
                    <option value="Direct & Efficient">Direct & Executive</option>
                    <option value="Casual & Conversational">Casual & Conversational</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">Business Email</label>
                    <input
                      type="email"
                      value={businessEmail}
                      onChange={e => setBusinessEmail(e.target.value)}
                      placeholder="contact@company.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">Business Phone</label>
                    <input
                      type="text"
                      value={businessPhone}
                      onChange={e => setBusinessPhone(e.target.value)}
                      placeholder="e.g. 260971234567"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. WhatsApp Session Status Card */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  waData?.connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">WhatsApp Integration</h3>
                  <p className="text-xs text-slate-400">Baileys WebSocket real-time session status.</p>
                </div>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                waData?.connected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {waData?.connected ? 'Live & Connected' : 'Disconnected'}
              </span>
            </div>

            <div className="p-6">
              {waData?.connected ? (
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Connected Phone</p>
                    <p className="text-xs text-emerald-400 font-mono mt-0.5">+{waData.phone || 'Active Session'}</p>
                    {waData.lastConnectedAt && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Last synced: {new Date(waData.lastConnectedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={disconnectWA}
                    disabled={disconnecting}
                    className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect Session'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">No active WhatsApp session</p>
                    <p className="text-xs text-slate-400 mt-0.5">Connect via QR code scan or 8-character phone link code.</p>
                  </div>
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-lg shadow-indigo-600/20"
                  >
                    <Smartphone className="w-4 h-4" />
                    Pair WhatsApp Now
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* 4. Quick Account Actions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              href="/billing"
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all group space-y-2 shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <CreditCard className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-white">Billing & Tier</h4>
              <p className="text-xs text-slate-400">View current plan, active usage, and Stripe payment methods.</p>
            </Link>

            <Link
              href="/settings"
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all group space-y-2 shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                <Bot className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-white">Auto Responses & AI</h4>
              <p className="text-xs text-slate-400">Configure approval rules, BYOK keys, and autonomous agents.</p>
            </Link>

            <Link
              href="/diagnostics"
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all group space-y-2 shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <Wrench className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-white">System Health</h4>
              <p className="text-xs text-slate-400">Run 7 live connection checks and historical intelligence sync.</p>
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}

