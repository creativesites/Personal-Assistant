'use client'

import React, { useState, useEffect } from 'react'
import { Users, Search, Shield, RefreshCw, X, User } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { apiClient } from '@/lib/api'

export interface GroupParticipant {
  id: string
  contactId: string
  name: string
  phone: string
  avatarUrl?: string | null
  role: 'admin' | 'superadmin' | 'member'
  joinedAt?: string
}

interface GroupParticipantsDrawerProps {
  open: boolean
  onClose: () => void
  conversationId: string
  groupName: string
  groupAvatar?: string | null
  token?: string | null
}

export function GroupParticipantsDrawer({
  open,
  onClose,
  conversationId,
  groupName,
  groupAvatar,
  token,
}: GroupParticipantsDrawerProps) {
  const [participants, setParticipants] = useState<GroupParticipant[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const fetchParticipants = async (forceRefresh = false) => {
    if (!conversationId || !token) return
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const query = forceRefresh ? '?refresh=true' : ''
      const res = await apiClient<{ participants: GroupParticipant[] }>(
        `/api/conversations/${conversationId}/participants${query}`,
        { token }
      )
      setParticipants(res.participants || [])
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (open && conversationId) {
      fetchParticipants()
    }
  }, [open, conversationId, token])

  if (!open) return null

  const filteredParticipants = participants.filter(p => {
    const q = searchQuery.toLowerCase()
    return (
      p.name?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q)
    )
  })

  const adminCount = participants.filter(p => p.role === 'admin' || p.role === 'superadmin').length

  return (
    <div className="fixed inset-y-0 right-0 w-80 md:w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
            <Users size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Group Info</h3>
            <p className="text-[11px] font-medium text-slate-500">
              {participants.length} participants · {adminCount} admin{adminCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchParticipants(true)}
            disabled={refreshing}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh participants"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Group Profile Summary */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col items-center text-center bg-gradient-to-b from-indigo-50/30 to-transparent dark:from-indigo-950/20">
        <Avatar
          src={groupAvatar || undefined}
          name={groupName}
          size="lg"
          className="w-16 h-18 text-xl shadow-md ring-4 ring-white dark:ring-slate-800 mb-2"
        />
        <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 max-w-full truncate px-2">
          {groupName}
        </h4>
        <p className="text-xs text-slate-500 font-medium">WhatsApp Group</p>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search participants..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw size={20} className="animate-spin text-indigo-500" />
            <span>Loading group participants...</span>
          </div>
        ) : filteredParticipants.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            {searchQuery ? 'No participants match search' : 'No participant data available'}
          </div>
        ) : (
          filteredParticipants.map(p => {
            const isAdmin = p.role === 'admin' || p.role === 'superadmin'
            return (
              <div
                key={p.id || p.phone}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group"
              >
                <Avatar
                  src={p.avatarUrl || undefined}
                  name={p.name || p.phone}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {p.name || p.phone}
                    </p>
                    {isAdmin && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-[9px] font-extrabold text-emerald-800 dark:text-emerald-300 shrink-0">
                        <Shield size={9} />
                        Admin
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate font-mono">
                    {p.phone}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center">
        <p className="text-[10px] text-slate-400">
          Group management synchronized with WhatsApp
        </p>
      </div>
    </div>
  )
}
