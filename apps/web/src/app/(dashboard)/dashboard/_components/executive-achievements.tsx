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
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200/80">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">Executive Badges Shelf</h3>
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200/80">
                {unlockedCount} / {milestoneList.length} Unlocked
              </span>
            </div>
            <p className="text-xs text-slate-500">Team milestones and relationship OS accomplishments.</p>
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
                  ? 'border-amber-300 bg-gradient-to-br from-amber-50/80 via-white to-white shadow-sm'
                  : 'border-slate-200 bg-slate-50/60 opacity-80 hover:opacity-100 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${
                    unlocked
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                      : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {unlocked ? <IconComponent className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </div>

                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    unlocked
                      ? 'border-amber-300 bg-amber-100/80 text-amber-800'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                >
                  {m.rarity}
                </span>
              </div>

              <div className="mt-3">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                  {m.title}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{m.subtitle}</p>
                <div className="mt-2.5 flex items-center justify-between text-[11px] border-t border-slate-100 pt-2 text-slate-500">
                  <span className="text-emerald-600 font-semibold">{m.impactMetric}</span>
                  <span className="text-[10px] font-medium text-slate-400">
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
