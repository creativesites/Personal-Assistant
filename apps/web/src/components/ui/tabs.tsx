'use client'

import { useState, ReactNode } from 'react'

export interface Tab {
  id: string
  label: string
  icon?: ReactNode
  badge?: string | number
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
  activeTab?: string
  onChange?: (id: string) => void
  variant?: 'underline' | 'pill'
  className?: string
  children?: ReactNode | ((activeTab: string) => ReactNode)
}

export function Tabs({
  tabs,
  defaultTab,
  activeTab: controlled,
  onChange,
  variant = 'underline',
  className = '',
  children,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultTab ?? tabs[0]?.id ?? '')
  const active = controlled ?? internal

  const handleSelect = (id: string) => {
    if (!controlled) setInternal(id)
    onChange?.(id)
  }

  return (
    <div className={className}>
      <div
        className={
          variant === 'pill'
            ? 'flex gap-1 p-1 bg-gray-100 rounded-xl w-full sm:w-fit overflow-x-auto max-w-full scrollbar-none'
            : 'flex border-b border-gray-200 overflow-x-auto max-w-full scrollbar-none'
        }
        role="tablist"
      >
        {tabs.map(tab => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSelect(tab.id)}
              className={
                variant === 'pill'
                  ? `inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isActive
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`
                  : `inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap focus-visible:outline-none ${
                      isActive
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`
              }
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                    isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {children !== undefined && (
        <div>
          {typeof children === 'function' ? (children as (id: string) => ReactNode)(active) : children}
        </div>
      )}
    </div>
  )
}
