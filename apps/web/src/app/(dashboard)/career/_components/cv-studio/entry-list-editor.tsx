'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, GripVertical } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { Input, Textarea, Button, useToast } from '@/components/ui'

// CV Studio Phase 4 — The Wizard (docs/CV_STUDIO_PLAN.md §4, §18 Phase 4).
// Eight of the wizard's fourteen steps (employment, education,
// certifications, skill groups, awards, volunteer work, memberships,
// publications, references) are all the exact same shape on the backend
// (career-entry-crud.ts's shared factory) — this is that same DRY
// discipline carried into the frontend: one generic list editor driven by
// a small field-config array per step, instead of eight near-identical
// hand-written forms.

export type EntryFieldType = 'text' | 'textarea' | 'date' | 'boolean' | 'array' | 'select'

export interface EntryFieldConfig {
  key: string
  label: string
  type: EntryFieldType
  required?: boolean
  options?: string[]
  placeholder?: string
}

interface EntryItem {
  id: string
  sortOrder: number
  [key: string]: unknown
}

function emptyDraft(fields: EntryFieldConfig[]): Record<string, unknown> {
  const draft: Record<string, unknown> = {}
  for (const f of fields) draft[f.key] = f.type === 'boolean' ? false : f.type === 'array' ? [] : ''
  return draft
}

function fieldValueForInput(value: unknown, type: EntryFieldType): string {
  if (type === 'array') return Array.isArray(value) ? value.join(', ') : ''
  if (type === 'date') return value == null ? '' : String(value).slice(0, 10)
  return value == null ? '' : String(value)
}

function parseFieldValue(raw: string, type: EntryFieldType): unknown {
  if (type === 'array') return raw.split(',').map(s => s.trim()).filter(Boolean)
  return raw === '' ? null : raw
}

function FieldInput({
  field, value, onChange, onBlur,
}: {
  field: EntryFieldConfig
  value: unknown
  onChange: (v: unknown) => void
  onBlur?: () => void
}) {
  if (field.type === 'boolean') {
    return (
      <label className="inline-flex items-center gap-2 text-sm text-gray-700 mt-6">
        <input type="checkbox" checked={!!value} onChange={e => { onChange(e.target.checked); onBlur?.() }}
               className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
        {field.label}
      </label>
    )
  }
  if (field.type === 'textarea') {
    return (
      <Textarea
        label={field.label} placeholder={field.placeholder} rows={3}
        value={fieldValueForInput(value, field.type)}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
      />
    )
  }
  if (field.type === 'select') {
    return (
      <div className="w-full">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{field.label}</label>
        <select
          value={fieldValueForInput(value, field.type)}
          onChange={e => { onChange(e.target.value); onBlur?.() }}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Select...</option>
          {field.options?.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
    )
  }
  return (
    <Input
      label={field.label}
      type={field.type === 'date' ? 'date' : 'text'}
      placeholder={field.type === 'array' ? `${field.placeholder ?? ''} (comma-separated)` : field.placeholder}
      value={fieldValueForInput(value, field.type)}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
    />
  )
}

export function EntryListEditor({
  resourcePath, token, fields, titleFields, addLabel, emptyLabel, onMutated,
}: {
  resourcePath: string
  token: string
  fields: EntryFieldConfig[]
  titleFields: string[]
  addLabel: string
  emptyLabel: string
  onMutated?: () => void
}) {
  const { addToast } = useToast()
  const [items, setItems] = useState<EntryItem[] | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)

  useEffect(() => {
    apiClient<{ items: EntryItem[] }>(`/api/career/${resourcePath}`, { token })
      .then(data => setItems(data.items))
      .catch(() => setItems([]))
  }, [resourcePath, token])

  const updateItemField = (id: string, key: string, rawValue: string | boolean) => {
    setItems(prev => prev?.map(i => i.id === id ? { ...i, [key]: rawValue } : i) ?? null)
  }

  const persistItemField = async (id: string, field: EntryFieldConfig) => {
    const item = items?.find(i => i.id === id)
    if (!item) return
    const value = field.type === 'boolean' ? item[field.key] : parseFieldValue(fieldValueForInput(item[field.key], field.type), field.type)
    try {
      await apiClient(`/api/career/${resourcePath}/${id}`, { method: 'PATCH', token, body: JSON.stringify({ [field.key]: value }) })
      onMutated?.()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not save change', description: err instanceof ApiError ? err.message : undefined })
    }
  }

  const removeItem = async (id: string) => {
    if (!window.confirm('Remove this entry?')) return
    setItems(prev => prev?.filter(i => i.id !== id) ?? null)
    try {
      await apiClient(`/api/career/${resourcePath}/${id}`, { method: 'DELETE', token })
      onMutated?.()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not remove entry', description: err instanceof ApiError ? err.message : undefined })
    }
  }

  const saveDraft = async () => {
    if (!draft) return
    const missing = fields.find(f => f.required && !String(draft[f.key] ?? '').trim())
    if (missing) {
      addToast({ variant: 'error', title: `${missing.label} is required` })
      return
    }
    setSavingDraft(true)
    try {
      const body: Record<string, unknown> = {}
      for (const f of fields) body[f.key] = f.type === 'boolean' ? !!draft[f.key] : parseFieldValue(fieldValueForInput(draft[f.key], f.type), f.type)
      const created = await apiClient<{ item: EntryItem }>(`/api/career/${resourcePath}`, { method: 'POST', token, body: JSON.stringify(body) })
      setItems(prev => [...(prev ?? []), created.item])
      setDraft(null)
      onMutated?.()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not save entry', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSavingDraft(false)
    }
  }

  const itemTitle = (item: Record<string, unknown>) =>
    titleFields.map(k => item[k]).filter(Boolean).join(' — ') || 'Untitled'

  if (items === null) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && !draft && (
        <p className="text-sm text-gray-500 italic">{emptyLabel}</p>
      )}

      {items.map(item => (
        <div key={item.id} className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
              <GripVertical className="w-3.5 h-3.5 text-gray-300" />
              {itemTitle(item)}
            </div>
            <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-rose-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <FieldInput
                  field={f}
                  value={item[f.key]}
                  onChange={v => updateItemField(item.id, f.key, v as string | boolean)}
                  onBlur={() => persistItemField(item.id, f)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {draft ? (
        <div className="rounded-[1.75rem] border border-indigo-200 bg-indigo-50/40 shadow-sm p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <FieldInput field={f} value={draft[f.key]} onChange={v => setDraft(prev => ({ ...(prev ?? {}), [f.key]: v }))} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" onClick={saveDraft} loading={savingDraft}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setDraft(emptyDraft(fields))}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="w-4 h-4" />{addLabel}
        </button>
      )}
    </div>
  )
}
