'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { apiClient } from '@/lib/api'
import type { TemplateProps } from '@zuri/pdf-templates'

const ClientPdfRenderer = dynamic(
  () => import('./ClientPdfRenderer'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-32 rounded-2xl bg-gray-50 border border-gray-100">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
      </div>
    ),
  },
)

interface RenderContext extends TemplateProps {
  documentType: string
  templateKey: string
}

interface Props {
  open: boolean
  onClose: () => void
  documentId: string
  token: string | null | undefined
  onPersisted?: () => void
}

// PDF Rendering Architecture (see CLAUDE.md) — this modal used to assemble
// an ad-hoc, single-template PDF shape from three separate fetches
// (document/business-profiles/contact); it now fetches the exact
// {templateKey, document, business, contact} shape GET /api/documents/:id/
// render-context already assembles server-side (the same builders the old
// server-render path used), and renders it via the real template the
// document actually uses — see docs/PDF_TEMPLATE_GUIDE.md.
export default function DocumentPreviewModal({ open, onClose, documentId, token, onPersisted }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<RenderContext | null>(null)

  useEffect(() => {
    if (!open || !token || !documentId) return

    let isMounted = true
    setLoading(true)
    setError(null)

    apiClient<RenderContext>(`/api/documents/${documentId}/render-context`, { token })
      .then(data => { if (isMounted) setContext(data) })
      .catch((err: any) => { if (isMounted) setError(err.message || 'Failed to load document preview data') })
      .finally(() => { if (isMounted) setLoading(false) })

    return () => { isMounted = false }
  }, [open, documentId, token])

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title={context ? `${context.document.title} — Preview` : 'Document Preview'} size="lg">
      <div className="space-y-4 p-1 min-h-[400px] flex flex-col justify-between">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm text-gray-500 font-semibold">Compiling document preview…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-sm text-red-700 font-semibold">{error}</p>
            <button
              onClick={onClose}
              className="mt-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl transition-all"
            >
              Close
            </button>
          </div>
        ) : context ? (
          <ClientPdfRenderer
            documentId={documentId}
            templateKey={context.templateKey}
            data={{ document: context.document, business: context.business, contact: context.contact }}
            fileName={`${context.document.documentNumber || context.documentType}.pdf`}
            docLabel={context.documentType.charAt(0).toUpperCase() + context.documentType.slice(1)}
            token={token}
            onPersisted={onPersisted}
          />
        ) : (
          <div className="text-center py-10 text-gray-500 text-sm">No preview data found.</div>
        )}
      </div>
    </Modal>
  )
}
