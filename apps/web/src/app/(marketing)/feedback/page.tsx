'use client'

import React, { useState } from 'react'
import Link from 'lucide-react'
import { MessageSquarePlus, Star, CheckCircle2, ArrowLeft, Bug, Lightbulb, Heart, ShieldCheck } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export default function MarketingFeedbackPage() {
  const [category, setCategory] = useState<'general' | 'bug' | 'feature' | 'ux'>('general')
  const [rating, setRating] = useState<number>(5)
  const [message, setMessage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) {
      setError('Please enter your feedback message.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          rating,
          message: message.trim(),
          contactEmail: contactEmail.trim() || undefined,
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send feedback')

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Error sending feedback. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/40 via-white to-gray-50 text-gray-900 font-sans py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <a
            href="/marketing"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </a>
        </div>

        <div className="bg-white border border-gray-200/80 shadow-xl shadow-indigo-500/5 rounded-3xl p-6 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <MessageSquarePlus className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Share Your Feedback</h1>
              <p className="text-xs sm:text-sm text-gray-500">Help us build Zuri into the ultimate relationship &amp; business OS</p>
            </div>
          </div>

          {submitted ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Feedback Received!</h2>
              <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                Thank you for helping us refine Zuri. Our product &amp; engineering team reads every single submission.
              </p>
              <div className="pt-4 flex justify-center gap-3">
                <button
                  onClick={() => {
                    setSubmitted(false)
                    setMessage('')
                  }}
                  className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Send More Feedback
                </button>
                <a
                  href="/marketing"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                >
                  Return to Home
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                  {error}
                </div>
              )}

              {/* Category Picker */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Category</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'general', label: 'General', icon: Heart },
                    { key: 'bug', label: 'Bug Report', icon: Bug },
                    { key: 'feature', label: 'Feature Idea', icon: Lightbulb },
                    { key: 'ux', label: 'UX / Design', icon: ShieldCheck },
                  ].map(item => {
                    const Icon = item.icon
                    const isSelected = category === item.key
                    return (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => setCategory(item.key as any)}
                        className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Star Rating */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Overall Experience</label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setRating(star)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 fill-gray-100'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-semibold text-gray-500 ml-2">{rating} / 5 Stars</span>
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Your Feedback *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Tell us what's working well, what needs improvement, or what feature you'd love to see next..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="w-full p-3.5 text-xs sm:text-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Contact Email */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Contact Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="In case we want to follow up or send you an update..."
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
              >
                {loading ? 'Submitting Feedback...' : 'Send Feedback'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
