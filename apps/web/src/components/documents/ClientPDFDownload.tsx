// @ts-nocheck — @react-pdf/renderer types incompatible with React 19; runtime is fine
'use client'

import { PDFDownloadLink, BlobProvider } from '@react-pdf/renderer'
import ZuriDocumentPDF from './ZuriDocumentPDF'
import type { ZuriDocData } from './ZuriDocumentPDF'
import { Download, Loader2, Eye } from 'lucide-react'

interface Props {
  data: ZuriDocData
  fileName: string
  docLabel?: string
}

export default function ClientPDFDownload({ data, fileName, docLabel = 'Document' }: Props) {
  return (
    <div className="space-y-4">
      {/* Inline preview */}
      <BlobProvider document={<ZuriDocumentPDF data={data} />}>
        {({ url, loading, error }) => {
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
            <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
              <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-gray-600">PDF Preview</span>
              </div>
              <iframe
                src={url}
                title="Document Preview"
                className="w-full"
                style={{ height: '520px', border: 'none' }}
              />
            </div>
          )
        }}
      </BlobProvider>

      {/* Download button */}
      <PDFDownloadLink
        document={<ZuriDocumentPDF data={data} />}
        fileName={fileName}
      >
        {({ loading, error }) => (
          <button
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-white text-indigo-700 font-black rounded-2xl hover:bg-indigo-50 transition-all shadow-sm ring-1 ring-indigo-200 text-sm disabled:opacity-60"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Preparing PDF…</>
            ) : (
              <><Download className="w-4 h-4" />Download {docLabel} PDF</>
            )}
          </button>
        )}
      </PDFDownloadLink>
    </div>
  )
}
