'use client'

import React from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { ContactStatusGroup } from '@zuri/types'

interface StatusStoriesBarProps {
  groups: ContactStatusGroup[]
  onSelectGroup: (group: ContactStatusGroup) => void
}

export function StatusStoriesBar({ groups, onSelectGroup }: StatusStoriesBarProps) {
  const myGroup = groups.find(g => g.isFromMe)
  const contactGroups = groups.filter(g => !g.isFromMe)

  if (!myGroup && contactGroups.length === 0) return null

  return (
    <div className="w-full bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/80 dark:border-slate-800/80 px-3 py-2.5">
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth">
        {/* My Status Tile (if active status exists) */}
        {myGroup && (
          <button
            onClick={() => onSelectGroup(myGroup)}
            className="flex flex-col items-center gap-1 min-w-[64px] group focus:outline-none"
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-indigo-500 to-purple-500 group-hover:scale-105 transition-transform shadow-xs">
                <div className="w-full h-full rounded-full p-0.5 bg-white dark:bg-slate-900">
                  <Avatar
                    name="My Status"
                    src={myGroup.avatarUrl ?? undefined}
                    size="sm"
                  />
                </div>
              </div>
            </div>
            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[64px]">
              My Status
            </span>
          </button>
        )}

        {/* Divider if we have contact statuses */}
        {myGroup && contactGroups.length > 0 && (
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 my-auto shrink-0" />
        )}

        {/* Contact Status Circles */}
        {contactGroups.map((group) => {
          const count = group.statuses.length
          return (
            <button
              key={group.contactId || group.contactPhone}
              onClick={() => onSelectGroup(group)}
              className="flex flex-col items-center gap-1 min-w-[64px] group focus:outline-none"
            >
              <div className="relative">
                {/* Active story ring */}
                <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-teal-400 to-indigo-500 group-hover:scale-105 transition-transform shadow-xs">
                  <div className="w-full h-full rounded-full p-0.5 bg-white dark:bg-slate-900">
                    <Avatar
                      name={group.contactName}
                      src={group.avatarUrl ?? undefined}
                      size="sm"
                    />
                  </div>
                </div>

                {count > 1 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-emerald-600 text-white text-[9px] font-bold rounded-full border border-white dark:border-slate-900">
                    {count}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[64px]">
                {group.contactName}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
