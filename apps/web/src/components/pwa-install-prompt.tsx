'use client'

import { useEffect, useState } from 'react'
import { Smartphone, Download, Share, PlusSquare, X } from 'lucide-react'

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    // Check if already running as installed PWA
    const inStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    setIsStandalone(inStandalone)
    if (inStandalone) return

    // Check if user dismissed prompt recently
    const dismissed = localStorage.getItem('zuri_pwa_prompt_dismissed')
    if (dismissed && Date.now() - Number(dismissed) < 7 * 86_400_000) {
      return
    }

    // Detect iOS
    const ua = window.navigator.userAgent
    const isIosDevice = /iphone|ipad|ipod/i.test(ua)
    setIsIos(isIosDevice)

    if (isIosDevice) {
      setShowPrompt(true)
    }

    // Android / Chrome listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    localStorage.setItem('zuri_pwa_prompt_dismissed', String(Date.now()))
    setShowPrompt(false)
  }

  if (isStandalone || !showPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-indigo-500/30 backdrop-blur-xl animate-in slide-in-from-bottom duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 flex-shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-xs font-black tracking-wide uppercase text-indigo-300">
              Install Zuri OS
            </h4>
            <p className="text-xs font-semibold text-slate-100 mt-0.5">
              Get the full app experience on your phone
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Close prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-300">
        {isIos ? (
          <div className="space-y-1.5 leading-relaxed">
            <p className="flex items-center gap-1.5 font-medium text-slate-200">
              1. Tap the <Share className="w-3.5 h-3.5 text-indigo-400 inline" /> <b>Share</b> button in Safari
            </p>
            <p className="flex items-center gap-1.5 font-medium text-slate-200">
              2. Scroll down &amp; tap <PlusSquare className="w-3.5 h-3.5 text-indigo-400 inline" /> <b>Add to Home Screen</b>
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Install Web App</span>
          </button>
        )}
      </div>
    </div>
  )
}
