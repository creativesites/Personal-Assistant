'use client'

import { useZuriSession } from '@/hooks/use-zuri-session'

export default function SettingsPage() {
  const session = useZuriSession()

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
        <h1 className="font-semibold text-gray-900">Settings</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6 max-w-xl">
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Account</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="text-gray-900">{session.data?.user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="text-gray-900">{session.data?.user.name || '—'}</span>
              </div>
            </div>
          </div>
          <div className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">WhatsApp</p>
            <a href="/onboarding" className="inline-block text-sm text-indigo-600 hover:underline">
              Manage connection
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
