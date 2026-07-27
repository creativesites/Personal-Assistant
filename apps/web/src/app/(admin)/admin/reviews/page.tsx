'use client'

import React, { useState, useEffect } from 'react'
import { Star, CheckCircle, XCircle, Trash2, Eye, MessageSquare, ShieldAlert, Sparkles, Filter, RefreshCw } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'

interface ReviewItem {
  id: string
  authorName: string
  authorRole?: string
  authorCompany?: string
  rating: number
  reviewText: string
  isApproved: boolean
  isFeatured: boolean
  source: 'website' | 'dashboard'
  createdAt: string
}

interface FeedbackItem {
  id: string
  category: 'bug' | 'feature' | 'ux' | 'general'
  rating?: number
  message: string
  status: 'new' | 'in_progress' | 'resolved'
  adminNotes?: string
  contactEmail?: string
  userName?: string
  pageUrl?: string
  createdAt: string
}

export default function AdminReviewsPage() {
  const { data: session } = useZuriSession()
  const token = session?.accessToken

  const [activeTab, setActiveTab] = useState<'reviews' | 'feedback'>('reviews')

  // Reviews state
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [loadingReviews, setLoadingReviews] = useState(true)

  // Feedback state
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loadingFeedback, setLoadingFeedback] = useState(true)

  const [actionMsg, setActionMsg] = useState('')

  const fetchReviews = async () => {
    if (!token) return
    setLoadingReviews(true)
    try {
      const data = await apiClient<{ success: boolean; reviews: ReviewItem[] }>('/api/admin/reviews', { token })
      if (data.success) setReviews(data.reviews || [])
    } catch (err: any) {
      console.error('Failed to fetch reviews:', err)
    } finally {
      setLoadingReviews(false)
    }
  }

  const fetchFeedback = async () => {
    if (!token) return
    setLoadingFeedback(true)
    try {
      const data = await apiClient<{ success: boolean; feedback: FeedbackItem[] }>('/api/admin/feedback', { token })
      if (data.success) setFeedback(data.feedback || [])
    } catch (err: any) {
      console.error('Failed to fetch feedback:', err)
    } finally {
      setLoadingFeedback(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchReviews()
      fetchFeedback()
    }
  }, [token])

  // Review actions
  const toggleApprove = async (id: string, current: boolean) => {
    if (!token) return
    try {
      await apiClient(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isApproved: !current }),
      })
      setActionMsg(`Review ${!current ? 'Approved' : 'Unapproved'}`)
      fetchReviews()
    } catch {
      setActionMsg('Action failed')
    }
  }

  const toggleFeature = async (id: string, current: boolean) => {
    if (!token) return
    try {
      await apiClient(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isFeatured: !current }),
      })
      setActionMsg(`Review ${!current ? 'Featured' : 'Unfeatured'}`)
      fetchReviews()
    } catch {
      setActionMsg('Action failed')
    }
  }

  const deleteReview = async (id: string) => {
    if (!token || !confirm('Are you sure you want to delete this review?')) return
    try {
      await apiClient(`/api/admin/reviews/${id}`, {
        method: 'DELETE',
        token,
      })
      setActionMsg('Review deleted')
      fetchReviews()
    } catch {
      setActionMsg('Action failed')
    }
  }

  // Feedback actions
  const updateFeedbackStatus = async (id: string, newStatus: string) => {
    if (!token) return
    try {
      await apiClient(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: newStatus }),
      })
      setActionMsg(`Feedback set to ${newStatus}`)
      fetchFeedback()
    } catch {
      setActionMsg('Action failed')
    }
  }

  const deleteFeedback = async (id: string) => {
    if (!token || !confirm('Are you sure you want to delete this feedback?')) return
    try {
      await apiClient(`/api/admin/feedback/${id}`, {
        method: 'DELETE',
        token,
      })
      setActionMsg('Feedback deleted')
      fetchFeedback()
    } catch {
      setActionMsg('Action failed')
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-gray-100 min-h-screen">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Reviews &amp; Feedback Moderation</h1>
          <p className="text-xs sm:text-sm text-gray-400">Moderate landing page testimonials and respond to user feedback</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchReviews(); fetchFeedback(); }}
            className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {actionMsg && (
            <div className="px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-semibold rounded-xl">
              {actionMsg}
            </div>
          )}
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
        <button
          onClick={() => setActiveTab('reviews')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'reviews'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          User Reviews ({reviews.length})
        </button>
        <button
          onClick={() => setActiveTab('feedback')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'feedback'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Platform Feedback ({feedback.length})
        </button>
      </div>

      {/* REVIEWS TAB */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {loadingReviews ? (
            <div className="text-center py-12 text-gray-500 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Loading reviews from server...</span>
            </div>
          ) : reviews.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-400 text-xs">
              No reviews submitted yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviews.map(item => (
                <div
                  key={item.id}
                  className={`bg-gray-900 border rounded-2xl p-5 space-y-3 relative transition-all ${
                    item.isApproved ? 'border-gray-800' : 'border-amber-500/40 bg-amber-950/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{item.authorName}</h4>
                        <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 text-[10px] font-semibold">
                          {item.source}
                        </span>
                        {item.isFeatured && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                            Featured
                          </span>
                        )}
                      </div>
                      {(item.authorRole || item.authorCompany) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[item.authorRole, item.authorCompany].filter(Boolean).join(' at ')}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 bg-gray-800/80 px-2 py-1 rounded-lg">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-bold text-white">{item.rating}</span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-300 leading-relaxed italic">&ldquo;{item.reviewText}&rdquo;</p>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-800 text-[11px] text-gray-500">
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleApprove(item.id, item.isApproved)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors ${
                          item.isApproved
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500 text-black hover:bg-amber-400'
                        }`}
                      >
                        {item.isApproved ? 'Approved' : 'Approve'}
                      </button>

                      <button
                        onClick={() => toggleFeature(item.id, item.isFeatured)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors ${
                          item.isFeatured
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        {item.isFeatured ? 'Featured' : 'Feature'}
                      </button>

                      <button
                        onClick={() => deleteReview(item.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                        title="Delete review"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FEEDBACK TAB */}
      {activeTab === 'feedback' && (
        <div className="space-y-4">
          {loadingFeedback ? (
            <div className="text-center py-12 text-gray-500 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Loading feedback from server...</span>
            </div>
          ) : feedback.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-400 text-xs">
              No platform feedback submitted yet.
            </div>
          ) : (
            <div className="space-y-3">
              {feedback.map(item => (
                <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider border border-indigo-500/30">
                        {item.category}
                      </span>
                      {item.rating && (
                        <div className="flex items-center gap-1 text-xs text-amber-400 font-bold bg-gray-800 px-2 py-0.5 rounded-md">
                          <Star className="w-3 h-3 fill-amber-400" />
                          <span>{item.rating}/5</span>
                        </div>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.status === 'resolved'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : item.status === 'in_progress'
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={item.status}
                        onChange={e => updateFeedbackStatus(item.id, e.target.value)}
                        className="bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded-lg px-2 py-1 outline-none"
                      >
                        <option value="new">New</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                      <button
                        onClick={() => deleteFeedback(item.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">{item.message}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-800 text-[11px] text-gray-500">
                    <div>
                      {item.contactEmail && <span className="text-gray-400">From: {item.contactEmail}</span>}
                      {item.pageUrl && <span className="ml-3 text-gray-600">Page: {item.pageUrl}</span>}
                    </div>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
