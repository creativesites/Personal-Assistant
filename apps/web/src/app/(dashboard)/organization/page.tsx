'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import {
  Building2,
  Users,
  ShieldCheck,
  FolderGit2,
  History,
  Plus,
  Lock,
  CheckCircle2,
  UserPlus,
  Trash2,
  UserCheck,
  Sparkles,
  AlertCircle
} from 'lucide-react'
import { FeatureGate } from '@/components/ui'

interface OrgMember {
  id: string
  userId: string
  fullName: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: string
  joinedAt: string
  assignedConversationsCount: number
}

interface OrgTeam {
  id: string
  name: string
  description: string | null
  leadUserId: string | null
  leadName: string | null
  memberCount: number
}

interface AuditLog {
  id: string
  action: string
  actorName: string
  targetType: string | null
  metadata: any
  createdAt: string
}

interface OrgMeResponse {
  organization: {
    id: string
    clerkOrgId: string
    name: string
    slug: string | null
    planFamily: string
    maxSeats: number
    settings: any
    createdAt: string
    userRole: string
    activeMembersCount: number
    activeTeamsCount: number
  } | null
}

interface MembersResponse {
  members: OrgMember[]
  maxSeats: number
}

interface TeamsResponse {
  teams: OrgTeam[]
}

interface AuditLogsResponse {
  logs: AuditLog[]
}

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800 border-purple-200',
  admin: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  member: 'bg-blue-100 text-blue-800 border-blue-200',
  viewer: 'bg-gray-100 text-gray-700 border-gray-200',
}

function OrganizationHubInner() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const currentUserId = session.data?.user?.id
  const isCompanyManaged = session.data?.isCompanyManaged

  const [activeTab, setActiveTab] = useState<'members' | 'teams' | 'governance' | 'audit' | 'settings'>('members')

  // API Data
  const { data: orgData, loading: orgLoading, refetch: refetchOrg } = useApi<OrgMeResponse>('/api/organization/me', token)
  const { data: membersData, loading: membersLoading, refetch: refetchMembers } = useApi<MembersResponse>('/api/organization/members', token)
  const { data: teamsData, loading: teamsLoading, refetch: refetchTeams } = useApi<TeamsResponse>('/api/organization/teams', token)
  const { data: auditData, loading: auditLoading } = useApi<AuditLogsResponse>(
    activeTab === 'audit' ? '/api/organization/audit-logs' : null,
    token,
  )

  const org = orgData?.organization
  const members = membersData?.members ?? []
  const teams = teamsData?.teams ?? []
  const auditLogs = auditData?.logs ?? []
  const maxSeats = membersData?.maxSeats || org?.maxSeats || 10

  // Modals state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamDesc, setNewTeamNameDesc] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)

  const [orgNameInput, setOrgNameInput] = useState(org?.name || '')
  const [updatingSettings, setUpdatingSettings] = useState(false)

  const isOwnerOrAdmin = org?.userRole === 'owner' || org?.userRole === 'admin'

  const handleInvite = async () => {
    if (!token || !inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    try {
      await apiClient('/api/organization/invite', {
        method: 'POST',
        token,
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      setShowInviteModal(false)
      setInviteEmail('')
      await Promise.all([refetchMembers(), refetchOrg()])
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (memberId: string, name: string) => {
    if (!token || !confirm(`Are you sure you want to remove ${name} from your company organization? This will release their personal workspace lock.`)) return
    try {
      await apiClient(`/api/organization/members/${memberId}`, { method: 'DELETE', token })
      await Promise.all([refetchMembers(), refetchOrg()])
    } catch (err: any) {
      alert(err.message || 'Failed to remove member')
    }
  }

  const handleChangeRole = async (memberId: string, role: string) => {
    if (!token) return
    try {
      await apiClient(`/api/organization/members/${memberId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ role }),
      })
      await refetchMembers()
    } catch (err: any) {
      alert(err.message || 'Failed to update member role')
    }
  }

  const handleCreateTeam = async () => {
    if (!token || !newTeamName.trim()) return
    setCreatingTeam(true)
    try {
      await apiClient('/api/organization/teams', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: newTeamName.trim(), description: newTeamDesc.trim() || undefined }),
      })
      setShowCreateTeamModal(false)
      setNewTeamName('')
      setNewTeamNameDesc('')
      await refetchTeams()
    } catch (err: any) {
      alert(err.message || 'Failed to create team')
    } finally {
      setCreatingTeam(false)
    }
  }

  const handleUpdateOrgSettings = async () => {
    if (!token || !orgNameInput.trim()) return
    setUpdatingSettings(true)
    try {
      await apiClient('/api/organization/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ name: orgNameInput.trim() }),
      })
      await refetchOrg()
      alert('Organization settings updated successfully.')
    } catch (err: any) {
      alert(err.message || 'Failed to update settings')
    } finally {
      setUpdatingSettings(false)
    }
  }

  if (orgLoading && !org) {
    return (
      <div className="flex-1 bg-gray-50 px-4 md:px-8 py-6 pt-16 pb-20 md:pt-6 md:pb-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="h-24 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          <div className="h-64 bg-white rounded-2xl border border-gray-200 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-gray-50 px-4 md:px-8 py-6 pt-16 pb-20 md:pt-6 md:pb-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Top Header Card */}
        <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2.5 py-0.5 rounded-full font-medium tracking-wide uppercase border border-indigo-400/20">
                  Business Plan Tier
                </span>
                {isCompanyManaged && (
                  <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-medium border border-emerald-400/20 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Managed Organization
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <Building2 className="w-7 h-7 text-indigo-400" />
                {org?.name || 'Company Organization Hub'}
              </h1>
              <p className="text-indigo-200/80 text-sm max-w-xl">
                Clerk Organization Integration · Multi-user Team Roster · Centralized Governance & Seat Control
              </p>
            </div>

            {isOwnerOrAdmin && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/30 flex items-center gap-2 self-start md:self-auto"
              >
                <UserPlus className="w-4 h-4" />
                Invite Team Member
              </button>
            )}
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10 text-xs">
            <div>
              <p className="text-indigo-200/60 uppercase font-semibold">Active Seats</p>
              <p className="text-lg font-bold text-white mt-0.5">
                {members.length} / {maxSeats} <span className="text-xs text-indigo-300 font-normal">seats</span>
              </p>
            </div>
            <div>
              <p className="text-indigo-200/60 uppercase font-semibold">Sub-Teams</p>
              <p className="text-lg font-bold text-white mt-0.5">{teams.length} departments</p>
            </div>
            <div>
              <p className="text-indigo-200/60 uppercase font-semibold">Your Org Role</p>
              <p className="text-lg font-bold text-indigo-300 capitalize mt-0.5">{org?.userRole || 'Member'}</p>
            </div>
            <div>
              <p className="text-indigo-200/60 uppercase font-semibold">Governance Mode</p>
              <p className="text-lg font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Enforced Business
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-white rounded-xl p-1 shadow-sm overflow-x-auto">
          {[
            { id: 'members', label: 'Organization Members', icon: Users, count: members.length },
            { id: 'teams', label: 'Departments & Sub-Teams', icon: FolderGit2, count: teams.length },
            { id: 'governance', label: 'Governance & Account Isolation', icon: ShieldCheck },
            { id: 'audit', label: 'Audit Trail', icon: History },
            { id: 'settings', label: 'Org Settings', icon: Building2 },
          ].map((t) => {
            const Icon = t.icon
            const active = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {t.count !== undefined && (
                  <span
                    className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                      active ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* TAB 1: Members Roster */}
        {activeTab === 'members' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Organization Members Roster</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Users under this company organization have their workspaces locked to business mode.
                </p>
              </div>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Member
                </button>
              )}
            </div>

            {membersLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading organization roster...</div>
            ) : members.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-900 font-semibold">No members found</p>
                <p className="text-gray-500 text-xs mt-1">Invite colleagues using their work email address.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {members.map((m) => {
                  const isSelf = m.userId === currentUserId
                  return (
                    <div key={m.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50/80 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm shadow-inner">
                          {m.fullName?.charAt(0) || m.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">{m.fullName || m.email}</span>
                            {isSelf && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                                YOU
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{m.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-auto">
                        <span className="text-xs text-gray-400">
                          {m.assignedConversationsCount} active chats
                        </span>

                        {isOwnerOrAdmin && !isSelf && m.role !== 'owner' ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleChangeRole(m.id, e.target.value)}
                            className="text-xs border border-gray-300 rounded-lg px-2.5 py-1 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize border ${ROLE_BADGE[m.role]}`}>
                            {m.role}
                          </span>
                        )}

                        {isOwnerOrAdmin && !isSelf && m.role !== 'owner' && (
                          <button
                            onClick={() => handleRemoveMember(m.id, m.fullName || m.email)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Remove from company"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Departments & Sub-teams */}
        {activeTab === 'teams' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Departments & Shared Inbox Teams</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Organize your company into sub-teams (Sales, Customer Support, Ops) for shared conversation routing.
                </p>
              </div>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setShowCreateTeamModal(true)}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Create Department
                </button>
              )}
            </div>

            {teamsLoading ? (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm">Loading teams...</div>
            ) : teams.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
                <FolderGit2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-900 font-semibold">No sub-teams created yet</p>
                <p className="text-gray-500 text-xs mt-1">Create departments like Sales or Support to divide conversation leads.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teams.map((t) => (
                  <div key={t.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3 hover:border-indigo-300 transition-all">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">{t.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{t.description || 'No description provided.'}</p>
                      </div>
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">
                        {t.memberCount} members
                      </span>
                    </div>
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                      <span>Lead: <strong className="text-gray-700">{t.leadName || 'Unassigned'}</strong></span>
                      <span className="text-indigo-600 font-semibold cursor-pointer hover:underline">Manage Sub-team →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Governance Policy */}
        {activeTab === 'governance' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" /> Company Account Governance Policy
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Zuri enforces strict enterprise isolation to prevent data leaks between enterprise accounts and personal profiles.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                  <Lock className="w-4 h-4 text-amber-600" /> Personal Account Switch Lock
                </div>
                <p className="text-xs text-amber-700/90 leading-relaxed">
                  Users active under a company organization are locked to <strong>Business Mode</strong>. They cannot switch their active email account to Personal or Hybrid mode while belonging to the company.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/80 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <UserCheck className="w-4 h-4 text-emerald-600" /> Governed Offboarding
                </div>
                <p className="text-xs text-emerald-700/90 leading-relaxed">
                  When a company administrator removes a member from the organization roster, the user’s company lock is released automatically, permitting personal account operation again.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-900">Current Governance Enforcement Status</h3>
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Active Organization ID:</span>
                  <span className="font-mono font-semibold text-gray-900">{org?.id || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Clerk Organization Identifier:</span>
                  <span className="font-mono font-semibold text-gray-900">{org?.clerkOrgId || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Workspace Lock Status:</span>
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Enforced (Business Mode Only)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Audit Logs */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Company Audit Trail</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Real-time security logs tracking member invitations, role modifications, and team updates.
              </p>
            </div>

            {auditLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading security audit trail...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-12 text-center">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-900 font-semibold">No audit logs recorded yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-bold text-gray-900">
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] uppercase">
                          {log.action}
                        </span>
                        <span>by {log.actorName}</span>
                      </div>
                      {log.metadata && (
                        <p className="text-gray-500 font-mono text-[11px]">{JSON.stringify(log.metadata)}</p>
                      )}
                    </div>
                    <span className="text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: Org Settings */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-bold text-gray-900">Organization Settings</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Manage company profile details and seats.
              </p>
            </div>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Company Display Name</label>
                <input
                  type="text"
                  value={orgNameInput}
                  onChange={(e) => setOrgNameInput(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  className="w-full text-sm border border-gray-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Clerk Organization ID</label>
                <input
                  type="text"
                  disabled
                  value={org?.clerkOrgId || ''}
                  className="w-full text-sm border border-gray-200 bg-gray-50 rounded-xl px-3.5 py-2.5 text-gray-500 font-mono"
                />
              </div>

              {isOwnerOrAdmin && (
                <button
                  disabled={updatingSettings}
                  onClick={handleUpdateOrgSettings}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50"
                >
                  {updatingSettings ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: Invite Member */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Invite Colleague to Company</h2>
            <p className="text-xs text-gray-500">
              Entering their email will attach them to your company organization and lock their account to Business mode.
            </p>

            {inviteError && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {inviteError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Work Email Address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full text-sm border border-gray-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Assigned Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="w-full text-sm border border-gray-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="member">Member (Standard Access)</option>
                <option value="admin">Admin (Full Team Management)</option>
                <option value="viewer">Viewer (Read-Only)</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowInviteModal(false); setInviteError(null) }}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={inviting || !inviteEmail.trim()}
                onClick={handleInvite}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
              >
                {inviting ? 'Inviting...' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Create Department */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Create Sub-team / Department</h2>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Department Name</label>
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g. Sales Team, Enterprise Support"
                className="w-full text-sm border border-gray-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
              <textarea
                value={newTeamDesc}
                onChange={(e) => setNewTeamNameDesc(e.target.value)}
                placeholder="Brief summary of department responsibilities..."
                rows={3}
                className="w-full text-sm border border-gray-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowCreateTeamModal(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={creatingTeam || !newTeamName.trim()}
                onClick={handleCreateTeam}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
              >
                {creatingTeam ? 'Creating...' : 'Create Department'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OrganizationPage() {
  return (
    <FeatureGate requiredFamily="business" featureLabel="Organization & Teams">
      <OrganizationHubInner />
    </FeatureGate>
  )
}
