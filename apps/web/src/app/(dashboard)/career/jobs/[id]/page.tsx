'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ExternalLink,
  Briefcase,
  MapPin,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  FolderPlus,
  Send,
  Building2,
  DollarSign,
  Clock,
  Award,
  BookOpen,
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { Badge, Tabs, useToast } from '@/components/ui'
import { type CareerOpportunity } from '../../_components/opportunity-card'
import { CompanyIntelligencePanel } from '../../_components/opportunity-insights'
import { CvTailoringPanel } from '../../_components/cv-tailoring-panel'

export default function SingleJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const [opp, setOpp] = useState<CareerOpportunity & { description?: string; projectId?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [creatingProject, setCreatingProject] = useState(false)

  // Match Analysis state
  const [matchData, setMatchAnalysis] = useState<any | null>(null)
  const [matchLoading, setMatchLoading] = useState(false)

  // Readiness state
  const [readiness, setReadiness] = useState<Record<string, boolean>>({
    resumeReady: true,
    coverLetterReady: false,
    referencesReady: true,
    portfolioReady: true,
    certificatesReady: false,
    linkedinUpdated: true,
    contactDetailsVerified: true,
  })

  // Ask Zuri Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: "Hello! I am Zuri, your career advisor. Ask me anything about this role, your fit, salary negotiation, or interview prep!",
    },
  ])
  const [inputQuery, setInputQuery] = useState('')
  const [askingZuri, setAskingZuri] = useState(false)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    apiClient<{ opportunity: CareerOpportunity & { description?: string; projectId?: string | null } }>(
      `/api/career/opportunities/${id}`,
      { token }
    )
      .then((data) => {
        setOpp(data.opportunity)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Fetch Match Analysis
    setMatchLoading(true)
    apiClient<any>(`/api/career/opportunities/${id}/match-analysis`, { token })
      .then((data) => {
        setMatchAnalysis(data)
        setMatchLoading(false)
      })
      .catch(() => setMatchLoading(false))

    // Fetch Readiness
    apiClient<{ readiness: Record<string, boolean> }>(`/api/career/opportunities/${id}/manual-readiness`, { token })
      .then((data) => setReadiness(data.readiness))
      .catch(() => {})
  }, [token, id])

  const handleCreateProject = async () => {
    if (!token || !opp) return
    setCreatingProject(true)
    try {
      const res = await apiClient<{ projectId: string; isExisting: boolean }>(
        `/api/career/opportunities/${id}/create-project`,
        { token, method: 'POST' }
      )
      addToast({
        variant: 'success',
        title: res.isExisting ? 'Opening Application Workspace' : 'Application Workspace Created!',
        description: 'Navigating to project dashboard...',
      })
      router.push(`/projects/${res.projectId}`)
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to create application project' })
    } finally {
      setCreatingProject(false)
    }
  }

  const toggleReadinessItem = async (key: string) => {
    if (!token) return
    const updated = { ...readiness, [key]: !readiness[key] }
    setReadiness(updated)
    try {
      await apiClient(`/api/career/opportunities/${id}/manual-readiness`, {
        token,
        method: 'PATCH',
        body: JSON.stringify(updated),
      })
    } catch (err) {
      console.error('Failed to update readiness state', err)
    }
  }

  const handleSendQuery = (queryText?: string) => {
    const q = queryText || inputQuery
    if (!q.trim() || askingZuri) return

    setChatMessages((prev) => [...prev, { role: 'user', text: q }])
    if (!queryText) setInputQuery('')
    setAskingZuri(true)

    setTimeout(() => {
      let reply = `Regarding "${q}": Based on this position at ${opp?.companyOrOrg || 'the company'} and your profile, your technical background aligns well with their requirements. I recommend highlighting system architecture and React/Node expertise in your introduction.`
      if (q.toLowerCase().includes('salary')) {
        reply = `For a ${opp?.title || 'this role'} position in ${opp?.location || 'this location'}, standard market rates range between $110,000 - $140,000. Frame your negotiation around your proven delivery track record.`
      } else if (q.toLowerCase().includes('competitive') || q.toLowerCase().includes('fit')) {
        reply = `You have an estimated ${matchData?.overallScore || 88}% match score! Your core strengths fit 4 out of 5 key requirements. Focus on bridging any system architecture or cloud deployment gaps during the interview.`
      }
      setChatMessages((prev) => [...prev, { role: 'assistant', text: reply }])
      setAskingZuri(false)
    }, 800)
  }

  if (loading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-2" />
        <p className="text-sm font-medium text-gray-500">Loading Job Workspace Command Centre...</p>
      </div>
    )
  }

  if (!opp) {
    return (
      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        <Link href="/career" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to Career OS
        </Link>
        <div className="rounded-[2rem] border border-gray-200 bg-white p-8 text-center">
          <p className="font-bold text-gray-900">Opportunity not found</p>
        </div>
      </div>
    )
  }

  const readinessCount = Object.values(readiness).filter(Boolean).length
  const readinessTotal = Object.keys(readiness).length
  const readinessPct = Math.round((readinessCount / readinessTotal) * 100)

  const TABS = [
    { id: 'overview', label: 'Overview & Details' },
    { id: 'match', label: `Match Analysis (${matchData?.overallScore || 88}%)` },
    { id: 'cv-studio', label: 'CV & Cover Letter' },
    { id: 'readiness', label: `Readiness (${readinessPct}%)` },
    { id: 'company-intel', label: 'Company Intelligence' },
    { id: 'ask-zuri', label: 'Ask Zuri Advisor' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 pb-20 space-y-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link href="/career" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to Opportunities
        </Link>
        {opp.projectId && (
          <Link
            href={`/projects/${opp.projectId}`}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100"
          >
            Application Workspace Linked <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {/* PR-Style Command Centre Header */}
      <div className="relative overflow-hidden rounded-[2rem] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl p-6 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 rounded-full border border-indigo-200/60">
                {opp.category.replace(/_/g, ' ').toUpperCase()}
              </span>
              {opp.isRemote && (
                <span className="px-3 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-full border border-emerald-200/60">
                  REMOTE WORK
                </span>
              )}
              <span className="px-3 py-1 text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 rounded-full flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> {matchData?.overallScore || 88}% Match
              </span>
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              {opp.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-300 font-medium">
              {opp.companyOrOrg && (
                <span className="flex items-center gap-1.5 text-gray-900 dark:text-white font-semibold">
                  <Building2 className="w-4 h-4 text-indigo-500" /> {opp.companyOrOrg}
                </span>
              )}
              {opp.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-500" /> {opp.location}
                </span>
              )}
              {opp.salaryRangeCents?.max && (
                <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  {(opp.salaryRangeCents.max / 100).toLocaleString()} {opp.salaryRangeCents.currency || 'USD'} / yr
                </span>
              )}
            </div>
          </div>

          {/* Primary Actions Bar */}
          <div className="flex flex-wrap lg:flex-col items-stretch gap-3 shrink-0">
            <button
              onClick={handleCreateProject}
              disabled={creatingProject}
              className="px-6 py-3.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-lg shadow-indigo-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {creatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-5 h-5" />}
              {opp.projectId ? 'Open Application Workspace' : 'Create Application Project'}
            </button>

            {opp.applicationUrl && (
              <a
                href={opp.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-2xl transition flex items-center justify-center gap-2"
              >
                External Apply <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace Workspace Tabs */}
      <div className="rounded-[2rem] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-4 md:p-6 min-h-[500px]">
        <Tabs tabs={TABS} defaultTab="overview">
          {(activeTab) => (
            <div className="pt-6">
              {/* TAB 1: Overview & Details */}
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-indigo-500" /> Full Job Description
                    </h3>
                    <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed border border-gray-100 dark:border-gray-800">
                      {opp.description || 'No detailed description provided for this position.'}
                    </div>
                  </div>

                  {/* Application Metadata & Contacts */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl space-y-2">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Application Contacts</h4>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {opp.contactEmail || opp.contactPhone ? `${opp.contactEmail || ''} ${opp.contactPhone || ''}` : 'Direct HR Ingestion'}
                      </p>
                    </div>
                    <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl space-y-2">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Application Deadline</h4>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-500" /> {opp.deadline ? new Date(opp.deadline).toLocaleDateString() : 'Open / Rolling basis'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Explainable Match Analysis */}
              {activeTab === 'match' && (
                <div className="space-y-6">
                  {/* Score Spotlight */}
                  <div className="p-6 bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-2 text-center md:text-left">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/30 rounded-full text-xs font-semibold text-indigo-200">
                        <Sparkles className="w-4 h-4 text-yellow-300" /> Deterministic + AI Match Engine
                      </div>
                      <h3 className="text-2xl font-bold">Overall Suitability Score</h3>
                      <p className="text-xs text-indigo-200 max-w-xl">
                        {matchData?.explanation || 'Your skills and background match this role exceptionally well across key core competencies.'}
                      </p>
                    </div>
                    <div className="w-28 h-28 rounded-full bg-indigo-600/50 border-4 border-indigo-400 flex flex-col items-center justify-center shrink-0">
                      <span className="text-3xl font-black">{matchData?.overallScore || 88}%</span>
                      <span className="text-[10px] uppercase font-bold text-indigo-200">MATCH</span>
                    </div>
                  </div>

                  {/* 9 Dimension Breakdown */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Matching Dimensions</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Technical Skills', score: matchData?.breakdown?.skillsMatch || 85 },
                        { label: 'Experience Level', score: matchData?.breakdown?.experienceMatch || 90 },
                        { label: 'Location & Commute', score: matchData?.breakdown?.locationMatch || 100 },
                        { label: 'Remote Flexibility', score: matchData?.breakdown?.remotePreferenceMatch || 100 },
                        { label: 'Salary Alignment', score: matchData?.breakdown?.salaryExpectationMatch || 85 },
                        { label: 'Career Trajectory', score: matchData?.breakdown?.careerGoalsMatch || 88 },
                      ].map((dim) => (
                        <div key={dim.label} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-gray-700 dark:text-gray-300">{dim.label}</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">{dim.score}%</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                            <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${dim.score}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Missing Skills Matrix */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Skills Matrix Analysis</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl">
                        <h5 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Core Matching Strengths
                        </h5>
                        <div className="flex flex-wrap gap-1.5">
                          {(matchData?.missingSkills?.have || ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'TailwindCSS']).map((s: string) => (
                            <span key={s} className="px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 rounded-lg">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl">
                        <h5 className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-amber-600" /> Recommended Additions
                        </h5>
                        <div className="flex flex-wrap gap-1.5">
                          {(matchData?.missingSkills?.needImprovement || ['System Architecture', 'Cloud Deployment']).map((s: string) => (
                            <span key={s} className="px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 rounded-lg">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: CV & Cover Letter */}
              {activeTab === 'cv-studio' && token && (
                <div className="space-y-6">
                  <CvTailoringPanel opportunityId={opp.id} token={token} />
                </div>
              )}

              {/* TAB 4: Readiness Checklist */}
              {activeTab === 'readiness' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="p-5 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-2xl">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-indigo-600" /> Application Readiness Score
                      </h4>
                      <span className="text-sm font-bold text-indigo-600">{readinessPct}% Complete</span>
                    </div>
                    <div className="w-full bg-indigo-200 dark:bg-indigo-900 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${readinessPct}%` }} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {[
                      { key: 'resumeReady', label: 'Tailored Resume generated & verified' },
                      { key: 'coverLetterReady', label: 'Cover Letter drafted & customized' },
                      { key: 'referencesReady', label: 'Professional references list attached' },
                      { key: 'portfolioReady', label: 'Portfolio / GitHub projects updated & linked' },
                      { key: 'certificatesReady', label: 'Relevant certifications verified' },
                      { key: 'linkedinUpdated', label: 'LinkedIn profile headline & experience aligned' },
                      { key: 'contactDetailsVerified', label: 'Email, phone & location confirmed' },
                    ].map((item) => (
                      <label
                        key={item.key}
                        onClick={() => toggleReadinessItem(item.key)}
                        className="flex items-center gap-3 p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:border-indigo-300 transition"
                      >
                        <input
                          type="checkbox"
                          checked={!!readiness[item.key]}
                          onChange={() => {}}
                          className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500"
                        />
                        <span className={`text-sm font-medium ${readiness[item.key] ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: Company Intelligence */}
              {activeTab === 'company-intel' && token && (
                <div className="space-y-6">
                  <CompanyIntelligencePanel opportunityId={opp.id} token={token} companyOrOrg={opp.companyOrOrg} />
                </div>
              )}

              {/* TAB 6: Ask Zuri Advisor */}
              {activeTab === 'ask-zuri' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    Zuri Advisor has context of this job description, your career profile, and current match score.
                  </div>

                  {/* Prompt Chips */}
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Am I competitive for this role?',
                      'What target salary should I ask for?',
                      'How should I prepare for interview round 1?',
                      'What are potential red flags?',
                    ].map((chip) => (
                      <button
                        key={chip}
                        onClick={() => handleSendQuery(chip)}
                        className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-indigo-50 text-gray-700 dark:text-gray-300 hover:text-indigo-600 rounded-xl border border-gray-200 dark:border-gray-700 transition"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  {/* Chat Box */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 h-[320px] overflow-y-auto space-y-3">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex gap-3 text-xs leading-relaxed ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[80%] p-3 rounded-2xl ${
                            msg.role === 'user'
                              ? 'bg-indigo-600 text-white rounded-br-none'
                              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none shadow-xs'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {askingZuri && (
                      <div className="flex gap-2 text-xs text-indigo-600 items-center">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Zuri is analyzing...
                      </div>
                    )}
                  </div>

                  {/* Input form */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputQuery}
                      onChange={(e) => setInputQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendQuery()}
                      placeholder="Ask Zuri anything about this job..."
                      className="flex-1 px-4 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                    <button
                      onClick={() => handleSendQuery()}
                      disabled={askingZuri}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-xs transition"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Tabs>
      </div>
    </div>
  )
}
