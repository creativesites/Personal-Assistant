'use client'

import { useEffect, useState } from 'react'
import { Download, X, Smartphone } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if user previously dismissed prompt within the last 7 days
    const dismissedUntil = localStorage.getItem('zuri_pwa_dismissed_until')
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
      return
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Slight delay so it doesn't pop up instantly on page load
      setTimeout(() => setIsVisible(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    setIsVisible(false)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem('zuri_pwa_installed', 'true')
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setIsVisible(false)
    // Suppress for 7 days
    const sevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000
    localStorage.setItem('zuri_pwa_dismissed_until', sevenDays.toString())
  }

  if (!isVisible || !deferredPrompt) return null

  return (
    <div className="fixed bottom-16 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-[90] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white/95 backdrop-blur-xl border border-indigo-100 shadow-2xl shadow-indigo-500/10 rounded-2xl p-4 flex items-start gap-3.5 ring-1 ring-black/5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-500/20">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-gray-900">Install Zuri AI Assistant</h4>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600 p-0.5 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Dismiss prompt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
            Install on your home screen for fast access, instant notifications, and smooth mobile experience.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleInstall}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs rounded-xl shadow-sm transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-medium rounded-xl transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
