'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { X, Loader2, AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { apiClient } from '@/lib/api'
import type { ZuriDocData } from './ZuriDocumentPDF'

const ClientPDFDownload = dynamic(
  () => import('./ClientPDFDownload'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-32 rounded-2xl bg-gray-50 border border-gray-100">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
      </div>
    )
  }
)

interface DocumentDetail {
  id: string
  documentType: string
  documentNumber: string
  title: string
  status: string
  currency: string
  contactId: string | null
  businessProfileId: string | null
  createdAt: string
  structuredData: {
    items?: { description?: string; quantity?: number; unitPriceCents?: number; discountPct?: number; taxPct?: number }[]
    notes?: string | null
    terms?: string | null
    validUntil?: string | null
    dueDate?: string | null
    manualContact?: { name: string; company?: string; email?: string; phone?: string; address?: string } | null
  } | null
}

interface BusinessProfile {
  id: string
  companyName?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  taxId?: string | null
  logoUrl?: string | null
  bankDetails?: { bankName?: string; accountName?: string; accountNumber?: string; branchCode?: string } | null
  footerText?: string | null
  defaultTerms?: string | null
  isDefault: boolean
}

interface Contact {
  id: string
  name: string
  company?: string | null
  phoneNumber?: string | null
  email?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  documentId: string
  token: string | null | undefined
}

export default function DocumentPreviewModal({ open, onClose, documentId, token }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [profiles, setProfiles] = useState<BusinessProfile[]>([])
  const [contact, setContact] = useState<Contact | null>(null)

  useEffect(() => {
    if (!open || !token || !documentId) return

    let isMounted = true
    setLoading(true)
    setError(null)

    async function loadData() {
      try {
        // 1. Fetch document detail
        const { document } = await apiClient<{ document: DocumentDetail }>(`/api/documents/${documentId}`, { token: token ?? undefined })
        if (!isMounted) return
        setDoc(document)

        // 2. Fetch business profiles to find the matching brand config
        const { profiles: fetchedProfiles } = await apiClient<{ profiles: BusinessProfile[] }>('/api/business-profiles', { token: token ?? undefined })
        if (!isMounted) return
        setProfiles(fetchedProfiles || [])

        // 3. Fetch contact if linked
        if (document.contactId) {
          const { contact: fetchedContact } = await apiClient<{ contact: Contact }>(`/api/contacts/${document.contactId}`, { token: token ?? undefined })
          if (!isMounted) return
          setContact(fetchedContact)
        } else {
          setContact(null)
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load document preview data')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [open, documentId, token])

  const pdfData = useMemo<ZuriDocData | null>(() => {
    if (!doc) return null

    // Match business profile
    const profile = profiles.find(p => p.id === doc.businessProfileId) || profiles.find(p => p.isDefault)

    // Match contact
    let clientName = ''
    let clientCompany = ''
    let clientAddress = ''
    let clientPhone = ''
    let clientEmail = ''

    if (contact) {
      clientName = contact.name || ''
      clientCompany = contact.company || ''
      clientPhone = contact.phoneNumber || ''
      clientEmail = contact.email || ''
    } else if (doc.structuredData?.manualContact) {
      const manual = doc.structuredData.manualContact
      clientName = manual.name || ''
      clientCompany = manual.company || ''
      clientPhone = manual.phone || ''
      clientEmail = manual.email || ''
      clientAddress = manual.address || ''
    }

    // Line items
    const lineItems = (doc.structuredData?.items || []).map((item: any, idx: number) => ({
      id: item.id || String(idx),
      description: item.description || '',
      quantity: String(item.quantity ?? 1),
      unitPrice: String(((item.unitPriceCents ?? 0) / 100).toFixed(2)),
      taxRate: String(item.taxPct ?? 0),
    }))

    // Global discount
    const discountRate = doc.structuredData?.items?.[0]?.discountPct ?? 0

    // Asset URL helper
    const brandAssetUrl = (pathStr: string): string => {
      if (!pathStr) return ''
      if (pathStr.startsWith('http')) return pathStr
      return `/api/proxy${pathStr}?token=${encodeURIComponent(token ?? '')}`
    }

    return {
      docType: doc.documentType,
      docNumber: doc.documentNumber,
      issueDate: doc.createdAt ? new Date(doc.createdAt).toISOString().slice(0, 10) : '',
      dueDate: doc.structuredData?.dueDate || doc.structuredData?.validUntil || '',
      reference: '',
      currency: doc.currency || 'ZMW',
      companyName: profile?.companyName || '',
      companyAddress: profile?.address || '',
      companyPhone: profile?.phone || '',
      companyEmail: profile?.email || '',
      companyWebsite: profile?.website || '',
      companyLogoUrl: profile?.logoUrl ? brandAssetUrl(profile.logoUrl) : '',
      taxId: profile?.taxId || '',
      clientName,
      clientCompany,
      clientAddress,
      clientPhone,
      clientEmail,
      lineItems,
      discountRate,
      notes: doc.structuredData?.notes || '',
      terms: doc.structuredData?.terms || profile?.defaultTerms || '',
      bankName: profile?.bankDetails?.bankName || '',
      accountName: profile?.bankDetails?.accountName || '',
      accountNumber: profile?.bankDetails?.accountNumber || '',
      branchCode: profile?.bankDetails?.branchCode || '',
      footerText: profile?.footerText || '',
    }
  }, [doc, profiles, contact, token])

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title={doc ? `${doc.title} — Preview` : 'Document Preview'} size="lg">
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
        ) : pdfData ? (
          <div className="space-y-4">
            <ClientPDFDownload
              data={pdfData}
              fileName={`${pdfData.docNumber || pdfData.docType}.pdf`}
              docLabel={pdfData.docType.charAt(0).toUpperCase() + pdfData.docType.slice(1)}
            />
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500 text-sm">No preview data found.</div>
        )}
      </div>
    </Modal>
  )
}
