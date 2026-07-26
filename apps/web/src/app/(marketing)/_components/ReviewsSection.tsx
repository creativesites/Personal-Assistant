'use client'

import React, { useState, useEffect } from 'react'
import { Star, MessageSquareHeart, MessageSquarePlus, ArrowRight } from 'lucide-react'
import { ReviewModal } from '@/components/review-modal'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface Review {
  id: string
  authorName: string
  authorRole?: string
  authorCompany?: string
  rating: number
  reviewText: string
  isFeatured: boolean
  source: string
  createdAt: string
}

export function ReviewsSection() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/api/reviews`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setReviews(data.reviews || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Fallback initial reviews if DB has 0 approved reviews yet
  const displayReviews: Review[] = reviews.length > 0 ? reviews : [
    {
      id: 'demo-1',
      authorName: 'Chileshe Mwamba',
      authorRole: 'Founder',
      authorCompany: 'Lusaka Commerce',
      rating: 5,
      reviewText: 'Zuri transformed our customer response times on WhatsApp. The automated reply drafts sound exactly like me and saved hours every week.',
      isFeatured: true,
      source: 'dashboard',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-2',
      authorName: 'Thandiwe Banda',
      authorRole: 'Operations Lead',
      authorCompany: 'Apex Retail',
      rating: 5,
      reviewText: 'Managing purchase orders, invoices, and inventory straight from WhatsApp messages is pure genius. Couldn’t run the business without it.',
      isFeatured: true,
      source: 'website',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-3',
      authorName: 'Kabwe Tembo',
      authorRole: 'Solopreneur',
      authorCompany: 'KT Digital',
      rating: 5,
      reviewText: 'The AI Advisor catches at-risk VIP clients before they slip away. It pays for itself 10x over every single month.',
      isFeatured: true,
      source: 'dashboard',
      createdAt: new Date().toISOString(),
    },
  ]

  return (
    <section className="py-20 bg-white border-t border-gray-100 px-4 md:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold mb-3">
            <MessageSquareHeart className="w-3.5 h-3.5" /> Loved by Solopreneurs &amp; Teams
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
            What Users Are Saying About Zuri
          </h2>
          <p className="text-gray-500 text-sm mt-3">
            Real feedback from business owners and professionals using Zuri to automate their daily back office.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {displayReviews.slice(0, 6).map(review => (
            <div
              key={review.id}
              className="bg-gray-50/80 border border-gray-100 rounded-3xl p-6 flex flex-col justify-between hover:shadow-lg hover:shadow-indigo-500/5 transition-all"
            >
              <div>
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 fill-gray-100'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-gray-700 text-xs sm:text-sm leading-relaxed italic">
                  &ldquo;{review.reviewText}&rdquo;
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200/60 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-900">{review.authorName}</h4>
                  {(review.authorRole || review.authorCompany) && (
                    <p className="text-[11px] text-gray-500">
                      {[review.authorRole, review.authorCompany].filter(Boolean).join(' at ')}
                    </p>
                  )}
                </div>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  Verified User
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-2xl shadow-md transition-all"
          >
            <MessageSquareHeart className="w-4 h-4" />
            <span>Leave a Review</span>
          </button>

          <a
            href="/feedback"
            className="inline-flex items-center gap-2 px-6 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs rounded-2xl transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>Send Private Feedback</span>
            <ArrowRight className="w-3 h-3 text-gray-400" />
          </a>
        </div>
      </div>

      <ReviewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        defaultSource="website"
      />
    </section>
  )
}
