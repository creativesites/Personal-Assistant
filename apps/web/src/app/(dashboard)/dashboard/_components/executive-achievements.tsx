'use client'

import { useCelebration } from '@/hooks/use-celebration'
import {
  Trophy,
  Sparkles,
  Users,
  CheckCircle2,
  Brain,
  Zap,
  FileCheck,
  Lock,
  ArrowUpRight,
} from 'lucide-react'

const ICON_MAP: Record<string, any> = {
  Users,
  Sparkles,
  CheckCircle2,
  Brain,
  Zap,
  FileCheck,
}

export function ExecutiveAchievements() {
  const { allMilestones, unlockedState, triggerMilestone } = useCelebration()

  const milestoneList = Object.values(allMilestones)
  const unlockedCount = Object.keys(unlockedState).length

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl p-5 shadow-lg">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Executive Badges Shelf</h3>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-amber-400 border border-slate-700">
                {unlockedCount} / {milestoneList.length} Unlocked
              </span>
            </div>
            <p className="text-xs text-slate-400">Team milestones and relationship OS accomplishments.</p>
          </div>
        </div>
      </div>

      {/* Grid of Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-4">
        {milestoneList.map((m) => {
          const unlocked = !!unlockedState[m.id]
          const IconComponent = ICON_MAP[m.iconName] || Trophy

          return (
            <div
              key={m.id}
              onClick={() => {
                if (!unlocked) {
                  triggerMilestone(m.id, { detail: `Manually verified ${m.title}` })
                }
              }}
              className={`group relative overflow-hidden rounded-xl border p-4 transition-all cursor-pointer ${
                unlocked
                  ? 'border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 shadow-md shadow-amber-500/5'
                  : 'border-slate-800/80 bg-slate-950/40 opacity-70 hover:opacity-100 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${
                    unlocked
                      ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {unlocked ? <IconComponent className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </div>

                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    unlocked
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                      : 'border-slate-800 bg-slate-900 text-slate-500'
                  }`}
                >
                  {m.rarity}
                </span>
              </div>

              <div className="mt-3">
                <h4 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                  {m.title}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{m.subtitle}</p>
                <div className="mt-2.5 flex items-center justify-between text-[11px] border-t border-slate-800/80 pt-2 text-slate-400">
                  <span className="text-emerald-400 font-medium">{m.impactMetric}</span>
                  <span className="text-[10px]">
                    {unlocked ? 'Unlocked' : 'Click to test'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
