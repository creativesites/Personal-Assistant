'use client'

import { useEffect, useState, use } from 'react'
import {
  Briefcase,
  Mail,
  Phone,
  MessageSquare,
  Globe,
  Download,
  QrCode,
  CheckCircle2,
  Sparkles,
  MapPin,
  Building2,
  Send,
  Loader2,
  X,
  UserCheck,
  Award,
  Layers,
  FileText,
} from 'lucide-react'

export type PortfolioThemeKey = 'obsidian-dark' | 'midnight-tech' | 'pearl-executive' | 'minimal-luxe'

interface PortfolioData {
  slug: string
  settings?: {
    themeKey?: PortfolioThemeKey
    allowCvDownload?: boolean
    visibility?: string
  }
  profile: {
    fullName: string
    headline: string
    summary: string
    location: string
    phone: string
    email: string
    githubUrl?: string
    linkedinUrl?: string
    portfolioUrl?: string
    availability?: string
    employmentTypePreference?: string[]
    preferredLocations?: string[]
  }
  employment: Array<{
    id: string
    title: string
    employer: string
    startDate: string
    endDate: string | null
    isCurrent: boolean
    achievements: string[]
  }>
  education: Array<{
    id: string
    qualification: string
    institution: string
    endDate: string
  }>
  skillGroups: Array<{
    id: string
    groupName: string
    skills: string[]
  }>
  projects: Array<{
    projectId: string
    projectTitle: string
    customDescriptionOverride?: string
  }>
}

function GithubIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

function LinkedinIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  )
}

export default function PublicPortfolioPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const [data, setData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)

  // Recruiter Contact Form State
  const [inquiryName, setInquiryName] = useState('')
  const [inquiryEmail, setInquiryEmail] = useState('')
  const [inquiryCompany, setInquiryCompany] = useState('')
  const [inquiryMessage, setInquiryMessage] = useState('')
  const [submittingInquiry, setSubmittingInquiry] = useState(false)
  const [inquirySent, setInquirySent] = useState(false)

  // QR Modal
  const [showQrModal, setShowQrModal] = useState(false)

  useEffect(() => {
    fetch(`/api/p/${slug}`)
      .then((res) => res.json())
      .then((d) => {
        if (d.portfolio) setData(d.portfolio)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    // Track view event
    fetch(`/api/p/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'track_event', event: 'page_view' }),
    }).catch(() => {})
  }, [slug])

  // Download vCard (.vcf)
  const handleDownloadVCard = () => {
    if (!data) return
    const p = data.profile
    const vcardContent = `BEGIN:VCARD
VERSION:3.0
FN:${p.fullName}
TITLE:${p.headline}
EMAIL;TYPE=INTERNET,PREF:${p.email}
TEL;TYPE=CELL:${p.phone}
URL:${p.portfolioUrl || window.location.href}
NOTE:${p.summary}
END:VCARD`

    const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${slug}-contact.vcf`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Handle Resume PDF Download
  const handleDownloadCvPdf = () => {
    // Track download event
    fetch(`/api/p/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'track_event', event: 'cv_download' }),
    }).catch(() => {})

    window.print()
  }

  // Handle Recruiter Inquiry
  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inquiryName.trim() || !inquiryEmail.trim() || !inquiryMessage.trim()) return

    setSubmittingInquiry(true)
    try {
      await fetch(`/api/p/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_inquiry',
          inquiry: {
            name: inquiryName,
            email: inquiryEmail,
            company: inquiryCompany,
            message: inquiryMessage,
          },
        }),
      })
      setInquirySent(true)
    } catch {
      // ignore
    } finally {
      setSubmittingInquiry(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
          <p className="text-xs text-slate-400 font-medium">Loading Living Portfolio...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4 bg-slate-900 border border-slate-800 p-8 rounded-3xl text-white">
          <Globe className="w-12 h-12 text-slate-600 mx-auto" />
          <h2 className="text-xl font-bold">Portfolio Not Found</h2>
          <p className="text-xs text-slate-400">The portfolio for "{slug}" is private or does not exist.</p>
        </div>
      </div>
    )
  }

  const { profile, employment, education, skillGroups, projects, settings } = data
  const themeKey = settings?.themeKey || 'pearl-executive'
  const allowCvDownload = settings?.allowCvDownload !== false
  const initials = profile.fullName.split(' ').map((n) => n[0]).join('').substring(0, 2)

  // Theme-dependent styling classes
  const isDark = themeKey === 'obsidian-dark' || themeKey === 'midnight-tech'
  const isTech = themeKey === 'midnight-tech'
  const isMinimal = themeKey === 'minimal-luxe'

  const bgClass = isDark
    ? isTech ? 'bg-slate-950 text-slate-100' : 'bg-slate-950 text-slate-100'
    : isMinimal ? 'bg-[#faf8f5] text-slate-900' : 'bg-slate-50 text-slate-900'

  const cardBgClass = isDark
    ? 'bg-slate-900/90 border-slate-800 text-slate-100'
    : isMinimal ? 'bg-white border-amber-100/80 text-slate-900 shadow-sm' : 'bg-white border-slate-200/90 text-slate-900 shadow-sm'

  const accentColor = isDark
    ? isTech ? 'text-emerald-400' : 'text-amber-400'
    : 'text-indigo-600'

  return (
    <div className={`min-h-screen ${bgClass} font-sans selection:bg-amber-400 selection:text-slate-950`}>
      {/* Background Glow Accents */}
      {isDark && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-indigo-600/15 via-amber-500/10 to-transparent blur-3xl pointer-events-none" />
      )}

      {/* Main Container */}
      <div className="max-w-5xl mx-auto px-4 py-8 relative z-10 space-y-8">
        {/* Top Brand Banner */}
        <header className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-xs shadow-md">
              Z
            </div>
            <span className="text-xs font-extrabold tracking-tight">Zuri Living Portfolio</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {profile.availability || 'Available for Opportunities'}
            </span>
          </div>
        </header>

        {/* Hero Card */}
        <div className={`relative overflow-hidden rounded-3xl border ${cardBgClass} p-6 sm:p-10 shadow-xl space-y-6`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="relative">
                <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-800 text-white text-2xl sm:text-3xl font-black border-2 border-amber-400/40 shadow-xl">
                  {initials}
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-slate-950 border-2 border-white dark:border-slate-900">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{profile.fullName}</h1>
                <p className={`text-sm sm:text-base font-bold ${accentColor} mt-1`}>{profile.headline}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs opacity-70 mt-2">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-indigo-500" />{profile.location}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5 text-emerald-500" />Verified Portfolio</span>
                </div>
              </div>
            </div>

            {/* Quick Networking Actions */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <a
                href={`https://wa.me/${profile.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 text-xs shadow-md transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>

              <a
                href={`mailto:${profile.email}`}
                className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-bold px-4 py-2.5 text-xs transition-all"
              >
                <Mail className="w-4 h-4 text-indigo-400" />
                <span>Email</span>
              </a>

              {/* Conditionally render CV PDF Download button if enabled in settings */}
              {allowCvDownload && (
                <button
                  type="button"
                  onClick={handleDownloadCvPdf}
                  className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 text-xs shadow-md transition-all"
                  title="Download Resume PDF"
                >
                  <FileText className="w-4 h-4 text-amber-300" />
                  <span>Resume (PDF)</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadVCard}
                className="inline-flex items-center justify-center p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 transition-all"
                title="Download vCard Contact (.vcf)"
              >
                <Download className="w-4 h-4 text-amber-500" />
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="inline-flex items-center justify-center p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 transition-all"
                title="Show Networking QR Code"
              >
                <QrCode className="w-4 h-4 text-indigo-500" />
              </button>
            </div>
          </div>

          {/* Social Links Row */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs opacity-80">
            {profile.githubUrl && (
              <a href={profile.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-white transition-colors">
                <GithubIcon className="w-3.5 h-3.5" />
                <span>GitHub</span>
              </a>
            )}
            {profile.linkedinUrl && (
              <a href={profile.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-white transition-colors">
                <LinkedinIcon className="w-3.5 h-3.5 text-sky-500" />
                <span>LinkedIn</span>
              </a>
            )}
            {profile.phone && (
              <a href={`tel:${profile.phone}`} className="inline-flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-white transition-colors">
                <Phone className="w-3.5 h-3.5 text-emerald-500" />
                <span>{profile.phone}</span>
              </a>
            )}
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Summary & Work Experience */}
          <div className="lg:col-span-2 space-y-8">
            {/* About / Summary */}
            <section className={`rounded-3xl border ${cardBgClass} p-6 space-y-3`}>
              <h2 className="text-sm font-bold uppercase tracking-wider opacity-60 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Executive Summary
              </h2>
              <p className="text-sm leading-relaxed">{profile.summary}</p>
            </section>

            {/* Work Experience */}
            <section className={`rounded-3xl border ${cardBgClass} p-6 space-y-6`}>
              <h2 className="text-sm font-bold uppercase tracking-wider opacity-60 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-500" />
                Work Experience
              </h2>

              <div className="space-y-6">
                {employment.map((e) => (
                  <div key={e.id} className="relative pl-5 border-l-2 border-indigo-500/30 space-y-2">
                    <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-indigo-600 border-2 border-white dark:border-slate-900" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <h3 className="text-base font-bold">{e.title}</h3>
                      <span className={`text-xs font-semibold ${accentColor}`}>
                        {e.startDate} – {e.isCurrent ? 'Present' : e.endDate}
                      </span>
                    </div>

                    <p className="text-xs font-semibold opacity-70">{e.employer}</p>

                    {e.achievements && e.achievements.length > 0 && (
                      <ul className="space-y-1.5 text-xs opacity-90 pt-1">
                        {e.achievements.map((a, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Key Projects */}
            {projects.length > 0 && (
              <section className={`rounded-3xl border ${cardBgClass} p-6 space-y-4`}>
                <h2 className="text-sm font-bold uppercase tracking-wider opacity-60 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  Key Projects & Systems
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {projects.map((p) => (
                    <div key={p.projectId} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <h4 className="text-sm font-bold">{p.projectTitle}</h4>
                      <p className="text-xs opacity-80 leading-relaxed">
                        {p.customDescriptionOverride || 'Architected and deployed high-performance software system.'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Skills, Education, Recruiter Form */}
          <div className="space-y-8">
            {/* Skills Matrix */}
            <section className={`rounded-3xl border ${cardBgClass} p-6 space-y-4`}>
              <h2 className="text-sm font-bold uppercase tracking-wider opacity-60 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                Skills & Technologies
              </h2>

              <div className="space-y-3">
                {skillGroups.map((g) => (
                  <div key={g.id} className="space-y-1.5">
                    <span className="text-xs font-bold opacity-80">{g.groupName}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {g.skills.map((skill, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Education */}
            {education.length > 0 && (
              <section className={`rounded-3xl border ${cardBgClass} p-6 space-y-3`}>
                <h2 className="text-sm font-bold uppercase tracking-wider opacity-60 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-500" />
                  Education
                </h2>

                <div className="space-y-3 text-xs">
                  {education.map((e) => (
                    <div key={e.id} className="space-y-0.5">
                      <p className="font-bold">{e.qualification}</p>
                      <p className="opacity-70">{e.institution} ({e.endDate})</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recruiter Inquiry Form */}
            <section className={`rounded-3xl border ${cardBgClass} p-6 space-y-4`}>
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold">Contact Candidate</h2>
              </div>
              <p className="text-xs opacity-70">Direct recruiter intake. Delivered directly to {profile.fullName}.</p>

              {inquirySent ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 text-center font-bold">
                  ✓ Inquiry sent successfully!
                </div>
              ) : (
                <form onSubmit={handleSubmitInquiry} className="space-y-3">
                  <input
                    type="text"
                    required
                    placeholder="Your Name / Recruiter Name"
                    value={inquiryName}
                    onChange={(e) => setInquiryName(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs bg-transparent focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Work Email Address"
                    value={inquiryEmail}
                    onChange={(e) => setInquiryEmail(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs bg-transparent focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="text"
                    placeholder="Company / Hiring Firm"
                    value={inquiryCompany}
                    onChange={(e) => setInquiryCompany(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs bg-transparent focus:outline-none focus:border-amber-400"
                  />
                  <textarea
                    rows={3}
                    required
                    placeholder="Role opportunities, salary range, or interview request..."
                    value={inquiryMessage}
                    onChange={(e) => setInquiryMessage(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs bg-transparent focus:outline-none focus:border-amber-400 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={submittingInquiry}
                    className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    {submittingInquiry ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Send Message to {profile.fullName.split(' ')[0]}</span>
                  </button>
                </form>
              )}
            </section>
          </div>
        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs opacity-60">
          <p>© {new Date().getFullYear()} {profile.fullName} • Living Professional Portfolio</p>
          <p>Powered by <strong>Zuri AI Relationship OS</strong></p>
        </footer>
      </div>

      {/* QR Code Networking Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center space-y-4 shadow-2xl text-white">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mx-auto">
              <QrCode className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold">Networking QR Code</h3>
              <p className="text-xs text-slate-400 mt-1">Scan to open {profile.fullName}'s living portfolio instantly on mobile.</p>
            </div>

            <div className="p-4 bg-white rounded-2xl inline-block shadow-inner mx-auto">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  profile.portfolioUrl || window.location.href
                )}`}
                alt="Networking QR Code"
                className="w-44 h-44 mx-auto"
              />
            </div>

            <p className="text-[11px] text-slate-400 font-mono break-all">
              {profile.portfolioUrl || window.location.href}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
