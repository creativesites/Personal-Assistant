'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'

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

function Spinner({ className }: { className?: string }) {
  return (
    <div className={`rounded-full border-2 border-transparent border-t-current animate-spin ${className}`} />
  )
}

export default function OnboardingPage() {
  const { data: sessionData } = useZuriSession()
  const token = sessionData?.accessToken
  const router = useRouter()

  // ── Step management (1: Profile & Team Size, 2: Connect WhatsApp, 3: Invite Team, 4: Verify Pipe & Briefing)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

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
  const [connectMode, setConnectMode] = useState<'choose' | 'qr' | 'phone'>('qr')
  const [userStarted, setUserStarted] = useState(false)
  const [showPhoneInput, setShowPhoneInput] = useState(false)
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
          setConnectMode('choose')
          setShowPhoneInput(false)
        }

        if (s.status === 'error') {
          setConnectError('WhatsApp connection failed. Please try again.')
          setQrData(null)
          lastQrRef.current = null
          clearQrTimer()
          wasActiveRef.current = false
          markSessionInitiated(false)
          setUserStarted(false)
          setConnectMode('choose')
          setShowPhoneInput(false)
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
        setConnectMode('choose')
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
        // Fallback to legacy team endpoint if organization is not active
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

  // Finish onboarding and route to dashboard
  const handleCompleteOnboarding = async () => {
    await saveContextToBackend()
    router.push('/dashboard')
  }

  // Confirm skipping a step
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
  const hasError = backendStatus === 'error' || !!connectError
  const isIdle = waStatus !== null && !isConnectingPhase && !hasError && !isQrReady && !isLinkCodeReady && !isConnected
  const isFirstLoad = waStatus === null && !connectError
  const showChooser = (isIdle || isFirstLoad) && connectMode === 'choose' && !isStarting && !sessionInitiated

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white flex flex-col">
      {/* Top Header */}
      <header className="border-b border-white/10 px-6 py-4 backdrop-blur-md bg-slate-950/60 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
              Z
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
                Zuri
              </span>
              <span className="text-[10px] text-indigo-400 block font-medium -mt-1">
                WhatsApp Relationship OS
              </span>
            </div>
          </div>
          <button
            onClick={() => setSkipModalStep(step)}
            className="text-xs text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
          >
            Skip step →
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {/* Step Indicator Header */}
        <div className="w-full max-w-2xl mb-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/10 -translate-y-1/2 z-0" />
            {[
              { num: 1, label: 'Profile & Team' },
              { num: 2, label: 'WhatsApp Pairing' },
              { num: 3, label: 'Invite Team' },
              { num: 4, label: 'Verify Pipe' },
            ].map((s) => {
              const active = step === s.num
              const done = step > s.num
              return (
                <div key={s.num} className="relative z-10 flex flex-col items-center gap-1.5">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-xs transition-all ${
                      done
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                        : active
                        ? 'bg-indigo-500 text-white ring-4 ring-indigo-500/20 shadow-lg shadow-indigo-500/40 scale-105'
                        : 'bg-slate-800 text-gray-400 border border-white/10'
                    }`}
                  >
                    {done ? <CheckIcon className="w-5 h-5" /> : s.num}
                  </div>
                  <span className={`text-[11px] font-medium text-center hidden sm:block ${active ? 'text-indigo-400 font-bold' : done ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── STEP 1: Profile & Team Size ─────────────────────────────────── */}
        {step === 1 && (
          <div className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-indigo-300">
                Welcome to Zuri 👋
              </h1>
              <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto">
                Set up your WhatsApp Relationship Operating System for your business and team.
              </p>
            </div>

            {/* Intent selection cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
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
                  className={`flex flex-col text-left p-4 rounded-xl border transition-all relative overflow-hidden ${
                    selectedIntent === item.id
                      ? 'bg-indigo-600/20 border-indigo-500/80 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/50'
                      : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <span className="text-2xl mb-2">{item.icon}</span>
                  <p className="font-bold text-xs text-white">{item.title}</p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{item.desc}</p>
                </button>
              ))}
            </div>

            <div className="space-y-4 pt-2 border-t border-white/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">Company / Business Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Solar Solutions"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">Industry</label>
                  <input
                    type="text"
                    placeholder="e.g. Clean Energy / Retail / Professional Services"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">What do you do or offer?</label>
                <textarea
                  rows={2}
                  placeholder="e.g. We install residential and commercial solar systems, issue quotes, and handle customer service."
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">Your Role</label>
                  <select
                    value={identityRole}
                    onChange={(e) => setIdentityRole(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="business_owner">Business Owner / Founder</option>
                    <option value="sales_pro">Sales / Account Manager</option>
                    <option value="support_lead">Support / Customer Operations</option>
                    <option value="executive">Executive / Manager</option>
                    <option value="freelancer">Freelancer / Solopreneur</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">Team Size</label>
                  <select
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value as any)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="1">1 (Solo / Individual)</option>
                    <option value="2-5">2 – 5 members (Small Team)</option>
                    <option value="6-20">6 – 20 members (Growing Business)</option>
                    <option value="20+">20+ members (Enterprise)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">Primary Goal</label>
                <select
                  value={primaryGoal}
                  onChange={(e) => setPrimaryGoal(e.target.value)}
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="increase_sales">Close more sales & automated follow-ups</option>
                  <option value="team_coordination">Coordinate team WhatsApp inbox & agent routing</option>
                  <option value="save_time">Save time responding to customer inquiries</option>
                  <option value="manage_relationships">Keep track of key customer relationships</option>
                </select>
              </div>

              {/* AI Engine & BYOK Transparency Card */}
              <div className="bg-indigo-950/60 border border-indigo-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    🤖
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-indigo-200">AI Intelligence Engine & Usage Credits</h4>
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        500 Included Drafts / Mo
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">
                      Zuri uses AI to draft replies and analyze customer intent. You can use our included credits (500 messages/month) or connect your own OpenAI/Anthropic/Google key for unlimited usage.
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-indigo-500/20">
                  <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
                    Execution Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAiEngineMode('zuri_included')}
                      className={`px-3 py-2.5 rounded-lg text-left border transition-all ${
                        aiEngineMode === 'zuri_included'
                          ? 'bg-indigo-600/30 border-indigo-400 ring-1 ring-indigo-400/50'
                          : 'bg-slate-950/60 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <p className="font-semibold text-xs text-white">Use Zuri Included Credits</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">500 msgs/mo · Zero setup required</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAiEngineMode('byok')}
                      className={`px-3 py-2.5 rounded-lg text-left border transition-all ${
                        aiEngineMode === 'byok'
                          ? 'bg-indigo-600/30 border-indigo-400 ring-1 ring-indigo-400/50'
                          : 'bg-slate-950/60 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <p className="font-semibold text-xs text-white">Connect Own AI Key (BYOK)</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Unlimited usage · Pay AI provider directly</p>
                    </button>
                  </div>

                  {aiEngineMode === 'byok' && (
                    <div className="mt-3 space-y-2.5 bg-slate-950 p-3 rounded-lg border border-white/15">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-gray-300">Provider</label>
                        <select
                          value={byokProvider}
                          onChange={(e) => setByokProvider(e.target.value as any)}
                          className="bg-slate-900 border border-white/15 text-[11px] text-gray-200 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="google">Google Gemini</option>
                          <option value="openai">OpenAI (GPT-4o)</option>
                          <option value="anthropic">Anthropic (Claude 3.5)</option>
                          <option value="dashscope">Alibaba Qwen</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-300 mb-1">API Key</label>
                        <input
                          type="password"
                          placeholder={byokProvider === 'google' ? 'AIzaSy...' : byokProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                          value={byokKey}
                          onChange={(e) => setByokKey(e.target.value)}
                          className="w-full bg-slate-900 border border-white/15 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                      <p className="text-[10px] text-gray-400">
                        🔒 Encrypted and stored securely. Used exclusively for your workspace's AI execution.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Safety & Privacy Guarantee Card */}
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <span className="text-base">🛡️</span>
                  <span>"You're Safe Here" — Data Privacy & Zero-Training Guarantee</span>
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  Your team's WhatsApp messages and customer data remain 100% private to your workspace. We store conversation data in AES-256 encrypted database partitions and <strong>never sell, share, or train AI models</strong> on your private chats.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-emerald-200/90 font-medium pt-1 border-t border-emerald-500/20">
                  <div className="flex items-center gap-1">
                    <span>🔒</span> AES-256 Encrypted
                  </div>
                  <div className="flex items-center gap-1">
                    <span>🏢</span> Workspace Partitioned
                  </div>
                  <div className="flex items-center gap-1">
                    <span>🤖</span> Zero Model Training
                  </div>
                  <div className="flex items-center gap-1">
                    <span>👤</span> Human-in-Loop Approval
                  </div>
                  <div className="flex items-center gap-1">
                    <span>🗑️</span> Purge Data Anytime
                  </div>
                  <div className="flex items-center gap-1">
                    <span>📦</span> Export Data Anytime
                  </div>
                  <div className="flex items-center gap-1">
                    <span>📜</span> GDPR Compliant
                  </div>
                </div>
              </div>

            </div>

            <div className="pt-4 flex items-center justify-between border-t border-white/10">
              <button
                onClick={() => setSkipModalStep(1)}
                className="text-xs text-gray-400 hover:text-white underline underline-offset-4"
              >
                Skip for now
              </button>
              <button
                onClick={async () => {
                  await saveContextToBackend()
                  setStep(2)
                  if (!userStarted) {
                    setConnectMode('qr')
                    startConnection()
                  }
                }}
                disabled={isSavingContext}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2"
              >
                {isSavingContext ? <Spinner className="w-4 h-4 text-white" /> : 'Continue to WhatsApp Pairing →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: WhatsApp Pairing ────────────────────────────────────── */}
        {step === 2 && (
          <div className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 sm:p-8 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Pair your WhatsApp account</h2>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Connect your WhatsApp number so Zuri can ingest messages, generate reply drafts, and route leads to your team.
                  </p>
                </div>
                {isConnected && (
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-semibold flex items-center gap-1.5 flex-shrink-0">
                    <CheckIcon className="w-3.5 h-3.5" /> Connected
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {!userStarted && !isConnected && (
                <div className="text-center py-4 space-y-4">
                  <p className="text-sm text-gray-300">Ready to pair your phone with Zuri?</p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => { setConnectMode('qr'); startConnection() }}
                      disabled={isStarting}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                    >
                      {isStarting ? <Spinner className="w-4 h-4 text-white" /> : '📷 Display QR Code'}
                    </button>
                  </div>
                </div>
              )}

              {/* QR display & Step-by-Step Instructions */}
              {userStarted && !isConnected && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                    {/* Left: QR / Code Box */}
                    <div className="sm:col-span-6 flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-2xl border border-white/10 text-center min-h-[220px]">
                      {isConnectingPhase && (
                        <div className="flex flex-col items-center gap-3 py-6">
                          <Spinner className="w-8 h-8 text-indigo-400" />
                          <p className="text-xs text-gray-400">Generating WhatsApp session…</p>
                        </div>
                      )}

                      {isQrReady && (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-48 h-48 bg-white p-2.5 rounded-2xl shadow-2xl relative">
                            <img src={qrData!} alt="WhatsApp QR Code" className="w-full h-full rounded-xl" />
                          </div>
                          <span className="text-[11px] text-indigo-300 font-mono">
                            Expires in {fmtTime(qrSecondsLeft)} {qrRefreshing && '(Refreshing…)'}
                          </span>
                        </div>
                      )}

                      {isLinkCodeReady && (
                        <div className="space-y-3 py-4">
                          <p className="text-xs text-gray-400">Enter this code in WhatsApp:</p>
                          <div className="bg-indigo-500/20 border border-indigo-500/40 px-5 py-3 rounded-xl font-mono text-2xl font-bold tracking-widest text-indigo-300">
                            {linkCodeData}
                          </div>
                        </div>
                      )}

                      {hasError && (
                        <div className="space-y-3 p-3">
                          <p className="text-xs text-red-400">{connectError || 'Session failed'}</p>
                          <button
                            onClick={() => startConnection()}
                            className="px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg"
                          >
                            Retry Pairing
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Right: Explicit Step-by-Step Instructions */}
                    <div className="sm:col-span-6 space-y-4">
                      <h3 className="font-bold text-sm text-white flex items-center gap-2">
                        <span>📱</span> How to scan with your phone:
                      </h3>
                      <ol className="space-y-2.5 text-xs text-gray-300">
                        <li className="flex items-start gap-2.5 bg-white/5 p-2.5 rounded-xl border border-white/5">
                          <span className="w-5 h-5 bg-indigo-500/30 text-indigo-300 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">1</span>
                          <span>Open <strong>WhatsApp</strong> on your primary phone</span>
                        </li>
                        <li className="flex items-start gap-2.5 bg-white/5 p-2.5 rounded-xl border border-white/5">
                          <span className="w-5 h-5 bg-indigo-500/30 text-indigo-300 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">2</span>
                          <span>Tap <strong>Menu (⋮)</strong> or <strong>Settings (⚙️)</strong> → <strong>Linked Devices</strong></span>
                        </li>
                        <li className="flex items-start gap-2.5 bg-white/5 p-2.5 rounded-xl border border-white/5">
                          <span className="w-5 h-5 bg-indigo-500/30 text-indigo-300 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">3</span>
                          <span>Tap <strong>Link a Device</strong> and point your camera at the QR code</span>
                        </li>
                      </ol>

                      {/* Phone Code Toggle */}
                      {!showPhoneInput ? (
                        <button
                          onClick={() => setShowPhoneInput(true)}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline"
                        >
                          Having camera trouble? Link with phone number code instead
                        </button>
                      ) : (
                        <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
                          <p className="text-[11px] text-gray-300">Enter WhatsApp Phone Number:</p>
                          <div className="flex gap-2">
                            <input
                              type="tel"
                              placeholder="+263 77 123 4567"
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value)}
                              className="flex-1 bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                            <button
                              onClick={startWithPhoneCode}
                              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg"
                            >
                              Get Code
                            </button>
                          </div>
                          {phoneError && <p className="text-[10px] text-red-400">{phoneError}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Connected success state */}
              {isConnected && (
                <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full mx-auto flex items-center justify-center text-xl font-bold">
                    ✓
                  </div>
                  <h3 className="font-bold text-base text-white">WhatsApp successfully paired!</h3>
                  <p className="text-xs text-gray-300">
                    Connected phone number: <span className="font-mono text-emerald-300 font-bold">{waStatus?.phone || 'Active WhatsApp Line'}</span>
                  </p>
                </div>
              )}

              <div className="pt-4 flex items-center justify-between border-t border-white/10">
                <button
                  onClick={() => setStep(1)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  ← Back to Profile
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSkipModalStep(2)}
                    className="text-xs text-gray-400 hover:text-white underline underline-offset-4"
                  >
                    Skip for now
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25"
                  >
                    Continue to Invite Team →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Invite Team Members ─────────────────────────────────── */}
        {step === 3 && (
          <div className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Invite your team to Zuri</h2>
              <p className="text-xs text-gray-400">
                Zuri connects your team to a shared WhatsApp inbox so agents can collaborate, lock conversations, and send AI-assisted replies.
              </p>
            </div>

            {/* Email invite inputs */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-300">Team Member Emails & Roles</label>
              {inviteRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <input
                    type="email"
                    placeholder="teammate@company.com"
                    value={row.email}
                    onChange={(e) => {
                      const updated = [...inviteRows]
                      updated[idx].email = e.target.value
                      setInviteRows(updated)
                    }}
                    className="flex-1 bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select
                    value={row.role}
                    onChange={(e) => {
                      const updated = [...inviteRows]
                      updated[idx].role = e.target.value as any
                      setInviteRows(updated)
                    }}
                    className="bg-slate-950 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="member">Agent (Member)</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              ))}

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setInviteRows(prev => [...prev, { email: '', role: 'member' }])}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                >
                  + Add another team member
                </button>
                <button
                  onClick={handleSendTeamInvites}
                  disabled={isSendingInvites || !inviteRows.some(r => r.email.trim())}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  {isSendingInvites ? <Spinner className="w-3.5 h-3.5 text-white" /> : 'Send Invitations ✉️'}
                </button>
              </div>

              {inviteSuccessMsg && <p className="text-xs text-emerald-400 mt-2">{inviteSuccessMsg}</p>}
              {inviteError && <p className="text-xs text-red-400 mt-2">{inviteError}</p>}
            </div>

            {/* Invited Roster list */}
            {invitedMembers.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-white/10">
                <p className="text-xs font-semibold text-gray-300">Sent Invitations:</p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {invitedMembers.map((m, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-xl text-xs border border-white/5">
                      <span className="text-white font-medium">{m.email}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase text-gray-400 font-mono bg-white/5 px-2 py-0.5 rounded">{m.role}</span>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{m.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 flex items-center justify-between border-t border-white/10">
              <button
                onClick={() => setStep(2)}
                className="text-xs text-gray-400 hover:text-white"
              >
                ← Back to WhatsApp
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSkipModalStep(3)}
                  className="text-xs text-gray-400 hover:text-white underline underline-offset-4"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25"
                >
                  Continue to Pipe Check →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Test Message & Pipe Verification ───────────────────── */}
        {step === 4 && (
          <div className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Verify your WhatsApp pipe</h2>
              <p className="text-xs text-gray-400">
                Confirm your intelligence system health and verify message delivery before entering your live dashboard.
              </p>
            </div>

            {/* Health & Diagnostic Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl space-y-1">
                <span className="text-xs text-gray-400 block font-medium">1. WhatsApp Session</span>
                <p className={`text-xs font-bold flex items-center gap-1.5 ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                  {isConnected ? 'Active & Paired' : 'Not Connected'}
                </p>
              </div>

              <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl space-y-1">
                <span className="text-xs text-gray-400 block font-medium">2. AI Intelligence Engine</span>
                <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Gemini / Qwen Active
                </p>
              </div>

              <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl space-y-1">
                <span className="text-xs text-gray-400 block font-medium">3. Shared Inbox Queue</span>
                <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Redis Pipeline Online
                </p>
              </div>
            </div>

            {/* Test Message Box */}
            <div className="p-5 bg-slate-950/60 border border-white/15 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <span>⚡</span> Send Verification Ping:
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Target Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+263771234567 or leave default"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Test Message Body</label>
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full bg-slate-900 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={handleTestPipe}
                    disabled={isTestingPipe || !isConnected}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                  >
                    {isTestingPipe ? <Spinner className="w-4 h-4 text-white" /> : '⚡ Send Test Message'}
                  </button>

                  {!isConnected && (
                    <span className="text-[11px] text-amber-400">Pair WhatsApp in Step 2 to send live ping</span>
                  )}
                </div>

                {pipeVerified && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-semibold flex items-center gap-2">
                    <CheckIcon className="w-4 h-4 text-emerald-400" />
                    Pipe verified successfully! Test message enqueued and system operational.
                  </div>
                )}

                {testError && (
                  <p className="text-xs text-red-400">{testError}</p>
                )}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-white/10">
              <button
                onClick={() => setStep(3)}
                className="text-xs text-gray-400 hover:text-white"
              >
                ← Back to Invites
              </button>
              <button
                onClick={handleCompleteOnboarding}
                className="px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all shadow-xl shadow-emerald-500/30 flex items-center gap-2"
              >
                Complete Setup & Launch Dashboard 🚀
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Skip Consequence Alert Modal ────────────────────────────────────── */}
      {skipModalStep !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 font-bold text-base">
              <span className="text-2xl">⚠️</span>
              <h3>Are you sure you want to skip this step?</h3>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              {skipModalStep === 1 && (
                'Skipping business profile customization means Zuri will use generic default reply templates until you set up your profile in Settings.'
              )}
              {skipModalStep === 2 && (
                'Skipping WhatsApp setup means Zuri cannot ingest incoming client messages, generate AI drafts, or power your team inbox until paired.'
              )}
              {skipModalStep === 3 && (
                'Skipping team invitations means your team members won\'t receive access invites right now. You can invite them later from Organization & Teams.'
              )}
              {skipModalStep === 4 && (
                'Skipping message delivery verification will take you straight to your dashboard without verifying live pipe transmission.'
              )}
            </p>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setSkipModalStep(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => executeSkip(skipModalStep)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl shadow-lg"
              >
                Yes, Skip Step →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
