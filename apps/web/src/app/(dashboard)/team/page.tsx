'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Users, CheckCircle2, X, Lock } from 'lucide-react'

interface TeamMember {
  id: string
  user_id: string
  role: string
  accepted_at: string | null
  name: string | null
  email: string
}

interface Team {
  id: string
  name: string
  owner_id: string
  members: TeamMember[]
}

interface TeamResponse { team: Team | null }

interface ConversationNote {
  id: string
  user_id: string
  author_name: string | null
  body: string
  created_at: string
}

interface AssignedConversation {
  id: string
  contact_name: string | null
  contact_phone: string
  last_message_at: string | null
  assigned_to_user_id: string | null
  assigned_to_name: string | null
  locked_by: string | null
  locked_by_name: string | null
}

interface InboxResponse { conversations: AssignedConversation[] }

const ROLE_STYLE: Record<string, string> = {
  owner:  'bg-purple-50 text-purple-700',
  admin:  'bg-indigo-50 text-indigo-700',
  member: 'bg-gray-100 text-gray-600',
}

export default function TeamPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const userId = session.data?.user?.id

  const { data: teamData, loading: teamLoading, refetch: refetchTeam } = useApi<TeamResponse>('/api/team', token)
  const { data: inboxData, loading: inboxLoading, refetch: refetchInbox } = useApi<InboxResponse>('/api/team/inbox', token)

  const team = teamData?.team
  const conversations = inboxData?.conversations ?? []

  const [tab, setTab] = useState<'inbox' | 'members'>('inbox')
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [notes, setNotes] = useState<ConversationNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  const createTeam = async () => {
    if (!token || !teamName.trim()) return
    setCreating(true)
    try {
      await apiClient('/api/team', { method: 'POST', token, body: JSON.stringify({ name: teamName.trim() }) })
      setShowCreateTeam(false)
      setTeamName('')
      await refetchTeam()
    } finally { setCreating(false) }
  }

  const inviteMember = async () => {
    if (!token || !inviteEmail.trim()) return
    setInviting(true)
    try {
      await apiClient('/api/team/invite', { method: 'POST', token, body: JSON.stringify({ email: inviteEmail.trim(), role: 'member' }) })
      setShowInvite(false)
      setInviteEmail('')
      await refetchTeam()
    } finally { setInviting(false) }
  }

  const assignToMe = async (convId: string) => {
    if (!token) return
    await apiClient(`/api/conversations/${convId}/assign`, { method: 'POST', token, body: JSON.stringify({ assigned_to: userId }) })
    await refetchInbox()
  }

  const lockConv = async (convId: string, locked: boolean) => {
    if (!token) return
    const path = locked ? 'unlock' : 'lock'
    await apiClient(`/api/conversations/${convId}/${path}`, { method: 'POST', token })
    await refetchInbox()
  }

  const openNotes = async (convId: string) => {
    if (!token) return
    setSelectedConvId(convId)
    setNotesLoading(true)
    try {
      const data = await apiClient<{ notes: ConversationNote[] }>(`/api/conversations/${convId}/notes`, { token })
      setNotes(data.notes ?? [])
    } finally { setNotesLoading(false) }
  }

  const postNote = async () => {
    if (!token || !selectedConvId || !newNote.trim()) return
    setAddingNote(true)
    try {
      await apiClient(`/api/conversations/${selectedConvId}/notes`, {
        method: 'POST', token, body: JSON.stringify({ body: newNote.trim() }),
      })
      setNewNote('')
      await openNotes(selectedConvId)
    } finally { setAddingNote(false) }
  }

  const loading = teamLoading || inboxLoading

  if (loading && !team) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50 px-4 md:px-6 py-5 pt-16 pb-20 md:pt-5 md:pb-5">
        <div className="max-w-3xl mx-auto space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50 px-4 md:px-6 py-5 pt-16 pb-20 md:pt-5 md:pb-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Team Inbox</h1>
              <p className="text-gray-500 text-sm mt-0.5">Collaborate on conversations with your team</p>
            </div>
          </div>

          {showCreateTeam ? (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Create your team</h2>
                <input value={teamName} onChange={e => setTeamName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                  placeholder="e.g. Sales Team" />
                <div className="flex gap-3">
                  <button onClick={() => setShowCreateTeam(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700">Cancel</button>
                  <button disabled={creating || !teamName.trim()} onClick={createTeam}
                    className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-900 font-semibold mb-1">No team yet</p>
            <p className="text-gray-500 text-sm mb-4">Create a team to share conversations and collaborate</p>
            <button onClick={() => setShowCreateTeam(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
              Create team
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50 px-4 md:px-6 py-5 pt-16 pb-20 md:pt-5 md:pb-5">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{team.name}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{team.members.length} members · Team inbox</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-5">
          {(['inbox', 'members'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'inbox' ? `Inbox (${conversations.length})` : `Members (${team.members.length})`}
            </button>
          ))}
        </div>

        {tab === 'inbox' && (
          <div className="space-y-3">
            {inboxLoading ? (
              [1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />)
            ) : conversations.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="text-gray-700 font-semibold">Team inbox is clear</p>
                <p className="text-gray-400 text-sm mt-1">No conversations assigned to the team</p>
              </div>
            ) : (
              conversations.map(conv => {
                const isLockedByMe = conv.locked_by === userId
                const isLockedByOther = conv.locked_by && conv.locked_by !== userId
                const isAssignedToMe = conv.assigned_to_user_id === userId
                return (
                  <div key={conv.id} className={`bg-white rounded-xl border p-4 ${isLockedByOther ? 'border-yellow-300 opacity-75' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-semibold text-gray-900">{conv.contact_name ?? conv.contact_phone}</p>
                          {conv.assigned_to_name && (
                            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                              → {conv.assigned_to_name}
                            </span>
                          )}
                          {isLockedByOther && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Lock className="w-3 h-3" />{conv.locked_by_name ?? 'teammate'} is replying
                            </span>
                          )}
                          {isLockedByMe && (
                            <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-3 h-3" />You</span>
                          )}
                        </div>
                        {conv.last_message_at && (
                          <p className="text-xs text-gray-400">{new Date(conv.last_message_at).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {!isAssignedToMe && (
                          <button onClick={() => assignToMe(conv.id)}
                            className="text-xs px-2.5 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 font-medium">
                            Assign me
                          </button>
                        )}
                        {!isLockedByOther && (
                          <button onClick={() => lockConv(conv.id, !!conv.locked_by)}
                            className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">
                            {conv.locked_by ? 'Unlock' : 'Lock'}
                          </button>
                        )}
                        <button onClick={() => openNotes(conv.id)}
                          className="text-xs px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">
                          Notes
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {tab === 'members' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Team members</p>
              <button onClick={() => setShowInvite(true)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">+ Invite</button>
            </div>
            <div className="divide-y divide-gray-100">
              {team.members.map(m => (
                <div key={m.id} className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name ?? m.email}</p>
                    {m.name && <p className="text-xs text-gray-400">{m.email}</p>}
                    {!m.accepted_at && <p className="text-xs text-amber-500 mt-0.5">Invite pending</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_STYLE[m.role] ?? ROLE_STYLE.member}`}>
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Invite team member</h2>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              type="email" placeholder="colleague@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setShowInvite(false); setInviteEmail('') }} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700">Cancel</button>
              <button disabled={inviting || !inviteEmail.trim()} onClick={inviteMember}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {inviting ? 'Inviting…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes panel */}
      {selectedConvId && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <p className="font-semibold text-gray-900 text-sm">Internal notes</p>
              <button onClick={() => { setSelectedConvId(null); setNotes([]) }} className="text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {notesLoading ? (
                <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No notes yet</p>
              ) : (
                notes.map(n => (
                  <div key={n.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700">{n.author_name ?? 'Team member'}</p>
                      <p className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    <p className="text-sm text-gray-700">{n.body}</p>
                  </div>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <input value={newNote} onChange={e => setNewNote(e.target.value)}
                placeholder="Add a note for your team…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button disabled={addingNote || !newNote.trim()} onClick={postNote}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {addingNote ? '…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
