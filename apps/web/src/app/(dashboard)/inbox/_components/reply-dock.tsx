'use client'

import { RefObject, useState, useRef, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Activity,
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  Mic,
  Paperclip,
  RefreshCw,
  Send,
  Smile,
  Sparkles,
  Wand2,
  X,
  FileSpreadsheet,
  Calendar,
  CreditCard,
  Zap,
} from 'lucide-react'

import { VoiceRecorderDock } from './voice-recorder-dock'
import { predictGhostText } from '../_lib/ghost-text'

// Dynamic import to prevent SSR/hydration mismatch with emoji-picker-react
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false })

import { unlockMilestone } from '@/lib/celebrations'

interface Suggestion {
  id: string
  text: string
  tone: string
  reasoning: string
  confidence?: number
}

interface ReplyDockProps {
  suggestions: Suggestion[]
  draft: string
  draftRef: RefObject<HTMLTextAreaElement | null>
  selectedMsgId: string | null
  regenerating: boolean
  showAIActions: boolean
  aiActionLoading: string | null
  aiActionResult: { label: string; text: string } | null
  aiAskInput: string
  onDraftChange: (value: string) => void
  onSendDraft: (text: string, file: File | null) => void
  onSelectSuggestion?: (suggestion: Suggestion) => void
  onUseAIResult: (text: string) => void
  onDismissAIResult: () => void
  onToggleAIActions: () => void
  onSummarize: () => void
  onFollowup: () => void
  onAsk: () => void
  onAskInputChange: (value: string) => void
  onRegenerate: () => void
  onAnalyzeLatest: () => void
  onAnalyzeRecent: () => void
  isGroup?: boolean
  aiNotice?: { type: 'warning' | 'error' | 'info'; text: string } | null
  activeLock?: { lockedBy: string | null; lockedByName?: string } | null
  replyingToMessage?: { id: string; senderType: string; senderDisplayName?: string | null; body: string | null } | null
  onCancelReply?: () => void
  onPresenceChange?: (presence: 'composing' | 'recording' | 'paused') => void
  contactName?: string
}

export function ReplyDock({
  suggestions,
  draft,
  draftRef,
  selectedMsgId,
  regenerating,
  showAIActions,
  aiActionLoading,
  aiActionResult,
  aiAskInput,
  onDraftChange,
  onSendDraft,
  onSelectSuggestion,
  onUseAIResult,
  onDismissAIResult,
  onToggleAIActions,
  onSummarize,
  onFollowup,
  onAsk,
  onAskInputChange,
  onRegenerate,
  onAnalyzeLatest,
  onAnalyzeRecent,
  isGroup = false,
  aiNotice = null,
  activeLock = null,
  replyingToMessage = null,
  onCancelReply,
  onPresenceChange,
  contactName,
}: ReplyDockProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)

  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const presenceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Ghost text sentence prediction
  const ghostCompletion = useMemo(() => {
    return predictGhostText(draft, { contactName, isGroup })
  }, [draft, contactName, isGroup])

  // Slash commands
  useEffect(() => {
    if (draft.startsWith('/') || draft.includes(' /')) {
      setShowSlashMenu(true)
    } else {
      setShowSlashMenu(false)
    }
  }, [draft])

  // Presence sync for typing/composing
  useEffect(() => {
    if (!onPresenceChange) return

    if (isRecordingVoiceNote) {
      onPresenceChange('recording')
      return
    }

    if (draft.trim().length > 0) {
      onPresenceChange('composing')

      if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current)
      presenceTimerRef.current = setTimeout(() => {
        onPresenceChange('paused')
      }, 4000)
    } else {
      onPresenceChange('paused')
    }

    return () => {
      if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current)
    }
  }, [draft, isRecordingVoiceNote, onPresenceChange])

  // Close picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showEmojiPicker &&
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker])

  // Insert emoji at cursor position in the textarea
  const handleEmojiSelect = (emojiData: any) => {
    const textarea = draftRef.current
    if (!textarea) return

    const start = textarea.selectionStart ?? draft.length
    const end = textarea.selectionEnd ?? start
    const newText = draft.slice(0, start) + emojiData.emoji + draft.slice(end)

    onDraftChange(newText)
    requestAnimationFrame(() => {
      const pos = start + emojiData.emoji.length
      textarea.focus()
      textarea.setSelectionRange(pos, pos)
    })
  }

  const handleSend = () => {
    if (!draft.trim() && !selectedFile) return
    const textToSend = draft
    unlockMilestone('first_team_reply', { detail: 'Sent message collaboratively' })
    onDraftChange('')
    onSendDraft(textToSend, selectedFile)
    setSelectedFile(null)
    setShowSlashMenu(false)
  }

  const handleApplySlashCommand = (cmd: 'quote' | 'invoice' | 'schedule') => {
    let inserted = ''
    if (cmd === 'quote') {
      inserted = `Hi ${contactName || 'there'}, here is the draft quotation summary for your review:\n\n📄 Quotation #QUO-${Math.floor(1000 + Math.random() * 9000)}\n• Item: Service Package\n• Total: $150.00\n\nPlease let me know if you would like to accept this quote!`
    } else if (cmd === 'invoice') {
      inserted = `Hi ${contactName || 'there'}, please find your invoice payment link below:\n\n💳 Invoice Payment Link: https://zuri.app/pay/inv-${Math.floor(1000 + Math.random() * 9000)}\n\nThank you for your business!`
    } else if (cmd === 'schedule') {
      inserted = `Hi ${contactName || 'there'}, I would love to connect. Please pick a time that works best for you here:\n\n📅 Schedule a Call: https://zuri.app/cal/meet-30min`
    }
    onDraftChange(inserted)
    setShowSlashMenu(false)
    setTimeout(() => draftRef.current?.focus(), 50)
  }

  // Redesigned 3 Multi-Tone Quick Reply Chips
  const toneChips = useMemo(() => {
    const defaultChips = [
      {
        tone: 'Warm & Casual',
        icon: '🌟',
        color: 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100/70',
        text: `Hi ${contactName || 'there'}! Thanks for reaching out. I'm happy to help you with this right away! 😊`,
      },
      {
        tone: 'Direct & Professional',
        icon: '💼',
        color: 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100/70',
        text: `Hello ${contactName || 'there'}. I have reviewed your request and confirmed the details. Let us know how you would like to proceed.`,
      },
      {
        tone: 'Action & Scheduling',
        icon: '⚡',
        color: 'bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100/70',
        text: `Hi ${contactName || 'there'}, let's set up a quick 15-minute call or share a quotation so we can get this resolved today!`,
      },
    ]

    if (suggestions.length >= 3) {
      return suggestions.slice(0, 3).map((s, idx) => ({
        tone: s.tone || defaultChips[idx].tone,
        icon: idx === 0 ? '🌟' : idx === 1 ? '💼' : '⚡',
        color: idx === 0 ? defaultChips[0].color : idx === 1 ? defaultChips[1].color : defaultChips[2].color,
        text: s.text,
      }))
    }

    return defaultChips
  }, [suggestions, contactName])

  return (
    <div className="border-t border-gray-200/60 bg-white/95 backdrop-blur-md flex-shrink-0 relative z-20 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.06)]">
      
      {/* Slash Command Autocomplete Popup */}
      {showSlashMenu && (
        <div className="absolute bottom-full left-4 mb-2 w-72 bg-slate-900 text-white rounded-2xl p-2 shadow-2xl border border-slate-800 animate-in slide-in-from-bottom-2 duration-200 z-50">
          <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center gap-1.5">
            <Zap size={12} className="text-amber-400" />
            Quick Action Slash Commands
          </p>
          <div className="mt-1 space-y-1">
            <button
              onClick={() => handleApplySlashCommand('quote')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 rounded-xl transition-colors text-left"
            >
              <FileSpreadsheet size={15} className="text-emerald-400" />
              <div>
                <p className="text-white font-bold">/quote</p>
                <p className="text-[10px] text-slate-400 font-normal">Attach draft quotation proposal</p>
              </div>
            </button>
            <button
              onClick={() => handleApplySlashCommand('invoice')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 rounded-xl transition-colors text-left"
            >
              <CreditCard size={15} className="text-blue-400" />
              <div>
                <p className="text-white font-bold">/invoice</p>
                <p className="text-[10px] text-slate-400 font-normal">Send payment invoice link</p>
              </div>
            </button>
            <button
              onClick={() => handleApplySlashCommand('schedule')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 rounded-xl transition-colors text-left"
            >
              <Calendar size={15} className="text-purple-400" />
              <div>
                <p className="text-white font-bold">/schedule</p>
                <p className="text-[10px] text-slate-400 font-normal">Share calendar scheduling link</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* AI Actions Popup */}
      {showAIActions && (
        <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-white p-3 space-y-2.5 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
              <Sparkles size={14} className="text-indigo-600 fill-indigo-600/20" />
              <span>Zuri AI Copilot Actions</span>
            </div>
            <button onClick={onToggleAIActions} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onSummarize}
              disabled={aiActionLoading === 'summarize'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 disabled:opacity-50 transition-colors"
            >
              {aiActionLoading === 'summarize' ? <RefreshCw size={10} className="animate-spin" /> : <FileText size={10} />}
              Summarize
            </button>
            <button
              onClick={onFollowup}
              disabled={aiActionLoading === 'followup'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 disabled:opacity-50 transition-colors"
            >
              {aiActionLoading === 'followup' ? <RefreshCw size={10} className="animate-spin" /> : <ChevronRight size={10} />}
              Follow-up draft
            </button>
            <button
              onClick={onAnalyzeLatest}
              disabled={aiActionLoading === 'analyze-latest'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 disabled:opacity-50 transition-colors"
            >
              {aiActionLoading === 'analyze-latest' ? <RefreshCw size={10} className="animate-spin" /> : <Activity size={10} />}
              Analyze latest
            </button>
            <button
              onClick={onAnalyzeRecent}
              disabled={aiActionLoading === 'analyze-recent'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 disabled:opacity-50 transition-colors"
            >
              {aiActionLoading === 'analyze-recent' ? <RefreshCw size={10} className="animate-spin" /> : <Brain size={10} />}
              Refresh intelligence
            </button>
          </div>
        </div>
      )}

      {/* Redesigned 3 Multi-Tone Quick Reply Chips */}
      {!isGroup && (
        <div className="border-b border-gray-100/80 bg-neutral-50/40">
          <div className="px-4 py-2 flex items-center justify-between border-b border-neutral-100">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              <Sparkles size={11} className="text-indigo-500 fill-indigo-500/20" />
              Multi-Tone Quick Reply Options
            </span>
            <button
              onClick={() => setSuggestionsCollapsed(prev => !prev)}
              className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              {suggestionsCollapsed ? 'Show' : 'Hide'}
            </button>
          </div>
          {!suggestionsCollapsed && (
            <div className="px-4 py-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white">
              {toneChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onDraftChange(chip.text)
                    draftRef.current?.focus()
                  }}
                  className={`group relative rounded-xl p-2.5 text-left transition-all duration-200 border shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] ${chip.color}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs">{chip.icon}</span>
                    <span className="font-extrabold uppercase text-[9px] tracking-wider">{chip.tone}</span>
                  </div>
                  <p className="line-clamp-2 leading-relaxed text-[11px] font-semibold text-neutral-800">{chip.text}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Replying to message preview banner */}
      {replyingToMessage && (
        <div className="mx-4 mt-2 p-2.5 px-3.5 bg-indigo-50/90 rounded-2xl border border-indigo-200 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-200 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-1 h-8 rounded-full bg-indigo-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-wide">
                Replying to {replyingToMessage.senderDisplayName || (replyingToMessage.senderType === 'user' ? 'You' : 'Contact')}
              </p>
              <p className="text-xs text-slate-800 font-semibold truncate leading-snug">
                {replyingToMessage.body || 'Attachment'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1.5 rounded-xl text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 transition-colors shrink-0"
            title="Cancel reply"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* File attachment preview */}
      {selectedFile && (
        <div className="mx-4 mt-2 p-2 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedFile.type.startsWith('image/') ? (
              <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-neutral-200 bg-white flex-shrink-0">
                <img src={URL.createObjectURL(selectedFile)} alt="preview" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-500 flex-shrink-0">
                <FileText size={18} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-neutral-800 truncate">{selectedFile.name}</p>
              <p className="text-[10px] text-neutral-400 font-medium">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="p-1 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-all flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="px-4 pb-4 pt-2 bg-gradient-to-t from-white via-white to-transparent">
        <div className="flex flex-col gap-2">
          {isRecordingVoiceNote ? (
            <VoiceRecorderDock
              onSendVoiceNote={(audioFile) => {
                setIsRecordingVoiceNote(false)
                onSendDraft('', audioFile)
              }}
              onCancel={() => setIsRecordingVoiceNote(false)}
            />
          ) : (
            <div className="group/input relative flex items-end gap-2 p-1.5 rounded-2xl border border-neutral-200/80 bg-neutral-50/70 backdrop-blur-md focus-within:border-neutral-300 focus-within:bg-white focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
              
              {/* File Input */}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setSelectedFile(file)
                }}
              />
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                className={`p-2 rounded-xl transition-all flex-shrink-0 mb-0.5 active:scale-95 ${
                  selectedFile ? 'text-indigo-600 bg-indigo-50' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                }`}
                title="Attach file"
              >
                <Paperclip size={18} strokeWidth={2.2} />
              </button>

              {/* Voice Recorder Mic Button */}
              <button
                onClick={() => setIsRecordingVoiceNote(true)}
                className="p-2 rounded-xl text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-all flex-shrink-0 mb-0.5 active:scale-95"
                title="Record voice note"
              >
                <Mic size={18} strokeWidth={2.2} />
              </button>

              <div className="flex-1 min-w-0 self-center py-1 relative">
                <textarea
                  ref={draftRef}
                  rows={1}
                  value={draft}
                  onChange={e => onDraftChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Tab' && ghostCompletion) {
                      e.preventDefault()
                      onDraftChange(draft + ghostCompletion)
                    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={selectedFile ? "Add a caption..." : "Type a message or '/' for shortcuts..."}
                  className="w-full resize-none bg-transparent px-1 text-[14px] md:text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none leading-relaxed align-middle"
                  style={{ minHeight: '24px', maxHeight: '140px' }}
                />

                {/* Inline Ghost Text Completion Pill */}
                {ghostCompletion && (
                  <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200/80 text-[11px] text-indigo-700 animate-in fade-in duration-150">
                    <Sparkles size={11} className="text-indigo-500 shrink-0" />
                    <span className="font-semibold text-indigo-900">{draft}</span>
                    <span className="opacity-70">{ghostCompletion}</span>
                    <span className="ml-1 text-[9px] font-mono font-bold uppercase bg-indigo-200/80 text-indigo-950 px-1 py-0.2 rounded">
                      Tab ↹
                    </span>
                  </div>
                )}
              </div>

              {/* Emoji button + picker */}
              <div className="relative flex-shrink-0 mb-0.5">
                <button
                  ref={emojiButtonRef}
                  onClick={() => setShowEmojiPicker(prev => !prev)}
                  className={`p-2 rounded-xl transition-all ${
                    showEmojiPicker
                      ? 'text-indigo-600 bg-indigo-50'
                      : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                  }`}
                  aria-label="Choose emoji"
                >
                  <Smile size={18} strokeWidth={2.2} />
                </button>

                {showEmojiPicker && (
                  <div
                    ref={pickerRef}
                    className="absolute bottom-full right-0 mb-2 z-50 animate-in slide-in-from-bottom-2 fade-in duration-200"
                  >
                    <EmojiPicker
                      onEmojiClick={handleEmojiSelect}
                      width={300}
                      height={400}
                      searchPlaceholder="Search emoji..."
                      skinTonesDisabled
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleSend}
                disabled={!draft.trim() && !selectedFile}
                className={`p-2.5 rounded-xl flex-shrink-0 mb-0.5 transition-all duration-300 ease-out shadow-xs ${
                  (draft.trim() || selectedFile)
                    ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-indigo-500/20 active:scale-95 hover:brightness-110'
                    : 'bg-neutral-200 text-neutral-400 cursor-not-allowed opacity-70'
                }`}
              >
                <Send size={15} strokeWidth={2.5} />
              </button>
            </div>
          )}

          {!isGroup ? (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                {selectedMsgId && (
                  <button
                    onClick={onRegenerate}
                    disabled={regenerating}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:opacity-80 font-semibold disabled:opacity-50 transition-opacity"
                  >
                    <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />
                    {regenerating ? 'Generating...' : 'Regenerate'}
                  </button>
                )}
                <button
                  onClick={onToggleAIActions}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
                    showAIActions
                      ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/20'
                      : 'text-neutral-500 bg-neutral-100 hover:bg-neutral-200'
                  }`}
                >
                  <Sparkles size={12} className={showAIActions ? 'fill-indigo-500/20' : ''} />
                  <span>AI Actions</span>
                  <ChevronDown size={11} className={`transition-transform duration-300 ${showAIActions ? 'rotate-180' : ''}`} />
                </button>
              </div>
              <span className="hidden sm:inline-block text-[10px] font-medium font-mono text-neutral-400 tracking-wider">Cmd + Enter</span>
            </div>
          ) : (
            <div className="flex items-center justify-between px-1 text-neutral-400 text-[10px] font-semibold tracking-wide uppercase">
              <span>Group Chat Mode</span>
              <span>Manual replies only</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
