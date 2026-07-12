// Export system (docs/RELATIONSHIP_OS_PLAN.md §11) — CSV for any filtered
// view. Client-side generation: every view this feeds already has the full
// row set loaded in the browser (Relationship Feed, Leads), so there's no
// new backend endpoint needed, just a formatter + browser download.
export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    const s = value === null || value === undefined ? '' : String(value)
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
