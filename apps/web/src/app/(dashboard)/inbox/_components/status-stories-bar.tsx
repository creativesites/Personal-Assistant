'use client'

import React from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { ContactStatusGroup } from '@zuri/types'

interface StatusStoriesBarProps {
  groups: ContactStatusGroup[]
  onSelectGroup: (group: ContactStatusGroup) => void
  onOpenCreate: () => void
}

export function StatusStoriesBar({ groups, onSelectGroup, onOpenCreate }: StatusStoriesBarProps) {
  const myGroup = groups.find(g => g.isFromMe)
  const contactGroups = groups.filter(g => !g.isFromMe)

  return (
    <div className="w-full bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/80 dark:border-slate-800/80 px-3 py-2.5">
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth">
        {/* Post My Status Tile */}
        <button
          onClick={myGroup ? () => onSelectGroup(myGroup) : onOpenCreate}
          className="flex flex-col items-center gap-1 min-w-[64px] group focus:outline-none"
        >
          <div className="relative">
            <div className="w-12 h-12 rounded-full p-0.5 border-2 border-dashed border-indigo-400/80 dark:border-indigo-500/80 group-hover:border-indigo-600 transition-colors flex items-center justify-center bg-white dark:bg-slate-800 shadow-2xs">
              <Avatar
                name="My Status"
                src={myGroup?.avatarUrl ?? undefined}
                size="sm"
              />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-2xs">
              <Plus size={10} strokeWidth={3} />
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[64px]">
            {myGroup ? 'My Status' : 'Add Status'}
          </span>
        </button>

        {/* Divider if we have contact statuses */}
        {contactGroups.length > 0 && (
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
