import type { ElementType } from 'react'
import {
  Flame, DollarSign, AlertTriangle, Star, XCircle, Calendar, Clock,
  Bell, Tag, FileText, CreditCard,
} from 'lucide-react'

export const AI_PRIORITY: Record<string, { label: string; color: string; icon: ElementType }> = {
  hot_lead:       { label: 'Hot Lead',     color: 'bg-red-50 text-red-700 border-red-200',             icon: Flame },
  ready_to_buy:   { label: 'Ready to Buy', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: DollarSign },
  needs_followup: { label: 'Follow-up',    color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: AlertTriangle },
  loyal:          { label: 'VIP',          color: 'bg-purple-50 text-purple-700 border-purple-200',    icon: Star },
  dissatisfied:   { label: 'At Risk',      color: 'bg-rose-50 text-rose-700 border-rose-200',          icon: XCircle },
  appointment:    { label: 'Appt Today',   color: 'bg-blue-50 text-blue-700 border-blue-200',          icon: Calendar },
  waiting:        { label: 'Waiting',      color: 'bg-gray-100 text-gray-600 border-gray-200',         icon: Clock },
}

export const SENTIMENT_DOT: Record<string, string> = {
  happy: 'bg-emerald-400', neutral: 'bg-gray-300',
  frustrated: 'bg-amber-400', angry: 'bg-red-500',
}

export const TONE_STYLE: Record<string, string> = {
  friendly:     'bg-emerald-50 text-emerald-900 border-emerald-200',
  professional: 'bg-blue-50 text-blue-900 border-blue-200',
  empathetic:   'bg-purple-50 text-purple-900 border-purple-200',
  casual:       'bg-gray-50 text-gray-800 border-gray-200',
  urgent:       'bg-amber-50 text-amber-900 border-amber-200',
  sales:        'bg-orange-50 text-orange-900 border-orange-200',
  direct:       'bg-slate-50 text-slate-800 border-slate-200',
  firm:         'bg-slate-50 text-slate-800 border-slate-200',
}

export const FILTERS = [
  { id: 'all',            label: 'All' },
  { id: 'assigned_to_me', label: 'Assigned to Me' },
  { id: 'unread',         label: 'Unread' },
  { id: 'needs_reply',    label: 'Needs Reply' },
  { id: 'hot_leads',      label: 'Hot Leads' },
  { id: 'vip',            label: 'VIP' },
  { id: 'waiting',        label: 'Waiting' },
  { id: 'at_risk',        label: 'At Risk' },
] as const

export const MOCK_ACTIONS = [
  { label: 'Follow up tomorrow', icon: Bell },
  { label: 'Offer 10% discount', icon: Tag },
  { label: 'Send catalogue',     icon: FileText },
  { label: 'Book appointment',   icon: Calendar },
  { label: 'Create invoice',     icon: CreditCard },
]
