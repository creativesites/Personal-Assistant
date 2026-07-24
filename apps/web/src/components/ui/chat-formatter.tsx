'use client'

import { useState } from 'react'
import { ApiError } from '@/lib/api'
import {
  TrendingUp, Target, Calendar, MessageCircle,
  Check, Copy, Edit3, Send, ChevronRight, Loader2, FileText, ExternalLink, Clock, GitBranch,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionType =
  | 'lead_score' | 'pipeline_stage' | 'reply_draft' | 'reminder' | 'generate_document'
  // Services Management System (docs/SERVICES_PROJECTS_PLAN.md §B9)
  | 'estimate_duration' | 'start_project'

export interface ParsedAction {
  type: ActionType
  params: string[]
}

export interface ChatFormatterProps {
  content: string
  /** Dark theme (Advisor page) vs light theme (IntelPanel chat tab) */
  theme?: 'dark' | 'light'
  /** Called when the user triggers a CRM action — may resolve a value the
   * widget renders back (e.g. start_project's created projectId) */
  onAction?: (action: ParsedAction) => Promise<any>
  /** Contact name — used in draft card header */
  contactName?: string
}

// ── Action tag parser ─────────────────────────────────────────────────────────

const ACTION_REGEX = /\[ACTION:\s*(\w+)\s*\|([^\]]+)\]/g

function parseActions(text: string): Array<{ text: string } | { action: ParsedAction }> {
  const parts: Array<{ text: string } | { action: ParsedAction }> = []
  let last = 0
  let match: RegExpExecArray | null

  ACTION_REGEX.lastIndex = 0
  while ((match = ACTION_REGEX.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index) })
    }
    const type = match[1].toLowerCase() as ActionType
    const params = match[2].split('|').map(p => p.trim())
    parts.push({ action: { type, params } })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last) })
  }
  return parts
}

// ── Inline Markdown renderer ──────────────────────────────────────────────────

function renderInline(text: string, theme: 'dark' | 'light', key: string | number) {
  // Bold + italic + inline code
  const parts: React.ReactNode[] = []
  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g
  let last = 0
  let m: RegExpExecArray | null
  let idx = 0

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`t-${key}-${idx++}`}>{text.slice(last, m.index)}</span>)

    if (m[1].startsWith('***')) {
      parts.push(<strong key={`b-${key}-${idx++}`} className="font-bold italic">{m[2]}</strong>)
    } else if (m[1].startsWith('**')) {
      parts.push(<strong key={`b-${key}-${idx++}`} className="font-semibold">{m[3]}</strong>)
    } else if (m[1].startsWith('*')) {
      parts.push(<em key={`i-${key}-${idx++}`}>{m[4]}</em>)
    } else if (m[1].startsWith('`')) {
      parts.push(
        <code key={`c-${key}-${idx++}`}
          className={`px-1 py-0.5 rounded text-[11px] font-mono ${
            theme === 'dark' ? 'bg-slate-700 text-pink-300' : 'bg-gray-100 text-pink-600'
          }`}>
          {m[5]}
        </code>
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<span key={`t-${key}-${idx++}`}>{text.slice(last)}</span>)
  return parts.length ? parts : [<span key={`t-${key}-0`}>{text}</span>]
}

// ── Block Markdown renderer ───────────────────────────────────────────────────

function renderMarkdown(text: string, theme: 'dark' | 'light'): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const lines = text.split('\n')
  let i = 0
  let blockIdx = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip blank lines
    if (!line.trim()) { i++; continue }

    // Headings
    const h3 = line.match(/^###\s+(.+)/)
    const h2 = line.match(/^##\s+(.+)/)
    const h1 = line.match(/^#\s+(.+)/)
    if (h3) {
      nodes.push(
        <p key={blockIdx++} className={`text-[11px] font-bold uppercase tracking-widest mt-3 mb-1 ${
          theme === 'dark' ? 'text-slate-300' : 'text-gray-600'
        }`}>
          {h3[1]}
        </p>
      )
      i++; continue
    }
    if (h2) {
      nodes.push(
        <p key={blockIdx++} className={`text-[12px] font-bold mt-3 mb-1 ${
          theme === 'dark' ? 'text-white' : 'text-gray-800'
        }`}>
          {h2[1]}
        </p>
      )
      i++; continue
    }
    if (h1) {
      nodes.push(
        <p key={blockIdx++} className={`text-sm font-bold mt-2 mb-1 ${
          theme === 'dark' ? 'text-white' : 'text-gray-900'
        }`}>
          {h1[1]}
        </p>
      )
      i++; continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={blockIdx++} className={`my-2 ${
        theme === 'dark' ? 'border-slate-700' : 'border-gray-200'
      }`} />)
      i++; continue
    }

    // Unordered list — collect consecutive bullet lines
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      nodes.push(
        <ul key={blockIdx++} className="space-y-1 my-1.5 pl-0">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                theme === 'dark' ? 'bg-indigo-400' : 'bg-indigo-500'
              }`} />
              <span className="flex-1">{renderInline(item, theme, `ul-${blockIdx}-${j}`)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      let num = 1
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      nodes.push(
        <ol key={blockIdx++} className="space-y-1 my-1.5 pl-0">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className={`text-[10px] font-bold flex-shrink-0 mt-0.5 w-4 ${
                theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'
              }`}>{j + 1}.</span>
              <span className="flex-1">{renderInline(item, theme, `ol-${blockIdx}-${j}`)}</span>
            </li>
          ))}
        </ol>
      )
      num++
      continue
    }

    // Code block (fenced with ```)
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      nodes.push(
        <pre key={blockIdx++} className={`rounded-lg px-3 py-2.5 text-[11px] font-mono overflow-x-auto my-2 ${
          theme === 'dark' ? 'bg-slate-800 text-slate-200' : 'bg-gray-100 text-gray-800'
        }`}>
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }

    // Normal paragraph line
    nodes.push(
      <p key={blockIdx++} className="leading-relaxed">
        {renderInline(line, theme, blockIdx)}
      </p>
    )
    i++
  }

  return nodes
}

// ── Action widgets ─────────────────────────────────────────────────────────────

function LeadScoreWidget({
  score, contactId, theme, onAction,
}: { score: number; contactId: string; theme: 'dark' | 'light'; onAction?: (a: ParsedAction) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const clamp = Math.max(0, Math.min(100, score))
  const color = clamp >= 70 ? 'bg-emerald-500' : clamp >= 40 ? 'bg-amber-400' : 'bg-red-400'

  const apply = async () => {
    if (!onAction) return
    setLoading(true)
    await onAction({ type: 'lead_score', params: [String(clamp), contactId] })
    setDone(true)
    setLoading(false)
  }

  return (
    <div className={`rounded-xl border p-3 my-2 space-y-2 ${
      theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-indigo-50 border-indigo-100'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={12} className="text-indigo-400" />
          <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-indigo-800'}`}>
            Suggested Lead Score
          </span>
        </div>
        <span className={`text-xs font-black ${
          clamp >= 70 ? 'text-emerald-500' : clamp >= 40 ? 'text-amber-500' : 'text-red-500'
        }`}>{clamp}/100</span>
      </div>
      <div className={`w-full h-2 rounded-full ${theme === 'dark' ? 'bg-slate-700' : 'bg-indigo-100'}`}>
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${clamp}%` }} />
      </div>
      {onAction && !done && (
        <button onClick={apply} disabled={loading}
          className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 transition-colors">
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          Apply Score
        </button>
      )}
      {done && <p className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1"><Check size={10} />Score updated</p>}
    </div>
  )
}

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead', prospect: 'Prospect', qualified: 'Qualified',
  proposal: 'Proposal', negotiation: 'Negotiation',
  closed_won: 'Closed Won', closed_lost: 'Closed Lost',
}
const STAGE_COLOR: Record<string, string> = {
  lead: 'bg-gray-100 text-gray-700 border-gray-200',
  prospect: 'bg-sky-50 text-sky-700 border-sky-200',
  qualified: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  proposal: 'bg-violet-50 text-violet-700 border-violet-200',
  negotiation: 'bg-amber-50 text-amber-700 border-amber-200',
  closed_won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed_lost: 'bg-red-50 text-red-700 border-red-200',
}

function PipelineStageWidget({
  stage, contactId, theme, onAction,
}: { stage: string; contactId: string; theme: 'dark' | 'light'; onAction?: (a: ParsedAction) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const label = STAGE_LABELS[stage] ?? stage
  const colorClass = STAGE_COLOR[stage] ?? 'bg-gray-100 text-gray-700 border-gray-200'

  const apply = async () => {
    if (!onAction) return
    setLoading(true)
    await onAction({ type: 'pipeline_stage', params: [stage, contactId] })
    setDone(true)
    setLoading(false)
  }

  return (
    <div className={`rounded-xl border p-3 my-2 space-y-2 ${
      theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center gap-1.5">
        <Target size={12} className="text-indigo-400" />
        <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-gray-700'}`}>
          Suggested Pipeline Stage
        </span>
      </div>
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${colorClass}`}>
        <ChevronRight size={10} />{label}
      </span>
      {onAction && !done && (
        <button onClick={apply} disabled={loading}
          className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 transition-colors">
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          Confirm Stage
        </button>
      )}
      {done && <p className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1"><Check size={10} />Stage updated</p>}
    </div>
  )
}

function ReplyDraftWidget({
  contactId, draftText, theme, contactName, onAction, onSetDraft, draftFocus,
}: {
  contactId: string; draftText: string; theme: 'dark' | 'light';
  contactName?: string; onAction?: (a: ParsedAction) => Promise<void>;
  onSetDraft?: (t: string) => void; draftFocus?: () => void;
}) {
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(draftText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const send = async () => {
    if (!onAction) return
    setSending(true)
    await onAction({ type: 'reply_draft', params: [contactId, draftText] })
    setSent(true)
    setSending(false)
  }

  return (
    <div className={`rounded-xl border my-2 overflow-hidden ${
      theme === 'dark' ? 'bg-slate-800 border-emerald-700/40' : 'bg-emerald-50 border-emerald-200'
    }`}>
      <div className={`flex items-center gap-2 px-3 py-2 ${
        theme === 'dark' ? 'bg-emerald-900/30' : 'bg-emerald-100/60'
      }`}>
        <div className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
          <MessageCircle size={9} className="text-white" />
        </div>
        <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-emerald-300' : 'text-emerald-800'}`}>
          Draft for {contactName ?? 'contact'}
        </span>
      </div>
      <div className="px-3 py-2.5">
        <p className={`text-[12px] leading-relaxed ${theme === 'dark' ? 'text-slate-200' : 'text-gray-800'}`}>
          {draftText}
        </p>
      </div>
      {!sent && (
        <div className={`flex gap-1.5 px-3 pb-3`}>
          {onAction && (
            <button onClick={send} disabled={sending}
              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50 transition-colors">
              {sending ? <Loader2 size={9} className="animate-spin" /> : <Send size={9} />}
              Send
            </button>
          )}
          {onSetDraft && (
            <button onClick={() => { onSetDraft(draftText); draftFocus?.() }}
              className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                theme === 'dark'
                  ? 'bg-slate-700 text-emerald-300 border-slate-600 hover:bg-slate-600'
                  : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
              }`}>
              <Edit3 size={9} />Edit
            </button>
          )}
          <button onClick={copy}
            className={`flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
              theme === 'dark'
                ? 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            <Copy size={9} />{copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      {sent && (
        <p className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1 px-3 pb-3">
          <Check size={10} />Sent successfully
        </p>
      )}
    </div>
  )
}

function ReminderWidget({
  title, date, theme, onAction,
}: { title: string; date: string; theme: 'dark' | 'light'; onAction?: (a: ParsedAction) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const schedule = async () => {
    if (!onAction) return
    setLoading(true)
    await onAction({ type: 'reminder', params: [title, date] })
    setDone(true)
    setLoading(false)
  }

  const formatted = (() => {
    try {
      return new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    } catch { return date }
  })()

  return (
    <div className={`rounded-xl border p-3 my-2 space-y-2 ${
      theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-violet-50 border-violet-100'
    }`}>
      <div className="flex items-center gap-1.5">
        <Calendar size={12} className="text-violet-400" />
        <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-violet-800'}`}>
          Follow-up Reminder
        </span>
      </div>
      <p className={`text-[12px] font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{title}</p>
      <p className={`text-[11px] ${theme === 'dark' ? 'text-slate-400' : 'text-violet-700'}`}>{formatted}</p>
      {onAction && !done && (
        <button onClick={schedule} disabled={loading}
          className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg disabled:opacity-50 transition-colors">
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Calendar size={10} />}
          Schedule
        </button>
      )}
      {done && <p className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1"><Check size={10} />Reminder set</p>}
    </div>
  )
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  quotation: 'Quotation', invoice: 'Invoice', proposal: 'Proposal', contract: 'Contract',
  statement_of_work: 'Statement of Work', service_agreement: 'Service Agreement',
}

function GenerateDocumentWidget({
  documentType, contactId, brief, theme, onAction,
}: {
  documentType: string; contactId: string; brief: string; theme: 'dark' | 'light';
  onAction?: (a: ParsedAction) => Promise<any>
}) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [createdDocId, setCreatedDocId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const label = DOCUMENT_TYPE_LABELS[documentType] ?? documentType

  const generate = async () => {
    if (!onAction) return
    setLoading(true)
    setFailed(false)
    setLimitReached(false)
    try {
      const res = await onAction({ type: 'generate_document', params: [documentType, contactId, brief] })
      if (res && typeof res === 'object' && res.id) {
        setCreatedDocId(res.id)
      }
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setLimitReached(true)
      } else {
        setFailed(true)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-xl border p-3 my-2 space-y-2 ${
      theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-sky-50 border-sky-100'
    }`}>
      <div className="flex items-center gap-1.5">
        <FileText size={12} className="text-sky-400" />
        <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-sky-800'}`}>
          Generate {label}
        </span>
      </div>
      {brief && (
        <p className={`text-[12px] leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{brief}</p>
      )}
      {onAction && !done && (
        <button onClick={generate} disabled={loading || !contactId}
          className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg disabled:opacity-50 transition-colors">
          {loading ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />}
          Generate {label}
        </button>
      )}
      {done && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] text-emerald-500 font-bold flex items-center gap-1.5">
            <Check size={12} />{label} created cleanly
          </p>
          <div className="flex items-center gap-2">
            {createdDocId ? (
              <a
                href={`/documents/${createdDocId}/edit`}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors shadow-sm"
              >
                <FileText size={11} /> Edit &amp; Download PDF <ExternalLink size={10} />
              </a>
            ) : null}
            <a href="/business" className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-900 underline">
              View All Documents
            </a>
          </div>
        </div>
      )}
      {limitReached && (
        <p className="text-[10px] font-semibold text-amber-500">
          Daily document limit reached —{' '}
          <a href="/billing" className="underline">upgrade for unlimited documents</a>.
        </p>
      )}
      {failed && !limitReached && <p className="text-[10px] text-red-500 font-semibold">Couldn&apos;t generate the document. Try again from the Documents page.</p>}
    </div>
  )
}

function EstimateDurationWidget({
  productId, theme, onAction,
}: { productId: string; theme: 'dark' | 'light'; onAction?: (a: ParsedAction) => Promise<any> }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const estimate = async () => {
    if (!onAction) return
    setLoading(true)
    setFailed(false)
    try {
      const res = await onAction({ type: 'estimate_duration', params: [productId] })
      setResult(typeof res === 'string' ? res : 'Estimate ready.')
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-xl border p-3 my-2 space-y-2 ${
      theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-amber-50 border-amber-100'
    }`}>
      <div className="flex items-center gap-1.5">
        <Clock size={12} className="text-amber-400" />
        <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-amber-800'}`}>
          Estimate Duration
        </span>
      </div>
      {!result && onAction && (
        <button onClick={estimate} disabled={loading}
          className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50 transition-colors">
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Clock size={10} />}
          Estimate
        </button>
      )}
      {result && <p className={`text-[12px] leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{result}</p>}
      {failed && <p className="text-[10px] text-red-500 font-semibold">Couldn&apos;t estimate — check the service&apos;s workflow stages in the Services tab.</p>}
    </div>
  )
}

function StartProjectWidget({
  productId, contactId, theme, onAction,
}: { productId: string; contactId: string; theme: 'dark' | 'light'; onAction?: (a: ParsedAction) => Promise<any> }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)

  const start = async () => {
    if (!onAction) return
    setLoading(true)
    setFailed(false)
    try {
      const res = await onAction({ type: 'start_project', params: [productId, contactId] })
      if (res && typeof res === 'object' && res.projectId) setProjectId(res.projectId)
      setDone(true)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-xl border p-3 my-2 space-y-2 ${
      theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-violet-50 border-violet-100'
    }`}>
      <div className="flex items-center gap-1.5">
        <GitBranch size={12} className="text-violet-400" />
        <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-violet-800'}`}>
          Start Project
        </span>
      </div>
      {onAction && !done && (
        <button onClick={start} disabled={loading}
          className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg disabled:opacity-50 transition-colors">
          {loading ? <Loader2 size={10} className="animate-spin" /> : <GitBranch size={10} />}
          Start Project
        </button>
      )}
      {done && (
        <p className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1.5">
          <Check size={10} />Project created —
          <a href={projectId ? `/projects/${projectId}` : '/projects'} className="underline inline-flex items-center gap-0.5">
            open Projects <ExternalLink size={9} />
          </a>
        </p>
      )}
      {failed && <p className="text-[10px] text-red-500 font-semibold">Couldn&apos;t start the project. Try again from the Services tab.</p>}
    </div>
  )
}

// ── Main ChatFormatter ────────────────────────────────────────────────────────

export interface ChatFormatterExtras {
  onSetDraft?: (text: string) => void
  draftFocus?: () => void
}

export function ChatFormatter({
  content,
  theme = 'light',
  onAction,
  contactName,
  onSetDraft,
  draftFocus,
}: ChatFormatterProps & ChatFormatterExtras) {
  const segments = parseActions(content)

  return (
    <div className={`space-y-0.5 text-xs leading-relaxed ${
      theme === 'dark' ? 'text-slate-200' : 'text-gray-800'
    }`}>
      {segments.map((seg, i) => {
        if ('text' in seg) {
          return (
            <div key={i}>
              {renderMarkdown(seg.text.trim(), theme)}
            </div>
          )
        }

        const { action } = seg
        switch (action.type) {
          case 'lead_score': {
            const [score, contactId] = action.params
            return (
              <LeadScoreWidget key={i}
                score={parseInt(score, 10)} contactId={contactId ?? ''}
                theme={theme} onAction={onAction} />
            )
          }
          case 'pipeline_stage': {
            const [stage, contactId] = action.params
            return (
              <PipelineStageWidget key={i}
                stage={stage} contactId={contactId ?? ''}
                theme={theme} onAction={onAction} />
            )
          }
          case 'reply_draft': {
            const [contactId, ...draftParts] = action.params
            const draftText = draftParts.join(' | ')
            return (
              <ReplyDraftWidget key={i}
                contactId={contactId ?? ''} draftText={draftText}
                theme={theme} contactName={contactName}
                onAction={onAction} onSetDraft={onSetDraft} draftFocus={draftFocus} />
            )
          }
          case 'reminder': {
            const [title, date] = action.params
            return (
              <ReminderWidget key={i}
                title={title ?? 'Follow-up'} date={date ?? ''}
                theme={theme} onAction={onAction} />
            )
          }
          case 'generate_document': {
            const [documentType, contactId, ...briefParts] = action.params
            const brief = briefParts.join(' | ')
            return (
              <GenerateDocumentWidget key={i}
                documentType={documentType ?? 'quotation'} contactId={contactId ?? ''} brief={brief}
                theme={theme} onAction={onAction} />
            )
          }
          case 'estimate_duration': {
            const [productId] = action.params
            return (
              <EstimateDurationWidget key={i}
                productId={productId ?? ''} theme={theme} onAction={onAction} />
            )
          }
          case 'start_project': {
            const [productId, contactId] = action.params
            return (
              <StartProjectWidget key={i}
                productId={productId ?? ''} contactId={contactId ?? ''} theme={theme} onAction={onAction} />
            )
          }
          default:
            return null
        }
      })}
    </div>
  )
}
