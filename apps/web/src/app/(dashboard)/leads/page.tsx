'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useZuriSession } from '@/hooks/use-zuri-session';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MessageAnalysis {
  intent: { primary: string; details: string };
  responseUrgency: string;
  requiresResponse: boolean;
  entities: { text: string; type: string }[];
  topics: string[];
  promisesDetected: { text: string; type: string }[];
  sentiment: string;
  importanceScore: number | null;
}

interface LeadMessage {
  id: string;
  senderType: 'user' | 'contact';
  body: string;
  timestamp: string;
  analysis: MessageAnalysis | null;
}

interface LeadInsight {
  key: string;
  value: string;
  confidence: number;
  supportingText: string;
  createdAt: string;
}

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  industry: string | null;
  customerStatus: string | null;
  pipelineStage: string | null;
  leadScore: number;
  lastMessageAt: string | null;
  createdAt: string;
  tags: string[];
  relationship: {
    healthScore: number;
    healthTrend: string;
    lastInteractionAt: string | null;
  };
  profile: {
    personalitySummary: string | null;
    communicationStyle: string | null;
    buyingBehaviour: string | null;
    painPoints: string | null;
    goals: string | null;
    preferences: string | null;
    relationshipStage: string | null;
    moodBaseline: string | null;
    currentLifeContext: string | null;
  };
  insights: LeadInsight[];
  interestInsights: LeadInsight[];
  mentionedProducts: string[];
  mentionedTopics: string[];
  recentMessages: LeadMessage[];
  lastContactMessage: LeadMessage | null;
  hasRequiresResponse: boolean;
  maxUrgency: string;
  nextAction: string | null;
  messageCount: number;
}

// ─── Pipeline stage config ────────────────────────────────────────────────────

const STAGES = [
  { key: 'new_lead',    label: 'New Lead',    color: 'bg-gray-100 text-gray-700',    dot: 'bg-gray-400' },
  { key: 'contacted',   label: 'Contacted',   color: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-400' },
  { key: 'qualified',   label: 'Qualified',   color: 'bg-violet-50 text-violet-700', dot: 'bg-violet-400' },
  { key: 'proposal',    label: 'Proposal',    color: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-400' },
  { key: 'negotiation', label: 'Negotiation', color: 'bg-orange-50 text-orange-700', dot: 'bg-orange-400' },
  { key: 'won',         label: 'Won',         color: 'bg-green-50 text-green-700',   dot: 'bg-green-400' },
  { key: 'lost',        label: 'Lost',        color: 'bg-red-50 text-red-700',       dot: 'bg-red-400' },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

function getStage(key: string | null) {
  return STAGE_MAP[key ?? 'new_lead'] ?? STAGES[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function urgencyBadge(urgency: string) {
  if (urgency === 'urgent') return 'bg-red-100 text-red-700 border border-red-200';
  if (urgency === 'high')   return 'bg-orange-100 text-orange-700 border border-orange-200';
  if (urgency === 'medium') return 'bg-amber-100 text-amber-700 border border-amber-200';
  return 'bg-gray-100 text-gray-500';
}

function scoreColor(score: number) {
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  if (score >= 25) return 'text-orange-500';
  return 'text-gray-400';
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string;
  avatarUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'sm' ? 'w-8 h-8 text-xs' :
    size === 'lg' ? 'w-12 h-12 text-base' :
    'w-10 h-10 text-sm';
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn('rounded-full object-cover ring-2 ring-white flex-shrink-0', sizeClass)}
      />
    );
  }
  return (
    <div className={cn('rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center flex-shrink-0', sizeClass)}>
      {initials(name)}
    </div>
  );
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score, 100) / 100;
  const stroke =
    score >= 75 ? '#16a34a' :
    score >= 50 ? '#d97706' :
    score >= 25 ? '#ea580c' :
    '#9ca3af';
  return (
    <div className="relative w-12 h-12 flex-shrink-0">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3.5" />
        <circle
          cx="22" cy="22" r={r} fill="none"
          stroke={stroke}
          strokeWidth="3.5"
          strokeDasharray={`${circ * pct} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className={cn('absolute inset-0 flex items-center justify-center text-xs font-bold', scoreColor(score))}>
        {score}
      </span>
    </div>
  );
}

// ─── Lead card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const topInterest = lead.interestInsights[0] ?? lead.insights[0] ?? null;
  const lastMsg = lead.lastContactMessage;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-200 transition-all p-3"
    >
      <div className="flex items-start gap-3">
        <Avatar name={lead.name} avatarUrl={lead.avatarUrl} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="font-semibold text-gray-900 text-sm truncate">{lead.name}</span>
            <ScoreRing score={lead.leadScore} />
          </div>
          {lead.company && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{lead.company}</p>
          )}

          {topInterest ? (
            <div className="mt-2 bg-indigo-50 rounded-lg p-2">
              <p className="text-xs text-indigo-700 font-medium leading-snug line-clamp-2">
                {topInterest.value}
              </p>
              {topInterest.supportingText && (
                <p className="text-xs text-indigo-500 mt-1 italic line-clamp-1">
                  &ldquo;{topInterest.supportingText}&rdquo;
                </p>
              )}
            </div>
          ) : lastMsg?.body ? (
            <div className="mt-2 bg-gray-50 rounded-lg p-2">
              <p className="text-xs text-gray-600 italic line-clamp-2">&ldquo;{lastMsg.body}&rdquo;</p>
            </div>
          ) : null}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {lead.hasRequiresResponse && (
              <span className="text-xs bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5">
                Needs reply
              </span>
            )}
            {lead.maxUrgency !== 'low' && !lead.hasRequiresResponse && (
              <span className={cn('text-xs rounded-full px-2 py-0.5', urgencyBadge(lead.maxUrgency))}>
                {lead.maxUrgency}
              </span>
            )}
            {lead.lastMessageAt && (
              <span className="text-xs text-gray-400">{timeAgo(lead.lastMessageAt)}</span>
            )}
          </div>
        </div>
      </div>

      {lead.nextAction && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5">
          <svg className="w-3 h-3 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="text-xs text-indigo-600 font-medium">{lead.nextAction}</span>
        </div>
      )}
    </button>
  );
}

// ─── Lead detail slide-over ───────────────────────────────────────────────────

function LeadDetail({
  lead,
  onClose,
  onStageChange,
  token,
}: {
  lead: Lead;
  onClose: () => void;
  onStageChange: (id: string, stage: string) => void;
  token: string;
}) {
  const router = useRouter();
  const stage = getStage(lead.pipelineStage);
  const [updating, setUpdating] = useState(false);

  async function moveStage(newStage: string) {
    setUpdating(true);
    try {
      await apiClient(`/api/leads/${lead.id}/stage`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ pipelineStage: newStage }),
      });
      onStageChange(lead.id, newStage);
    } catch {}
    setUpdating(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <div
        className="w-full max-w-md bg-white shadow-2xl overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
          <Avatar name={lead.name} avatarUrl={lead.avatarUrl} size="lg" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 truncate">{lead.name}</h2>
            {lead.company && <p className="text-sm text-gray-500 truncate">{lead.company}</p>}
          </div>
          <button
            onClick={() => router.push(`/contacts/${lead.id}`)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 bg-indigo-50 rounded-lg flex-shrink-0"
          >
            Full profile
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Score + stage */}
          <div className="flex items-center gap-4 flex-wrap">
            <ScoreRing score={lead.leadScore} />
            <div>
              <p className="text-xs text-gray-500 mb-1">Current stage</p>
              <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full', stage.color)}>
                <span className={cn('w-2 h-2 rounded-full', stage.dot)} />
                {stage.label}
              </span>
            </div>
            {lead.hasRequiresResponse && (
              <span className="ml-auto text-xs bg-red-50 text-red-600 border border-red-200 rounded-full px-3 py-1.5 font-medium">
                Needs reply
              </span>
            )}
          </div>

          {/* Move stage */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Move to stage</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map(s => (
                <button
                  key={s.key}
                  disabled={updating || s.key === lead.pipelineStage}
                  onClick={() => moveStage(s.key)}
                  className={cn(
                    'text-xs px-2.5 py-1.5 rounded-lg border transition-all',
                    s.key === lead.pipelineStage
                      ? cn(s.color, 'border-current font-semibold')
                      : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* What they want */}
          {lead.interestInsights.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">What they want</p>
              <div className="space-y-2">
                {lead.interestInsights.map((ins, i) => (
                  <div key={i} className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                    <p className="text-sm text-indigo-900 font-medium">{ins.value}</p>
                    {ins.supportingText && (
                      <p className="text-xs text-indigo-600 mt-1 italic">&ldquo;{ins.supportingText}&rdquo;</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1 bg-indigo-100 rounded-full">
                        <div className="h-1 bg-indigo-400 rounded-full" style={{ width: `${Math.round(ins.confidence * 100)}%` }} />
                      </div>
                      <span className="text-xs text-indigo-500">{Math.round(ins.confidence * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Buying behaviour */}
          {lead.profile.buyingBehaviour && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Buying behaviour</p>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-sm text-amber-900">{lead.profile.buyingBehaviour}</p>
              </div>
            </section>
          )}

          {/* Pain points + goals */}
          {(lead.profile.painPoints || lead.profile.goals) && (
            <section className="grid grid-cols-2 gap-3">
              {lead.profile.painPoints && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-600 mb-1">Pain points</p>
                  <p className="text-xs text-red-800">{lead.profile.painPoints}</p>
                </div>
              )}
              {lead.profile.goals && (
                <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-600 mb-1">Goals</p>
                  <p className="text-xs text-green-800">{lead.profile.goals}</p>
                </div>
              )}
            </section>
          )}

          {/* Products / topics */}
          {(lead.mentionedProducts.length > 0 || lead.mentionedTopics.length > 0) && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Topics &amp; products mentioned</p>
              <div className="flex flex-wrap gap-1.5">
                {lead.mentionedProducts.map((p, i) => (
                  <span key={i} className="text-xs bg-violet-50 text-violet-700 border border-violet-100 rounded-full px-2.5 py-1">
                    {p}
                  </span>
                ))}
                {lead.mentionedTopics
                  .filter(t => !lead.mentionedProducts.includes(t))
                  .map((t, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2.5 py-1">
                      {t}
                    </span>
                  ))}
              </div>
            </section>
          )}

          {/* Other AI insights */}
          {lead.insights.filter(i => !lead.interestInsights.includes(i)).slice(0, 5).length > 0 && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">AI insights</p>
              <div className="space-y-2">
                {lead.insights.filter(i => !lead.interestInsights.includes(i)).slice(0, 5).map((ins, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 text-gray-300">•</span>
                    <div>
                      <span className="font-medium text-gray-700">{ins.key.replace(/_/g, ' ')}: </span>
                      <span className="text-gray-600">{ins.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent messages */}
          {lead.recentMessages.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent conversation</p>
              <div className="space-y-2">
                {lead.recentMessages.slice(0, 4).map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg p-2.5 text-xs',
                      msg.senderType === 'contact'
                        ? 'bg-gray-50 border border-gray-100'
                        : 'bg-indigo-50 border border-indigo-100 ml-4',
                    )}
                  >
                    <p className={cn('font-medium mb-0.5', msg.senderType === 'contact' ? 'text-gray-500' : 'text-indigo-500')}>
                      {msg.senderType === 'contact' ? lead.name : 'You'}
                    </p>
                    <p className="text-gray-800 line-clamp-3">{msg.body}</p>
                    {msg.analysis?.intent && (
                      <p className="text-gray-400 mt-1">Intent: {msg.analysis.intent.primary}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Next action */}
          {lead.nextAction && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Next best action</p>
              <div className="bg-indigo-600 text-white rounded-xl p-4">
                <p className="font-semibold">{lead.nextAction}</p>
                {lead.lastMessageAt && (
                  <p className="text-indigo-200 text-xs mt-1">Last contact: {timeAgo(lead.lastMessageAt)}</p>
                )}
              </div>
            </section>
          )}

          {/* Contact info */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact info</p>
            <div className="space-y-1.5 text-sm text-gray-700">
              {lead.phone && <p>📞 {lead.phone}</p>}
              {lead.email && <p>✉️ {lead.email}</p>}
              {lead.company && <p>🏢 {lead.company}</p>}
              {lead.industry && <p>🏷️ {lead.industry}</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  leads,
  onLeadClick,
}: {
  stage: typeof STAGES[0];
  leads: Lead[];
  onLeadClick: (l: Lead) => void;
}) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full', stage.dot)} />
          <span className="font-semibold text-sm text-gray-800">{stage.label}</span>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[4rem]">
        {leads.length === 0 ? (
          <div className="border-2 border-dashed border-gray-100 rounded-xl p-4 text-center text-xs text-gray-300">
            No leads
          </div>
        ) : (
          leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onLeadClick(lead)} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function KPIStrip({ leads }: { leads: Lead[] }) {
  const total     = leads.length;
  const hot       = leads.filter(l => l.leadScore >= 70).length;
  const needReply = leads.filter(l => l.hasRequiresResponse).length;
  const urgent    = leads.filter(l => l.maxUrgency === 'urgent' || l.maxUrgency === 'high').length;
  const avgScore  = total ? Math.round(leads.reduce((s, l) => s + l.leadScore, 0) / total) : 0;

  const kpis = [
    { label: 'Total leads',    value: total,     sub: 'in pipeline',       alert: false, hot: false },
    { label: 'Hot leads',      value: hot,        sub: 'score ≥ 70',        alert: false, hot: hot > 0 },
    { label: 'Needs reply',    value: needReply,  sub: 'awaiting response', alert: needReply > 0, hot: false },
    { label: 'High urgency',   value: urgent,     sub: 'urgent or high',    alert: urgent > 0, hot: false },
    { label: 'Avg lead score', value: avgScore,   sub: 'out of 100',        alert: false, hot: false },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map(kpi => (
        <div
          key={kpi.label}
          className={cn(
            'bg-white border rounded-xl p-4 shadow-sm',
            kpi.alert ? 'border-red-200' : kpi.hot ? 'border-green-200' : 'border-gray-200',
          )}
        >
          <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
          <p className="text-xs font-medium text-gray-700 mt-0.5">{kpi.label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── AI signals feed ──────────────────────────────────────────────────────────

function AiSignalsFeed({ leads, onLeadClick }: { leads: Lead[]; onLeadClick: (l: Lead) => void }) {
  const urgRank: Record<string, number> = { urgent: 3, high: 2, medium: 1, low: 0 };
  const hotWithSignals = leads
    .filter(l => l.leadScore >= 50 || l.interestInsights.length > 0 || l.hasRequiresResponse)
    .sort((a, b) => {
      const au = urgRank[a.maxUrgency] ?? 0;
      const bu = urgRank[b.maxUrgency] ?? 0;
      if (bu !== au) return bu - au;
      return b.leadScore - a.leadScore;
    })
    .slice(0, 8);

  if (hotWithSignals.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <h3 className="font-semibold text-sm text-gray-900">AI Signals</h3>
        <span className="text-xs text-gray-400 ml-auto">Hot leads with buying intent</span>
      </div>
      <div className="divide-y divide-gray-50">
        {hotWithSignals.map(lead => {
          const topSignal = lead.interestInsights[0] ?? lead.insights[0] ?? null;
          return (
            <button
              key={lead.id}
              onClick={() => onLeadClick(lead)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Avatar name={lead.name} avatarUrl={lead.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{lead.name}</span>
                    {lead.hasRequiresResponse && (
                      <span className="text-xs bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 flex-shrink-0">
                        Reply
                      </span>
                    )}
                    {lead.maxUrgency !== 'low' && !lead.hasRequiresResponse && (
                      <span className={cn('text-xs rounded-full px-1.5 py-0.5 flex-shrink-0', urgencyBadge(lead.maxUrgency))}>
                        {lead.maxUrgency}
                      </span>
                    )}
                    <span className={cn('text-xs font-bold ml-auto', scoreColor(lead.leadScore))}>
                      {lead.leadScore}
                    </span>
                  </div>
                  {topSignal ? (
                    <p className="text-xs text-gray-600 truncate mt-0.5">{topSignal.value}</p>
                  ) : lead.lastContactMessage?.body ? (
                    <p className="text-xs text-gray-500 truncate mt-0.5 italic">
                      &ldquo;{lead.lastContactMessage.body}&rdquo;
                    </p>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">No leads yet</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        Contacts become leads when they have a pipeline stage, lead score, or are marked as lead or prospect.
      </p>
      <button
        onClick={() => router.push('/contacts')}
        className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
      >
        Go to contacts
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { data: session } = useZuriSession();
  const token = session?.accessToken ?? '';

  const [leads, setLeads]       = useState<Lead[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [view, setView]         = useState<'kanban' | 'list'>('kanban');
  const [filter, setFilter]     = useState<string>('all');
  const [search, setSearch]     = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<{ leads: Lead[] }>('/api/leads', { token });
      setLeads(data.leads);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function handleStageChange(id: string, newStage: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, pipelineStage: newStage } : l));
    setSelected(prev => (prev?.id === id ? { ...prev, pipelineStage: newStage } : prev));
  }

  const filtered = leads.filter(l => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !l.name.toLowerCase().includes(q) &&
        !(l.company ?? '').toLowerCase().includes(q) &&
        !l.tags.some(t => t.includes(q))
      ) return false;
    }
    if (filter === 'hot')         return l.leadScore >= 70;
    if (filter === 'needs_reply') return l.hasRequiresResponse;
    if (filter === 'urgent')      return l.maxUrgency === 'urgent' || l.maxUrgency === 'high';
    if (filter === 'no_profile')  return !l.profile.buyingBehaviour && !l.interestInsights.length;
    return true;
  });

  const byStage: Record<string, Lead[]> = {};
  for (const s of STAGES) byStage[s.key] = [];
  for (const lead of filtered) {
    const key = lead.pipelineStage ?? 'new_lead';
    (byStage[key] ?? byStage['new_lead']).push(lead);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-screen-2xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
            <p className="text-sm text-gray-500 mt-0.5">AI-enriched sales pipeline from your WhatsApp conversations</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('kanban')}
              title="Kanban"
              className={cn(
                'p-2 rounded-lg border transition-colors',
                view === 'kanban'
                  ? 'bg-white border-indigo-300 text-indigo-600 shadow-sm'
                  : 'border-gray-200 text-gray-400 hover:text-gray-700',
              )}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2V7" />
              </svg>
            </button>
            <button
              onClick={() => setView('list')}
              title="List"
              className={cn(
                'p-2 rounded-lg border transition-colors',
                view === 'list'
                  ? 'bg-white border-indigo-300 text-indigo-600 shadow-sm'
                  : 'border-gray-200 text-gray-400 hover:text-gray-700',
              )}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={load}
              disabled={loading}
              title="Refresh"
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
            >
              <svg className={cn('w-5 h-5', loading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="w-8 h-8 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : leads.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <KPIStrip leads={leads} />

            {/* Search + filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search leads…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              {([
                { key: 'all',         label: 'All' },
                { key: 'hot',         label: 'Hot' },
                { key: 'needs_reply', label: 'Needs reply' },
                { key: 'urgent',      label: 'Urgent' },
                { key: 'no_profile',  label: 'No signals' },
              ] as { key: string; label: string }[]).map(f => {
                const count =
                  f.key === 'hot'         ? leads.filter(l => l.leadScore >= 70).length :
                  f.key === 'needs_reply' ? leads.filter(l => l.hasRequiresResponse).length :
                  f.key === 'urgent'      ? leads.filter(l => l.maxUrgency === 'urgent' || l.maxUrgency === 'high').length :
                  f.key === 'no_profile'  ? leads.filter(l => !l.profile.buyingBehaviour && !l.interestInsights.length).length :
                  null;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      'text-sm px-3 py-2 rounded-lg border transition-colors',
                      filter === f.key
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-200',
                    )}
                  >
                    {f.label}
                    {count !== null && (
                      <span className="ml-1.5 text-xs opacity-70">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Main content */}
            <div className="flex gap-5">
              <div className="flex-1 min-w-0">
                {view === 'kanban' ? (
                  <div className="overflow-x-auto pb-4">
                    <div className="flex gap-4 min-w-max">
                      {STAGES.map(stage => (
                        <KanbanColumn
                          key={stage.key}
                          stage={stage}
                          leads={byStage[stage.key] ?? []}
                          onLeadClick={setSelected}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    {filtered.length === 0 ? (
                      <div className="p-8 text-center text-sm text-gray-400">No leads match this filter.</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {filtered.map(lead => {
                          const stg = getStage(lead.pipelineStage);
                          const topInsight = lead.interestInsights[0] ?? lead.insights[0] ?? null;
                          return (
                            <button
                              key={lead.id}
                              onClick={() => setSelected(lead)}
                              className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors flex items-center gap-4"
                            >
                              <Avatar name={lead.name} avatarUrl={lead.avatarUrl} size="md" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900 text-sm truncate">{lead.name}</span>
                                  {lead.company && (
                                    <span className="text-xs text-gray-400 truncate hidden sm:block">{lead.company}</span>
                                  )}
                                </div>
                                {topInsight ? (
                                  <p className="text-xs text-gray-500 truncate mt-0.5">{topInsight.value}</p>
                                ) : lead.lastContactMessage?.body ? (
                                  <p className="text-xs text-gray-400 italic truncate mt-0.5">
                                    &ldquo;{lead.lastContactMessage.body}&rdquo;
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span className={cn('hidden sm:inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full', stg.color)}>
                                  <span className={cn('w-1.5 h-1.5 rounded-full', stg.dot)} />
                                  {stg.label}
                                </span>
                                {lead.hasRequiresResponse && (
                                  <span className="text-xs bg-red-50 text-red-600 border border-red-100 rounded-full px-2 py-0.5">
                                    Reply
                                  </span>
                                )}
                                <ScoreRing score={lead.leadScore} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* AI signals sidebar — desktop only */}
              <div className="hidden lg:block w-80 flex-shrink-0">
                <AiSignalsFeed leads={filtered} onLeadClick={setSelected} />
              </div>
            </div>

            {/* AI signals below on mobile */}
            <div className="lg:hidden">
              <AiSignalsFeed leads={filtered} onLeadClick={setSelected} />
            </div>
          </>
        )}
      </div>

      {/* Lead detail slide-over */}
      {selected && (
        <LeadDetail
          lead={selected}
          onClose={() => setSelected(null)}
          onStageChange={handleStageChange}
          token={token}
        />
      )}
    </div>
  );
}
