'use client'

import { useState, useEffect } from 'react'
import { Loader2, AlertCircle, Download, RefreshCw } from 'lucide-react'
import { Modal } from '@/components/ui/modal'

interface Props {
  open: boolean
  onClose: () => void
  cvId: string
  cvTitle?: string
  token: string | null | undefined
}

// CvPdfPreviewModal — renders a CV PDF by embedding the authenticated backend PDF
// endpoint inside an iframe. The backend now has fontconfig + ttf-dejavu installed
// (via the Dockerfile fix), so it produces correct output.
// Falls back to a direct download link if the iframe cannot display the PDF.
export default function CvPdfPreviewModal({ open, onClose, cvId, cvTitle, token }: Props) {
  const [iframeKey, setIframeKey] = useState(0)
  const [iframeError, setIframeError] = useState(false)

  // Reset state whenever the modal opens with a new cvId
  useEffect(() => {
    if (open) {
      setIframeKey(k => k + 1)
      setIframeError(false)
    }
  }, [open, cvId])

  const apiUrl = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
    : ''

  // Authenticated PDF URL — token in query param for iframe compatibility
  const pdfUrl = `${apiUrl}/api/career/cvs/${cvId}/pdf?token=${encodeURIComponent(token ?? '')}`
  const proxyUrl = `/api/proxy/api/career/cvs/${cvId}/pdf?token=${encodeURIComponent(token ?? '')}`

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = `${cvTitle || 'cv'}.pdf`
    // The backend requires the Authorization header, but for download we
    // use token-in-query which the route supports.
    a.click()
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title={cvTitle ? `${cvTitle} — PDF Preview` : 'CV PDF Preview'} size="lg">
      <div className="space-y-4 min-h-[420px] flex flex-col">
        {/* PDF iframe */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50">
          <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-600">PDF Preview</span>
            <button
              onClick={() => { setIframeKey(k => k + 1); setIframeError(false) }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-indigo-600 transition-colors"
              title="Reload preview"
            >
              <RefreshCw className="w-3 h-3" />Reload
            </button>
          </div>

          {iframeError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
              <AlertCircle className="w-8 h-8 text-amber-500" />
              <p className="text-sm font-semibold text-gray-700">Your browser blocked the inline preview.</p>
              <p className="text-xs text-gray-500">Use the Download button below to get your CV PDF.</p>
            </div>
          ) : (
            <iframe
              key={iframeKey}
              src={proxyUrl}
              title="CV PDF Preview"
              className="w-full"
              style={{ height: '520px', border: 'none' }}
              onError={() => setIframeError(true)}
            />
          )}
        </div>

        {/* Download button */}
        <button
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-white text-indigo-700 font-black rounded-2xl hover:bg-indigo-50 transition-all shadow-sm ring-1 ring-indigo-200 text-sm"
        >
          <Download className="w-4 h-4" />
          Download CV PDF
        </button>
      </div>
    </Modal>
  )
}
