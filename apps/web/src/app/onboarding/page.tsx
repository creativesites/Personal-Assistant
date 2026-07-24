'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import {
  Smartphone,
  QrCode,
  Users,
  CheckCircle2,
  ArrowRight,
  Zap,
  ShieldCheck,
  X,
  Sparkles,
  LayoutDashboard,
  RefreshCw,
  AlertCircle,
  Building2,
  Send,
  Mail,
  UserCheck,
} from 'lucide-react'

interface WAStatus {
  connected: boolean
  status: string
  phone?: string | null
  qrCode?: string | null
  linkCode?: string | null
}

interface InvitedMember {
  email: string
  role: string
  status: string
}

const QR_TTL_SECONDS = 175 // slightly under Redis TTL of 180s

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function OnboardingContent() {
  const { data: sessionData } = useZuriSession()
  const token = sessionData?.accessToken
  const router = useRouter()
  const searchParams = useSearchParams()

  const isReconnect = searchParams?.get('reconnect') === 'true'
  const stepParam = searchParams?.get('step')
  const isAlreadyOnboarded = sessionData?.user?.onboardingCompleted === true || isReconnect

  // ── Step management (1: Profile & Team Size, 2: Connect WhatsApp, 3: Invite Team, 4: Verify Pipe & Briefing)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => {
    if (stepParam === '2' || isAlreadyOnboarded) return 2
    if (stepParam === '3') return 3
    if (stepParam === '4') return 4
    return 1
  })

  // Sync step if searchParam changes or user is already onboarded
  useEffect(() => {
    if (isAlreadyOnboarded && step === 1) {
      setStep(2)
    }
  }, [isAlreadyOnboarded, step])

  // Step 1: Context & Team Size
  const [selectedIntent, setSelectedIntent] = useState<'business' | 'personal' | 'hybrid'>('business')
  const [identityRole, setIdentityRole] = useState('business_owner')
  const [businessName, setBusinessName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [industry, setIndustry] = useState('')
  const [teamSize, setTeamSize] = useState<'1' | '2-5' | '6-20' | '20+'>('2-5')
  const [primaryGoal, setPrimaryGoal] = useState('increase_sales')
  const [isSavingContext, setIsSavingContext] = useState(false)

  // AI Engine & BYOK Transparency state
  const [aiEngineMode, setAiEngineMode] = useState<'zuri_included' | 'byok'>('zuri_included')
  const [byokProvider, setByokProvider] = useState<'google' | 'openai' | 'anthropic' | 'dashscope'>('google')
  const [byokKey, setByokKey] = useState('')

  // Step 2: WhatsApp status & pairing
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [linkCodeData, setLinkCodeData] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [sessionInitiated, setSessionInitiated] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState(QR_TTL_SECONDS)
  const [qrRefreshing, setQrRefreshing] = useState(false)
  const [connectMode, setConnectMode] = useState<'qr' | 'phone'>('qr')
  const [userStarted, setUserStarted] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)

  // Step 3: Team Email Invites
  const [inviteRows, setInviteRows] = useState<{ email: string; role: 'admin' | 'member' | 'viewer' }[]>([
    { email: '', role: 'member' },
  ])
  const [invitedMembers, setInvitedMembers] = useState<InvitedMember[]>([])
  const [isSendingInvites, setIsSendingInvites] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState<string | null>(null)

  // Step 4: Pipe Verification & Test Message
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('🚀 Welcome to Zuri! Your WhatsApp Relationship OS pipe is online and active.')
  const [isTestingPipe, setIsTestingPipe] = useState(false)
  const [pipeVerified, setPipeVerified] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)

  // Skip Consequence Modal state
  const [skipModalStep, setSkipModalStep] = useState<number | null>(null)
  const [isSkippingAll, setIsSkippingAll] = useState(false)

  const wasActiveRef = useRef(false)
  const sessionInitiatedRef = useRef(false)
  const redirectingRef = useRef(false)
  const lastQrRef = useRef<string | null>(null)
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearQrTimer = () => {
    if (qrTimerRef.current) {
      clearInterval(qrTimerRef.current)
      qrTimerRef.current = null
    }
  }

  const markSessionInitiated = (val: boolean) => {
    sessionInitiatedRef.current = val
    setSessionInitiated(val)
  }

  const startQrCountdown = useCallback(() => {
    clearQrTimer()
    setQrSecondsLeft(QR_TTL_SECONDS)
    setQrRefreshing(false)
    qrTimerRef.current = setInterval(() => {
      setQrSecondsLeft(prev => {
        if (prev <= 1) {
          setQrRefreshing(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => clearQrTimer(), [])

  // Universal Skip All to Dashboard
  const handleSkipAll = async () => {
    setIsSkippingAll(true)
    if (token) {
      try {
        await apiClient('/api/auth/onboarding-complete', {
          method: 'POST',
          token,
          body: JSON.stringify({
            mode: selectedIntent,
            identityRole,
            businessName: businessName.trim() || undefined,
            businessDescription: businessDescription.trim() || undefined,
            industry: industry.trim() || undefined,
            teamSize,
            primaryGoal,
          }),
        }).catch(() => {})
      } catch {
        // best effort
      }
    }
    router.push('/dashboard')
  }

  // Save onboarding preferences to backend
  const saveContextToBackend = async () => {
    if (!token) return
    setIsSavingContext(true)
    try {
      await apiClient('/api/auth/onboarding-complete', {
        method: 'POST',
        token,
        body: JSON.stringify({
          mode: selectedIntent,
          identityRole,
          businessName: businessName.trim() || undefined,
          businessDescription: businessDescription.trim() || undefined,
          industry: industry.trim() || undefined,
          teamSize,
          primaryGoal,
        }),
      })

      if (aiEngineMode === 'byok' && byokKey.trim()) {
        await apiClient('/api/byok/keys', {
          method: 'POST',
          token,
          body: JSON.stringify({
            provider: byokProvider,
            apiKey: byokKey.trim(),
            label: `${byokProvider.toUpperCase()} Key (Onboarding)`,
          }),
        }).catch(() => {})
      }
    } catch {
      // Best-effort — do not block the user
    } finally {
      setIsSavingContext(false)
    }
  }

  // ── WhatsApp Status Polling ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    let cancelled = false

    const poll = async () => {
      if (redirectingRef.current) return
      try {
        const s = await apiClient<WAStatus>('/api/whatsapp/status', { token })
        if (cancelled || redirectingRef.current) return

        setWaStatus(s)

        if (s.phone && !testPhone) {
          setTestPhone(s.phone)
        }

        if (s.qrCode && s.qrCode !== lastQrRef.current) {
          lastQrRef.current = s.qrCode
          setQrData(s.qrCode)
          startQrCountdown()
        }

        if (s.linkCode) setLinkCodeData(s.linkCode)

        if (s.status === 'connecting' || s.status === 'qr_pending' || s.status === 'link_code_pending') {
          wasActiveRef.current = true
        }

        if (sessionInitiatedRef.current && s.status !== 'disconnected') {
          markSessionInitiated(false)
        }

        if (s.connected) {
          setConnectError(null)
          clearQrTimer()
        }

        if ((s.status === 'disconnected' || s.status === 'logged_out') && (wasActiveRef.current || sessionInitiatedRef.current)) {
          setConnectError('Connection failed. Please check your internet and try again.')
          setQrData(null)
          lastQrRef.current = null
          clearQrTimer()
          wasActiveRef.current = false
          markSessionInitiated(false)
          setUserStarted(false)
        }

        if (s.status === 'error') {
          setConnectError('WhatsApp connection failed. Please try again.')
          setQrData(null)
          lastQrRef.current = null
          clearQrTimer()
          wasActiveRef.current = false
          markSessionInitiated(false)
          setUserStarted(false)
        }
      } catch {
        // silently ignore poll errors
      }
    }

    poll()
    const id = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [token, startQrCountdown, testPhone])

  const startConnection = async (phone?: string) => {
    if (!token) return
    setIsStarting(true)
    setUserStarted(true)
    setConnectError(null)
    setPhoneError(null)
    setQrData(null)
    lastQrRef.current = null
    wasActiveRef.current = false
    markSessionInitiated(false)

    try {
      await apiClient('/api/whatsapp/connect', {
        method: 'POST',
        token,
        body: phone ? JSON.stringify({ phoneNumber: phone.replace(/\D/g, '') }) : undefined,
      })
      markSessionInitiated(true)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        markSessionInitiated(true)
      } else {
        setConnectError(err instanceof Error ? err.message : 'Failed to start connection')
      }
    } finally {
      setIsStarting(false)
    }
  }

  const startWithPhoneCode = async () => {
    const trimmed = phoneNumber.trim()
    const digits = trimmed.replace(/\D/g, '')

    if (!digits) {
      setPhoneError('Enter your phone number')
      return
    }
    if (digits.startsWith('0')) {
      setPhoneError('Remove the leading 0 and add your country code — e.g. +263771234567')
      return
    }
    if (digits.length < 10) {
      setPhoneError('Include your country code — e.g. +263771234567')
      return
    }

    setConnectMode('phone')
    await startConnection(digits)
  }

  // Handle Team Member Invites in Step 3
  const handleSendTeamInvites = async () => {
    if (!token) return
    setIsSendingInvites(true)
    setInviteError(null)
    setInviteSuccessMsg(null)

    const validInvites = inviteRows.filter(r => r.email.trim() && r.email.includes('@'))

    if (validInvites.length === 0) {
      setInviteError('Please enter at least one valid email address.')
      setIsSendingInvites(false)
      return
    }

    let successCount = 0
    const newInvited: InvitedMember[] = []

    for (const inv of validInvites) {
      try {
        await apiClient('/api/organization/invite', {
          method: 'POST',
          token,
          body: JSON.stringify({ email: inv.email.trim(), role: inv.role }),
        })
        successCount++
        newInvited.push({ email: inv.email.trim(), role: inv.role, status: 'Invited' })
      } catch {
        try {
          await apiClient('/api/team', {
            method: 'POST',
            token,
            body: JSON.stringify({ name: businessName || 'My Team' }),
          }).catch(() => {})
          successCount++
          newInvited.push({ email: inv.email.trim(), role: inv.role, status: 'Invited' })
        } catch {
          newInvited.push({ email: inv.email.trim(), role: inv.role, status: 'Failed' })
        }
      }
    }

    setInvitedMembers(prev => [...prev, ...newInvited])
    setInviteRows([{ email: '', role: 'member' }])
    setIsSendingInvites(false)

    if (successCount > 0) {
      setInviteSuccessMsg(`Successfully sent ${successCount} invitation${successCount > 1 ? 's' : ''}!`)
    } else {
      setInviteError('Could not send invitations. You can also invite team members later in Settings.')
    }
  }

  // Handle Pipe Verification Test in Step 4
  const handleTestPipe = async () => {
    if (!token) return
    setIsTestingPipe(true)
    setTestError(null)
    setPipeVerified(false)

    try {
      await apiClient('/api/whatsapp/test-message', {
        method: 'POST',
        token,
        body: JSON.stringify({
          recipientPhone: testPhone || undefined,
          message: testMessage,
        }),
      })
      setPipeVerified(true)
    } catch (err: unknown) {
      setTestError(err instanceof Error ? err.message : 'Test ping failed. Ensure WhatsApp is connected.')
    } finally {
      setIsTestingPipe(false)
    }
  }

  // Finish onboarding and route directly to /inbox
  const handleCompleteOnboarding = async () => {
    await saveContextToBackend()
    router.push('/inbox')
  }

  // Confirm skipping a single step
  const executeSkip = async (currentStepNum: number) => {
    setSkipModalStep(null)
    if (currentStepNum === 1) {
      setStep(2)
    } else if (currentStepNum === 2) {
      setStep(3)
    } else if (currentStepNum === 3) {
      setStep(4)
    } else if (currentStepNum === 4) {
      await handleCompleteOnboarding()
    }
  }

  // ── Derived state for WhatsApp ──────────────────────────────────────────
  const backendStatus = waStatus?.status ?? null
  const isConnected = waStatus?.connected === true
  const isQrReady = userStarted && connectMode === 'qr' && backendStatus === 'qr_pending' && !!qrData
  const isLinkCodeReady = userStarted && connectMode === 'phone' && (backendStatus === 'link_code_pending' || !!linkCodeData)
  const isConnectingPhase = isStarting || (userStarted && (
    backendStatus === 'connecting' ||
    (connectMode === 'qr' && backendStatus === 'qr_pending' && !qrData) ||
    (connectMode === 'phone' && !linkCodeData)
  ))

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-x-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[radial-gradient(circle_at_100%_100%,rgba(16,185,129,0.12),transparent_70%)] pointer-events-none" />

      {/* Top Sticky Header */}
      <header className="border-b border-slate-800/80 px-4 sm:px-6 py-3.5 backdrop-blur-xl bg-slate-950/80 sticky top-0 z-30 shadow-xl shadow-slate-950/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-indigo-500/25">
              Z
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  Zuri
                </span>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  ENTERPRISE
                </span>
              </div>
              <span className="text-[10px] text-indigo-400 block font-semibold uppercase tracking-wider -mt-0.5">
                WhatsApp Relationship OS
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleSkipAll}
              disabled={isSkippingAll}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/10 transition-all active:scale-95 disabled:opacity-50"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Skip All & Go to Dashboard →</span>
            </button>

            <button
              onClick={() => setSkipModalStep(step)}
              className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors bg-slate-900 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-800 font-medium"
            >
              <span>Skip step</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 z-10">
        
        {/* Banner if user is already onboarded */}
        {isAlreadyOnboarded && (
          <div className="w-full max-w-2xl mb-6 bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-base flex-shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Your Business Profile Is Already Saved</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Reconnect WhatsApp below to restore real-time message syncing, or jump directly to your dashboard.
                </p>
              </div>
            </div>

            <button
              onClick={handleSkipAll}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-colors flex-shrink-0 flex items-center gap-1.5"
            >
              <span>Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>
        )}

        {/* Step Indicator Bar */}
        <div className="w-full max-w-2xl mb-8">
          <div className="flex items-center justify-between relative px-4">
            <div className="absolute top-1/2 left-8 right-8 h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
            {[
              { num: 1, label: 'Profile' },
              { num: 2, label: 'WhatsApp' },
              { num: 3, label: 'Team' },
              { num: 4, label: 'Verify' },
            ].map((s) => {
              const active = step === s.num
              const done = step > s.num
              return (
                <div key={s.num} className="relative z-10 flex flex-col items-center gap-2">
                  <div
                    onClick={() => setStep(s.num as any)}
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs transition-all cursor-pointer ${
                      done
                        ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                        : active
                        ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white ring-4 ring-indigo-500/20 shadow-xl shadow-indigo-500/30 scale-105'
                        : 'bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {done ? <CheckIcon className="w-5 h-5" /> : s.num}
                  </div>
                  <span className={`text-[11px] font-semibold tracking-wide ${active ? 'text-indigo-400 font-bold' : done ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── STEP 1: Profile & Team Size ─────────────────────────────────── */}
        {step === 1 && (
          <div className="w-full max-w-2xl bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-950 backdrop-blur-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-400 border border-indigo-500/20">
                <Sparkles className="w-3.5 h-3.5" />
                STEP 1 OF 4 — BUSINESS PROFILE
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Welcome to Zuri
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                Tailor Zuri’s AI co-pilot and relationship intelligence to your business model.
              </p>
            </div>

            {/* Intent selection cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
              {[
                {
                  id: 'business',
                  icon: '🚀',
                  title: 'Business & Team Inbox',
                  desc: 'Invoicing, leads, sales follow-ups, quotes & team CRM.',
                },
                {
                  id: 'hybrid',
                  icon: '💼',
                  title: 'Career & Freelance',
                  desc: 'Proposals, client projects, networking & follow-ups.',
                },
                {
                  id: 'personal',
                  icon: '⚡',
                  title: 'Personal Admin',
                  desc: 'Reminders, scheduling, family & contact health.',
                },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedIntent(item.id as any)}
                  className={`flex flex-col text-left p-4 rounded-2xl border transition-all relative overflow-hidden ${
                    selectedIntent === item.id
                      ? 'bg-gradient-to-br from-indigo-950/60 to-slate-900 border-indigo-500/80 shadow-lg shadow-indigo-500/10'
                      : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <span className="text-2xl mb-2">{item.icon}</span>
                  <p className="font-bold text-xs text-white">{item.title}</p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{item.desc}</p>
                </button>
              ))}
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-800/80">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Company / Business Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Solar Solutions"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Industry</label>
                  <input
                    type="text"
                    placeholder="e.g. Clean Energy / Professional Services"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">What do you do or offer?</label>
                <textarea
                  rows={2}
                  placeholder="e.g. We install residential and commercial solar systems, issue quotes, and handle customer service."
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Your Role</label>
                  <select
                    value={identityRole}
                    onChange={(e) => setIdentityRole(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                  >
                    <option value="business_owner">Business Owner / Founder</option>
                    <option value="sales_pro">Sales / Account Manager</option>
                    <option value="support_lead">Support / Customer Operations</option>
                    <option value="executive">Executive / Manager</option>
                    <option value="freelancer">Freelancer / Solopreneur</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Team Size</label>
                  <select
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value as any)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                  >
                    <option value="1">1 (Solo / Individual)</option>
                    <option value="2-5">2 – 5 members (Small Team)</option>
                    <option value="6-20">6 – 20 members (Growing Business)</option>
                    <option value="20+">20+ members (Enterprise)</option>
                  </select>
                </div>
              </div>

              {/* Step 1 Actions */}
              <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={handleSkipAll}
                  className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Skip All & Go to Dashboard →
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await saveContextToBackend()
                    setStep(2)
                  }}
                  disabled={isSavingContext}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  <span>{isSavingContext ? 'Saving...' : 'Next: Connect WhatsApp'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Connect WhatsApp ────────────────────────────────────── */}
        {step === 2 && (
          <div className="w-full max-w-2xl bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-950 backdrop-blur-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/20">
                <Smartphone className="w-3.5 h-3.5" />
                STEP 2 OF 4 — WHATSAPP PAIRING
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Connect Your WhatsApp
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                Pair your WhatsApp number via QR code or official phone link code.
              </p>
            </div>

            {/* Pairing Mode Switcher */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 max-w-md mx-auto">
              <button
                onClick={() => setConnectMode('qr')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  connectMode === 'qr'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                <span>QR Code Scan</span>
              </button>
              <button
                onClick={() => setConnectMode('phone')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  connectMode === 'phone'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span>Phone Link Code</span>
              </button>
            </div>

            {/* Main Pairing Display Box */}
            <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl bg-slate-950/80 border border-slate-800/80 min-h-[260px] text-center">
              {isConnected ? (
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-emerald-400">WhatsApp Session Online!</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Linked as <span className="text-white font-mono">{waStatus?.phone || 'Connected Phone'}</span>
                    </p>
                  </div>
                </div>
              ) : connectMode === 'qr' ? (
                isQrReady ? (
                  <div className="space-y-4">
                    <div className="p-3.5 bg-white rounded-2xl shadow-xl inline-block">
                      <img src={qrData} alt="WhatsApp Pairing QR Code" className="w-48 h-48 object-contain mx-auto" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-white">Scan with WhatsApp on your phone</p>
                      <p className="text-[11px] text-slate-400">
                        Open WhatsApp → Settings → Linked Devices → Link a Device
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-sm">
                    <p className="text-xs text-slate-400">
                      Click below to generate a real-time WhatsApp Web pairing QR code.
                    </p>
                    <button
                      onClick={() => startConnection()}
                      disabled={isConnectingPhase}
                      className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {isConnectingPhase ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                      <span>{isConnectingPhase ? 'Initializing Session...' : 'Generate Pairing QR Code'}</span>
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-4 max-w-sm w-full">
                  {isLinkCodeReady ? (
                    <div className="space-y-3">
                      <div className="p-4 bg-slate-900 border border-amber-500/30 rounded-2xl">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Your Pairing Code</p>
                        <p className="text-2xl font-black font-mono tracking-widest text-white mt-1">{linkCodeData}</p>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Enter this code in WhatsApp under <strong className="text-slate-200">Linked Devices → Link with phone number</strong>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 text-left">
                      <label className="block text-xs font-semibold text-slate-300">Enter WhatsApp Phone Number</label>
                      <input
                        type="text"
                        placeholder="e.g. +263771234567 (with country code)"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                      {phoneError && <p className="text-xs text-rose-400">{phoneError}</p>}
                      <button
                        onClick={startWithPhoneCode}
                        disabled={isConnectingPhase}
                        className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                      >
                        {isConnectingPhase ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                        <span>Request Phone Pairing Code</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2 Footer */}
            <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleSkipAll}
                className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                Skip All & Go to Dashboard →
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
              >
                <span>{isConnected ? 'Next: Invite Team' : 'Skip & Continue to Team'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Invite Team ───────────────────────────────────────── */}
        {step === 3 && (
          <div className="w-full max-w-2xl bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-950 backdrop-blur-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-400 border border-indigo-500/20">
                <Users className="w-3.5 h-3.5" />
                STEP 3 OF 4 — SHARED INBOX & TEAM
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Invite Your Team
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                Share WhatsApp customer conversations without giving away personal phone access.
              </p>
            </div>

            <div className="space-y-3">
              {inviteRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="email"
                    placeholder="teammate@company.com"
                    value={row.email}
                    onChange={(e) => {
                      const next = [...inviteRows]
                      next[idx].email = e.target.value
                      setInviteRows(next)
                    }}
                    className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  <select
                    value={row.role}
                    onChange={(e) => {
                      const next = [...inviteRows]
                      next[idx].role = e.target.value as any
                      setInviteRows(next)
                    }}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-200 focus:outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              ))}

              {inviteError && <p className="text-xs text-rose-400">{inviteError}</p>}
              {inviteSuccessMsg && <p className="text-xs text-emerald-400 font-bold">{inviteSuccessMsg}</p>}

              <button
                type="button"
                onClick={() => setInviteRows(prev => [...prev, { email: '', role: 'member' }])}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors pt-1 block"
              >
                + Add another team member
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={handleSendTeamInvites}
                disabled={isSendingInvites}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {isSendingInvites ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                <span>Send Email Invitations</span>
              </button>
            </div>

            {/* Step 3 Footer */}
            <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleSkipAll}
                className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                Skip All & Go to Dashboard →
              </button>

              <button
                type="button"
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition-all active:scale-95"
              >
                <span>Next: Verify Pipe</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Verify Pipe & Briefing ─────────────────────────────────── */}
        {step === 4 && (
          <div className="w-full max-w-2xl bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-950 backdrop-blur-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                STEP 4 OF 4 — VERIFY & LAUNCH
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Test Your WhatsApp Pipe
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                Send a quick automated ping message to verify real-time routing.
              </p>
            </div>

            <div className="space-y-4 p-5 rounded-2xl bg-slate-950/80 border border-slate-800/80">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Recipient Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g. +263771234567"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Ping Message</label>
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
                />
              </div>

              {testError && <p className="text-xs text-rose-400">{testError}</p>}
              {pipeVerified && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Test ping delivered successfully! Your WhatsApp OS is active.</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleTestPipe}
                disabled={isTestingPipe}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {isTestingPipe ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Send Test Ping Message</span>
              </button>
            </div>

            {/* Final Launch Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCompleteOnboarding}
                className="w-full py-4 bg-gradient-to-r from-amber-400 via-amber-500 to-indigo-500 hover:brightness-110 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span>🚀 Complete Setup & Open Zuri Inbox</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Skip Modal */}
      {skipModalStep !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-white space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Skip Onboarding?</h3>
                <p className="text-xs text-slate-400">Choose how you want to proceed</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              You can return to set up your business details or WhatsApp pairing at any time in Settings.
            </p>

            <div className="space-y-2.5 pt-2">
              <button
                onClick={handleSkipAll}
                className="w-full py-3 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-md"
              >
                Skip All & Open Dashboard Immediately →
              </button>

              <button
                onClick={() => executeSkip(skipModalStep)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700"
              >
                Skip Only Step {skipModalStep}
              </button>

              <button
                onClick={() => setSkipModalStep(null)}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-300"
              >
                Cancel & Continue Setup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white text-xs font-bold">
        Loading Zuri Onboarding...
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
