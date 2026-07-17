'use client'

import React, { useState } from 'react'
import { AlertTriangle, Bell, CreditCard, Flame, MessageSquare, Smartphone, SmartphoneNfc, Sparkles, Zap } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, EmptyState, PageHeader, SkeletonListItem } from '@/components/ui'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
  contact?: { id: string; name: string; avatarUrl: string | null }
}

type BadgeVariantType = 'info' | 'success' | 'warning' | 'error' | 'default' | 'purple'

const TYPE_CONFIG: Record<string, { Icon: React.ElementType; variant: BadgeVariantType; iconColor: string }> = {
  suggestion_ready:     { Icon: Zap,           variant: 'info',    iconColor: 'text-blue-500' },
  relationship_alert:   { Icon: AlertTriangle,  variant: 'warning', iconColor: 'text-amber-500' },
  lead_detected:        { Icon: Flame,          variant: 'success', iconColor: 'text-red-500' },
  proactive_reminder:   { Icon: Sparkles,       variant: 'purple',  iconColor: 'text-purple-500' },
  session_connected:    { Icon: Smartphone,     variant: 'success', iconColor: 'text-green-500' },
  session_disconnected: { Icon: SmartphoneNfc,  variant: 'error',   iconColor: 'text-red-400' },
  billing:              { Icon: CreditCard,     variant: 'warning', iconColor: 'text-amber-500' },
  system:               { Icon: Bell,           variant: 'default', iconColor: 'text-gray-400' },
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

type Filter = 'all' | 'unread'

export default function NotificationsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [filter, setFilter] = useState<Filter>('all')
  const [markedRead, setMarkedRead] = useState<Set<string>>(new Set())

  const { data, loading, error } = useApi<{ notifications: Notification[] }>(
    '/api/notifications',
    token,
  )

  const notifications = (data?.notifications ?? []).map(n => ({
    ...n,
    read: n.read || markedRead.has(n.id),
  }))

  const displayed = filter === 'unread' ? notifications.filter(n => !n.read) : notifications
  const unreadCount = notifications.filter(n => !n.read).length

  const markRead = (id: string) => {
    setMarkedRead(prev => new Set([...prev, id]))
    if (token) apiClient(`/api/notifications/${id}/read`, { method: 'PATCH', token }).catch(() => {})
  }
  const markAllRead = () => {
    setMarkedRead(new Set(notifications.map(n => n.id)))
    if (token) apiClient('/api/notifications/read-all', { method: 'PATCH', token }).catch(() => {})
  }

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Notifications" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-2xl mx-auto space-y-2">
            {Array.from({ length: 6 }, (_, i) => <SkeletonListItem key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        action={
          unreadCount > 0 ? (
            <button
              onClick={markAllRead}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Mark all read
            </button>
          ) : undefined
        }
      />

      {/* Filter tabs */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-6 flex gap-1 flex-shrink-0">
        {(['all', 'unread'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              filter === f
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f}
            {f === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 bg-indigo-100 text-indigo-600 text-xs rounded-full px-1.5 py-0.5 font-semibold">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-6 max-w-2xl mx-auto">
            <EmptyState icon={<AlertTriangle className="w-10 h-10 text-amber-400" />} title="Couldn't load notifications" description="Make sure the API server is running." />
          </div>
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={<Bell className="w-10 h-10 text-gray-400" />}
            title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            description={filter === 'unread' ? "You're all caught up." : 'Activity across your workspace will appear here.'}
          />
        ) : (
          <div className="max-w-2xl mx-auto">
            {displayed.map(n => {
              const config = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system
              const TypeIcon = config.Icon
              return (
                <div
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={`flex items-start gap-4 px-4 md:px-6 py-4 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50/80 ${
                    !n.read ? 'bg-indigo-50/30' : ''
                  }`}
                >
                  {n.contact ? (
                    <div className="flex-shrink-0 relative">
                      <Avatar name={n.contact.name} src={n.contact.avatarUrl ?? undefined} size="md" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <TypeIcon className={`w-2.5 h-2.5 ${config.iconColor}`} />
                      </span>
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <TypeIcon className={`w-5 h-5 ${config.iconColor}`} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${n.read ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-indigo-600 mt-1.5" aria-label="Unread" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                      <Badge variant={config.variant} className="text-[10px] py-0">{n.type.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
