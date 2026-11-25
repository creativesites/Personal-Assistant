'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileText, Loader2, Plus, Send, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { apiClient } from '@/lib/api'

interface Props {
  open: boolean
  onClose: () => void
  contact: { id: string; name: string; phone?: string | null } | null
  token: string | null
  /** Called after the PDF was queued to WhatsApp (the chat shows it via the live socket). */
  onSent?: () => void
}

type QuickType = 'quotation' | 'invoice' | 'receipt'

const TYPES: { id: QuickType; label: string; message: string }[] = [
  { id: 'quotation', label: 'Quotation', message: 'Here is your quotation.' },
  { id: 'invoice', label: 'Invoice', message: 'Here is your invoice.' },
  { id: 'receipt', label: 'Receipt', message: 'Here is your receipt. Thank you!' },
]

const CURRENCIES = ['ZMW', 'USD', 'ZAR', 'KES', 'NGN', 'EUR', 'GBP']
const CURRENCY_KEY = 'zuri.quickDoc.currency'

interface Line { description: string; quantity: string; unitPrice: string }
const emptyLine = (): Line => ({ description: '', quantity: '1', unitPrice: '' })

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/**
 * Quick quotation / invoice / receipt from a chat. "Send PDF" creates the
 * document, renders the PDF on the server and sends it to the chat as a real
 * WhatsApp document (not a link). Anything richer opens the full editor.
 */
export function QuickDocModal({ open, onClose, contact, token, onSent }: Props) {
  const router = useRouter()
  const { addToast } = useToast()

  const [type, setType] = useState<QuickType>('quotation')
  const [currency, setCurrency] = useState('ZMW')
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState(TYPES[0].message)
  const [messageTouched, setMessageTouched] = useState(false)
  const [dateValue, setDateValue] = useState(isoInDays(14))
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null)
  const [savedDraft, setSavedDraft] = useState<{ id: string; number: string; error: string } | null>(null)

  // Fresh form each time it opens; currency = last used, else the business default.
  useEffect(() => {
    if (!open) return
    setType('quotation'); setLines([emptyLine()]); setNotes(''); setSavedDraft(null)
    setMessage(TYPES[0].message); setMessageTouched(false); setDateValue(isoInDays(14))
    const remembered = typeof window !== 'undefined' ? localStorage.getItem(CURRENCY_KEY) : null
    if (remembered) { setCurrency(remembered); return }
    if (token) {
      apiClient<{ defaultCurrency?: string | null }>('/api/business-profile', { token })
        .then(p => { if (p.defaultCurrency) setCurrency(p.defaultCurrency) })
        .catch(() => {})
    }
  }, [open, token])

  useEffect(() => {
    if (!messageTouched) setMessage(TYPES.find(t => t.id === type)!.message)
    setDateValue(type === 'invoice' ? isoInDays(7) : isoInDays(14))
  }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => lines.map(l => ({
    description: l.description.trim(),
    quantity: Number(l.quantity) || 0,
    unitPriceCents: Math.round((Number(l.unitPrice) || 0) * 100),
  })), [lines])
  const valid = parsed.filter(l => l.description && l.quantity > 0)
  const total = valid.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0) / 100

  if (!open || !contact) return null

  const update = (i: number, patch: Partial<Line>) => setLines(prev => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const submit = async (send: boolean) => {
    if (!token) return
    if (valid.length === 0) {
      addToast({ variant: 'error', title: 'Add at least one item' })
      return
    }
    setBusy(send ? 'send' : 'draft')
    localStorage.setItem(CURRENCY_KEY, currency)
    let doc: { id: string; documentNumber: string } | null = savedDraft ? { id: savedDraft.id, documentNumber: savedDraft.number } : null
    try {
      if (!doc) {
        const res = await apiClient<{ document: { id: string; documentNumber: string } }>('/api/documents', {
          method: 'POST', token,
          body: JSON.stringify({
            contactId: contact.id,
            documentType: type,
            currency,
            items: valid,
            notes: notes.trim() || undefined,
            ...(type === 'quotation' ? { validUntil: dateValue } : type === 'invoice' ? { dueDate: dateValue } : {}),
          }),
        })
        doc = res.document
      }
      if (!send) {
        addToast({ variant: 'success', title: `${doc.documentNumber} saved as a draft` })
        onClose()
        return
      }
      await apiClient(`/api/documents/${doc.id}/send`, {
        method: 'POST', token,
        body: JSON.stringify({ caption: message.trim() || undefined }),
      })
      addToast({ variant: 'success', title: `${doc.documentNumber} sent`, description: `PDF sent to ${contact.name} on WhatsApp` })
      onSent?.()
      onClose()
    } catch (err) {
      const reason = (err as { data?: { error?: string } })?.data?.error || (err as Error)?.message || 'Something went wrong'
      if (doc) {
        // Created but not sent: keep the form open so "Send PDF" retries the same document.
        setSavedDraft({ id: doc.id, number: doc.documentNumber, error: reason })
      } else {
        addToast({ variant: 'error', title: 'Could not create the document', description: reason })
      }
    } finally {
      setBusy(null)
    }
  }

  const openFullEditor = () => {
    onClose()
    router.push(`/documents/new?contactId=${contact.id}&docType=${type}`)
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50'
  const locked = !!savedDraft

  return (
    <Modal open={open} onClose={onClose} title={`New document for ${contact.name}`} size="lg">
      <div className="space-y-4">
        {/* Type */}
        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-3 gap-1 rounded-2xl bg-gray-100 p-1">
            {TYPES.map(t => (
              <button
                key={t.id}
                type="button"
                disabled={locked}
                onClick={() => setType(t.id)}
                className={`min-h-10 rounded-xl text-sm font-semibold transition-colors ${
                  type === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={openFullEditor}
            className="inline-flex min-h-10 flex-shrink-0 items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            title="Contracts, proposals, NDAs, templates and more"
          >
            More <ExternalLink size={12} />
          </button>
        </div>

        {/* Items */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Items</p>
            <select
              value={currency}
              disabled={locked}
              onChange={e => setCurrency(e.target.value)}
              className="min-h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700"
              aria-label="Currency"
            >
              {[...new Set([currency, ...CURRENCIES])].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl border border-gray-100 bg-gray-50/60 p-2 sm:grid-cols-[1fr_4.5rem_7rem_auto]">
                <input
                  value={line.description}
                  disabled={locked}
                  onChange={e => update(i, { description: e.target.value })}
                  placeholder="What is it? e.g. Logo design"
                  className={`${inputCls} col-span-1`}
                />
                <button
                  type="button"
                  onClick={() => setLines(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [emptyLine()])}
                  disabled={locked}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 hover:bg-white hover:text-rose-500 sm:order-last"
                  aria-label="Remove item"
                >
                  <Trash2 size={15} />
                </button>
                <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2 sm:contents">
                  <input
                    value={line.quantity}
                    disabled={locked}
                    onChange={e => update(i, { quantity: e.target.value })}
                    inputMode="decimal"
                    placeholder="Qty"
                    aria-label="Quantity"
                    className={`${inputCls} text-center`}
                  />
                  <input
                    value={line.unitPrice}
                    disabled={locked}
                    onChange={e => update(i, { unitPrice: e.target.value })}
                    inputMode="decimal"
                    placeholder={`Price (${currency})`}
                    aria-label="Unit price"
                    className={`${inputCls} text-right tabular-nums`}
                  />
                </div>
              </div>
            ))}
          </div>
          {!locked && (
            <button
              type="button"
              onClick={() => setLines(prev => [...prev, emptyLine()])}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              <Plus size={14} /> Add item
            </button>
          )}
        </div>

        {/* Details */}
        <div className="grid gap-3 sm:grid-cols-2">
          {type !== 'receipt' && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">{type === 'quotation' ? 'Valid until' : 'Due date'}</span>
              <input type="date" value={dateValue} disabled={locked} onChange={e => setDateValue(e.target.value)} className={inputCls} />
            </label>
          )}
          <label className={`block ${type === 'receipt' ? 'sm:col-span-2' : ''}`}>
            <span className="mb-1 block text-xs font-semibold text-gray-700">Notes on the document <span className="font-normal text-gray-400">(optional)</span></span>
            <input value={notes} disabled={locked} onChange={e => setNotes(e.target.value)} placeholder="Payment terms, bank details…" className={inputCls} />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-700">Message with the PDF</span>
          <input
            value={message}
            onChange={e => { setMessage(e.target.value); setMessageTouched(true) }}
            placeholder="Here is your quotation."
            className={inputCls}
          />
        </label>

        {savedDraft && (
          <div className="rounded-2xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700 ring-1 ring-rose-200">
            <p className="font-semibold">{savedDraft.number} was saved, but sending failed.</p>
            <p className="mt-0.5">{savedDraft.error}</p>
            <p className="mt-1 text-rose-600/80">Tap Send PDF to try again, or close — it stays in your documents as a draft.</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-black tabular-nums tracking-tight text-gray-950">{money(total, currency)}</p>
          </div>
          <div className="flex gap-2">
            {!locked && (
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={!!busy}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl px-4 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
              >
                {busy === 'draft' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Save draft
              </button>
            )}
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={!!busy}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-50 sm:flex-none"
            >
              {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {busy === 'send' ? 'Making PDF…' : 'Send PDF'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
