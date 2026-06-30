'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import {
  FileText, Globe, FileEdit, BookOpen, Table, Upload, Link2,
  Sparkles, Search, RefreshCw, Trash2, Eye, RotateCcw,
  AlertTriangle, X, ChevronRight, File as FileIcon, Send, Database,
  Layers, Clock, Tag, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface KbDocument {
  id: string
  title: string
  source_type: 'pdf' | 'url' | 'text' | 'excel' | 'csv' | 'notion' | string
  source_url: string | null
  category: string | null
  tags: string[]
  status: 'ready' | 'processing' | 'error' | string
  chunk_count: number
  word_count: number | null
  file_size: number | null
  used_count: number | null
  last_used_at: string | null
  summary: string | null
  error_message: string | null
  content_preview: string | null
  created_at: string
  updated_at: string
}

interface KbStats {
  documents: number
  total_chunks: number
  total_words: number
  last_sync: string | null
  categories: string[]
}

interface KbHealthWarning {
  id: string
  message: string
  level: 'warning' | 'error'
}

interface ChatMessage {
  id: string
  question: string
  answer: string
  sources: string[]
}

interface SearchResult {
  document_id: string
  document_title: string
  content: string
  relevance_score: number
  source_type: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatWords(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TypeIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  switch (type) {
    case 'pdf':    return <FileText className={`${className} text-red-500`} />
    case 'url':    return <Globe className={`${className} text-blue-500`} />
    case 'text':   return <FileEdit className={`${className} text-green-500`} />
    case 'excel':  return <Table className={`${className} text-emerald-600`} />
    case 'csv':    return <Table className={`${className} text-gray-500`} />
    case 'notion': return <BookOpen className={`${className} text-purple-500`} />
    default:       return <FileIcon className={`${className} text-gray-400`} />
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      <CheckCircle className="w-3 h-3" /> AI Ready
    </span>
  )
  if (status === 'processing') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Loader2 className="w-3 h-3 animate-spin" /> Processing
    </span>
  )
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      <AlertCircle className="w-3 h-3" /> Failed
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
      {status}
    </span>
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

// ─── Stat Cards ──────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: string | number; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-tight font-numeric">{value}</p>
      </div>
    </div>
  )
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function ModalWrapper({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </div>
  )
}

function UploadModal({
  token,
  onClose,
  onSuccess,
}: {
  token: string | undefined
  onClose: () => void
  onSuccess: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [progress, setProgress] = useState<'idle' | 'uploading' | 'indexing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleSubmit = async () => {
    if (!file || !title.trim() || !token) return
    setProgress('uploading')
    setErrorMsg('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title)
      if (category) formData.append('category', category)
      if (tags) formData.append('tags', tags)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const res = await fetch(`${apiUrl}/api/knowledge/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setProgress('indexing')
      await new Promise(r => setTimeout(r, 800))
      setProgress('done')
      await new Promise(r => setTimeout(r, 600))
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setProgress('error')
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const progressLabel: Record<string, string> = {
    idle: 'Upload & Index',
    uploading: 'Uploading...',
    indexing: 'Indexing...',
    done: 'Done!',
    error: 'Retry',
  }

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Upload File</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors mb-4"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <TypeIcon type={file.name.endsWith('.pdf') ? 'pdf' : file.name.endsWith('.csv') ? 'csv' : 'excel'} className="w-6 h-6" />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700">Drop PDF, Excel or CSV here</p>
              <p className="text-xs text-gray-400 mt-1">or click to browse files</p>
            </>
          )}
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Document title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g. Policies"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tags</label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="comma, separated"
              />
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            disabled={!file || !title.trim() || progress === 'uploading' || progress === 'indexing'}
            onClick={handleSubmit}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {(progress === 'uploading' || progress === 'indexing') && <Loader2 className="w-4 h-4 animate-spin" />}
            {progressLabel[progress]}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

function AddUrlModal({
  token,
  onClose,
  onSuccess,
}: {
  token: string | undefined
  onClose: () => void
  onSuccess: () => void
}) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleUrlChange = (val: string) => {
    setUrl(val)
    if (!title && val) {
      try {
        const domain = new URL(val).hostname.replace('www.', '')
        setTitle(domain)
      } catch {}
    }
  }

  const handleSubmit = async () => {
    if (!url.trim() || !title.trim() || !token) return
    setLoading(true)
    setErrorMsg('')
    try {
      await apiClient('/api/knowledge/add-url', {
        method: 'POST',
        token,
        body: JSON.stringify({ url, title, category, tags }),
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add URL')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Add Website</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">URL</label>
            <input
              value={url}
              onChange={e => handleUrlChange(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="https://yourwebsite.com/faq"
              type="url"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="e.g. Company FAQ"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g. Support"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tags</label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="comma, separated"
              />
            </div>
          </div>
        </div>
        {errorMsg && (
          <div className="mb-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            disabled={!url.trim() || !title.trim() || loading}
            onClick={handleSubmit}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Adding...' : 'Scrape & Index'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

function AddNoteModal({
  token,
  onClose,
  onSuccess,
}: {
  token: string | undefined
  onClose: () => void
  onSuccess: () => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || !token) return
    setLoading(true)
    setErrorMsg('')
    try {
      await apiClient('/api/knowledge/add-note', {
        method: 'POST',
        token,
        body: JSON.stringify({ title, content, category, tags }),
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Paste Content</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="e.g. Refund Policy, Pricing Guide"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g. Policies"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tags</label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="comma, separated"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Content
              <span className="ml-2 font-normal text-gray-400 normal-case">{content.length.toLocaleString()} chars</span>
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={8}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              placeholder="Paste your content here — FAQs, policies, product specs, pricing..."
            />
          </div>
        </div>
        {errorMsg && (
          <div className="mb-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            disabled={!title.trim() || !content.trim() || loading}
            onClick={handleSubmit}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Saving...' : 'Save & Index'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

function DocumentDetailModal({
  doc,
  token,
  onClose,
  onRefresh,
}: {
  doc: KbDocument
  token: string | undefined
  onClose: () => void
  onRefresh: () => void
}) {
  const [reindexing, setReindexing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editTitle, setEditTitle] = useState(doc.title)
  const [editCategory, setEditCategory] = useState(doc.category ?? '')
  const [editTags, setEditTags] = useState((doc.tags ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleReindex = async () => {
    if (!token) return
    setReindexing(true)
    try {
      await apiClient(`/api/knowledge/${doc.id}/reindex`, { method: 'POST', token })
      onRefresh()
    } finally {
      setReindexing(false)
    }
  }

  const handleSave = async () => {
    if (!token) return
    setSaving(true)
    try {
      await apiClient(`/api/knowledge/${doc.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ title: editTitle, category: editCategory, tags: editTags }),
      })
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!token) return
    setDeleting(true)
    try {
      await apiClient(`/api/knowledge/${doc.id}`, { method: 'DELETE', token })
      onRefresh()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center">
              <TypeIcon type={doc.source_type} className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{doc.source_type}</p>
              <StatusBadge status={doc.status} />
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        {/* Editable fields */}
        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <input
                value={editCategory}
                onChange={e => setEditCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Uncategorized"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tags</label>
              <input
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="comma, separated"
              />
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { label: 'Chunks', value: doc.chunk_count },
            { label: 'Words', value: doc.word_count != null ? formatWords(doc.word_count) : '—' },
            { label: 'Size', value: doc.file_size != null ? formatFileSize(doc.file_size) : '—' },
            { label: 'Used', value: doc.used_count ?? 0 },
            { label: 'Last used', value: relativeTime(doc.last_used_at) },
            { label: 'Added', value: new Date(doc.created_at).toLocaleDateString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {doc.summary && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-700 mb-1">Summary</p>
            <p className="text-sm text-gray-600 leading-relaxed">{doc.summary}</p>
          </div>
        )}

        {doc.error_message && (
          <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{doc.error_message}</p>
          </div>
        )}

        {doc.content_preview && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-700 mb-1">Content preview</p>
            <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto font-mono">
              {doc.content_preview.slice(0, 500)}{doc.content_preview.length > 500 ? '...' : ''}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save changes
          </button>
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {reindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Reindex
          </button>
          {confirmDelete ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Confirm delete
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>
    </ModalWrapper>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  // Data state
  const [documents, setDocuments] = useState<KbDocument[]>([])
  const [stats, setStats] = useState<KbStats | null>(null)
  const [health, setHealth] = useState<KbHealthWarning[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissedWarnings, setDismissedWarnings] = useState<string[]>([])

  // Table filter state
  const [tableSearch, setTableSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Knowledge search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Modal state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<KbDocument | null>(null)

  // Toast state
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null)

  const showToast = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [docsData, statsData, healthData] = await Promise.allSettled([
        apiClient<{ documents: KbDocument[] }>('/api/knowledge', { token: token ?? undefined }),
        apiClient<KbStats>('/api/knowledge/stats', { token: token ?? undefined }),
        apiClient<{ warnings: KbHealthWarning[] }>('/api/knowledge/health', { token: token ?? undefined }),
      ])
      if (docsData.status === 'fulfilled') setDocuments(docsData.value.documents ?? [])
      if (statsData.status === 'fulfilled') setStats(statsData.value)
      if (healthData.status === 'fulfilled') setHealth(healthData.value.warnings ?? [])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, chatLoading])

  // ── Chat ──────────────────────────────────────────────────────────────────

  const handleAskKb = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q || !token || chatLoading) return
    setChatInput('')
    setChatLoading(true)
    try {
      const data = await apiClient<{ answer: string; sources: string[] }>('/api/knowledge/chat', {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify({ question: q }),
      })
      setChatHistory(prev => [...prev, {
        id: `c-${Date.now()}`,
        question: q,
        answer: data.answer,
        sources: data.sources ?? [],
      }])
    } catch {
      setChatHistory(prev => [...prev, {
        id: `e-${Date.now()}`,
        question: q,
        answer: "Couldn't reach the knowledge engine. Make sure the intelligence service is running.",
        sources: [],
      }])
    } finally {
      setChatLoading(false)
    }
  }, [token, chatLoading])

  // ── Knowledge search ─────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q || !token) return
    setSearchLoading(true)
    try {
      const data = await apiClient<{ results: SearchResult[] }>('/api/knowledge/search', {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify({ query: q }),
      })
      setSearchResults(data.results ?? [])
    } catch {
      showToast('Search failed. Check the intelligence service.', 'error')
    } finally {
      setSearchLoading(false)
    }
  }, [searchQuery, token, showToast])

  // ── Reindex ───────────────────────────────────────────────────────────────

  const handleReindex = useCallback(async (docId: string) => {
    if (!token) return
    try {
      await apiClient(`/api/knowledge/${docId}/reindex`, { method: 'POST', token: token ?? undefined })
      showToast('Reindex started', 'success')
      await loadData()
    } catch {
      showToast('Reindex failed', 'error')
    }
  }, [token, loadData, showToast])

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (docId: string) => {
    if (!token || !confirm('Delete this document? All indexed chunks will be removed.')) return
    try {
      await apiClient(`/api/knowledge/${docId}`, { method: 'DELETE', token: token ?? undefined })
      showToast('Document deleted', 'success')
      await loadData()
    } catch {
      showToast('Delete failed', 'error')
    }
  }, [token, loadData, showToast])

  // ── Filtered documents ────────────────────────────────────────────────────

  const filteredDocs = documents.filter(doc => {
    const q = tableSearch.toLowerCase()
    if (q && !doc.title.toLowerCase().includes(q)) return false
    if (categoryFilter && doc.category !== categoryFilter) return false
    if (statusFilter && doc.status !== statusFilter) return false
    return true
  })

  const allCategories = Array.from(new Set(documents.map(d => d.category).filter(Boolean))) as string[]
  const visibleWarnings = health.filter(w => !dismissedWarnings.includes(w.id))

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-auto bg-gray-50 pt-16 pb-20 md:pt-5 md:pb-5">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 space-y-6">

        {/* ── Toast ─────────────────────────────────────────────────────── */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-green-600 text-white' :
            toast.type === 'error' ? 'bg-red-600 text-white' :
            'bg-gray-900 text-white'
          }`}>
            {toast.type === 'success' && <CheckCircle className="w-4 h-4" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
            {toast.msg}
          </div>
        )}

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              🧠 Knowledge Base
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Teach Zuri about your business. AI replies, agents, planning, and automation consult this before responding.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Upload File
            </button>
            <button
              onClick={() => setShowUrlModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" /> Add Website
            </button>
            <button
              onClick={() => setShowNoteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FileEdit className="w-3.5 h-3.5" /> Paste Content
            </button>
            <button
              onClick={() => {
                if (!selectedDoc) { showToast('Select a document first', 'info'); return }
                handleReindex(selectedDoc.id)
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh AI Index
            </button>
          </div>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label="Documents"
              value={stats?.documents ?? documents.length}
              icon={Database}
              color="bg-blue-50 text-blue-600"
            />
            <StatCard
              label="AI-Ready Chunks"
              value={(stats?.total_chunks ?? 0).toLocaleString()}
              icon={Layers}
              color="bg-green-50 text-green-600"
            />
            <StatCard
              label="Words Indexed"
              value={formatWords(stats?.total_words ?? 0)}
              icon={FileText}
              color="bg-purple-50 text-purple-600"
            />
            <StatCard
              label="Last Sync"
              value={relativeTime(stats?.last_sync ?? null)}
              icon={Clock}
              color="bg-gray-100 text-gray-600"
            />
            <StatCard
              label="Categories"
              value={stats?.categories?.length ?? allCategories.length}
              icon={Tag}
              color="bg-amber-50 text-amber-600"
            />
          </div>
        )}

        {/* ── Health Warnings ────────────────────────────────────────────── */}
        {visibleWarnings.length > 0 && (
          <div className="space-y-2">
            {visibleWarnings.map(w => (
              <div key={w.id} className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="flex-1 text-sm text-amber-800">{w.message}</p>
                <button
                  onClick={() => setDismissedWarnings(prev => [...prev, w.id])}
                  className="text-amber-500 hover:text-amber-700 p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Ask Your Knowledge Base ────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <div>
              <h2 className="text-sm font-bold text-gray-900">Ask Your Knowledge Base</h2>
              <p className="text-xs text-gray-500">Ask anything about your business — Zuri answers from your documents.</p>
            </div>
          </div>

          {/* Chat area */}
          <div className="p-5">
            {chatHistory.length === 0 && !chatLoading ? (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Try asking</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Do you ship to Kitwe?',
                    'What is our refund policy?',
                    'What discounts do VIP customers get?',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => handleAskKb(q)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
                    >
                      <ChevronRight className="w-3 h-3" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 mb-4 max-h-72 overflow-y-auto pr-1">
                {chatHistory.map(item => (
                  <div key={item.id} className="space-y-2">
                    {/* Question */}
                    <div className="flex justify-end">
                      <div className="bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] text-sm leading-relaxed">
                        {item.question}
                      </div>
                    </div>
                    {/* Answer */}
                    <div className="flex justify-start">
                      <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%]">
                        <p className="text-sm text-gray-900 leading-relaxed">{item.answer}</p>
                        {item.sources.length > 0 && (
                          <p className="text-[11px] text-gray-400 mt-2">
                            Sources: {item.sources.slice(0, 3).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                      <span className="text-sm text-gray-500">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAskKb(chatInput) } }}
                placeholder="Ask about your products, policies, pricing..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                onClick={() => handleAskKb(chatInput)}
                disabled={!chatInput.trim() || chatLoading || !token}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 text-sm font-semibold"
              >
                <Send className="w-3.5 h-3.5" />
                Ask
              </button>
            </div>
          </div>
        </div>

        {/* ── Knowledge Search ───────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-bold text-gray-900">Search Knowledge</h2>
          </div>
          <div className="p-5">
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                  placeholder="Search indexed content..."
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || searchLoading || !token}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-semibold"
              >
                {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-3">
                {searchResults.map((r, i) => (
                  <div key={i} className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <TypeIcon type={r.source_type} className="w-3.5 h-3.5" />
                        <span className="text-xs font-semibold text-gray-700">{r.document_title}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.round(r.relevance_score * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500 font-numeric">{Math.round(r.relevance_score * 100)}%</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{r.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Documents Table ────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <h2 className="text-sm font-bold text-gray-900">Knowledge Sources</h2>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold border border-indigo-100">
                  {filteredDocs.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={tableSearch}
                    onChange={e => setTableSearch(e.target.value)}
                    placeholder="Filter by title..."
                    className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-40"
                  />
                </div>
                {allCategories.length > 0 && (
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="py-2 pl-3 pr-7 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 bg-white"
                  >
                    <option value="">All categories</option>
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="py-2 pl-3 pr-7 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 bg-white"
                >
                  <option value="">All status</option>
                  <option value="ready">AI Ready</option>
                  <option value="processing">Processing</option>
                  <option value="error">Failed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : filteredDocs.length === 0 && documents.length === 0 ? (
            // Empty state
            <div className="p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto mb-4">
                <Database className="w-7 h-7 text-gray-300" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Your Knowledge Base is empty</h3>
              <p className="text-sm text-gray-500 mb-6">Add documents to make Zuri smarter about your business.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
                >
                  <Upload className="w-4 h-4" /> Upload PDF
                </button>
                <button
                  onClick={() => setShowUrlModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
                >
                  <Globe className="w-4 h-4" /> Add Website
                </button>
                <button
                  onClick={() => setShowNoteModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
                >
                  <FileEdit className="w-4 h-4" /> Paste Content
                </button>
              </div>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No documents match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-3">Title</th>
                    <th className="text-left px-4 py-3">Category</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3 font-numeric">Chunks</th>
                    <th className="text-right px-4 py-3 font-numeric">Used</th>
                    <th className="text-left px-4 py-3">Updated</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredDocs.map(doc => (
                    <tr
                      key={doc.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors group"
                      onClick={() => setSelectedDoc(doc)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <TypeIcon type={doc.source_type} className="w-4 h-4 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate max-w-[200px]">{doc.title}</p>
                            {doc.source_url && (
                              <p className="text-xs text-gray-400 truncate max-w-[200px]">{doc.source_url}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {doc.category ? (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{doc.category}</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={doc.status} /></td>
                      <td className="px-4 py-3.5 text-right text-gray-700 font-numeric">{doc.chunk_count.toLocaleString()}</td>
                      <td className="px-4 py-3.5 text-right text-gray-500 font-numeric">{doc.used_count ?? 0}</td>
                      <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">{relativeTime(doc.updated_at)}</td>
                      <td className="px-5 py-3.5">
                        <div
                          className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setSelectedDoc(doc)}
                            title="View details"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleReindex(doc.id)}
                            title="Reindex"
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            title="Delete"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showUploadModal && (
        <UploadModal
          token={token ?? undefined}
          onClose={() => setShowUploadModal(false)}
          onSuccess={loadData}
        />
      )}
      {showUrlModal && (
        <AddUrlModal
          token={token ?? undefined}
          onClose={() => setShowUrlModal(false)}
          onSuccess={loadData}
        />
      )}
      {showNoteModal && (
        <AddNoteModal
          token={token ?? undefined}
          onClose={() => setShowNoteModal(false)}
          onSuccess={loadData}
        />
      )}
      {selectedDoc && (
        <DocumentDetailModal
          doc={selectedDoc}
          token={token ?? undefined}
          onClose={() => setSelectedDoc(null)}
          onRefresh={() => { loadData(); setSelectedDoc(null) }}
        />
      )}
    </div>
  )
}
