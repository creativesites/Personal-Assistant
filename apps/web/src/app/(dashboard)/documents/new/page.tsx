'use client'

import { useState, useEffect } from 'react'
import InvoicePage from '@/components/generate-pdf/InvoicePage'
import { Invoice } from '@/components/generate-pdf/data/types'

export default function TestNewPDF() {
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
    <div className="app">
      <h1 className="center fs-30">React Invoice Generator</h1>
      <InvoicePage data={data ?? undefined} onChange={onInvoiceUpdated} />
    </div>
  )
}
