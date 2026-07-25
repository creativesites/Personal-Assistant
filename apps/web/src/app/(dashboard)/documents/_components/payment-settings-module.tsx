'use client'

import { useState, useEffect } from 'react'
import {
  CreditCard, Building2, Smartphone, QrCode, Save, RefreshCw, CheckCircle2, FileText, AlertCircle, Upload, ShieldCheck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { apiClient } from '@/lib/api'
import { uploadBrandLogo } from '@/lib/storage'

interface Props {
  token: string | null
}

const COMMON_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar (USD)' },
  { code: 'ZMW', symbol: 'K', name: 'Zambian Kwacha (ZMW)' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling (KES)' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand (ZAR)' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira (NGN)' },
  { code: 'EUR', symbol: '€', name: 'Euro (EUR)' },
  { code: 'GBP', symbol: '£', name: 'British Pound (GBP)' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi (GHS)' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling (UGX)' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling (TZS)' },
  { code: 'RWF', symbol: 'RF', name: 'Rwandan Franc (RWF)' },
  { code: 'BWP', symbol: 'P', name: 'Botswana Pula (BWP)' },
]

export function PaymentSettingsModule({ token }: Props) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)

  // Form State
  const [defaultCurrency, setDefaultCurrency] = useState('ZMW')
  const [defaultTaxRate, setDefaultTaxRate] = useState<number>(0)

  // Bank
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [swiftCode, setSwiftCode] = useState('')

  // Mobile Money
  const [momoProvider, setMoMoProvider] = useState('MTN MoMo')
  const [momoNumber, setMoMoNumber] = useState('')
  const [momoName, setMoMoName] = useState('')

  // QR Code & Payment Link
  const [paymentLink, setPaymentLink] = useState('')
  const [qrCodeUrl, setQrCodeUrl] = useState('')

  // Instructions & Terms
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [defaultTerms, setDefaultTerms] = useState('')

  // Load Profile Data
  useEffect(() => {
    if (!token) return
    let isMounted = true
    setLoading(true)

    apiClient<any>('/api/business-profile', { token })
      .then(profile => {
        if (!isMounted || !profile) return
        setDefaultCurrency(profile.defaultCurrency || 'ZMW')
        setDefaultTaxRate(profile.defaultTaxRate ?? 0)

        const bank = profile.bankDetails || {}
        setBankName(bank.bankName || '')
        setAccountName(bank.accountName || '')
        setAccountNumber(bank.accountNumber || '')
        setBranchCode(bank.branchCode || '')
        setSwiftCode(bank.swiftCode || '')

        const momo = profile.mobileMoney || {}
        setMoMoProvider(momo.provider || 'MTN MoMo')
        setMoMoNumber(momo.number || momo.paybill || '')
        setMoMoName(momo.name || momo.accountName || '')

        setPaymentLink(profile.paymentLink || bank.paymentLink || '')
        setQrCodeUrl(profile.qrCodeUrl || bank.qrCodeUrl || '')

        setPaymentInstructions(
          profile.paymentInstructions ||
          'Please send payment proof or quote document number as reference. Mobile Money and Wire transfers accepted.'
        )
        setDefaultTerms(
          profile.defaultTerms ||
          'Payment due within 14 days of invoice date. Late payments subject to 2% monthly interest.'
        )
      })
      .catch(() => {})
      .finally(() => { if (isMounted) setLoading(false) })

    return () => { isMounted = false }
  }, [token])

  const handleSave = async () => {
    if (!token) return
    setSaving(true)
    try {
      const payload = {
        defaultCurrency,
        defaultTaxRate: Number(defaultTaxRate) || 0,
        bankDetails: {
          bankName,
          accountName,
          accountNumber,
          branchCode,
          swiftCode,
          paymentLink,
          qrCodeUrl,
        },
        mobileMoney: {
          provider: momoProvider,
          number: momoNumber,
          paybill: momoNumber,
          name: momoName,
          accountName: momoName,
        },
        paymentInstructions,
        defaultTerms,
      }

      await apiClient('/api/business-profile', {
        method: 'PUT',
        token,
        body: JSON.stringify(payload)
      })

      addToast({
        variant: 'success',
        title: 'Payment Settings Saved',
        description: 'Your payment details and QR code will now appear on all generated documents and links.'
      })
    } catch (err: any) {
      addToast({
        variant: 'error',
        title: 'Failed to save',
        description: err?.message || 'Check connection and try again.'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !token) return

    setUploadingQr(true)
    try {
      const url = await uploadBrandLogo(token, file)
      if (url) {
        setQrCodeUrl(url)
        addToast({ variant: 'success', title: 'Payment QR Code Uploaded' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Upload failed', description: err?.message })
    } finally {
      setUploadingQr(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <RefreshCw className="w-7 h-7 animate-spin text-indigo-600" />
        <p className="text-sm font-semibold text-gray-500">Loading payment configuration…</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <CreditCard size={180} />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
            <ShieldCheck size={14} className="text-indigo-400" /> Automated Client Settlement
          </div>
          <h2 className="text-xl md:text-2xl font-black">Payment &amp; Settlement Settings</h2>
          <p className="text-xs md:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Configure your Mobile Money Paybills, Bank accounts, and instant Payment QR codes. These details are automatically embedded into your Quotations, Invoices, Receipts, and 1-Click WhatsApp payment links.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mobile Money Settings */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600">
              <Smartphone size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Mobile Money / Paybill</h3>
              <p className="text-xs text-gray-500">MTN MoMo, Airtel Money, M-Pesa &amp; local wallets</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-gray-700 block mb-1">Mobile Money Provider</label>
              <select
                value={momoProvider}
                onChange={e => setMoMoProvider(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="MTN MoMo">MTN Mobile Money (MoMo)</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="M-Pesa">Safaricom M-Pesa</option>
                <option value="Zamtel Kwacha">Zamtel Kwacha</option>
                <option value="Orange Money">Orange Money</option>
                <option value="Vodafone Cash">Vodafone Cash</option>
                <option value="Other Wallet">Other Mobile Wallet</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">Paybill / Till / Phone Number</label>
              <input
                type="text"
                placeholder="e.g. 0961234567 or Merchant Code 123456"
                value={momoNumber}
                onChange={e => setMoMoNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">Account / Registered Name</label>
              <input
                type="text"
                placeholder="e.g. Apex Solutions Ltd"
                value={momoName}
                onChange={e => setMoMoName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </div>

        {/* Bank Account Settlement */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Bank Settlement Account</h3>
              <p className="text-xs text-gray-500">Wire transfers &amp; direct bank deposits</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-gray-700 block mb-1">Bank Name</label>
              <input
                type="text"
                placeholder="e.g. Absa Bank / Standard Chartered / FNB"
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Account Name</label>
                <input
                  type="text"
                  placeholder="Holder Name"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="font-bold text-gray-700 block mb-1">Account Number / IBAN</label>
                <input
                  type="text"
                  placeholder="0123456789"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Branch Code / Sort Code</label>
                <input
                  type="text"
                  placeholder="e.g. 00123"
                  value={branchCode}
                  onChange={e => setBranchCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="font-bold text-gray-700 block mb-1">SWIFT / BIC Code</label>
                <input
                  type="text"
                  placeholder="e.g. BARCZ21"
                  value={swiftCode}
                  onChange={e => setSwiftCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Currency & Tax Defaults */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
            <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600">
              <CreditCard size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Currency &amp; Tax Defaults</h3>
              <p className="text-xs text-gray-500">Base billing currency &amp; default VAT/Sales tax</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-bold text-gray-700 block mb-1">Base Currency</label>
              <select
                value={defaultCurrency}
                onChange={e => setDefaultCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {COMMON_CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">Default Tax Rate (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="e.g. 16"
                value={defaultTaxRate}
                onChange={e => setDefaultTaxRate(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </div>

        {/* Payment QR Code & Online Link */}
        <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
            <div className="p-2.5 rounded-2xl bg-purple-50 text-purple-600">
              <QrCode size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">QR Code &amp; Online Payment Link</h3>
              <p className="text-xs text-gray-500">Stripe, PayPal, Paystack, or MoMo QR Code</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-gray-700 block mb-1">Online Payment URL / Gateway Link</label>
              <input
                type="url"
                placeholder="https://buy.stripe.com/... or https://paypal.me/yourbrand"
                value={paymentLink}
                onChange={e => setPaymentLink(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">Payment QR Code Image</label>
              <div className="flex items-center gap-3">
                {qrCodeUrl ? (
                  <div className="relative group">
                    <img src={qrCodeUrl} alt="Payment QR Code" className="w-16 h-16 rounded-xl object-contain border border-gray-200 p-1 bg-white" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-gray-400 bg-gray-50">
                    <QrCode size={24} />
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs cursor-pointer transition-all">
                    <Upload size={13} />
                    {uploadingQr ? 'Uploading…' : 'Upload QR Code Image'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} disabled={uploadingQr} />
                  </label>
                  <p className="text-[10px] text-gray-400">Scan to pay QR code embedded directly into generated PDFs.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions & Terms */}
        <div className="md:col-span-2 p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
            <div className="p-2.5 rounded-2xl bg-cyan-50 text-cyan-600">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Default Instructions &amp; Standard Terms</h3>
              <p className="text-xs text-gray-500">Auto-filled on every new Quotation and Invoice</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-bold text-gray-700 block mb-1">Payment Instructions</label>
              <textarea
                rows={3}
                placeholder="Instructions shown under payment details on PDFs..."
                value={paymentInstructions}
                onChange={e => setPaymentInstructions(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">Standard Terms &amp; Conditions</label>
              <textarea
                rows={3}
                placeholder="Terms & conditions printed on PDFs..."
                value={defaultTerms}
                onChange={e => setDefaultTerms(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Button Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-2xl shadow-lg shadow-indigo-600/20 flex items-center gap-2"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Payment Settings
        </Button>
      </div>
    </div>
  )
}
