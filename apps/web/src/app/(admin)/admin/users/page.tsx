'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'

interface AdminUser {
  id: string
  email: string
  name: string | null
  mode: string
  isAdmin: boolean
  onboardingCompleted: boolean
  suspended: boolean
  createdAt: string
  plan: string
  whatsapp: { status: string; phone: string | null }
}

interface UsersResponse {
  users: AdminUser[]
  total: number
  page: number
  pageSize: number
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-700 text-gray-300',
  pro: 'bg-indigo-900 text-indigo-300',
  business: 'bg-purple-900 text-purple-300',
}

const WA_COLORS: Record<string, string> = {
  connected: 'text-green-400',
  disconnected: 'text-gray-500',
  error: 'text-red-400',
  none: 'text-gray-600',
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminUsersPage() {
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const buildPath = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) })
    if (search) params.set('search', search)
    return `/api/admin/users?${params}`
  }, [page, search])

  const { data, loading, refetch } = useApi<UsersResponse>(buildPath(), token)
  const users = data?.users ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / (data?.pageSize ?? 20))

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPage(1)
    refetch()
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white mb-1">User Management</h1>
          <p className="text-gray-500 text-sm">{total.toLocaleString()} total users</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-5 flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search by email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
          Search
        </button>
      </form>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['User', 'Plan', 'Mode', 'WhatsApp', 'Onboarded', 'Joined', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                Array.from({ length: 10 }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }, (_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.map((user) => (
                <tr
                  key={user.id}
                  className={`hover:bg-gray-800/50 cursor-pointer transition-colors ${user.suspended ? 'opacity-50' : ''}`}
                  onClick={() => router.push(`/admin/users/${user.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-indigo-900 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
                        {(user.name || user.email)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate max-w-[180px]">
                          {user.name || <span className="text-gray-400 italic">No name</span>}
                        </p>
                        <p className="text-gray-500 text-xs truncate max-w-[180px]">{user.email}</p>
                      </div>
                      {user.isAdmin && (
                        <span className="flex-shrink-0 text-[10px] bg-indigo-900/50 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.5 rounded font-semibold">ADMIN</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${PLAN_COLORS[user.plan] ?? PLAN_COLORS.free}`}>
                      {user.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs capitalize">{user.mode}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium capitalize ${WA_COLORS[user.whatsapp.status] ?? 'text-gray-500'}`}>
                      {user.whatsapp.status === 'connected' ? `✓ ${user.whatsapp.phone || 'connected'}` : user.whatsapp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${user.onboardingCompleted ? 'text-green-400' : 'text-gray-500'}`}>
                      {user.onboardingCompleted ? '✓ Yes' : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/admin/users/${user.id}`) }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
            <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
