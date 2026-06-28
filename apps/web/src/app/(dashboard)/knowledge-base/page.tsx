'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'

interface KbDocument {
  id: string
  title: string
  source_type: string
  source_url: string | null
  status: string
  chunk_count: number
  error_message: string | null
  createdAt: string
}

interface KbResponse { documents: KbDocument[] }

const STATUS_STYLE: Record<string, string> = {
  processing: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  ready:      'bg-green-50 text-green-600 border-green-200',
  error:      'bg-red-50 text-red-600 border-red-200',
}

const TYPE_ICON: Record<string, string> = {
  pdf:    '📄',
  url:    '🔗',
  text:   '📝',
  notion: '📓',
}

export default function KnowledgeBasePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data, loading, refetch } = useApi<KbResponse>('/api/knowledge-base', token)
  const documents = data?.documents ?? []

  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', source_type: 'url', source_url: '', raw_content: '' })

  const totalChunks = documents.filter(d => d.status === 'ready').reduce((acc, d) => acc + d.chunk_count, 0)
  const readyCount = documents.filter(d => d.status === 'ready').length

  const addDocument = async () => {
    if (!token || !form.title.trim()) return
    setAdding(true)
    try {
      const body: Record<string, string> = { title: form.title, source_type: form.source_type }
      if (form.source_url) body.source_url = form.source_url
      if (form.raw_content) body.raw_content = form.raw_content
      await apiClient('/api/knowledge-base', { method: 'POST', token, body: JSON.stringify(body) })
      setShowAdd(false)
      setForm({ title: '', source_type: 'url', source_url: '', raw_content: '' })
      await refetch()
    } finally {
      setAdding(false)
    }
  }

  const deleteDoc = async (id: string) => {
    if (!token || !confirm('Delete this document? All chunks will be removed.')) return
    await apiClient(`/api/knowledge-base/${id}`, { method: 'DELETE', token })
    await refetch()
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50 px-4 md:px-6 py-5 pt-16 pb-20 md:pt-5 md:pb-5">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Knowledge Base</h1>
            <p className="text-gray-500 text-sm mt-0.5">{readyCount} documents · {totalChunks.toLocaleString()} searchable chunks</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
            + Add source
          </button>
        </div>

        {/* Add modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Add knowledge source</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. FAQ Document, Product Guide" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source type</label>
                  <select value={form.source_type} onChange={e => setForm(f => ({...f, source_type: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="url">Website URL</option>
                    <option value="text">Paste text</option>
                    <option value="pdf">PDF (coming soon)</option>
                    <option value="notion">Notion (coming soon)</option>
                  </select>
                </div>
                {form.source_type === 'url' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input value={form.source_url} onChange={e => setForm(f => ({...f, source_url: e.target.value}))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="https://..." />
                  </div>
                )}
                {form.source_type === 'text' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                    <textarea value={form.raw_content} onChange={e => setForm(f => ({...f, raw_content: e.target.value}))} rows={6}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Paste your text content here…" />
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button disabled={adding || !form.title.trim()} onClick={addDocument}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {adding ? 'Processing…' : 'Add source'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />)}</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="text-4xl mb-3">📚</div>
            <p className="text-gray-900 font-semibold mb-1">No documents yet</p>
            <p className="text-gray-500 text-sm mb-4">Add FAQs, product guides, or URLs to give your agents knowledge</p>
            <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">Add first source</button>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map(doc => (
              <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
                <div className="text-2xl flex-shrink-0">{TYPE_ICON[doc.source_type] ?? '📄'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold text-gray-900">{doc.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLE[doc.status] ?? STATUS_STYLE.processing}`}>
                      {doc.status}
                    </span>
                  </div>
                  {doc.source_url && <p className="text-xs text-gray-400 truncate mb-1">{doc.source_url}</p>}
                  {doc.error_message && <p className="text-xs text-red-500">{doc.error_message}</p>}
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {doc.status === 'ready' && <span>{doc.chunk_count} chunks indexed</span>}
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button onClick={() => deleteDoc(doc.id)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
