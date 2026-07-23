'use client'

import { useState } from 'react'
import { Plus, Check, Star, Trash2, Edit2, ShieldCheck, PenTool } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { SignaturePad } from '@/components/ui/signature-pad'

export interface BrandSignature {
  id: string
  businessProfileId: string | null
  name: string
  signerName: string
  signerTitle: string | null
  signatureData: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export function SignaturesModule({
  token,
  businessProfileId,
}: {
  token?: string
  businessProfileId?: string | null
}) {
  const { addToast } = useToast()
  const { data, loading, refetch } = useApi<{ signatures: BrandSignature[] }>('/api/signatures', token)

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [signatureName, setSignatureName] = useState("Director's Signature")
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('Managing Director')
  const [isDefault, setIsDefault] = useState(false)
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const signatures = data?.signatures || []

  const handleSaveSignature = async () => {
    if (!capturedDataUrl) {
      addToast({ title: 'Signature Required', description: 'Please draw or type a signature before saving.', variant: 'error' })
      return
    }
    if (!signerName.trim()) {
      addToast({ title: 'Signer Name Required', description: 'Please enter the name of the person signing.', variant: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      await apiClient('/api/signatures', {
        method: 'POST',
        token,
        body: JSON.stringify({
          businessProfileId: businessProfileId || null,
          name: signatureName || 'Default Signature',
          signerName,
          signerTitle,
          signatureData: capturedDataUrl,
          isDefault,
        }),
      })

      addToast({ title: 'Signature Saved', description: 'Brand signature created successfully.', variant: 'success' })
      setIsAddModalOpen(false)
      setCapturedDataUrl(null)
      setSignerName('')
      refetch()
    } catch (err: any) {
      addToast({ title: 'Error Saving Signature', description: err?.message || 'Could not save signature.', variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await apiClient(`/api/signatures/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isDefault: true }),
      })
      addToast({ title: 'Default Updated', description: 'Signature set as brand default.', variant: 'success' })
      refetch()
    } catch (err: any) {
      addToast({ title: 'Error', description: 'Failed to set default signature.', variant: 'error' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand signature?')) return
    try {
      await apiClient(`/api/signatures/${id}`, {
        method: 'DELETE',
        token,
      })
      addToast({ title: 'Signature Deleted', description: 'Signature removed from brand settings.', variant: 'success' })
      refetch()
    } catch (err: any) {
      addToast({ title: 'Error', description: 'Failed to delete signature.', variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-semibold text-gray-900">Brand E-Signatures</h3>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Store authorized brand signatures to automatically apply onto Quotations, Invoices, Contracts, and Receipts.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setCapturedDataUrl(null)
            setIsAddModalOpen(true)
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-2 px-3.5 rounded-xl flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Signature
        </Button>
      </div>

      {/* Signature Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="h-44 bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-44 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      ) : signatures.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 p-6">
          <PenTool className="w-10 h-10 text-gray-300 mx-auto mb-3 stroke-1" />
          <h4 className="text-sm font-medium text-gray-900">No Signatures Saved Yet</h4>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Draw or type your signature once, and Zuri will auto-apply it across all business documents.
          </p>
          <Button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 px-4 rounded-xl"
          >
            Create Your First Signature
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {signatures.map((sig) => (
            <div
              key={sig.id}
              className={`bg-white rounded-2xl border p-4 transition flex flex-col justify-between relative ${
                sig.isDefault ? 'border-indigo-500/80 ring-2 ring-indigo-500/10 shadow-xs' : 'border-gray-200/80 hover:border-gray-300'
              }`}
            >
              <div>
                {/* Header & Badges */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-semibold text-gray-900 truncate">{sig.name}</span>
                  </div>
                  {sig.isDefault ? (
                    <Badge variant="purple" className="flex items-center gap-1 text-[10px] px-2 py-0.5">
                      <Star className="w-3 h-3 fill-indigo-600" /> Default
                    </Badge>
                  ) : null}
                </div>

                {/* Preview Image */}
                <div className="bg-slate-50 rounded-xl border border-gray-100 p-3 h-28 flex items-center justify-center relative overflow-hidden mb-3">
                  <img
                    src={sig.signatureData}
                    alt={sig.signerName}
                    className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                  />
                  <div className="absolute bottom-2 left-3 right-3 border-b border-gray-200/60 pointer-events-none" />
                </div>

                {/* Signer Info */}
                <div className="text-xs space-y-0.5">
                  <p className="font-medium text-gray-900">{sig.signerName}</p>
                  {sig.signerTitle ? <p className="text-gray-500 text-[11px]">{sig.signerTitle}</p> : null}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-4 text-xs">
                {!sig.isDefault ? (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(sig.id)}
                    className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                  >
                    <Star className="w-3.5 h-3.5" /> Set as Default
                  </button>
                ) : (
                  <span className="text-gray-400 text-[11px] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Auto-applies on docs
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(sig.id)}
                  className="text-gray-400 hover:text-red-600 p-1 rounded-md transition"
                  title="Delete signature"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for Adding New Signature */}
      <Modal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Brand Signature">
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Signature Label</label>
              <input
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="e.g. Director's Signature"
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Signer Name *</label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Signer Title / Role</label>
              <input
                type="text"
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                placeholder="e.g. Managing Director / Founder"
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Canvas Signature Pad */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Signature Pad</label>
            <SignaturePad
              onSave={(dataUrl) => {
                setCapturedDataUrl(dataUrl)
                addToast({ title: 'Signature Captured', description: 'Signature image generated ready to save.', variant: 'success' })
              }}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="set-default-sig"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
            />
            <label htmlFor="set-default-sig" className="text-xs text-gray-700">
              Set as default signature for all new business documents
            </label>
          </div>

          {/* Modal Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddModalOpen(false)}
              className="text-xs py-2 px-4"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!capturedDataUrl || isSubmitting}
              onClick={handleSaveSignature}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 px-4 rounded-xl flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {isSubmitting ? 'Saving...' : 'Save Brand Signature'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
