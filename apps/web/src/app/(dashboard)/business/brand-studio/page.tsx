'use client'

import React, { useState, useEffect } from 'react'
import {
  Palette, Type, Image as ImageIcon, Shield, Save, Check, RefreshCw, Sparkles, Building2, Eye, Layout
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { PageHeader } from '@/components/ui/page-header'
import { SignaturesModule } from '../../studio/_components/signatures-module'
import { BrandModule } from '../../studio/_components/brand-module'

interface BrandProfile {
  companyName: string | null
  tagline: string | null
  logoUrl: string | null
  themeColor: string
  accentColor: string
  fontFamily: string
  themeTemplateKey: string
  watermarkText: string | null
  watermarkImageUrl: string | null
  headerBannerUrl: string | null
  footerBannerUrl: string | null
}

const THEMES = [
  {
    key: 'modern_minimalist',
    name: 'Modern Minimalist',
    description: 'Clean indigo and slate layout with generous whitespace.',
    primaryColor: '#4F46E5',
    accentColor: '#818CF8',
    font: 'Inter',
    bg: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  },
  {
    key: 'classic_corporate',
    name: 'Classic Corporate',
    description: 'Traditional deep navy and gold border layout for institutional trust.',
    primaryColor: '#1E293B',
    accentColor: '#D97706',
    font: 'Roboto',
    bg: 'bg-slate-50 border-slate-300 text-slate-900',
  },
  {
    key: 'tech_dark',
    name: 'Tech Dark',
    description: 'High-contrast dark mode with glowing cyan accents.',
    primaryColor: '#0F172A',
    accentColor: '#06B6D4',
    font: 'Outfit',
    bg: 'bg-slate-900 border-slate-700 text-slate-100',
  },
  {
    key: 'elegant_serif',
    name: 'Elegant Serif',
    description: 'Sophisticated emerald and gold accents with Playfair Display typography.',
    primaryColor: '#064E3B',
    accentColor: '#F59E0B',
    font: 'Playfair Display',
    bg: 'bg-emerald-50 border-emerald-200 text-emerald-950',
  },
]

export default function BrandStudioPage() {
  const { data: sessionData } = useZuriSession()
  const token = sessionData?.accessToken
  const { addToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'visual' | 'brand'>('visual')
  const [profileId, setProfileId] = useState<string | undefined>(undefined)
  const [profile, setProfile] = useState<BrandProfile>({
    companyName: '',
    tagline: '',
    logoUrl: null,
    themeColor: '#4F46E5',
    accentColor: '#818CF8',
    fontFamily: 'Inter',
    themeTemplateKey: 'modern_minimalist',
    watermarkText: '',
    watermarkImageUrl: '',
    headerBannerUrl: '',
    footerBannerUrl: '',
  })

  useEffect(() => {
    if (!token) return
    apiClient<any>('/api/business-profile', { token })
      .then(data => {
        setProfileId(data.id)
        setProfile({
          companyName: data.companyName || '',
          tagline: data.tagline || '',
          logoUrl: data.logoUrl || null,
          themeColor: data.themeColor || '#4F46E5',
          accentColor: data.accentColor || '#818CF8',
          fontFamily: data.fontFamily || 'Inter',
          themeTemplateKey: data.themeTemplateKey || 'modern_minimalist',
          watermarkText: data.watermarkText || '',
          watermarkImageUrl: data.watermarkImageUrl || '',
          headerBannerUrl: data.headerBannerUrl || '',
          footerBannerUrl: data.footerBannerUrl || '',
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token])

  const handleSave = async () => {
    if (!token) return
    setSaving(true)
    try {
      await apiClient('/api/business-profile', {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          themeColor: profile.themeColor,
          accentColor: profile.accentColor,
          fontFamily: profile.fontFamily,
          themeTemplateKey: profile.themeTemplateKey,
          watermarkText: profile.watermarkText || null,
          watermarkImageUrl: profile.watermarkImageUrl || null,
          headerBannerUrl: profile.headerBannerUrl || null,
          footerBannerUrl: profile.footerBannerUrl || null,
        }),
      })
      addToast({ variant: 'success', title: 'Brand Kit updated successfully' })
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Failed to update Brand Kit' })
    } finally {
      setSaving(false)
    }
  }

  const applyThemePreset = (theme: typeof THEMES[0]) => {
    setProfile(prev => ({
      ...profile,
      themeTemplateKey: theme.key,
      themeColor: theme.primaryColor,
      accentColor: theme.accentColor,
      fontFamily: theme.font,
    }))
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-indigo-600 font-medium">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading Brand Studio...</span>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 font-sans">
      <PageHeader
        title="Brand Studio & Visual Customizer"
        description="Customize document themes, color palettes, fonts, watermarks, and header banners."
        action={
          activeTab === 'visual' ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Brand Kit</span>
            </button>
          ) : null
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('visual')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'visual'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Visual Theme Customizer
        </button>
        <button
          onClick={() => setActiveTab('brand')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'brand'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Brand Profiles & Signatures
        </button>
      </div>

      {activeTab === 'visual' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Column — Controls */}
          <div className="lg:col-span-7 space-y-8">

            {/* 1. Theme Presets */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
              <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
                <Layout className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-gray-900">1. Visual Theme</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {THEMES.map(t => {
                  const isSelected = profile.themeTemplateKey === t.key
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => applyThemePreset(t)}
                      className={`p-4 rounded-xl border text-left transition-all relative space-y-2 ${
                        isSelected
                          ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/30'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                      <div className="flex items-center space-x-2">
                        <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.primaryColor }} />
                        <span className="font-bold text-sm text-gray-900">{t.name}</span>
                      </div>
                      <p className="text-xs text-gray-500 leading-normal">{t.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. Color Palette & Typography */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
              <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
                <Palette className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-gray-900">2. Colors & Typography</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Primary Brand Color</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={profile.themeColor}
                      onChange={e => setProfile({ ...profile, themeColor: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-gray-300 p-0.5"
                    />
                    <input
                      type="text"
                      value={profile.themeColor}
                      onChange={e => setProfile({ ...profile, themeColor: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Accent Color</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={profile.accentColor}
                      onChange={e => setProfile({ ...profile, accentColor: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-gray-300 p-0.5"
                    />
                    <input
                      type="text"
                      value={profile.accentColor}
                      onChange={e => setProfile({ ...profile, accentColor: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Primary Font Family</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {['Inter', 'Roboto', 'Outfit', 'Playfair Display'].map(font => (
                      <button
                        key={font}
                        type="button"
                        onClick={() => setProfile({ ...profile, fontFamily: font })}
                        className={`p-3 rounded-xl border text-xs font-medium text-center transition-colors ${
                          profile.fontFamily === font
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700 font-bold'
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Watermark & Banners */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
              <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
                <Shield className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-gray-900">3. Watermark & Banners</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Watermark Text (Diagonal Overlay)</label>
                  <input
                    type="text"
                    value={profile.watermarkText || ''}
                    onChange={e => setProfile({ ...profile, watermarkText: e.target.value })}
                    placeholder="e.g. CONFIDENTIAL or DRAFT"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Header Banner Image URL</label>
                  <input
                    type="url"
                    value={profile.headerBannerUrl || ''}
                    onChange={e => setProfile({ ...profile, headerBannerUrl: e.target.value })}
                    placeholder="https://example.com/banner.png"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Right Column — Live Preview Card */}
          <div className="lg:col-span-5">
            <div className="sticky top-8 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden space-y-4 p-6">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <Eye className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-900">Live Preview</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-600">Sample Invoice</span>
              </div>

              {/* Mock Document Canvas */}
              <div className={`p-6 rounded-xl border space-y-6 shadow-inner relative overflow-hidden bg-white text-gray-900 border-gray-200`}>
                
                {/* Optional Header Banner */}
                {profile.headerBannerUrl && (
                  <div className="h-12 w-full rounded-lg overflow-hidden bg-gray-100 mb-4">
                    <img src={profile.headerBannerUrl} alt="Header Banner" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Accent Header Stripe */}
                <div className="h-2 w-full rounded-full" style={{ backgroundColor: profile.themeColor }} />

                {/* Watermark Overlay Preview */}
                {profile.watermarkText && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 rotate-[-30deg]">
                    <span className="text-4xl font-black uppercase text-gray-900 tracking-widest">{profile.watermarkText}</span>
                  </div>
                )}

                {/* Header Info */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{profile.companyName || 'Your Business Name'}</h3>
                    <p className="text-[10px] text-gray-500">{profile.tagline || 'Professional Services & Consulting'}</p>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-xs font-bold text-indigo-600">INV-2026-001</span>
                    <p className="text-[10px] text-gray-400">July 22, 2026</p>
                  </div>
                </div>

                {/* Items Table Mock */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold text-gray-400 border-b pb-1">
                    <span>Description</span>
                    <span>Amount</span>
                  </div>
                  <div className="flex justify-between text-xs py-1">
                    <span>Enterprise AI OS License</span>
                    <span className="font-mono font-semibold">$2,500.00</span>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-b">
                    <span>Custom Strategy Setup</span>
                    <span className="font-mono font-semibold">$1,000.00</span>
                  </div>
                </div>

                {/* Total Row */}
                <div className="flex justify-end pt-2">
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block uppercase">Total Due</span>
                    <span className="text-lg font-bold font-mono" style={{ color: profile.themeColor }}>$3,500.00</span>
                  </div>
                </div>

                {/* Footer Badge */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                  <span>Theme: {profile.themeTemplateKey}</span>
                  <span>Font: {profile.fontFamily}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <BrandModule token={token ?? undefined} />
        </div>
      )}
    </div>
  )
}
