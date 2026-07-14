'use client'

import { useState, useEffect } from 'react'
import InvoicePage from '@/components/generate-pdf/InvoicePage'
import { Invoice } from '@/components/generate-pdf/data/types'
import '@/components/generate-pdf/invoice.css'

export default function NewDocumentPage() {
  const [data, setData] = useState<Invoice | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('invoiceData')
      if (saved) setData(JSON.parse(saved))
    } catch {}
  }, [])

  const onInvoiceUpdated = (invoice: Invoice) => {
    localStorage.setItem('invoiceData', JSON.stringify(invoice))
    setData(invoice)
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]">
      {/* Page header */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-200">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-950">New Document</h1>
            <p className="text-xs text-gray-500">Edit the fields below — click the PDF button to download</p>
          </div>
        </div>

        {/* Info pill */}
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
          Click any field to edit · All changes auto-save locally
        </div>
      </div>

      {/* Invoice card */}
      <div className="max-w-4xl mx-auto px-4 pb-12">
        <div className="rounded-[2rem] bg-white shadow-2xl shadow-indigo-200/30 ring-1 ring-white overflow-hidden">
          <InvoicePage data={data ?? undefined} onChange={onInvoiceUpdated} />
        </div>
      </div>
    </div>
  )
}
