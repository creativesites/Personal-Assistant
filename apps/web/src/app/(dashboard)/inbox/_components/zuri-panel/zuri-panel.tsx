'use client'

import { useEffect, useState, type ComponentProps } from 'react'
import { X } from 'lucide-react'
import { ZuriMark } from '@/components/ui/zuri-mark'
import { IntelPanel } from '../intel-panel'
import { NowTab } from './now-tab'
import { PersonTab } from './person-tab'
import { MediaTab } from './media-tab'
import type { LightboxItem } from '../media-lightbox'

type ZuriTab = 'now' | 'person' | 'ask' | 'media'

const TABS: { id: ZuriTab; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'person', label: 'Person' },
  { id: 'ask', label: 'Ask Zuri' },
  { id: 'media', label: 'Media' },
]

// Until Ask is rebuilt, they show the matching part of the
// older intelligence panel (without its own header and tabs).
const LEGACY_TAB: Record<Exclude<ZuriTab, 'now' | 'person' | 'media'>, ComponentProps<typeof IntelPanel>['aiTab']> = {
  ask: 'chat',
}

/**
 * The Zuri side panel for one chat. "Now" is the default: auto-reply for this
 * person, what Zuri is about to send, suggested replies, and open loops.
 */
export function ZuriPanel({
  conversationId,
  contactId,
  contactName,
  isGroup,
  token,
  refreshKey,
  legacyProps,
  onClose,
  onUseDraft,
  onReplyTo,
  onSendSuggestion,
  onOpenViewer,
}: {
  conversationId: string
  contactId: string | null
  contactName: string
  isGroup: boolean
  token: string | null
  refreshKey: string | number
  legacyProps: Omit<ComponentProps<typeof IntelPanel>, 'aiTab' | 'onTabChange' | 'embedded'>
  onClose: () => void
  onUseDraft: (text: string) => void
  onReplyTo: (messageId: string) => void
  onSendSuggestion: (suggestionId: string) => Promise<void> | void
  onOpenViewer: (items: LightboxItem[], index: number) => void
}) {
  const [tab, setTab] = useState<ZuriTab>('now')
  useEffect(() => { setTab('now') }, [conversationId])

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-gray-100 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
          <ZuriMark size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-gray-950">Zuri</p>
          <p className="truncate text-[11px] leading-tight text-gray-500">with {contactName}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close Zuri panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-shrink-0 gap-1 border-b border-gray-100 px-3 py-2" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-9 flex-1 rounded-xl text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`min-h-0 flex-1 ${tab === 'ask' ? 'flex flex-col' : 'overflow-y-auto'}`}>
        {tab === 'now' ? (
          <NowTab
            conversationId={conversationId}
            contactId={contactId}
            contactName={contactName}
            isGroup={isGroup}
            token={token}
            refreshKey={refreshKey}
            onUseDraft={onUseDraft}
            onReplyTo={onReplyTo}
            onSendSuggestion={onSendSuggestion}
          />
        ) : tab === 'media' ? (
          <MediaTab conversationId={conversationId} token={token} contactName={contactName} onOpenViewer={onOpenViewer} />
        ) : tab === 'person' ? (
          contactId
            ? <PersonTab contactId={contactId} token={token} onUseDraft={onUseDraft} />
            : <p className="p-6 text-center text-sm text-gray-500">No contact linked to this chat.</p>
        ) : (
          <IntelPanel {...legacyProps} embedded aiTab={LEGACY_TAB[tab]} onTabChange={() => {}} />
        )}
      </div>
    </div>
  )
}
