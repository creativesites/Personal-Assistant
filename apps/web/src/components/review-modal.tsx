'use client'

import React, { useState } from 'react'
import { Star, X, CheckCircle2, MessageSquareHeart } from 'lucide-react'

interface ReviewModalProps {
  isOpen: boolean
  onClose: () => void
  token?: string | null
  defaultSource?: 'website' | 'dashboard'
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export function ReviewModal({ isOpen, onClose, token, defaultSource = 'website' }: ReviewModalProps) {
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [authorName, setAuthorName] = useState('')
  const [authorRole, setAuthorRole] = useState('')
  const [authorCompany, setAuthorCompany] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!authorName.trim() || !reviewText.trim()) {
      setError('Please provide your name and review message.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`${API_URL}/api/reviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          authorName: authorName.trim(),
          authorRole: authorRole.trim() || undefined,
          authorCompany: authorCompany.trim() || undefined,
          rating,
          reviewText: reviewText.trim(),
          source: defaultSource,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit review')
      }

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-gray-100 shadow-2xl rounded-3xl max-w-lg w-full overflow-hidden p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">Thank you for your review!</h3>
            <p className="text-sm text-gray-600 max-w-xs mx-auto leading-relaxed">
              Your feedback means the world to us. Your review has been submitted for quick approval.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                <MessageSquareHeart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Leave a Review</h3>
                <p className="text-xs text-gray-500">Share your experience with Zuri AI</p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                {error}
              </div>
            )}

            {/* Star Rating Picker */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Rating</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(star => {
                  const active = star <= (hoverRating || rating)
                  return (
                    <button
                      type="button"
                      key={star}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      className="p-1 transition-transform hover:scale-110 focus:outline-none"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          active ? 'fill-amber-400 text-amber-400' : 'text-gray-200 fill-gray-100'
                        }`}
                      />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Your Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Morgan"
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Role / Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Founder & CEO"
                  value={authorRole}
                  onChange={e => setAuthorRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Company / Industry (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Apex Digital"
                value={authorCompany}
                onChange={e => setAuthorCompany(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Your Review *</label>
              <textarea
                required
                rows={3}
                placeholder="What do you love most about using Zuri AI?"
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
