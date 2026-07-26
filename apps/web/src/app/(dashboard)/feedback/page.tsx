'use client'

import React, { useState } from 'react'
import { MessageSquarePlus, Star, CheckCircle2, Bug, Lightbulb, Heart, ShieldCheck, Send } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export default function DashboardFeedbackPage() {
  const { data: session } = useZuriSession()
  const [category, setCategory] = useState<'general' | 'bug' | 'feature' | 'ux'>('general')
  const [rating, setRating] = useState<number>(5)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) {
      setError('Please write your feedback message.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.accessToken) {
        headers['Authorization'] = `Bearer ${session.accessToken}`
      }

      const res = await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category,
          rating,
          message: message.trim(),
          contactEmail: session?.user?.email,
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit feedback')

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Error submitting feedback. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Product Feedback</h1>
          <p className="text-xs sm:text-sm text-gray-500">Report bugs, suggest features, or rate your experience with Zuri</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200/90 shadow-sm rounded-3xl p-6 sm:p-8">
        {submitted ? (
          <div className="text-center py-10 space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Feedback Submitted Successfully!</h2>
            <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
              Our engineering and product design team has received your message. Thank you for making Zuri better!
            </p>
            <button
              onClick={() => {
                setSubmitted(false)
                setMessage('')
              }}
              className="mt-4 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              Submit Another Entry
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                {error}
              </div>
            )}

            {/* Category Selector */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Category</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { key: 'general', label: 'General', icon: Heart },
                  { key: 'bug', label: 'Bug Report', icon: Bug },
                  { key: 'feature', label: 'Feature Idea', icon: Lightbulb },
                  { key: 'ux', label: 'UX / UI Design', icon: ShieldCheck },
                ].map(item => {
                  const Icon = item.icon
                  const active = category === item.key
                  return (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => setCategory(item.key as any)}
                      className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                        active
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
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
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Platform Rating</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform focus:outline-none"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        star <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 fill-gray-100'
                      }`}
                    />
                  </button>
                ))}
                <span className="text-xs font-bold text-gray-600 ml-2">{rating} / 5</span>
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Details / Message *</label>
              <textarea
                required
                rows={5}
                placeholder="What happened? Or what would make Zuri significantly better for your daily workflow?"
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full p-3.5 text-xs sm:text-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{loading ? 'Submitting...' : 'Send Feedback'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
