'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'

export interface DropdownItem {
  label: string
  icon?: ReactNode
  onClick?: () => void
  href?: string
  destructive?: boolean
  disabled?: boolean
  dividerBefore?: boolean
}

interface DropdownProps {
  trigger: ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
  className?: string
}

export function Dropdown({ trigger, items, align = 'right', className = '' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const itemClass = (item: DropdownItem) =>
    `w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      item.disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' :
      item.destructive ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
    }`

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <div onClick={() => setOpen(v => !v)}>{trigger}</div>
      {open && (
        <div
          className={`absolute z-50 mt-1.5 w-48 rounded-lg bg-white border border-gray-200 shadow-lg py-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          role="menu"
        >
          {items.map((item, i) => (
            <div key={i}>
              {item.dividerBefore && i > 0 && (
                <div className="my-1 border-t border-gray-100" />
              )}
              {item.href ? (
                <a
                  href={item.href}
                  role="menuitem"
                  className={itemClass(item)}
                  onClick={() => { setOpen(false); item.onClick?.() }}
                >
                  {item.icon && <span className="w-4 h-4 flex-shrink-0 flex items-center">{item.icon}</span>}
                  {item.label}
                </a>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={itemClass(item)}
                  onClick={() => { setOpen(false); item.onClick?.() }}
                >
                  {item.icon && <span className="w-4 h-4 flex-shrink-0 flex items-center">{item.icon}</span>}
                  {item.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
