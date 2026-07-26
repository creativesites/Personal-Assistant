'use client'

import React, { useState, useEffect } from 'react'
import { MessageSquareHeart, X, Star } from 'lucide-react'
import { ReviewModal } from './review-modal'
import { useZuriSession } from '@/hooks/use-zuri-session'

export function DashboardFeedbackPrompt() {
  const { data: session } = useZuriSession()
  const [isVisible, setIsVisible] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    // Suppress if user dismissed in the last 30 days or already submitted
    const dismissedUntil = localStorage.getItem('zuri_review_prompt_dismissed')
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
      return
    }

    // Show after 10 seconds of user activity on dashboard
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 10000)

    return () => clearTimeout(timer)
  }, [])

  const handleDismiss = () => {
    setIsVisible(false)
    // Suppress for 30 days
    const thirtyDays = Date.now() + 30 * 24 * 60 * 60 * 1000
    localStorage.setItem('zuri_review_prompt_dismissed', thirtyDays.toString())
  }

  if (!isVisible) return null

  return (
    <>
      <div className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 max-w-xs z-[80] animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-white/95 backdrop-blur-xl border border-indigo-100 shadow-xl shadow-indigo-500/10 rounded-2xl p-3.5 ring-1 ring-black/5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-amber-500/20">
            <MessageSquareHeart className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <h4 className="text-xs font-bold text-gray-900">How is Zuri working for you?</h4>
              <button
                onClick={handleDismiss}
                className="text-gray-400 hover:text-gray-600 p-0.5 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Dismiss prompt"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
              Enjoying the experience? Leave a review or share quick feedback.
            </p>

            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={() => {
                  setIsModalOpen(true)
                  setIsVisible(false)
                }}
                className="flex-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-xl shadow-xs transition-all text-center"
              >
                Leave Review
              </button>
              <a
                href="/feedback"
                className="px-2.5 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 font-semibold text-[11px] rounded-xl transition-colors"
              >
                Send Feedback
              </a>
            </div>
          </div>
        </div>
      </div>

      <ReviewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        token={session?.accessToken}
        defaultSource="dashboard"
      />
    </>
  )
}
