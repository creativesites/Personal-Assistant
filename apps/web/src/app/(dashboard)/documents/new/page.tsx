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
    <div className="min-h-full bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Invoice Generator</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Click any field to edit · Use the buttons above the invoice to download or save a template
          </p>
        </div>

        {/* Invoice card — no overflow-hidden so content and scroll are unaffected */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <InvoicePage data={data ?? undefined} onChange={onInvoiceUpdated} />
        </div>
      </div>
    </div>
  )
}
