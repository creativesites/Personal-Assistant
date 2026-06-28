'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Brain, MessageSquare, Send } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { Avatar, PageHeader } from '@/components/ui'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTED_PROMPTS = [
  "Who should I reach out to this week?",
  "Which relationships need the most attention?",
  "Summarise my top 5 contacts",
  "How is my overall relationship health trending?",
  "Which leads are closest to converting?",
  "Give me talking points for my next call with a contact",
]

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold self-end mb-1">
          Z
        </div>
      )}
      <div className={`max-w-[82%] sm:max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-indigo-600 text-white rounded-br-md'
          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md shadow-sm'
      }`}>
        {message.content.split('\n').map((line, i) => (
          <p key={i} className={i > 0 ? 'mt-2' : ''}>{line}</p>
        ))}
        <p className={`text-[10px] mt-1.5 ${isUser ? 'text-indigo-200' : 'text-gray-400'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold self-end mb-1">
        Z
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

export default function AdvisorPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !token || loading) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const data = await apiClient<{ reply: string }>('/api/advisor/chat', {
        method: 'POST',
        token,
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, aiMsg])
    } catch {
      const errMsg: Message = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please make sure the API server is running and try again.",
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }, [token, loading, messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="AI Advisor" description="Your personal relationship intelligence" />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4 shadow-lg">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Zuri, your AI advisor</h2>
            <p className="text-sm text-gray-500 text-center max-w-xs mb-8">
              Ask me anything about your relationships, contacts, or communication strategy.
            </p>
            <div className="w-full max-w-md space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center mb-3">Suggested</p>
              {SUGGESTED_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="w-full text-left inline-flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0 text-gray-400 group-hover:text-indigo-400" />
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto py-4 md:py-6 space-y-4">
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-100 p-3 md:p-4 flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-end gap-3">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-indigo-300 focus-within:bg-white transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask Zuri anything…"
              rows={1}
              className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none"
              style={{ maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading || !token}
            className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-2">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
