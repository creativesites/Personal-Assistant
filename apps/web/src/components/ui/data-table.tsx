'use client'

import { useState, ReactNode } from 'react'

export interface Column<T> {
  key: keyof T | string
  header: string
  cell?: (row: T) => ReactNode
  sortable?: boolean
  className?: string
}

export interface RowAction<T> {
  label: string
  icon?: ReactNode
  onClick: (row: T) => void
  destructive?: boolean
  disabled?: (row: T) => boolean
}

interface DataTableProps<T extends { id: string | number }> {
  columns: Column<T>[]
  data: T[]
  actions?: RowAction<T>[]
  loading?: boolean
  emptyMessage?: string
  pageSize?: number
  className?: string
}

type SortDir = 'asc' | 'desc'

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  actions,
  loading = false,
  emptyMessage = 'No results',
  pageSize = 20,
  className = '',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const av = (a as any)[sortKey]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bv = (b as any)[sortKey]
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
    : data

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)
  const colSpan = columns.length + (actions ? 1 : 0)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const visiblePages = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 3) return [1, 2, 3, 4, 5]
    if (page >= totalPages - 2) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [page - 2, page - 1, page, page + 1, page + 2]
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {columns.map(col => (
                <th
                  key={String(col.key)}
                  scope="col"
                  onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${col.className ?? ''} ${col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="text-gray-300" aria-hidden="true">
                        {sortKey === String(col.key) ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              {actions && (
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse w-16 ml-auto" />
                    </td>
                  )}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-16 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map(row => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                  {columns.map(col => (
                    <td key={String(col.key)} className={`px-4 py-3 text-gray-700 ${col.className ?? ''}`}>
                      {col.cell
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ? col.cell(row)
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        : String((row as any)[col.key] ?? '')}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {actions.map((action, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => action.onClick(row)}
                            disabled={action.disabled?.(row)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              action.destructive
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {action.icon}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-4 text-sm">
          <span className="text-xs text-gray-500 tabular-nums">
            {Math.min((page - 1) * pageSize + 1, sorted.length)}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            {visiblePages().map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`w-8 h-7 rounded-md text-xs font-medium transition-colors ${
                  page === n ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
