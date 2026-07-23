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

  // ── Step management (1: Intent, 2: Identity & Context, 3: Connect WhatsApp, 4: Transition)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1: Intent
  const [selectedIntent, setSelectedIntent] = useState<'business' | 'personal' | 'hybrid'>('business')

  // Step 2: Context
  const [identityRole, setIdentityRole] = useState('business_owner')
  const [businessName, setBusinessName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [industry, setIndustry] = useState('')
  const [primaryGoal, setPrimaryGoal] = useState('save_time')
  const [isSavingContext, setIsSavingContext] = useState(false)

  // Step 3: WhatsApp status & pairing
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [linkCodeData, setLinkCodeData] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [sessionInitiated, setSessionInitiated] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState(QR_TTL_SECONDS)
  const [qrRefreshing, setQrRefreshing] = useState(false)
  const [connectMode, setConnectMode] = useState<'choose' | 'qr' | 'phone'>('choose')
  const [userStarted, setUserStarted] = useState(false)
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)

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
          primaryGoal,
        }),
      })
    } catch {
      // Best-effort — do not block the user
    } finally {
      setIsSavingContext(false)
    }
  }

  // ── Status Polling ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    let cancelled = false

    const poll = async () => {
      if (redirectingRef.current) return
      try {
        const s = await apiClient<WAStatus>('/api/whatsapp/status', { token })
        if (cancelled || redirectingRef.current) return

        setWaStatus(s)

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
          redirectingRef.current = true
          markSessionInitiated(false)
          wasActiveRef.current = false
          clearQrTimer()
          saveContextToBackend().finally(() => {
            router.push('/dashboard')
          })
          return
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
  }, [token, router, startQrCountdown])

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
      setPhoneError('Include your country code — e.g. +263771234567 for Zimbabwe')
      return
    }

    setConnectMode('phone')
    await startConnection(digits)
  }

  const handleSkipWhatsApp = async () => {
    await saveContextToBackend()
    setStep(4)
    setTimeout(() => {
      router.push('/dashboard')
    }, 2500)
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col">
      {/* Top Header */}
      <header className="border-b border-white/10 px-6 py-4 backdrop-blur-md bg-slate-950/40 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
              Z
            </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
              Zuri
            </span>
          </div>
          <button
            onClick={handleSkipWhatsApp}
            className="text-xs text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
          >
            Skip to Dashboard →
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {/* Step Indicator */}
        <div className="w-full max-w-xl mb-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/10 -translate-y-1/2 z-0" />
            {[
              { num: 1, label: 'Your Intent' },
              { num: 2, label: 'Business Profile' },
              { num: 3, label: 'Connect WhatsApp' },
              { num: 4, label: 'Your Briefing' },
            ].map((s) => {
              const active = step === s.num
              const done = step > s.num
              return (
                <div key={s.num} className="relative z-10 flex flex-col items-center gap-1.5">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-xs transition-all ${
                      done
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                        : active
                        ? 'bg-indigo-500 text-white ring-4 ring-indigo-500/20 shadow-lg shadow-indigo-500/40'
                        : 'bg-slate-800 text-gray-400 border border-white/10'
                    }`}
                  >
                    {done ? <CheckIcon className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`text-[11px] font-medium hidden sm:block ${active ? 'text-indigo-400' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── STEP 1: Intent Selection ────────────────────────────────────── */}
        {step === 1 && (
          <div className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-indigo-300">
                Welcome to Zuri 👋
              </h1>
              <p className="text-sm text-gray-400 max-w-md mx-auto">
                How do you plan to use your AI Relationship Operating System?
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                {
                  id: 'business',
                  icon: '🚀',
                  title: 'Grow My Business',
                  desc: 'Invoicing, leads, sales follow-ups, quotes & CRM.',
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
                  className={`flex flex-col text-left p-5 rounded-xl border transition-all relative overflow-hidden ${
                    selectedIntent === item.id
                      ? 'bg-indigo-600/20 border-indigo-500/80 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/50'
                      : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <span className="text-3xl mb-3">{item.icon}</span>
                  <p className="font-bold text-sm text-white">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{item.desc}</p>
                </button>
              ))}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Identity & Context ─────────────────────────────────── */}
        {step === 2 && (
          <div className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Let&apos;s customize Zuri for you</h2>
              <p className="text-xs text-gray-400">
                This helps Zuri draft replies, invoices, and briefings that match your real world.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">What best describes you?</label>
                <select
                  value={identityRole}
                  onChange={(e) => setIdentityRole(e.target.value)}
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="business_owner">Business Owner / Founder</option>
                  <option value="freelancer">Freelancer / Solopreneur</option>
                  <option value="sales_pro">Sales / Account Manager</option>
                  <option value="executive">Executive / Manager</option>
                  <option value="personal">Individual / Personal Use</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">Company / Work Name</label>
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
                    placeholder="e.g. Clean Energy / Retail"
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
                  placeholder="e.g. We install residential and commercial solar systems and perform maintenance."
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">Primary Goal</label>
                <select
                  value={primaryGoal}
                  onChange={(e) => setPrimaryGoal(e.target.value)}
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="save_time">Save time responding to clients</option>
                  <option value="increase_sales">Close more sales & follow-ups</option>
                  <option value="manage_relationships">Keep track of key relationships</option>
                  <option value="stay_organized">Stay organized and delegate tasks</option>
                </select>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-white">
                ← Back
              </button>
              <button
                onClick={async () => {
                  await saveContextToBackend()
                  setStep(3)
                }}
                disabled={isSavingContext}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2"
              >
                {isSavingContext ? <Spinner className="w-4 h-4 text-white" /> : 'Save & Connect WhatsApp →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Connect WhatsApp ───────────────────────────────────── */}
        {step === 3 && (
          <div className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 sm:p-8 border-b border-white/10">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Give Zuri access to your WhatsApp</h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                Zuri reads incoming client messages to generate reply drafts and surface follow-up opportunities. You remain in control.
              </p>
            </div>

            {/* Privacy callouts */}
            <div className="px-6 py-3 bg-white/5 border-b border-white/5 flex flex-wrap gap-4 text-xs text-gray-300">
              <span className="flex items-center gap-1.5">🔒 End-to-end encrypted</span>
              <span className="flex items-center gap-1.5">🤖 AI drafts, you approve</span>
              <span className="flex items-center gap-1.5">⚡ Under 60 seconds</span>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {showChooser && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400 text-center">Choose connection method:</p>

                  <button
                    onClick={() => { setConnectMode('qr'); startConnection() }}
                    disabled={!token || isStarting}
                    className="w-full flex items-start gap-4 p-4 border border-white/10 hover:border-indigo-500/50 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-all group"
                  >
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                      📷
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">Scan QR Code</p>
                      <p className="text-xs text-gray-400 mt-0.5">Open WhatsApp → Linked Devices → Link a Device</p>
                      <span className="inline-block mt-1 text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">
                        Recommended
                      </span>
                    </div>
                  </button>

                  {!showPhoneInput ? (
                    <button
                      onClick={() => setShowPhoneInput(true)}
                      disabled={!token}
                      className="w-full flex items-start gap-4 p-4 border border-white/10 hover:border-indigo-500/50 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-all group"
                    >
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                        🔢
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">Use a phone code</p>
                        <p className="text-xs text-gray-400 mt-0.5">Enter an 8-character pairing code directly in WhatsApp</p>
                      </div>
                    </button>
                  ) : (
                    <div className="border border-indigo-500/40 bg-indigo-500/10 rounded-xl p-4 space-y-3">
                      <p className="font-semibold text-white text-xs">Enter your WhatsApp phone number:</p>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          placeholder="+263 77 123 4567"
                          value={phoneNumber}
                          onChange={(e) => { setPhoneNumber(e.target.value); setPhoneError(null) }}
                          className="flex-1 bg-slate-950 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          onClick={startWithPhoneCode}
                          disabled={!token || isStarting || !phoneNumber.trim()}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          {isStarting ? 'Starting…' : 'Get Code'}
                        </button>
                      </div>
                      {phoneError && <p className="text-xs text-red-400">{phoneError}</p>}
                      <button onClick={() => setShowPhoneInput(false)} className="text-[11px] text-gray-400 hover:text-white underline">
                        Cancel
                      </button>
                    </div>
                  )}

                  <div className="pt-2 text-center">
                    <button
                      onClick={handleSkipWhatsApp}
                      className="text-xs text-gray-400 hover:text-white underline underline-offset-4"
                    >
                      Skip for now & explore dashboard
                    </button>
                  </div>
                </div>
              )}

              {/* Connecting checklist */}
              {isConnectingPhase && (
                <div className="flex flex-col items-center gap-6 py-6 text-center">
                  <Spinner className="w-8 h-8 text-indigo-400" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">
                      {connectMode === 'phone' ? 'Generating 8-character phone code…' : 'Preparing QR session…'}
                    </p>
                    <p className="text-xs text-gray-400">Usually takes 5–15 seconds</p>
                  </div>
                </div>
              )}

              {/* QR display */}
              {isQrReady && !isConnected && (
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-48 h-48 bg-white p-2 rounded-2xl shadow-xl relative">
                      <img src={qrData!} alt="WhatsApp QR" className="w-full h-full rounded-xl" />
                    </div>
                    <span className="text-xs text-gray-400">Expires in {fmtTime(qrSecondsLeft)}</span>
                  </div>
                  <div className="space-y-2 text-xs text-gray-300">
                    <p className="font-bold text-white text-sm">Instructions:</p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400">
                      <li>Open WhatsApp on phone</li>
                      <li>Tap Linked Devices → Link a Device</li>
                      <li>Scan this QR code</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* Link Code display */}
              {isLinkCodeReady && !isConnected && (
                <div className="text-center space-y-5 py-4">
                  <p className="text-xs text-gray-400">Enter this 8-character code in WhatsApp:</p>
                  <div className="inline-block bg-white/10 border border-white/20 rounded-2xl px-6 py-4">
                    <p className="font-mono text-3xl font-bold tracking-[0.25em] text-indigo-300">
                      {linkCodeData}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto">
                    Open WhatsApp → Linked Devices → Link a Device → <strong>Link with phone number instead</strong>
                  </p>
                </div>
              )}

              {/* Error state */}
              {hasError && !isConnected && !isQrReady && !isLinkCodeReady && !isConnectingPhase && (
                <div className="space-y-4">
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300">
                    {connectError || 'Failed to initialize session. Please try again.'}
                  </div>
                  <button
                    onClick={() => { setConnectMode('choose'); setConnectError(null); setUserStarted(false) }}
                    className="w-full py-2.5 bg-indigo-600 text-white text-xs font-semibold rounded-xl"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 4: Workspace Preparation ──────────────────────────────── */}
        {step === 4 && (
          <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
              <span className="text-2xl font-bold text-white">Z</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Zuri is learning your world…</h2>
              <p className="text-xs text-gray-400">
                Setting up your workspace and initializing your personalized intelligence briefing.
              </p>
            </div>

            <div className="flex justify-center">
              <Spinner className="w-6 h-6 text-indigo-400" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
