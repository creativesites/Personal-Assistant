'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  FileText, CheckCircle2, ShieldCheck, PenTool, Type, Upload, Download, RefreshCw, AlertCircle, Building2, User,
  MessageSquare, DollarSign, Send, X, Smartphone, CreditCard
} from 'lucide-react'

interface DocumentDetails {
  id: string
  title: string
  documentNumber: string
  documentType: string
  status: string
  currency: string
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  structuredData: any
  expiresAt: string | null
  createdAt: string
  business: {
    company_name: string | null
    logo_storage_path: string | null
    address: string | null
    phone: string | null
    email: string | null
    website: string | null
    tax_id: string | null
    bank_details: any
    theme_color: string | null
  } | null
  contact: {
    name: string | null
    company: string | null
    email: string | null
    phone: string | null
  }
  signatures: Array<{
    id: string
    signer_name: string
    signer_email: string | null
    signature_type: string
    signature_data: string
    verification_code: string
    document_hash: string
    signed_at: string
  }>
}

interface CommentItem {
  id: string
  item_index: number | null
  commenter_name: string
  comment_text: string
  created_at: string
}

export default function SharedDocumentPage() {
  const params = useParams()
  const token = params?.token as string

  const [doc, setDoc] = useState<DocumentDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Interactive Quote Action State
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [revisionReason, setRevisionReason] = useState('')

  // Line Item Comments State
  const [comments, setComments] = useState<CommentItem[]>([])
  const [activeCommentItemIndex, setActiveCommentItemIndex] = useState<number | null>(null)
  const [showCommentDrawer, setShowCommentDrawer] = useState(false)
  const [commenterName, setCommenterName] = useState('')
  const [commentText, setCommentText] = useState('')

  // Payment Gateway Modal State
  const [showPayModal, setShowPayModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'mtn_momo' | 'airtel_money' | 'bank_transfer'>('mtn_momo')
  const [momoPhone, setMomoPhone] = useState('')
  const [paymentRef, setPaymentRef] = useState('')
  const [paying, setSavingPay] = useState(false)
  const [paidReceipt, setPaidReceipt] = useState<{ paymentReference: string; receiptNumber: string; receiptShareToken: string } | null>(null)

  // Signature Form State
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [sigType, setSigType] = useState<'draw' | 'type' | 'upload'>('draw')
  const [typedSig, setTypedSig] = useState('')
  const [uploadedSig, setUploadedSig] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Canvas ref for drawing
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  const fetchDetails = () => {
    if (!token) return
    fetch(`${API_URL}/api/documents/public/${token}/details`)
      .then(res => {
        if (!res.ok) throw new Error('Document not found or link expired')
        return res.json()
      })
      .then(data => {
        setDoc(data)
        if (data.contact?.name) {
          setSignerName(data.contact.name)
          setCommenterName(data.contact.name)
        }
        if (data.contact?.email) setSignerEmail(data.contact.email)
        if (data.contact?.phone) setMomoPhone(data.contact.phone)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  const fetchComments = () => {
    if (!token) return
    fetch(`${API_URL}/api/documents/public/${token}/comments`)
      .then(res => res.json())
      .then(data => setComments(data.comments || []))
      .catch(() => {})
  }

  useEffect(() => {
    fetchDetails()
    fetchComments()
  }, [token, API_URL])

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#1E1B4B'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  const stopDrawing = () => setIsDrawing(false)

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setUploadedSig(reader.result as string)
    reader.readAsDataURL(file)
  }

  // Submit Action (Accept or Request Changes)
  const handleAction = async (action: 'accept' | 'request_changes') => {
    try {
      const res = await fetch(`${API_URL}/api/documents/public/${token}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: revisionReason }),
      })
      if (!res.ok) throw new Error('Failed to perform action')
      setShowRevisionModal(false)
      setRevisionReason('')
      fetchDetails()
    } catch (err: any) {
      alert(err.message || 'Action failed')
    }
  }

  // Submit Line Item Comment
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    try {
      const res = await fetch(`${API_URL}/api/documents/public/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIndex: activeCommentItemIndex,
          commenterName: commenterName || 'Client',
          commentText,
        }),
      })
      if (!res.ok) throw new Error('Failed to post comment')
      setCommentText('')
      fetchComments()
    } catch (err: any) {
      alert(err.message || 'Failed to post comment')
    }
  }

  // Submit One-Click Mobile Money Payment
  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPay(true)
    try {
      const res = await fetch(`${API_URL}/api/documents/public/${token}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          phoneNumber: momoPhone,
          reference: paymentRef,
        }),
      })
      if (!res.ok) throw new Error('Payment processing failed')
      const data = await res.json()
      setPaidReceipt(data)
      fetchDetails()
    } catch (err: any) {
      alert(err.message || 'Payment processing failed')
    } finally {
      setSavingPay(false)
    }
  }

  const handleSignSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signerName.trim()) return alert('Please enter your full name')
    if (!agreed) return alert('Please check the consent box to proceed')

    let signatureData = ''
    if (sigType === 'draw') {
      const canvas = canvasRef.current
      if (!canvas) return alert('Please draw your signature')
      signatureData = canvas.toDataURL('image/png')
    } else if (sigType === 'type') {
      if (!typedSig.trim()) return alert('Please type your signature name')
      signatureData = typedSig.trim()
    } else if (sigType === 'upload') {
      if (!uploadedSig) return alert('Please upload a signature image')
      signatureData = uploadedSig
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/documents/public/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName,
          signerEmail,
          signatureType: sigType,
          signatureData,
        }),
      })
      if (!res.ok) throw new Error('Failed to submit signature')
      fetchDetails()
    } catch (err: any) {
      alert(err.message || 'Signature submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="flex items-center space-x-3 text-indigo-600 font-medium">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading Client Portal...</span>
        </div>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Document Unavailable</h2>
          <p className="text-sm text-gray-500">{error || 'This link may have expired or is invalid.'}</p>
        </div>
      </div>
    )
  }

  const items = doc.structuredData?.items || []
  const themeColor = doc.business?.theme_color || '#4F46E5'
  const isSigned = doc.signatures && doc.signatures.length > 0
  const isInvoice = doc.documentType === 'invoice'
  const isQuotation = ['quotation', 'proposal', 'estimate'].includes(doc.documentType)

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            {doc.business?.company_name && (
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg border border-indigo-100">
                {doc.business.company_name.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{doc.title}</h1>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{doc.documentNumber} · {doc.documentType.toUpperCase()}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
              doc.status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              doc.status === 'paid' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
              doc.status === 'revision_requested' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
              'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {doc.status.replace('_', ' ')}
            </span>

            {/* Pay Invoice CTA */}
            {isInvoice && doc.status !== 'paid' && (
              <button
                onClick={() => setShowPayModal(true)}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-colors shadow-sm"
              >
                <DollarSign className="w-4 h-4" />
                <span>Pay Invoice</span>
              </button>
            )}

            <a
              href={`${API_URL}/api/documents/shared/${token}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </a>
          </div>
        </div>

        {/* Interactive Quotation Action Bar (Accept or Request Changes) */}
        {isQuotation && doc.status !== 'accepted' && (
          <div className="bg-indigo-900 text-white rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold">Review Quote Options</h3>
              <p className="text-xs text-indigo-200 mt-0.5">Click to instantly accept this quotation or request adjustments from seller.</p>
            </div>
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <button
                onClick={() => setShowRevisionModal(true)}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors border border-white/20"
              >
                Request Changes
              </button>
              <button
                onClick={() => handleAction('accept')}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-colors shadow-sm flex items-center justify-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Accept Quote</span>
              </button>
            </div>
          </div>
        )}

        {/* Document Body Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="h-2 w-full" style={{ backgroundColor: themeColor }} />

          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8 border-b border-gray-100">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Issued By</span>
                </h3>
                <p className="text-base font-semibold text-gray-900">{doc.business?.company_name || 'Business Name'}</p>
                {doc.business?.address && <p className="text-xs text-gray-600 mt-1">{doc.business.address}</p>}
                {doc.business?.email && <p className="text-xs text-gray-500 mt-0.5">{doc.business.email}</p>}
              </div>

              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <User className="w-3.5 h-3.5" />
                  <span>Prepared For</span>
                </h3>
                <p className="text-base font-semibold text-gray-900">{doc.contact?.name || 'Valued Client'}</p>
                {doc.contact?.company && <p className="text-xs text-gray-600 mt-1">{doc.contact.company}</p>}
                {doc.contact?.email && <p className="text-xs text-gray-500 mt-0.5">{doc.contact.email}</p>}
              </div>
            </div>

            {/* Line Items Table with Comments */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Line Items & Feedback</h3>
                <span className="text-[10px] text-gray-400">Click comment balloon to discuss specific items</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-2">Description</th>
                      <th className="py-3 px-2 text-center">Qty</th>
                      <th className="py-3 px-2 text-right">Unit Price</th>
                      <th className="py-3 px-2 text-right">Total</th>
                      <th className="py-3 px-2 text-center">Feedback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {items.map((item: any, idx: number) => {
                      const itemCommentCount = comments.filter(c => c.item_index === idx).length
                      return (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="py-3.5 px-2 font-medium text-gray-900">{item.description}</td>
                          <td className="py-3.5 px-2 text-center font-mono">{item.quantity}</td>
                          <td className="py-3.5 px-2 text-right font-mono">
                            {(item.unitPriceCents / 100).toLocaleString('en-US', { style: 'currency', currency: doc.currency })}
                          </td>
                          <td className="py-3.5 px-2 text-right font-semibold font-mono text-gray-900">
                            {((item.quantity * item.unitPriceCents) / 100).toLocaleString('en-US', { style: 'currency', currency: doc.currency })}
                          </td>
                          <td className="py-3.5 px-2 text-center">
                            <button
                              onClick={() => {
                                setActiveCommentItemIndex(idx)
                                setShowCommentDrawer(true)
                              }}
                              className={`p-1.5 rounded-lg border text-xs font-semibold inline-flex items-center space-x-1 transition-colors ${
                                itemCommentCount > 0
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                              }`}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              {itemCommentCount > 0 && <span>{itemCommentCount}</span>}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
                <div className="w-full sm:w-64 space-y-2 font-mono text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>{(doc.subtotalCents / 100).toLocaleString('en-US', { style: 'currency', currency: doc.currency })}</span>
                  </div>
                  {doc.taxCents > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Tax</span>
                      <span>{(doc.taxCents / 100).toLocaleString('en-US', { style: 'currency', currency: doc.currency })}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t border-gray-200">
                    <span>Total Due</span>
                    <span className="text-indigo-600">{(doc.totalCents / 100).toLocaleString('en-US', { style: 'currency', currency: doc.currency })}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Existing Signature Certificate Badge */}
        {isSigned && (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 space-y-4">
            <div className="flex items-center space-x-3 text-emerald-900">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
              <div>
                <h3 className="text-base font-bold">Document Digitally Signed & Accepted</h3>
                <p className="text-xs text-emerald-700">A Cryptographic Audit Certificate has been issued and attached to this document.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/80 backdrop-blur rounded-xl p-4 border border-emerald-100 text-xs font-mono">
              <div>
                <span className="text-gray-400 block mb-0.5">Verification Code</span>
                <span className="font-bold text-emerald-800">{doc.signatures[0].verification_code}</span>
              </div>
              <div>
                <span className="text-gray-400 block mb-0.5">Signed At</span>
                <span className="font-semibold text-gray-700">{new Date(doc.signatures[0].signed_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* E-Signature Module Card */}
        {!isSigned && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
            <div className="flex items-center space-x-3 pb-4 border-b border-gray-100">
              <ShieldCheck className="w-6 h-6 text-indigo-600" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Sign & Accept Document</h2>
                <p className="text-xs text-gray-500">Provide your digital signature below to confirm acceptance.</p>
              </div>
            </div>

            <form onSubmit={handleSignSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={signerEmail}
                    onChange={e => setSignerEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Signature Method</label>
                <div className="flex items-center space-x-2 border-b border-gray-200 pb-2">
                  <button type="button" onClick={() => setSigType('draw')} className={`px-4 py-2 rounded-lg text-xs font-semibold ${sigType === 'draw' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600'}`}>Draw</button>
                  <button type="button" onClick={() => setSigType('type')} className={`px-4 py-2 rounded-lg text-xs font-semibold ${sigType === 'type' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600'}`}>Type</button>
                  <button type="button" onClick={() => setSigType('upload')} className={`px-4 py-2 rounded-lg text-xs font-semibold ${sigType === 'upload' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600'}`}>Upload</button>
                </div>

                <div className="mt-4">
                  {sigType === 'draw' && (
                    <div className="border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 overflow-hidden relative cursor-crosshair">
                      <canvas ref={canvasRef} width={600} height={160} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} className="w-full h-40 touch-none" />
                    </div>
                  )}
                  {sigType === 'type' && (
                    <input type="text" value={typedSig} onChange={e => setTypedSig(e.target.value)} placeholder="Type signature name..." className="w-full px-4 py-3 rounded-xl border text-lg font-serif italic text-indigo-900 bg-gray-50" />
                  )}
                  {sigType === 'upload' && (
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="block text-xs text-gray-500" />
                  )}
                </div>
              </div>

              <div className="flex items-start space-x-3 pt-2">
                <input type="checkbox" id="consent-check" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 rounded text-indigo-600" />
                <label htmlFor="consent-check" className="text-xs text-gray-600">I agree that this digital signature constitutes a legally binding acceptance.</label>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-3 px-6 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-colors">
                {submitting ? 'Processing Signature...' : 'Sign & Accept Document'}
              </button>
            </form>
          </div>
        )}

      </div>

      {/* Request Revision Modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Request Quote Adjustments</h3>
              <button onClick={() => setShowRevisionModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <textarea
              rows={4}
              value={revisionReason}
              onChange={e => setRevisionReason(e.target.value)}
              placeholder="Describe requested pricing, quantity, or terms changes..."
              className="w-full p-3 border rounded-xl text-xs"
            />
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowRevisionModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600">Cancel</button>
              <button onClick={() => handleAction('request_changes')} className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-bold">Submit Request</button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Mobile Money Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-6">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-gray-900">Embedded Payment Gateway</h3>
              </div>
              <button onClick={() => setShowPayModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            {paidReceipt ? (
              <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <h4 className="text-lg font-bold text-emerald-950">Payment Settled & Receipt Issued</h4>
                <p className="text-xs text-emerald-800">Your payment reference is <span className="font-mono font-bold">{paidReceipt.paymentReference}</span>.</p>
                <a
                  href={`${API_URL}/api/documents/shared/${paidReceipt.receiptShareToken}`}
                  target="_blank"
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Receipt ({paidReceipt.receiptNumber})</span>
                </a>
              </div>
            ) : (
              <form onSubmit={handleProcessPayment} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Select Payment Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('mtn_momo')}
                      className={`p-3 rounded-xl border text-xs font-bold text-center ${paymentMethod === 'mtn_momo' ? 'bg-amber-50 border-amber-500 text-amber-900' : 'bg-gray-50'}`}
                    >
                      MTN MoMo
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('airtel_money')}
                      className={`p-3 rounded-xl border text-xs font-bold text-center ${paymentMethod === 'airtel_money' ? 'bg-red-50 border-red-500 text-red-900' : 'bg-gray-50'}`}
                    >
                      Airtel Money
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className={`p-3 rounded-xl border text-xs font-bold text-center ${paymentMethod === 'bank_transfer' ? 'bg-indigo-50 border-indigo-500 text-indigo-900' : 'bg-gray-50'}`}
                    >
                      Bank Transfer
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Mobile Money Number / Account</label>
                  <input
                    type="text"
                    required
                    value={momoPhone}
                    onChange={e => setMomoPhone(e.target.value)}
                    placeholder="+260971234567"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-mono"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={paying}
                    className="w-full py-3 px-6 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 flex items-center justify-center space-x-2"
                  >
                    {paying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                    <span>Confirm & Pay {(doc.totalCents / 100).toLocaleString('en-US', { style: 'currency', currency: doc.currency })}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Line Item Comment Drawer */}
      {showCommentDrawer && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
          <div className="bg-white w-full max-w-md h-full p-6 flex flex-col justify-between space-y-4 shadow-xl">
            <div className="flex justify-between items-center pb-3 border-b">
              <h3 className="text-base font-bold text-gray-900">Line Item Feedback</h3>
              <button onClick={() => setShowCommentDrawer(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            {/* Comment List */}
            <div className="flex-1 overflow-y-auto space-y-3">
              {comments.filter(c => c.item_index === activeCommentItemIndex).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No comments on this item yet. Post feedback below.</p>
              ) : (
                comments.filter(c => c.item_index === activeCommentItemIndex).map(c => (
                  <div key={c.id} className="p-3 bg-gray-50 rounded-xl border text-xs space-y-1">
                    <div className="flex justify-between font-bold text-gray-900">
                      <span>{c.commenter_name}</span>
                      <span className="text-[10px] text-gray-400 font-normal">{new Date(c.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-gray-700">{c.comment_text}</p>
                  </div>
                ))
              )}
            </div>

            {/* New Comment Input */}
            <form onSubmit={handlePostComment} className="pt-3 border-t space-y-2">
              <input
                type="text"
                value={commenterName}
                onChange={e => setCommenterName(e.target.value)}
                placeholder="Your Name"
                className="w-full px-3 py-1.5 border rounded-lg text-xs"
              />
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Type comment..."
                  className="flex-1 px-3 py-2 border rounded-xl text-xs"
                />
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
