// @ts-nocheck — @react-pdf/renderer's JSX typings don't line up cleanly with
// React 19 (same accommodation the rest of this codebase's PDF code makes).
'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { BlobProvider } from '@react-pdf/renderer'
import { Download, Loader2, Eye, CloudUpload, CheckCircle2, AlertTriangle } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { BUSINESS_TEMPLATES } from '@zuri/pdf-templates'
import type { TemplateProps } from '@zuri/pdf-templates'

// PDF Rendering Architecture (see CLAUDE.md) — every document a user is
// actively looking at renders here, in the browser, using the exact same
// @zuri/pdf-templates components services/api used to render server-side.
// Once the browser produces the PDF bytes, they're uploaded once to
// POST /api/documents/:id/render-complete so storage_path/status get set —
// that's what keeps WhatsApp send, the public share link, and status
// transitions working exactly as before, without a second server-side
// render. See docs/PDF_TEMPLATE_GUIDE.md for the template format itself.

interface Props {
  documentId: string
  templateKey: string
  data: TemplateProps
  fileName: string
  docLabel?: string
  token: string | null | undefined
  onPersisted?: () => void
}

type PersistStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function ClientPdfRenderer({ documentId, templateKey, data, fileName, docLabel = 'Document', token, onPersisted }: Props) {
  const Template = (BUSINESS_TEMPLATES as Record<string, (p: TemplateProps) => any>)[templateKey] ?? BUSINESS_TEMPLATES.minimal
  const element = useMemo(
    () => <Template document={data.document} business={data.business} contact={data.contact} />,
    [Template, data],
  )

  const [persistStatus, setPersistStatus] = useState<PersistStatus>('idle')
  // A ref, not state — BlobProvider's render-prop fires during React's
  // render phase, so it can only mutate a ref here; the actual upload is
  // deferred to a microtask (see below) so its setState calls don't happen
  // mid-render.
  const seenBlobRef = useRef<Blob | null>(null)

  const persist = useCallback(async (blob: Blob) => {
    if (!token) return
    setPersistStatus('saving')
    try {
      const buf = await blob.arrayBuffer()
      await apiClient(`/api/documents/${documentId}/render-complete`, {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/pdf' },
        body: buf as unknown as BodyInit,
      })
      setPersistStatus('saved')
      onPersisted?.()
    } catch {
      setPersistStatus('error')
    }
  }, [documentId, token, onPersisted])

  return (
    <div className="space-y-4">
      <BlobProvider document={element}>
        {({ blob, url, loading, error }: { blob: Blob | null; url: string | null; loading: boolean; error: Error | null }) => {
          if (blob && blob !== seenBlobRef.current) {
            seenBlobRef.current = blob
            queueMicrotask(() => { persist(blob) })
          }

          if (loading) {
            return (
              <div className="flex items-center justify-center h-72 rounded-2xl border border-gray-100 bg-gray-50">
                <div className="text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
                  <p className="text-xs text-gray-400 font-semibold">Building preview…</p>
                </div>
              </div>
            )
          }
          if (error || !url) {
            return (
              <div className="flex items-center justify-center h-24 rounded-2xl border border-red-100 bg-red-50">
                <p className="text-xs text-red-500 font-semibold">Preview unavailable</p>
              </div>
            )
          }

          return (
            <>
              <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
                <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-xs font-semibold text-gray-600">PDF Preview</span>
                  </div>
                  {persistStatus === 'saving' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400">
                      <CloudUpload className="w-3 h-3 animate-pulse" />Saving…
                    </span>
                  )}
                  {persistStatus === 'saved' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                      <CheckCircle2 className="w-3 h-3" />Saved
                    </span>
                  )}
                  {persistStatus === 'error' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500">
                      <AlertTriangle className="w-3 h-3" />Couldn't save
                    </span>
                  )}
                </div>
                <iframe src={url} title="Document Preview" className="w-full" style={{ height: '520px', border: 'none' }} />
              </div>

              <a
                href={url}
                download={fileName}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-white text-indigo-700 font-black rounded-2xl hover:bg-indigo-50 transition-all shadow-sm ring-1 ring-indigo-200 text-sm"
              >
                <Download className="w-4 h-4" />Download {docLabel} PDF
              </a>
            </>
          )
        }}
      </BlobProvider>
    </div>
  )
}
