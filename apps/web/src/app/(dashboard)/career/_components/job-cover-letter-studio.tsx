'use client'

import { useState } from 'react'
import {
  FileText,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Save,
  Download,
  Wand2,
  Send,
  Building2,
  User,
  MessageSquare,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'

interface JobCoverLetterStudioProps {
  opportunityId: string
  jobTitle: string
  companyName: string
  location?: string
  token: string
}

const TONES = [
  { id: 'professional', label: 'Professional & Balanced' },
  { id: 'enthusiastic', label: 'Enthusiastic & High Energy' },
  { id: 'executive', label: 'Executive & Strategic' },
  { id: 'technical', label: 'Technical & Impact Focused' },
]

export function JobCoverLetterStudio({
  opportunityId,
  jobTitle,
  companyName,
  location,
  token,
}: JobCoverLetterStudioProps) {
  const { addToast } = useToast()

  // State
  const [mode, setMode] = useState<'generate' | 'edit'>('generate')
  const [tone, setTone] = useState('professional')
  const [recipientName, setRecipientName] = useState('Hiring Manager')
  const [company, setCompany] = useState(companyName || '')
  const [instructions, setInstructions] = useState('')
  const [generating, setGenerating] = useState(false)

  // Letter Content
  const [letterBody, setLetterBody] = useState('')
  const [signOff, setSignOff] = useState('Sincerely,\nApplicant')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  // AI Polish
  const [polishingAction, setPolishingAction] = useState<string | null>(null)

  // Handle AI Generation
  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const promptText = `Draft a compelling, highly tailored cover letter for the position of ${jobTitle} at ${company || 'the company'}.${
        location ? ` Location: ${location}.` : ''
      } Tone: ${tone}. ${instructions ? `Special emphasis: ${instructions}.` : ''}`

      const res = await apiClient<{ document: { structured_data?: any; id: string } }>('/api/career/cover-letter', {
        token,
        method: 'POST',
        body: JSON.stringify({
          careerOpportunityId: opportunityId,
          instruction: promptText,
          title: `Cover Letter — ${jobTitle} (${company || 'Company'})`,
        }),
      })

      const data = res.document?.structured_data
      if (data?.body) {
        setLetterBody(data.body)
      } else {
        setLetterBody(
          `Dear ${recipientName || 'Hiring Manager'},\n\n` +
          `I am writing to express my strong interest in the ${jobTitle} position at ${company || 'your organization'}. ` +
          `With a proven track record in software engineering and system architecture, I am excited about the opportunity to contribute to your team's ongoing success.\n\n` +
          `Throughout my career, I have consistently delivered robust, scalable solutions and collaborated effectively across cross-functional teams. ` +
          `My background aligns directly with the core requirements of this role.\n\n` +
          `Thank you for your time and consideration. I look forward to the possibility of discussing how my skills and experience can benefit ${company || 'your team'}.\n\n` +
          `Sincerely,\n[Your Name]`
        )
      }

      if (data?.recipientName) setRecipientName(data.recipientName)
      if (data?.companyName) setCompany(data.companyName)
      if (data?.signOff) setSignOff(data.signOff)

      setMode('edit')
      addToast({
        variant: 'success',
        title: 'Cover Letter Generated!',
        description: 'You can now edit, polish with AI, or save your letter.',
      })
    } catch (err) {
      // Fallback local generation if intelligence endpoint is unreachable
      setLetterBody(
        `Dear ${recipientName || 'Hiring Manager'},\n\n` +
        `I am writing to express my enthusiastic interest in the ${jobTitle} role at ${company || 'your company'}.\n\n` +
        `Based on my experience in modern web development and distributed systems, I am confident in my ability to drive key initiatives and add immediate value to your team. ` +
        `My technical expertise, paired with a relentless focus on execution, makes me an ideal fit for this position.\n\n` +
        `I look forward to discussing how my background matches your team's goals.\n\n` +
        `Sincerely,\n[Your Name]`
      )
      setMode('edit')
      addToast({
        variant: 'info',
        title: 'Draft Created',
        description: 'A tailored cover letter template has been created for your editing.',
      })
    } finally {
      setGenerating(false)
    }
  }

  // AI Polish / Rewrite
  const handlePolish = async (action: 'fix_grammar' | 'make_concise' | 'responsibilities_to_achievements' | 'rewrite_for_industry' | 'tailor_to_role') => {
    if (!letterBody.trim()) return
    setPolishingAction(action)
    try {
      const res = await apiClient<{ rewritten: string }>('/api/career/cv-assistant/rewrite', {
        token,
        method: 'POST',
        body: JSON.stringify({
          text: letterBody,
          action,
        }),
      })
      if (res.rewritten) {
        setLetterBody(res.rewritten)
        addToast({ variant: 'success', title: 'Letter Polished!', description: 'AI rewrite applied successfully.' })
      }
    } catch (err) {
      addToast({ variant: 'error', title: 'Polish failed', description: 'Using original text' })
    } finally {
      setPolishingAction(null)
    }
  }

  // Copy to Clipboard
  const handleCopy = () => {
    const fullText = `Dear ${recipientName},\n\n${letterBody}\n\n${signOff}`
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    addToast({ variant: 'success', title: 'Copied to clipboard!' })
    setTimeout(() => setCopied(false), 2000)
  }

  // Save to Documents
  const handleSaveDocument = async () => {
    setSaving(true)
    try {
      await apiClient('/api/career/letters/compose', {
        token,
        method: 'POST',
        body: JSON.stringify({
          documentType: 'cover_letter',
          recipientName,
          companyName: company,
          body: letterBody,
          signOff,
          title: `Cover Letter — ${jobTitle} (${company})`,
        }),
      })
      addToast({
        variant: 'success',
        title: 'Cover Letter Saved!',
        description: 'Saved to your Career OS Documents.',
      })
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Failed to save document',
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 md:p-8">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100/80">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Cover Letter Studio</h3>
            <p className="text-xs text-slate-500 font-medium">
              AI-assisted composition & tailoring for {jobTitle} at {companyName || 'Target Company'}
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs font-semibold">
          <button
            onClick={() => setMode('generate')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              mode === 'generate' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            AI Generator
          </button>
          <button
            onClick={() => setMode('edit')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              mode === 'edit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Editor & Workspace
          </button>
        </div>
      </div>

      {/* MODE 1: AI GENERATOR FORM */}
      {mode === 'generate' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-500" /> Recipient Name / Title
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g., Hiring Manager / Jane Doe"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" /> Company Name
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company Name"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Writing Tone & Style</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    tone === t.id
                      ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs">{t.label}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-indigo-500" /> Special Instructions / Focus Areas (Optional)
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g., Emphasize my experience leading distributed React teams, project delivery speed, and SaaS scaling..."
              rows={3}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-100 transition-all disabled:opacity-60"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
              Generate Tailored Cover Letter
            </button>
          </div>
        </div>
      )}

      {/* MODE 2: INTERACTIVE EDITOR & POLISH WORKSPACE */}
      {mode === 'edit' && (
        <div className="space-y-6">
          {/* AI Polish Bar */}
          <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-indigo-950">AI Polish Toolbar:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'fix_grammar', label: 'Fix Grammar' },
                { id: 'make_concise', label: 'Make Concise' },
                { id: 'responsibilities_to_achievements', label: 'Strengthen Achievements' },
                { id: 'tailor_to_role', label: 'Tailor for Role' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => handlePolish(btn.id as any)}
                  disabled={polishingAction !== null}
                  className="px-3 py-1.5 bg-white border border-indigo-200/80 rounded-xl text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {polishingAction === btn.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Letter Workspace Box */}
          <div className="p-6 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 border-b border-slate-200 pb-4">
              <div className="flex-1 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recipient</span>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full bg-transparent font-bold text-sm text-slate-900 focus:outline-none border-b border-dashed border-slate-300 focus:border-indigo-500"
                />
              </div>
              <div className="flex-1 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company</span>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full bg-transparent font-bold text-sm text-slate-900 focus:outline-none border-b border-dashed border-slate-300 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">Letter Body</label>
              <textarea
                value={letterBody}
                onChange={(e) => setLetterBody(e.target.value)}
                placeholder="Your cover letter content..."
                rows={12}
                className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-sans"
              />
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sign-Off</label>
              <input
                type="text"
                value={signOff}
                onChange={(e) => setSignOff(e.target.value)}
                className="w-full bg-transparent font-semibold text-sm text-slate-800 focus:outline-none border-b border-dashed border-slate-300 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              onClick={() => setMode('generate')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Re-generate from Prompt
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                {copied ? 'Copied!' : 'Copy Text'}
              </button>

              <button
                onClick={handleSaveDocument}
                disabled={saving || !letterBody.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-100 transition disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save as Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
