'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  FileText, CheckCircle2, ShieldCheck, PenTool, Type, Upload, Download, RefreshCw, AlertCircle, Building2, User
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

export default function SharedDocumentPage() {
  const params = useParams()
  const token = params?.token as string

  const [doc, setDoc] = useState<DocumentDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Signature Form State
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [sigType, setSigType] = useState<'draw' | 'type' | 'upload'>('draw')
  const [typedSig, setTypedSig] = useState('')
  const [uploadedSig, setUploadedSig] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [signedResult, setSignedResult] = useState<{ verificationCode: string; documentHash: string } | null>(null)

  // Canvas ref for drawing
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/api/documents/public/${token}/details`)
      .then(res => {
        if (!res.ok) throw new Error('Document not found or link expired')
        return res.json()
      })
      .then(data => {
        setDoc(data)
        if (data.contact?.name) setSignerName(data.contact.name)
        if (data.contact?.email) setSignerEmail(data.contact.email)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
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

  const stopDrawing = () => {
    setIsDrawing(false)
  }

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
    reader.onload = () => {
      setUploadedSig(reader.result as string)
    }
    reader.readAsDataURL(file)
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
      const data = await res.json()
      setSignedResult(data)

      // Refresh document details
      const detailRes = await fetch(`${API_URL}/api/documents/public/${token}/details`)
      if (detailRes.ok) {
        const refreshed = await detailRes.json()
        setDoc(refreshed)
      }
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
          <span>Loading Document...</span>
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

          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
              doc.status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              doc.status === 'paid' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
              'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {doc.status}
            </span>

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

        {/* Document Body Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Accent Line */}
          <div className="h-2 w-full" style={{ backgroundColor: themeColor }} />

          <div className="p-8 space-y-8">
            {/* Meta Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8 border-b border-gray-100">
              {/* Issued By */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Issued By</span>
                </h3>
                <p className="text-base font-semibold text-gray-900">{doc.business?.company_name || 'Business Name'}</p>
                {doc.business?.address && <p className="text-xs text-gray-600 mt-1">{doc.business.address}</p>}
                {doc.business?.email && <p className="text-xs text-gray-500 mt-0.5">{doc.business.email}</p>}
                {doc.business?.tax_id && <p className="text-xs text-gray-400 mt-0.5">Tax ID: {doc.business.tax_id}</p>}
              </div>

              {/* Prepared For */}
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

            {/* Line Items Table */}
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Line Items</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-2">Description</th>
                      <th className="py-3 px-2 text-center">Qty</th>
                      <th className="py-3 px-2 text-right">Unit Price</th>
                      <th className="py-3 px-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {items.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-3.5 px-2 font-medium text-gray-900">{item.description}</td>
                        <td className="py-3.5 px-2 text-center font-mono">{item.quantity}</td>
                        <td className="py-3.5 px-2 text-right font-mono">
                          {(item.unitPriceCents / 100).toLocaleString('en-US', { style: 'currency', currency: doc.currency })}
                        </td>
                        <td className="py-3.5 px-2 text-right font-semibold font-mono text-gray-900">
                          {((item.quantity * item.unitPriceCents) / 100).toLocaleString('en-US', { style: 'currency', currency: doc.currency })}
                        </td>
                      </tr>
                    ))}
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

            {/* Terms & Notes */}
            {(doc.structuredData?.terms || doc.structuredData?.notes) && (
              <div className="pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-gray-600">
                {doc.structuredData?.notes && (
                  <div>
                    <h4 className="font-bold text-gray-900 uppercase tracking-wider mb-1">Notes</h4>
                    <p className="whitespace-pre-line leading-relaxed">{doc.structuredData.notes}</p>
                  </div>
                )}
                {doc.structuredData?.terms && (
                  <div>
                    <h4 className="font-bold text-gray-900 uppercase tracking-wider mb-1">Terms & Conditions</h4>
                    <p className="whitespace-pre-line leading-relaxed">{doc.structuredData.terms}</p>
                  </div>
                )}
              </div>
            )}
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
              <div className="sm:col-span-2">
                <span className="text-gray-400 block mb-0.5">Cryptographic SHA-256 Hash</span>
                <span className="text-[10px] text-gray-600 break-all">{doc.signatures[0].document_hash}</span>
              </div>
            </div>
          </div>
        )}

        {/* E-Signature Module Card (Rendered if not yet signed) */}
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
                    placeholder="e.g. John Doe"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={signerEmail}
                    onChange={e => setSignerEmail(e.target.value)}
                    placeholder="e.g. john@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Signature Method Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Signature Method</label>
                <div className="flex items-center space-x-2 border-b border-gray-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setSigType('draw')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      sigType === 'draw' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>Draw</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigType('type')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      sigType === 'type' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" />
                    <span>Type</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigType('upload')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      sigType === 'upload' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Image</span>
                  </button>
                </div>

                {/* Input Area based on Type */}
                <div className="mt-4">
                  {sigType === 'draw' && (
                    <div className="space-y-2">
                      <div className="border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 overflow-hidden relative cursor-crosshair">
                        <canvas
                          ref={canvasRef}
                          width={600}
                          height={160}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                          className="w-full h-40 touch-none"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={clearCanvas}
                          className="text-xs font-medium text-gray-500 hover:text-gray-700 underline"
                        >
                          Clear Canvas
                        </button>
                      </div>
                    </div>
                  )}

                  {sigType === 'type' && (
                    <div>
                      <input
                        type="text"
                        value={typedSig}
                        onChange={e => setTypedSig(e.target.value)}
                        placeholder="Type signature name..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 text-lg font-serif italic text-indigo-900 bg-gray-50 focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}

                  {sigType === 'upload' && (
                    <div className="border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center bg-gray-50">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="sig-upload-input"
                      />
                      <label htmlFor="sig-upload-input" className="cursor-pointer space-y-2 block">
                        <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                        <p className="text-xs text-gray-600 font-medium">Click to upload signature PNG/JPG</p>
                      </label>
                      {uploadedSig && (
                        <div className="mt-4 p-2 bg-white rounded-lg border border-gray-200 inline-block">
                          <img src={uploadedSig} alt="Uploaded signature" className="h-16 max-w-full object-contain" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Consent Checkbox */}
              <div className="flex items-start space-x-3 pt-2">
                <input
                  type="checkbox"
                  id="consent-check"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="consent-check" className="text-xs text-gray-600 leading-normal">
                  I understand and agree that my digital signature constitutes a legally binding acceptance of this document and its terms.
                </label>
              </div>

              {/* Action Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-6 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Signature & Audit Certificate...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Sign & Accept Document</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}
