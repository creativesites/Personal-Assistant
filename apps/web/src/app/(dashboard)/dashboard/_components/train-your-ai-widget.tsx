'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Brain,
  Upload,
  FileText,
  CheckCircle2,
  Sparkles,
  Loader2,
  AlertCircle,
  X,
  ArrowRight,
  ShieldCheck,
  Check,
  RotateCcw,
  Edit2,
  Eye,
  FileSpreadsheet,
  FileCode,
  HelpCircle,
} from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'

export interface KnowledgeSuggestion {
  id: string
  suggestionType: string
  category: string
  title: string
  proposedKey: string | null
  proposedValue: string
  existingValue: string | null
  confidence: number
  sourceType: string
  sourceSnippet: string | null
  status: string
  createdAt: string
}

export interface KbDocument {
  id: string
  title: string
  sourceType: string
  status: string
  chunkCount: number
  createdAt: string
}

interface TrainYourAiWidgetProps {
  token: string
  initialDocCount?: number
  onRefresh?: () => void
}

export function TrainYourAiWidget({ token, initialDocCount = 0, onRefresh }: TrainYourAiWidgetProps) {
  const { addToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDragActive, setIsDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [recentDoc, setRecentDoc] = useState<{ id: string; title: string } | null>(null)
  
  const [documents, setDocuments] = useState<KbDocument[]>([])
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedValue, setEditedValue] = useState('')
  const [dismissed, setDismissed] = useState(false)

  // Fetch KB documents and pending suggestions
  const fetchKbState = useCallback(async () => {
    if (!token) return
    setLoadingSuggestions(true)
    try {
      const [docRes, sugRes] = await Promise.allSettled([
        apiClient<{ documents: KbDocument[] }>('/api/knowledge/documents', { token }),
        apiClient<{ suggestions: KnowledgeSuggestion[] }>('/api/knowledge/suggestions?status=pending', { token }),
      ])

      if (docRes.status === 'fulfilled') setDocuments(docRes.value.documents || [])
      if (sugRes.status === 'fulfilled') setSuggestions(sugRes.value.suggestions || [])
    } catch {
      // Non-critical, fail gracefully
    } finally {
      setLoadingSuggestions(false)
    }
  }, [token])

  useEffect(() => {
    fetchKbState()
  }, [fetchKbState])

  const totalDocs = documents.length || initialDocCount

  // Handle Drag Events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await uploadFile(files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFile(e.target.files[0])
    }
  }

  const uploadFile = async (file: File) => {
    if (!token) return
    setUploading(true)
    setUploadProgress(`Uploading ${file.name}...`)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', file.name.replace(/\.[^.]+$/, ''))
      formData.append('category', 'general')

      const res = await fetch('/api/proxy/api/knowledge/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || 'Failed to upload document')
      }

      const data = await res.json()
      setUploadProgress('Analyzing & extracting Q&A, prices, policies...')

      setRecentDoc({ id: data.id, title: file.name })
      addToast({
        variant: 'success',
        title: 'Document Uploaded!',
        description: `Zuri is now extracting knowledge and Q&A facts from ${file.name}.`,
      })

      // Refresh KB state & notify parent
      await fetchKbState()
      onRefresh?.()

      // Poll after 3 seconds for processed suggestions
      setTimeout(() => {
        fetchKbState()
        setUploadProgress(null)
      }, 3000)
    } catch (err: any) {
      addToast({
        variant: 'error',
        title: 'Upload Failed',
        description: err.message || 'Could not upload file.',
      })
      setUploadProgress(null)
    } finally {
      setUploading(false)
    }
  }

  const handleApprove = async (id: string, customVal?: string) => {
    if (!token) return
    setActioningId(id)
    try {
      await apiClient(`/api/knowledge/suggestions/${id}/approve`, {
        method: 'POST',
        token,
        body: JSON.stringify({ editedValue: customVal }),
      })
      addToast({ variant: 'success', title: 'Knowledge Fact Approved & Live!' })
      setEditingId(null)
      fetchKbState()
      onRefresh?.()
    } catch {
      addToast({ variant: 'error', title: 'Could not approve fact' })
    } finally {
      setActioningId(null)
    }
  }

  const handleReject = async (id: string) => {
    if (!token) return
    setActioningId(id)
    try {
      await apiClient(`/api/knowledge/suggestions/${id}/reject`, {
        method: 'POST',
        token,
      })
      addToast({ variant: 'info', title: 'Fact candidate dismissed' })
      fetchKbState()
    } catch {
      addToast({ variant: 'error', title: 'Could not dismiss fact' })
    } finally {
      setActioningId(null)
    }
  }

  const handleApproveAll = async () => {
    if (!token || suggestions.length === 0) return
    setActioningId('all')
    try {
      await apiClient('/api/knowledge/suggestions/bulk', {
        method: 'POST',
        token,
        body: JSON.stringify({ action: 'approve_all' }),
      })
      addToast({
        variant: 'success',
        title: 'All Extracted Q&A Approved!',
        description: `${suggestions.length} facts published to Zuri AI Memory.`,
      })
      fetchKbState()
      onRefresh?.()
    } catch {
      addToast({ variant: 'error', title: 'Failed to approve all facts' })
    } finally {
      setActioningId(null)
    }
  }

  // If user dismissed and already has documents with no pending suggestions, hide widget
  if (dismissed && totalDocs > 0 && suggestions.length === 0) {
    return null
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 p-6 md:p-8 text-white shadow-xl shadow-indigo-950/20">
      
      {/* Background Decorative Glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

      {/* Header */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-white/10">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Brain size={14} className="text-indigo-400 animate-pulse" />
              Train Your AI Knowledge Engine
            </span>
            {totalDocs > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <CheckCircle2 size={12} />
                {totalDocs} Doc{totalDocs > 1 ? 's' : ''} Active
              </span>
            )}
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-white">
            Upload Price Lists, FAQs & Catalogs for 100% Accurate AI Replies
          </h2>
          <p className="text-xs md:text-sm text-indigo-200/80 leading-relaxed">
            Prevent hallucinated pricing or policies. Train Zuri on your official company documents so customer replies on WhatsApp are always verified and reliable.
          </p>
        </div>

        {totalDocs > 0 && (
          <button
            onClick={() => setDismissed(true)}
            className="self-end md:self-auto p-1.5 text-indigo-300/60 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Dismiss widget"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Main Drag & Drop Zone */}
      <div className="relative z-10 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <div className="lg:col-span-7 space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
              isDragActive
                ? 'border-indigo-400 bg-indigo-500/20 scale-[0.99]'
                : 'border-white/20 bg-white/5 hover:border-indigo-400/50 hover:bg-white/10'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".pdf,.csv,.txt,.text,.md,.doc,.docx,.xlsx,.xls,image/*"
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300 ring-1 ring-white/10 group-hover:bg-indigo-500/30 group-hover:scale-110 transition-all">
                {uploading ? (
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                ) : (
                  <Upload size={24} className="text-indigo-300" />
                )}
              </div>

              {uploading ? (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">{uploadProgress}</p>
                  <p className="text-xs text-indigo-300/70">Extracting facts, prices & policy rules...</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">
                    Drag & Drop your pricing PDF, CSV, TXT or Catalog here
                  </p>
                  <p className="text-xs text-indigo-200/60">
                    Supports <span className="text-indigo-300 font-semibold">PDF, CSV, TXT, Word, Excel, Images</span> (Up to 25MB)
                  </p>
                </div>
              )}

              <button
                type="button"
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
              >
                <FileText size={14} />
                Browse Files
              </button>
            </div>
          </div>

          {/* Quick File Support Badges */}
          <div className="flex items-center justify-between text-[11px] text-indigo-200/70 px-1">
            <span className="flex items-center gap-1.5">
              <FileSpreadsheet size={13} className="text-emerald-400" /> Price Lists & Rate Cards
            </span>
            <span className="flex items-center gap-1.5">
              <HelpCircle size={13} className="text-amber-400" /> FAQ Documents
            </span>
            <span className="flex items-center gap-1.5">
              <FileCode size={13} className="text-blue-400" /> Service Terms & Guidelines
            </span>
          </div>
        </div>

        {/* Extracted Q&A Candidates Preview Side Panel */}
        <div className="lg:col-span-5 bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                  Extracted Q&A Preview
                </h3>
              </div>

              {suggestions.length > 0 && (
                <button
                  onClick={handleApproveAll}
                  disabled={actioningId === 'all'}
                  className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                >
                  {actioningId === 'all' ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                  Approve All ({suggestions.length})
                </button>
              )}
            </div>

            <div className="mt-3 space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
              {loadingSuggestions ? (
                <div className="flex items-center justify-center py-8 text-xs text-indigo-300/60">
                  <Loader2 size={16} className="animate-spin mr-2" /> Loading extracted Q&A facts...
                </div>
              ) : suggestions.length === 0 ? (
                <div className="text-center py-6 space-y-1">
                  <p className="text-xs font-semibold text-indigo-200/80">No pending Q&A approvals</p>
                  <p className="text-[11px] text-indigo-300/50">
                    Upload a file on the left to extract pricing rules and customer answers automatically.
                  </p>
                </div>
              ) : (
                suggestions.slice(0, 3).map((sug) => (
                  <div
                    key={sug.id}
                    className="p-3 bg-white/10 border border-white/10 rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-white text-[11px] truncate">{sug.title}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 uppercase">
                        {sug.category}
                      </span>
                    </div>

                    <p className="text-[11px] text-indigo-100/90 bg-black/20 p-2 rounded-lg font-mono">
                      {sug.proposedValue}
                    </p>

                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        onClick={() => handleReject(sug.id)}
                        disabled={actioningId === sug.id}
                        className="px-2 py-1 text-[11px] text-red-300 hover:text-white hover:bg-red-500/20 rounded transition-all"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(sug.id)}
                        disabled={actioningId === sug.id}
                        className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-[11px] font-bold shadow-sm transition-all flex items-center gap-1"
                      >
                        {actioningId === sug.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                        Approve
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <Link
            href="/knowledge-base"
            className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-xl text-xs font-bold text-center transition-all flex items-center justify-center gap-2 group"
          >
            <span>Open Knowledge Base & Memory Vault</span>
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

      </div>
    </div>
  )
}
