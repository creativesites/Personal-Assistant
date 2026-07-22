'use client'

import { RefObject, useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  Activity,
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  Paperclip,
  RefreshCw,
  Send,
  Smile,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'

// Dynamic import to prevent SSR/hydration mismatch with emoji-picker-react
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false })

interface Suggestion {
  id: string
  text: string
  tone: string
  reasoning: string
  confidence?: number
}

const TONE_STYLE: Record<string, string> = {
  friendly: 'bg-emerald-50 text-emerald-900 border-emerald-200/80 hover:bg-emerald-100/50',
  professional: 'bg-blue-50 text-blue-900 border-blue-200/80 hover:bg-blue-100/50',
  empathetic: 'bg-purple-50 text-purple-900 border-purple-200/80 hover:bg-purple-100/50',
  casual: 'bg-gray-50 text-gray-800 border-gray-200 hover:bg-gray-100/50',
  urgent: 'bg-amber-50 text-amber-900 border-amber-200/80 hover:bg-amber-100/50',
  sales: 'bg-orange-50 text-orange-900 border-orange-200/80 hover:bg-orange-100/50',
  direct: 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100/50',
  firm: 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100/50',
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
}: ReplyDockProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    // Restore cursor after React re‑render
    requestAnimationFrame(() => {
      const pos = start + emojiData.emoji.length
      textarea.focus()
      textarea.setSelectionRange(pos, pos)
    })
  }

  const handleSend = () => {
    if (!draft.trim() && !selectedFile) return
    onSendDraft(draft, selectedFile)
    setSelectedFile(null)
  }

  return (
    <div className="border-t border-gray-200/60 bg-white/95 backdrop-blur-md flex-shrink-0 relative z-20 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.06)]">
      {aiActionResult && (
        <div className="mx-3 mt-2 bg-indigo-50 rounded-xl border border-indigo-100 overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
            <div className="flex items-center gap-1.5">
              <Sparkles size={11} className="text-indigo-500" />
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">{aiActionResult.label}</p>
            </div>
            <button onClick={onDismissAIResult} className="p-0.5 text-indigo-300 hover:text-indigo-500 transition-colors">
              <X size={11} />
            </button>
          </div>
          <p className="px-3 pb-2.5 text-xs text-gray-700 leading-relaxed">{aiActionResult.text}</p>
          <div className="flex border-t border-indigo-100">
            <button
              onClick={() => onUseAIResult(aiActionResult.text)}
              className="flex-1 text-[11px] font-semibold text-indigo-700 py-2 hover:bg-indigo-100 transition-colors"
            >
              Use as draft
            </button>
            <div className="w-px bg-indigo-100" />
            <button onClick={onDismissAIResult} className="flex-1 text-[11px] text-gray-500 py-2 hover:bg-gray-50 transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showAIActions && (
        <div className="mx-3 mt-2 bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
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
          <div className="flex items-center gap-2">
            <input
              value={aiAskInput}
              onChange={e => onAskInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onAsk()
                }
              }}
              placeholder="Ask AI anything about this conversation..."
              className="flex-1 text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
            />
            <button
              onClick={onAsk}
              disabled={!aiAskInput.trim() || aiActionLoading === 'ask'}
              className="flex items-center gap-1 px-3 py-2 text-[11px] font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {aiActionLoading === 'ask' ? <RefreshCw size={10} className="animate-spin" /> : <Wand2 size={10} />}
              Ask
            </button>
          </div>
        </div>
      )}

      {!isGroup && suggestions.length > 0 && (
        <div className="border-b border-gray-100/60 bg-neutral-50/20">
          <button
            onClick={() => setSuggestionsCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-100 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles size={11} className="text-indigo-500 fill-indigo-500/10" />
              Suggested Replies ({suggestions.length})
            </span>
            <span className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-600 transition-colors">
              {suggestionsCollapsed ? 'Show' : 'Hide'}
            </span>
          </button>
          {!suggestionsCollapsed && (
            <div className="px-4 pt-4 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white">
              {suggestions.slice(0, 3).map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    if (onSelectSuggestion) {
                      onSelectSuggestion(s)
                    } else {
                      onDraftChange(s.text)
                    }
                    draftRef.current?.focus()
                  }}
                  className={`group relative rounded-2xl p-3 text-left transition-all duration-300 ease-out border border-neutral-200/70 bg-gradient-to-b from-white to-neutral-50/50 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_20px_-8px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 hover:border-neutral-300 active:translate-y-0 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${TONE_STYLE[s.tone] ?? ''}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium tracking-wide uppercase text-[9px] bg-neutral-100 text-neutral-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors duration-300">
                      <span className="h-1 w-1 rounded-full bg-neutral-400 group-hover:bg-indigo-500 transition-colors" />
                      {s.tone}
                    </span>
                    {s.confidence != null && (
                      <span className="text-[10px] font-medium font-mono text-neutral-400 group-hover:text-neutral-600 transition-colors">
                        {s.confidence}%
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 leading-relaxed text-[11px] font-bold text-neutral-900 transition-colors duration-300">{s.text}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File attachment preview */}
      {selectedFile && (
        <div className="mx-4 mt-2 p-2 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedFile.type.startsWith('image/') ? (
              <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-neutral-200 bg-white flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
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

      <div className="px-4 pb-5 pt-2 bg-gradient-to-t from-white via-white to-transparent">
        <div className="flex flex-col gap-2.5">
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
            >
              <Paperclip size={18} strokeWidth={2.2} />
            </button>

            <div className="flex-1 min-w-0 self-center py-1">
              <textarea
                ref={draftRef}
                rows={1}
                value={draft}
                onChange={e => onDraftChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={selectedFile ? "Add a caption..." : "Type a message..."}
                className="w-full resize-none bg-transparent px-1 text-[14px] md:text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none leading-relaxed align-middle"
                style={{ minHeight: '24px', maxHeight: '140px' }}
              />
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
              className={`p-2.5 rounded-xl flex-shrink-0 mb-0.5 transition-all duration-300 ease-out shadow-sm ${
                (draft.trim() || selectedFile)
                  ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-indigo-500/20 active:scale-95 hover:brightness-110'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed opacity-70'
              }`}
            >
              <Send size={15} strokeWidth={2.5} />
            </button>
          </div>

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
