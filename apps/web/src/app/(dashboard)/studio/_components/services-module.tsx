'use client'

import { useState, useEffect } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  FileText,
  GitBranch,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users2,
  Wrench,
  X,
  Archive,
  Ban,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import {
  type Product, type ProductFamily,
  formatCurrency, buildFamilyTree, PRICING_MODEL_LABELS,
} from './shared'

// ─── Services Module ──────────────────────────────────────────────────────────
// Services Management System (docs/SERVICES_PROJECTS_PLAN.md, Part B). A
// service is a `products` row with itemType in service/subscription/package
// — this tab is a dedicated view over that same table, plus the genuinely
// new per-service structures (pricing tiers, capacity, workflow stages).

const PRICING_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily rate' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'milestone', label: 'Milestone-based' },
  { value: 'quote', label: 'Quote required' },
  { value: 'recurring', label: 'Recurring' },
]

const SERVICE_ITEM_TYPES = ['service', 'subscription', 'package']

const BLANK_SERVICE_FORM = {
  name: '', itemType: 'service', category: '', description: '',
  sellingPrice: '', currency: 'USD', pricingModel: 'fixed', familyId: '',
}

interface PricingTier {
  id: string
  kind: 'package' | 'milestone'
  name: string
  price: number | null
  currency: string
  duration: string | null
  features: string[]
  extras: string[]
  sortOrder: number
}

interface ServiceCapacityRow {
  id: string
  capacityUnit: string
  periodType: string
  totalCapacity: number
  booked: number
  available: number
}

interface WorkflowStage {
  id?: string
  name: string
  description: string | null
  sortOrder: number
}

export function ServicesModule({ token }: { token: string | undefined }) {
  // Fetch including archived/discontinued/secondary items (same convention
  // as CatalogModule) so a hidden service can be found again and promoted
  // back to active, rather than disappearing once archived.
  const { data: productsData, loading, refetch } = useApi<{ products: Product[] }>(
    token ? '/api/products?includeSecondary=true' : null, token,
  )
  const { data: familiesData } = useApi<{ families: ProductFamily[] }>(
    token ? '/api/product-families' : null, token,
  )
  const { addToast } = useToast()

  const allServices = (productsData?.products ?? []).filter(p => SERVICE_ITEM_TYPES.includes(p.itemType))
  const hiddenCount = allServices.filter(p => p.status !== 'active').length
  const families = buildFamilyTree(familiesData?.families ?? [])

  const [showAdd, setShowAdd] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [editingService, setEditingService] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState({ ...BLANK_SERVICE_FORM })
  const [savingEdit, setSavingEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...BLANK_SERVICE_FORM })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const services = showHidden ? allServices : allServices.filter(p => p.status === 'active')
  const filteredServices = services.filter(s => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (s.name || '').toLowerCase().includes(q) ||
      (s.category || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
  })

  function openEdit(svc: Product) {
    setEditingService(svc)
    setEditForm({
      name: svc.name ?? '',
      itemType: svc.itemType ?? 'service',
      category: svc.category ?? '',
      description: svc.description ?? '',
      sellingPrice: svc.sellingPrice != null ? String(svc.sellingPrice) : '',
      currency: svc.currency ?? 'USD',
      pricingModel: svc.pricingModel ?? 'fixed',
      familyId: svc.familyId ?? '',
    })
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingService || !editForm.name.trim()) return
    setSavingEdit(true)
    try {
      await apiClient(`/api/products/${editingService.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({
          name: editForm.name.trim(),
          itemType: editForm.itemType,
          category: editForm.category || null,
          description: editForm.description || null,
          sellingPrice: editForm.sellingPrice ? parseFloat(editForm.sellingPrice) : null,
          currency: editForm.currency,
          pricingModel: editForm.pricingModel,
          familyId: editForm.familyId || null,
        }),
      })
      addToast({ variant: 'success', title: 'Service updated' })
      setEditingService(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save service' })
    } finally {
      setSavingEdit(false)
    }
  }

  async function setServiceStatus(svc: Product, status: 'active' | 'archived' | 'discontinued', label: string) {
    try {
      await apiClient(`/api/products/${svc.id}`, { method: 'PATCH', token, body: JSON.stringify({ status }) })
      addToast({ variant: 'success', title: `${svc.name} ${label}` })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? `Failed to ${label}` })
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await apiClient('/api/products', {
        method: 'POST', token,
        body: JSON.stringify({
          name: form.name.trim(),
          itemType: form.itemType,
          category: form.category || null,
          description: form.description || null,
          sellingPrice: form.sellingPrice ? parseFloat(form.sellingPrice) : null,
          currency: form.currency,
          pricingModel: form.pricingModel,
          trackInventory: false,
          familyId: form.familyId || null,
        }),
      })
      addToast({ variant: 'success', title: 'Service added' })
      setForm({ ...BLANK_SERVICE_FORM })
      setShowAdd(false)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add service' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient(`/api/products/${id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Service deleted' })
      setDeleteConfirm(null)
      setExpandedId(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-900">Services</p>
          <p className="text-xs text-gray-500">Things you deliver, not stock — consulting, development, subscriptions, packages.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {hiddenCount > 0 && (
            <Button
              variant={showHidden ? 'primary' : 'secondary'}
              onClick={() => setShowHidden(v => !v)}
              title="Archived or discontinued services are hidden from this list by default."
              className="min-h-[44px]"
            >
              {showHidden ? 'Hide' : 'Show'} archived ({hiddenCount})
            </Button>
          )}
          <Button onClick={() => setShowAdd(v => !v)} className="min-h-[44px]">
            <Plus className="w-4 h-4 mr-1.5" />
            Add service
          </Button>
        </div>
      </div>

      {/* Mobile-First Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search services by name, category, or description..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
          />
        </div>
      </div>

      {editingService && (
        <Modal open={!!editingService} onClose={() => setEditingService(null)} title={`Edit ${editingService.name}`}>
          <form onSubmit={handleSaveEdit} className="space-y-4 p-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input
                  required
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select
                  value={editForm.itemType}
                  onChange={e => setEditForm(f => ({ ...f, itemType: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="service">Service</option>
                  <option value="subscription">Subscription</option>
                  <option value="package">Package</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Pricing model</label>
                <select
                  value={editForm.pricingModel}
                  onChange={e => setEditForm(f => ({ ...f, pricingModel: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {PRICING_MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Category</label>
                <input
                  value={editForm.category}
                  onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {editForm.pricingModel === 'hourly' ? 'Hourly rate' : editForm.pricingModel === 'daily' ? 'Daily rate' : 'Base price'}
                </label>
                <input
                  type="number" min="0" step="0.01"
                  value={editForm.sellingPrice}
                  onChange={e => setEditForm(f => ({ ...f, sellingPrice: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Currency</label>
                <input
                  value={editForm.currency}
                  onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button type="button" variant="secondary" onClick={() => setEditingService(null)}>Cancel</Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-[1.75rem] border border-indigo-200 shadow-sm shadow-indigo-100/70 p-4 space-y-4">
          <p className="font-semibold text-gray-900 text-sm">New Service</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Web Development"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={form.itemType}
                onChange={e => setForm(f => ({ ...f, itemType: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="service">Service</option>
                <option value="subscription">Subscription</option>
                <option value="package">Package</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pricing model</label>
              <select
                value={form.pricingModel}
                onChange={e => setForm(f => ({ ...f, pricingModel: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PRICING_MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Development, Design, Consulting..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {form.pricingModel === 'hourly' ? 'Hourly rate' : form.pricingModel === 'daily' ? 'Daily rate' : 'Base price'}
              </label>
              <input
                type="number" min="0" step="0.01"
                value={form.sellingPrice}
                onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
                placeholder={form.pricingModel === 'quote' ? 'Leave blank — contact for quote' : '0.00'}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Currency</label>
              <input
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                placeholder="USD"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {families.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Product type / family</label>
                <select
                  value={form.familyId}
                  onChange={e => setForm(f => ({ ...f, familyId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {families.map(fam => <option key={fam.id} value={fam.id}>{fam.path ?? fam.name}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="What this service includes..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
              Save Service
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filteredServices.length === 0 ? (
        <EmptyState
          title={searchQuery ? "No matching services" : "No services yet"}
          description={searchQuery ? "Try refining your search terms." : "Add the things you deliver — consulting, development, subscriptions, packages."}
          action={!searchQuery ? <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1.5" />Add service</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredServices.map(svc => (
            <ServiceCard
              key={svc.id}
              service={svc}
              token={token}
              isExpanded={expandedId === svc.id}
              onToggle={() => setExpandedId(expandedId === svc.id ? null : svc.id)}
              onChanged={refetch}
              deleteConfirm={deleteConfirm === svc.id}
              onDeleteConfirm={() => setDeleteConfirm(svc.id)}
              onDeleteCancel={() => setDeleteConfirm(null)}
              onDelete={() => handleDelete(svc.id)}
              onEdit={() => openEdit(svc)}
              onArchive={() => setServiceStatus(svc, 'archived', 'archived')}
              onDiscontinue={() => setServiceStatus(svc, 'discontinued', 'discontinued')}
              onPromote={() => setServiceStatus(svc, 'active', 'promoted to active')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type ServiceTab = 'overview' | 'packages' | 'deliverables' | 'capacity' | 'workflow'

function ServiceCard({
  service, token, isExpanded, onToggle, onChanged,
  deleteConfirm, onDeleteConfirm, onDeleteCancel, onDelete,
  onEdit, onArchive, onDiscontinue, onPromote,
}: {
  service: Product
  token: string | undefined
  isExpanded: boolean
  onToggle: () => void
  onChanged: () => void
  deleteConfirm: boolean
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  onDelete: () => void
  onEdit: () => void
  onArchive: () => void
  onDiscontinue: () => void
  onPromote: () => void
}) {
  const [tab, setTab] = useState<ServiceTab>('overview')

  const TAB_LABELS: Record<ServiceTab, string> = {
    overview: 'Overview', packages: 'Packages & Pricing', deliverables: 'Deliverables',
    capacity: 'Capacity', workflow: 'Workflow',
  }

  return (
    <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{service.name}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="purple">{service.itemType.replace('_', ' ')}</Badge>
                {service.pricingModel && (
                  <Badge variant="default">{PRICING_MODEL_LABELS[service.pricingModel] ?? service.pricingModel}</Badge>
                )}
                {service.status === 'archived' && <Badge variant="default">archived</Badge>}
                {service.status === 'discontinued' && <Badge variant="error">discontinued</Badge>}
              </div>
              {service.description && <p className="text-xs text-gray-500 mt-1.5">{service.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-semibold text-gray-900">
              {service.sellingPrice != null ? formatCurrency(service.sellingPrice, service.currency) : 'Quote'}
            </span>
            <button onClick={onToggle} className="min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-400">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100">
          <div className="flex gap-1 overflow-x-auto px-4 pt-3">
            {(Object.keys(TAB_LABELS) as ServiceTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`shrink-0 min-h-11 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === 'overview' && <ServiceOverviewTab service={service} token={token} onChanged={onChanged} />}
            {tab === 'packages' && <ServicePackagesTab service={service} token={token} />}
            {tab === 'deliverables' && <ServiceChecklistsTab service={service} token={token} onChanged={onChanged} />}
            {tab === 'capacity' && <ServiceCapacityTab service={service} token={token} />}
            {tab === 'workflow' && <ServiceWorkflowTab service={service} token={token} />}
          </div>
          <div className="px-4 pb-4 pt-3 border-t border-gray-50 flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={onEdit}>
              <Edit2 className="w-3.5 h-3.5 mr-1" />
              Edit
            </Button>
            {service.status === 'active' ? (
              <>
                <Button size="sm" variant="secondary" onClick={onArchive}>
                  <Archive className="w-3.5 h-3.5 mr-1" />
                  Archive
                </Button>
                <Button size="sm" variant="secondary" onClick={onDiscontinue}>
                  <Ban className="w-3.5 h-3.5 mr-1" />
                  Discontinue
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={onPromote}>
                <Check className="w-3.5 h-3.5 mr-1" />
                Promote to active
              </Button>
            )}
            {deleteConfirm ? (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-gray-500">Delete this service?</span>
                <button onClick={onDelete} className="text-red-600 font-medium hover:underline">Yes</button>
                <button onClick={onDeleteCancel} className="text-gray-500 hover:underline">No</button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={onDeleteConfirm}>
                <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ServiceOverviewTab({ service, token, onChanged }: { service: Product; token: string | undefined; onChanged: () => void }) {
  const { addToast } = useToast()
  const [staff, setStaff] = useState<string>(service.serviceDetails?.staffAssignment ?? '')
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<string[]>(service.serviceDetails?.requiredCapabilities ?? [])
  const [startingProject, setStartingProject] = useState(false)

  async function saveDetails(next: Record<string, any>) {
    try {
      await apiClient(`/api/products/${service.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ serviceDetails: { ...service.serviceDetails, ...next } }),
      })
      onChanged()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save' })
    }
  }

  function addSkill() {
    const v = skillInput.trim()
    if (!v) return
    const next = [...skills, v]
    setSkills(next)
    setSkillInput('')
    saveDetails({ requiredCapabilities: next })
  }

  function removeSkill(s: string) {
    const next = skills.filter(x => x !== s)
    setSkills(next)
    saveDetails({ requiredCapabilities: next })
  }

  async function handleStartProject() {
    setStartingProject(true)
    try {
      const res = await apiClient<{ projectId: string; title: string; taskCount: number }>(
        `/api/products/${service.id}/start-project`, { method: 'POST', token },
      )
      addToast({ variant: 'success', title: `Project "${res.title}" created (${res.taskCount} tasks)` })
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to start project' })
    } finally {
      setStartingProject(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
          <Users2 className="w-3.5 h-3.5" /> Staff assignment
        </label>
        <input
          value={staff}
          onChange={e => setStaff(e.target.value)}
          onBlur={() => saveDetails({ staffAssignment: staff })}
          placeholder="Who delivers this service..."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-[11px] text-gray-400 mt-1">Free text for now — full team assignment is on the roadmap (docs/SERVICES_PROJECTS_PLAN.md, Part D).</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Skills / requirements</label>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {skills.map(s => (
            <Badge key={s} variant="default" removable onRemove={() => removeSkill(s)}>{s}</Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
            placeholder="Add a skill and press Enter"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <Button type="button" size="sm" variant="secondary" onClick={addSkill}>Add</Button>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-50">
        <Button onClick={handleStartProject} disabled={startingProject}>
          {startingProject ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <GitBranch className="w-4 h-4 mr-1.5" />}
          Start a project from this service
        </Button>
        <p className="text-[11px] text-gray-400 mt-1.5">Copies the workflow template below into a real project with one task per stage.</p>
      </div>
    </div>
  )
}

function ServicePackagesTab({ service, token }: { service: Product; token: string | undefined }) {
  const { data, loading, refetch } = useApi<{ tiers: PricingTier[] }>(
    token ? `/api/products/${service.id}/pricing-tiers` : null, token,
  )
  const { addToast } = useToast()
  const tiers = data?.tiers ?? []

  const [showAdd, setShowAdd] = useState(false)
  const [kind, setKind] = useState<'package' | 'milestone'>('package')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await apiClient(`/api/products/${service.id}/pricing-tiers`, {
        method: 'POST', token,
        body: JSON.stringify({
          kind, name: name.trim(),
          price: price ? parseFloat(price) : null,
          currency: service.currency,
          duration: duration || null,
        }),
      })
      setName(''); setPrice(''); setDuration(''); setShowAdd(false)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient(`/api/products/${service.id}/pricing-tiers/${id}`, { method: 'DELETE', token })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete' })
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <SkeletonCard />
      ) : tiers.length === 0 && !showAdd ? (
        <p className="text-xs text-gray-500">No packages or milestones yet.</p>
      ) : (
        <div className="space-y-2">
          {tiers.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{t.name} <span className="text-gray-400 font-normal">· {t.kind}</span></p>
                {t.duration && <p className="text-xs text-gray-500">{t.duration}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(t.price, t.currency)}</span>
                <button onClick={() => handleDelete(t.id)} className="min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <form onSubmit={handleAdd} className="rounded-xl border border-indigo-200 p-3 space-y-2 bg-indigo-50/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={kind}
              onChange={e => setKind(e.target.value as 'package' | 'milestone')}
              className="rounded-lg border border-gray-200 px-2 py-2.5 text-xs min-h-11"
            >
              <option value="package">Package</option>
              <option value="milestone">Milestone</option>
            </select>
            <input
              value={duration} onChange={e => setDuration(e.target.value)} placeholder="Duration (optional)"
              className="rounded-lg border border-gray-200 px-2 py-2.5 text-xs min-h-11"
            />
            <input
              required value={name} onChange={e => setName(e.target.value)} placeholder="Name"
              className="rounded-lg border border-gray-200 px-2 py-2.5 text-xs min-h-11 sm:col-span-2"
            />
            <input
              type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="Price"
              className="rounded-lg border border-gray-200 px-2 py-2.5 text-xs min-h-11 sm:col-span-2"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" className="!h-11" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" size="sm" className="!h-11" disabled={saving}>Add</Button>
          </div>
        </form>
      ) : (
        <Button size="sm" className="!h-11" variant="secondary" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add package / milestone
        </Button>
      )}
    </div>
  )
}

function ServiceChecklistsTab({ service, token, onChanged }: { service: Product; token: string | undefined; onChanged: () => void }) {
  const { addToast } = useToast()
  const [deliverables, setDeliverables] = useState<{ label: string; included: boolean }[]>(service.serviceDetails?.deliverables ?? [])
  const [requirements, setRequirements] = useState<{ label: string; type: string; required: boolean }[]>(service.serviceDetails?.requirements ?? [])
  const [newDeliverable, setNewDeliverable] = useState('')
  const [newRequirement, setNewRequirement] = useState('')

  async function persist(next: Record<string, any>) {
    try {
      await apiClient(`/api/products/${service.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ serviceDetails: { ...service.serviceDetails, ...next } }),
      })
      onChanged()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save' })
    }
  }

  function addDeliverable() {
    const v = newDeliverable.trim()
    if (!v) return
    const next = [...deliverables, { label: v, included: true }]
    setDeliverables(next); setNewDeliverable('')
    persist({ deliverables: next })
  }
  function removeDeliverable(i: number) {
    const next = deliverables.filter((_, idx) => idx !== i)
    setDeliverables(next)
    persist({ deliverables: next })
  }
  function addRequirement() {
    const v = newRequirement.trim()
    if (!v) return
    const next = [...requirements, { label: v, type: 'notes', required: true }]
    setRequirements(next); setNewRequirement('')
    persist({ requirements: next })
  }
  function removeRequirement(i: number) {
    const next = requirements.filter((_, idx) => idx !== i)
    setRequirements(next)
    persist({ requirements: next })
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5" /> Deliverables
        </p>
        <div className="space-y-1.5 mb-2">
          {deliverables.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg pl-2.5 pr-1 py-1">
              <span>{d.label}</span>
              <button onClick={() => removeDeliverable(i)} className="min-w-11 min-h-11 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newDeliverable}
            onChange={e => setNewDeliverable(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDeliverable() } }}
            placeholder="e.g. Source code"
            className="flex-1 rounded-lg border border-gray-200 px-2.5 py-2.5 text-xs min-h-11"
          />
          <Button type="button" size="sm" className="!h-11" variant="secondary" onClick={addDeliverable}>Add</Button>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Requirements from client
        </p>
        <div className="space-y-1.5 mb-2">
          {requirements.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg pl-2.5 pr-1 py-1">
              <span>{r.label}</span>
              <button onClick={() => removeRequirement(i)} className="min-w-11 min-h-11 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newRequirement}
            onChange={e => setNewRequirement(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRequirement() } }}
            placeholder="e.g. Signed contract"
            className="flex-1 rounded-lg border border-gray-200 px-2.5 py-2.5 text-xs min-h-11"
          />
          <Button type="button" size="sm" className="!h-11" variant="secondary" onClick={addRequirement}>Add</Button>
        </div>
      </div>
    </div>
  )
}

function ServiceCapacityTab({ service, token }: { service: Product; token: string | undefined }) {
  const { data, loading, refetch } = useApi<{ capacity: ServiceCapacityRow[] }>(
    token ? `/api/products/${service.id}/capacity` : null, token,
  )
  const { addToast } = useToast()
  const capacity = data?.capacity ?? []

  const [periodType, setPeriodType] = useState<'day' | 'week' | 'month' | 'ongoing'>('week')
  const [capacityUnit, setCapacityUnit] = useState<'hours' | 'slots' | 'bays' | 'seats' | 'staff' | 'days'>('slots')
  const [total, setTotal] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!total) return
    setSaving(true)
    try {
      await apiClient(`/api/products/${service.id}/capacity`, {
        method: 'PUT', token,
        body: JSON.stringify({ capacityUnit, periodType, totalCapacity: parseFloat(total) }),
      })
      setTotal('')
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save capacity' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {loading ? <SkeletonCard /> : capacity.length === 0 ? (
        <p className="text-xs text-gray-500">No capacity limits set — this service has unlimited availability.</p>
      ) : (
        <div className="space-y-2">
          {capacity.map(c => (
            <div key={c.id} className="rounded-xl border border-gray-100 px-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-900 capitalize">Per {c.periodType}</span>
                <span className="text-xs text-gray-500">{c.capacityUnit}</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full ${c.available <= 0 ? 'bg-red-500' : c.totalCapacity > 0 && c.booked / c.totalCapacity > 0.75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${c.totalCapacity > 0 ? Math.min(100, (c.booked / c.totalCapacity) * 100) : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">{c.booked} booked / {c.totalCapacity} total · {c.available} available</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-xl border border-gray-100 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Set capacity</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={periodType}
            onChange={e => setPeriodType(e.target.value as 'day' | 'week' | 'month' | 'ongoing')}
            className="rounded-lg border border-gray-200 px-2 py-2.5 text-xs min-h-11"
          >
            <option value="day">Per day</option>
            <option value="week">Per week</option>
            <option value="month">Per month</option>
            <option value="ongoing">Ongoing</option>
          </select>
          <select
            value={capacityUnit}
            onChange={e => setCapacityUnit(e.target.value as 'hours' | 'slots' | 'bays' | 'seats' | 'staff' | 'days')}
            className="rounded-lg border border-gray-200 px-2 py-2.5 text-xs min-h-11"
          >
            <option value="slots">Slots</option>
            <option value="hours">Hours</option>
            <option value="bays">Bays</option>
            <option value="seats">Seats</option>
            <option value="staff">Staff</option>
            <option value="days">Days</option>
          </select>
          <input
            type="number" min="0" value={total} onChange={e => setTotal(e.target.value)} placeholder="Total"
            className="rounded-lg border border-gray-200 px-2 py-2.5 text-xs min-h-11"
          />
        </div>
        <Button type="submit" size="sm" className="!h-11" disabled={saving}>Save</Button>
      </form>
    </div>
  )
}

function ServiceWorkflowTab({ service, token }: { service: Product; token: string | undefined }) {
  const { data, loading, refetch } = useApi<{ stages: WorkflowStage[] }>(
    token ? `/api/products/${service.id}/workflow-stages` : null, token,
  )
  const { addToast } = useToast()
  const [stages, setStages] = useState<WorkflowStage[]>([])
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (data && !initialized) {
      setStages(data.stages)
      setInitialized(true)
    }
  }, [data, initialized])

  function addStage() {
    setStages(s => [...s, { name: '', description: '', sortOrder: s.length }])
  }
  function updateStage(i: number, name: string) {
    setStages(s => s.map((st, idx) => idx === i ? { ...st, name } : st))
  }
  function removeStage(i: number) {
    setStages(s => s.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await apiClient(`/api/products/${service.id}/workflow-stages`, {
        method: 'PUT', token,
        body: JSON.stringify({
          stages: stages.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), description: s.description })),
        }),
      })
      addToast({ variant: 'success', title: 'Workflow saved' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save workflow' })
    } finally {
      setSaving(false)
    }
  }

  if (loading && !initialized) return <SkeletonCard />

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">This becomes the task list when you start a project from this service.</p>
      <div className="space-y-2">
        {stages.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}.</span>
            <input
              value={s.name} onChange={e => updateStage(i, e.target.value)} placeholder="Stage name"
              className="flex-1 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm min-h-11"
            />
            <button onClick={() => removeStage(i)} className="min-w-11 min-h-11 flex items-center justify-center shrink-0">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex justify-between flex-wrap gap-2">
        <Button type="button" size="sm" className="!h-11" variant="secondary" onClick={addStage}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add stage
        </Button>
        <Button type="button" size="sm" className="!h-11" onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
          Save workflow
        </Button>
      </div>
    </div>
  )
}

