'use client'

import { useState, useEffect } from 'react'
import { PenTool, Check, ChevronDown, Plus } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Modal } from '@/components/ui/modal'
import { SignaturePad } from '@/components/ui/signature-pad'

export interface SelectedSignature {
  id?: string
  signerName: string
  signerTitle?: string | null
  signatureDataUri: string
}

interface SignatureSelectorProps {
  token?: string
  value?: SelectedSignature | null
  onChange: (sig: SelectedSignature | null) => void
  className?: string
}

interface ApiSignature {
  id: string
  name: string
  signerName: string
  signerTitle: string | null
  signatureData: string
  isDefault: boolean
}

export function SignatureSelector({
  token,
  value,
  onChange,
  className = '',
}: SignatureSelectorProps) {
  const { data } = useApi<{ signatures: ApiSignature[] }>('/api/signatures', token)
  const [isOpen, setIsOpen] = useState(false)
  const [isDrawModalOpen, setIsAddDrawModalOpen] = useState(false)
  const [customSignerName, setCustomSignerName] = useState('')
  const [customSignerTitle, setCustomSignerTitle] = useState('')

  const signatures = data?.signatures || []

  // Auto-select default signature if none selected yet
  useEffect(() => {
    if (!value && signatures.length > 0) {
      const defaultSig = signatures.find((s) => s.isDefault) || signatures[0]
      if (defaultSig) {
        onChange({
          id: defaultSig.id,
          signerName: defaultSig.signerName,
          signerTitle: defaultSig.signerTitle,
          signatureDataUri: defaultSig.signatureData,
        })
      }
    }
  }, [signatures, value, onChange])

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-xs font-medium text-gray-700 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-indigo-600" />
          Document Signature
        </span>
        <button
          type="button"
          onClick={() => setIsAddDrawModalOpen(true)}
          className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-0.5"
        >
          <Plus className="w-3 h-3" /> Draw One-Time
        </button>
      </label>

      {/* Selected Signature Display Box */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-white rounded-xl border border-gray-200 p-2.5 flex items-center justify-between hover:border-gray-300 transition text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {value ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-20 bg-slate-50 rounded border border-gray-100 p-1 flex items-center justify-center shrink-0">
                <img
                  src={value.signatureDataUri}
                  alt={value.signerName}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-gray-900 truncate">{value.signerName}</p>
                {value.signerTitle ? (
                  <p className="text-gray-500 text-[11px] truncate">{value.signerTitle}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <span className="text-xs text-gray-400">No signature selected (document will render without signature)</span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
        </button>

        {/* Dropdown Options */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 p-2 max-h-60 overflow-y-auto space-y-1">
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setIsOpen(false)
              }}
              className="w-full p-2 text-left rounded-lg text-xs text-gray-500 hover:bg-gray-50 flex items-center justify-between"
            >
              <span>None (Omit Signature)</span>
              {!value ? <Check className="w-3.5 h-3.5 text-indigo-600" /> : null}
            </button>

            {signatures.map((sig) => {
              const isSelected = value?.id === sig.id
              return (
                <button
                  key={sig.id}
                  type="button"
                  onClick={() => {
                    onChange({
                      id: sig.id,
                      signerName: sig.signerName,
                      signerTitle: sig.signerTitle,
                      signatureDataUri: sig.signatureData,
                    })
                    setIsOpen(false)
                  }}
                  className={`w-full p-2 rounded-lg text-left text-xs flex items-center justify-between transition ${
                    isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-16 bg-white rounded border border-gray-200 p-0.5 flex items-center justify-center shrink-0">
                      <img
                        src={sig.signatureData}
                        alt={sig.signerName}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {sig.signerName} {sig.isDefault ? <span className="text-[10px] text-indigo-600 font-semibold">(Default)</span> : null}
                      </p>
                      {sig.signerTitle ? <p className="text-[10px] text-gray-500 truncate">{sig.signerTitle}</p> : null}
                    </div>
                  </div>
                  {isSelected ? <Check className="w-4 h-4 text-indigo-600 shrink-0" /> : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Draw Custom One-Time Signature Modal */}
      <Modal open={isDrawModalOpen} onClose={() => setIsAddDrawModalOpen(false)} title="Draw Custom Signature">
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Signer Name *</label>
              <input
                type="text"
                value={customSignerName}
                onChange={(e) => setCustomSignerName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Signer Title</label>
              <input
                type="text"
                value={customSignerTitle}
                onChange={(e) => setCustomSignerTitle(e.target.value)}
                placeholder="e.g. Director"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <SignaturePad
            onSave={(dataUrl) => {
              onChange({
                signerName: customSignerName || 'Authorized Signer',
                signerTitle: customSignerTitle || null,
                signatureDataUri: dataUrl,
              })
              setIsAddDrawModalOpen(false)
            }}
          />
        </div>
      </Modal>
    </div>
  )
}
