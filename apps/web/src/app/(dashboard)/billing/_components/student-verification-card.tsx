'use client'

import { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { apiClient, ApiError } from '@/lib/api'

interface StudentStatus {
  isVerifiedStudent: boolean
  latestSubmission: { status: string; rejectedReason: string | null; createdAt: string } | null
}

// Membership Platform Phase 7 — student verification: submit institution +
// student ID, admin reviews, approval unlocks the hidden 50%-off Personal
// (Student) plan variant at checkout.
export function StudentVerificationCard({ token }: { token: string | null | undefined }) {
  const { data, loading, refetch } = useApi<StudentStatus>('/api/student-verification/me', token)
  const [institutionName, setInstitutionName] = useState('')
  const [studentIdNumber, setStudentIdNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading || !data) return null
  if (data.isVerifiedStudent) {
    return (
      <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <GraduationCap className="w-4 h-4" />
        </div>
        <p className="text-sm text-gray-700">Verified student — the discounted Personal plan is available at checkout.</p>
      </div>
    )
  }

  const pending = data.latestSubmission?.status === 'pending'

  const submit = async () => {
    if (!token || !institutionName.trim() || !studentIdNumber.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await apiClient('/api/student-verification', {
        method: 'POST', token,
        body: JSON.stringify({ institutionName, studentIdNumber }),
      })
      refetch()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
          <GraduationCap className="w-4 h-4" />
        </div>
        <p className="text-sm font-semibold text-gray-900">Student discount</p>
      </div>

      {pending ? (
        <p className="text-xs text-gray-500">Your verification is pending review — usually within a day.</p>
      ) : (
        <>
          {data.latestSubmission?.status === 'rejected' && (
            <p className="text-xs text-red-600">Previous submission wasn't verified. Try again with clearer details.</p>
          )}
          <input
            value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} placeholder="Institution name"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            value={studentIdNumber} onChange={(e) => setStudentIdNumber(e.target.value)} placeholder="Student ID number"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={submit} disabled={submitting || !institutionName.trim() || !studentIdNumber.trim()}
            className="w-full rounded-xl bg-indigo-600 text-white py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit for verification'}
          </button>
        </>
      )}
    </div>
  )
}
