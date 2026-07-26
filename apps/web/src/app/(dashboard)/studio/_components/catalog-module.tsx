'use client'

import { useState, useRef } from 'react'
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
  Sparkles,
  RefreshCw,
  Check,
  X,
  Layers,
  MessageSquare,
  Upload,
  Image,
  Archive,
  Ban,
  FileText,
  PenTool,
  Send,
  Download,
  Search,
  User,
  Building2,
  DollarSign,
  TrendingUp,
  BarChart2,
  Target,
  ShieldAlert,
  Copy,
} from 'lucide-react'
import { SignaturePad } from '@/components/ui/signature-pad'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import DocumentPreviewModal from '@/components/documents/DocumentPreviewModal'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { uploadProductImage } from '@/lib/storage'
import {
  type Product, type ProductFamily, type AttributeDefinition, type Supplier, type CoPurchase,
  marginColor, stockVariant, itemTypeBadgeVariant, formatCurrency, calcMargin, familyDepth, buildFamilyTree,
  PRICING_MODEL_LABELS,
} from './shared'

// ─── Catalog Module ───────────────────────────────────────────────────────────

const CATALOG_FILTER_LIST = ['All', 'product', 'service', 'bundle', 'subscription', 'package', 'digital_product'] as const
type CatalogFilter = (typeof CATALOG_FILTER_LIST)[number]

// The single conditional Studio's inventory UI/insights/forecasts gate on
// (see docs/SERVICES_PROJECTS_PLAN.md §9) — a service/subscription/package/
// digital_product doesn't get Stock/Minimum Stock fields, low-stock badges,
// or reorder suggestions.
const TRACKS_INVENTORY_TYPES = ['product', 'bundle']

const FILTER_LABELS: Record<string, string> = {
  All: 'All',
  product: 'Products',
  service: 'Services',
  bundle: 'Bundles',
  subscription: 'Subscriptions',
  package: 'Packages',
  digital_product: 'Digital',
}

const BLANK_CATALOG_FORM = {
  name: '', itemType: 'product', sku: '', category: '', brand: '',
  description: '', sellingPrice: '', currency: 'USD', stock: '',
  minimumStock: '', purchaseCost: '', supplierId: '', warranty: '', tags: '',
  familyId: '',
}

function productToCatalogForm(p: Product): typeof BLANK_CATALOG_FORM {
  return {
    name: p.name ?? '',
    itemType: p.itemType ?? 'product',
    sku: p.sku ?? '',
    category: p.category ?? '',
    brand: p.brand ?? '',
    description: p.description ?? '',
    sellingPrice: p.sellingPrice != null ? String(p.sellingPrice) : '',
    currency: p.currency ?? 'USD',
    stock: p.stock != null ? String(p.stock) : '',
    minimumStock: p.minimumStock != null ? String(p.minimumStock) : '',
    purchaseCost: p.purchaseCost != null ? String(p.purchaseCost) : '',
    supplierId: p.supplierId ?? '',
    warranty: p.warranty ?? '',
    tags: (p.tags ?? []).join(', '),
    familyId: p.familyId ?? '',
  }
}

// ─── Product Families & Attributes (Business OS Phase A) ──────────────────────
// See docs/BUSINESS_OS_PLAN.md §5 — configurable "exactly like Odoo" custom
// attributes per product family, no code required. product_families is the
// user-defined hierarchy; product_attribute_definitions is the schema a
// family's products render fields from.

const ATTRIBUTE_TYPE_LABELS: Record<AttributeDefinition['dataType'], string> = {
  text: 'Text', number: 'Number', select: 'Single select',
  multiselect: 'Multi select', boolean: 'Yes/No', date: 'Date',
}


function DynamicAttributeFields({
  definitions, values, onChange,
}: { definitions: AttributeDefinition[]; values: Record<string, any>; onChange: (key: string, value: any) => void }) {
  if (definitions.length === 0) return null
  return (
    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-indigo-50/50 ring-1 ring-indigo-100 p-3">
      <p className="sm:col-span-2 text-xs font-semibold text-indigo-700 -mb-1">Type-specific attributes</p>
      {definitions.map(def => (
        <div key={def.key}>
          <label className="block text-xs text-gray-500 mb-1">
            {def.label}{def.isRequired ? ' *' : ''}
            {def.isVariantAxis && <span className="ml-1 text-indigo-500">(variant)</span>}
          </label>
          {def.dataType === 'boolean' ? (
            <select
              value={values[def.key] ?? ''}
              onChange={e => onChange(def.key, e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">—</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : def.dataType === 'select' ? (
            <select
              value={values[def.key] ?? ''}
              onChange={e => onChange(def.key, e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">—</option>
              {def.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : def.dataType === 'multiselect' ? (
            <select
              multiple
              value={Array.isArray(values[def.key]) ? values[def.key] : []}
              onChange={e => onChange(def.key, Array.from(e.target.selectedOptions).map(o => o.value))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {def.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={def.dataType === 'number' ? 'number' : def.dataType === 'date' ? 'date' : 'text'}
              value={values[def.key] ?? ''}
              onChange={e => onChange(def.key, e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
        </div>
      ))}
    </div>
  )
}

function ProductFamiliesManager({ token, onClose }: { token: string | undefined; onClose: () => void }) {
  const { data: familiesData, loading, refetch } = useApi<{ families: ProductFamily[] }>(
    token ? '/api/product-families' : null, token,
  )
  const families = buildFamilyTree(familiesData?.families ?? [])
  const { addToast } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [savingFamily, setSavingFamily] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { data: attrsData, refetch: refetchAttrs } = useApi<{ attributes: AttributeDefinition[] }>(
    token && selectedId ? `/api/product-families/${selectedId}/attributes` : null, token,
  )
  const attributes = attrsData?.attributes ?? []

  const [attrForm, setAttrForm] = useState({
    key: '', label: '', dataType: 'text' as AttributeDefinition['dataType'],
    options: '', isVariantAxis: false, isRequired: false,
  })
  const [savingAttr, setSavingAttr] = useState(false)

  async function addFamily(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSavingFamily(true)
    try {
      await apiClient('/api/product-families', {
        method: 'POST', token,
        body: JSON.stringify({ name: newName.trim(), parentId: newParentId || null }),
      })
      setNewName(''); setNewParentId('')
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add family' })
    } finally {
      setSavingFamily(false)
    }
  }

  async function renameFamily(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    try {
      await apiClient(`/api/product-families/${id}`, { method: 'PATCH', token, body: JSON.stringify({ name: renameValue.trim() }) })
      setRenamingId(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to rename' })
    }
  }

  async function deleteFamily(id: string) {
    try {
      await apiClient(`/api/product-families/${id}`, { method: 'DELETE', token })
      if (selectedId === id) setSelectedId(null)
      addToast({ variant: 'success', title: 'Product type deleted' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete' })
    }
  }

  async function addAttribute(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId || !attrForm.key.trim() || !attrForm.label.trim()) return
    setSavingAttr(true)
    try {
      await apiClient(`/api/product-families/${selectedId}/attributes`, {
        method: 'POST', token,
        body: JSON.stringify({
          key: attrForm.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
          label: attrForm.label.trim(),
          dataType: attrForm.dataType,
          options: attrForm.options ? attrForm.options.split(',').map(o => o.trim()).filter(Boolean) : [],
          isVariantAxis: attrForm.isVariantAxis,
          isRequired: attrForm.isRequired,
        }),
      })
      setAttrForm({ key: '', label: '', dataType: 'text', options: '', isVariantAxis: false, isRequired: false })
      refetchAttrs()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add attribute' })
    } finally {
      setSavingAttr(false)
    }
  }

  async function deleteAttribute(id: string) {
    try {
      await apiClient(`/api/product-attribute-definitions/${id}`, { method: 'DELETE', token })
      refetchAttrs()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete attribute' })
    }
  }

  const selectedFamily = families.find(f => f.id === selectedId) ?? null

  return (
    <Modal open onClose={onClose} title="Manage Product Types" description="Define your own product families and the custom attributes each one needs — no code required." size="full">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* Families tree */}
        <div className="md:col-span-2 space-y-3">
          <form onSubmit={addFamily} className="flex flex-col gap-2 bg-gray-50 rounded-xl p-3">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Clothing, Motor Spares..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <select
                value={newParentId}
                onChange={e => setNewParentId(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Top-level</option>
                {families.map(f => (
                  <option key={f.id} value={f.id}>{'—'.repeat(familyDepth(f))} {f.name}</option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={savingFamily}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </form>

          {loading ? (
            <SkeletonCard />
          ) : families.length === 0 ? (
            <p className="text-xs text-gray-500 px-1">No product types yet. Add one above — e.g. "Electronics" or "Clothing".</p>
          ) : (
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
              {families.map(f => (
                <div
                  key={f.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${selectedId === f.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                  style={{ paddingLeft: `${12 + familyDepth(f) * 16}px` }}
                  onClick={() => setSelectedId(f.id)}
                >
                  {renamingId === f.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onBlur={() => renameFamily(f.id)}
                      onKeyDown={e => { if (e.key === 'Enter') renameFamily(f.id) }}
                      className="flex-1 rounded border border-indigo-300 px-2 py-0.5 text-sm"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-gray-800 truncate">{f.name}</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setRenamingId(f.id); setRenameValue(f.name) }}
                    className="p-1 rounded hover:bg-white text-gray-400"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteFamily(f.id) }}
                    className="p-1 rounded hover:bg-white text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attribute definitions for the selected family */}
        <div className="md:col-span-3">
          {!selectedFamily ? (
            <EmptyState title="Select a product type" description="Pick a product type on the left to define its custom attributes (Size, Color, Vehicle Model, Prep Time...)." />
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-900">{selectedFamily.path}</p>

              {attributes.length > 0 && (
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                  {attributes.map(a => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">
                          {a.label} <span className="text-xs text-gray-400">({a.key})</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {ATTRIBUTE_TYPE_LABELS[a.dataType]}
                          {a.options.length > 0 ? `: ${a.options.join(', ')}` : ''}
                          {a.isVariantAxis ? ' · generates variants' : ''}
                          {a.isRequired ? ' · required' : ''}
                        </p>
                      </div>
                      <button onClick={() => deleteAttribute(a.id)} className="p-1.5 rounded hover:bg-gray-50 text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={addAttribute} className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Attribute name *</label>
                  <input
                    value={attrForm.label}
                    onChange={e => setAttrForm(f => ({ ...f, label: e.target.value, key: f.key || e.target.value }))}
                    placeholder="Color, Vehicle Model, Prep Time..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Field type</label>
                  <select
                    value={attrForm.dataType}
                    onChange={e => setAttrForm(f => ({ ...f, dataType: e.target.value as AttributeDefinition['dataType'] }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(ATTRIBUTE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {(attrForm.dataType === 'select' || attrForm.dataType === 'multiselect') && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Options (comma-separated)</label>
                    <input
                      value={attrForm.options}
                      onChange={e => setAttrForm(f => ({ ...f, options: e.target.value }))}
                      placeholder="Small, Medium, Large"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={attrForm.isVariantAxis} onChange={e => setAttrForm(f => ({ ...f, isVariantAxis: e.target.checked }))} />
                  Generates variants (e.g. Size, Color)
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={attrForm.isRequired} onChange={e => setAttrForm(f => ({ ...f, isRequired: e.target.checked }))} />
                  Required
                </label>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" size="sm" disabled={savingAttr}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add attribute
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// Attribute values + variant generation for a single product, shown inside
// the expanded catalog card. Variants are just `products` rows with
// parent_product_id set — no separate variants table (see
// docs/BUSINESS_OS_PLAN.md §5).
function ProductVariantsPanel({
  token, product, onChanged,
}: { token: string | undefined; product: Product; onChanged: () => void }) {
  const { addToast } = useToast()
  const { data: attrsData } = useApi<{ attributes: AttributeDefinition[] }>(
    token && product.familyId ? `/api/product-families/${product.familyId}/effective-attributes` : null, token,
  )
  const definitions = attrsData?.attributes ?? []
  const axisDefs = definitions.filter(a => a.isVariantAxis)

  const { data: variantsData, refetch: refetchVariants } = useApi<{ variants: Product[] }>(
    token && !product.parentProductId ? `/api/products/${product.id}/variants` : null, token,
  )
  const variants = variantsData?.variants ?? []

  const [axisInputs, setAxisInputs] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  if (product.parentProductId) return null // a variant itself has no sub-variants

  const attributeEntries = Object.entries(product.attributes ?? {}).filter(([, v]) => v !== '' && v != null)

  async function generateVariants() {
    const axisValues: Record<string, string[]> = {}
    for (const def of axisDefs) {
      const raw = axisInputs[def.key] ?? ''
      const values = raw.split(',').map(v => v.trim()).filter(Boolean)
      if (values.length > 0) axisValues[def.key] = values
    }
    if (Object.keys(axisValues).length !== axisDefs.length) {
      addToast({ variant: 'error', title: `Enter values for every variant attribute (${axisDefs.map(a => a.label).join(', ')})` })
      return
    }
    setGenerating(true)
    try {
      const res = await apiClient<{ variants: Product[] }>(`/api/products/${product.id}/generate-variants`, {
        method: 'POST', token, body: JSON.stringify({ axisValues }),
      })
      addToast({ variant: 'success', title: `Generated ${res.variants.length} variant${res.variants.length === 1 ? '' : 's'}` })
      setAxisInputs({})
      refetchVariants()
      onChanged()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to generate variants' })
    } finally {
      setGenerating(false)
    }
  }

  async function archiveVariant(id: string) {
    setArchivingId(id)
    try {
      await apiClient(`/api/products/${id}`, { method: 'PATCH', token, body: JSON.stringify({ status: 'archived' }) })
      refetchVariants()
      onChanged()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to remove variant' })
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {attributeEntries.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {attributeEntries.map(([key, value]) => {
            const def = definitions.find(d => d.key === key)
            return (
              <Badge key={key} variant="purple">
                {def?.label ?? key}: {Array.isArray(value) ? value.join(', ') : String(value)}
              </Badge>
            )
          })}
        </div>
      )}

      {variants.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Variants ({variants.length})</p>
          <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {variants.map(v => (
              <div key={v.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="flex-1 truncate text-gray-700">{v.name}</span>
                <span className="text-gray-400">{v.available} in stock</span>
                <button
                  onClick={() => archiveVariant(v.id)}
                  disabled={archivingId === v.id}
                  className="p-1 rounded hover:bg-gray-100 text-red-400"
                  title="Remove variant"
                >
                  {archivingId === v.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {axisDefs.length > 0 && (
        <div className="rounded-lg bg-indigo-50/50 ring-1 ring-indigo-100 p-3 space-y-2">
          <p className="text-xs font-semibold text-indigo-700">Generate variants</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {axisDefs.map(def => (
              <div key={def.key}>
                <label className="block text-xs text-gray-500 mb-1">{def.label} (comma-separated)</label>
                <input
                  value={axisInputs[def.key] ?? ''}
                  onChange={e => setAxisInputs(v => ({ ...v, [def.key]: e.target.value }))}
                  placeholder={def.options.length > 0 ? def.options.join(', ') : 'e.g. Small, Medium, Large'}
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={generateVariants} disabled={generating}>
              {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Layers className="w-3.5 h-3.5 mr-1" />}
              Generate
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// "Customers who bought this also bought..." — data-driven from real
// contact_products purchase history (Business OS Phase D, see
// docs/BUSINESS_OS_PLAN.md §9), distinct from the manually-curated
// products.crossSell/upsell arrays. Offers a one-click way to promote a
// data-driven pairing into an official cross-sell recommendation.
function CoPurchasesPanel({ token, product, onChanged }: { token: string | undefined; product: Product; onChanged: () => void }) {
  const { data } = useApi<{ coPurchases: CoPurchase[] }>(
    token ? `/api/products/${product.id}/co-purchases` : null, token,
  )
  const { addToast } = useToast()
  const coPurchases = data?.coPurchases ?? []
  const [savingId, setSavingId] = useState<string | null>(null)

  if (coPurchases.length === 0) return null

  async function addAsCrossSell(coProductId: string) {
    setSavingId(coProductId)
    try {
      const nextCrossSell = Array.from(new Set([...(product.crossSell ?? []), coProductId]))
      await apiClient(`/api/products/${product.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ crossSell: nextCrossSell }),
      })
      addToast({ variant: 'success', title: 'Added as cross-sell' })
      onChanged()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1.5">Frequently bought together</p>
      <div className="space-y-1.5">
        {coPurchases.map(cp => {
          const alreadyCrossSell = (product.crossSell ?? []).includes(cp.productId)
          return (
            <div key={cp.productId} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
              <span className="flex-1 truncate text-gray-700">{cp.productName}</span>
              <span className="text-gray-400">{cp.confidencePct}% of buyers</span>
              {alreadyCrossSell ? (
                <Badge variant="success">Cross-sell</Badge>
              ) : (
                <button
                  onClick={() => addAsCrossSell(cp.productId)}
                  disabled={savingId === cp.productId}
                  className="text-indigo-600 font-semibold hover:text-indigo-700 shrink-0"
                >
                  {savingId === cp.productId ? '...' : '+ Cross-sell'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CatalogModule({ token }: { token: string | undefined }) {
  const [showSecondary, setShowSecondary] = useState(false)
  // Business Events Plan §6 — always fetch including secondary items (a
  // one-off item recorded but hidden from the main grid by default) so the
  // toggle below is an instant client-side filter, not a refetch, and the
  // "(N)" count on the toggle button is always accurate.
  const { data: productsData, loading, refetch } = useApi<{ products: Product[] }>(
    token ? '/api/products?includeSecondary=true' : null, token,
  )
  const { data: suppliersData } = useApi<{ suppliers: Supplier[] }>(
    token ? '/api/suppliers' : null, token,
  )
  const { data: familiesData, refetch: refetchFamilies } = useApi<{ families: ProductFamily[] }>(
    token ? '/api/product-families' : null, token,
  )
  const { addToast } = useToast()

  const products  = productsData?.products  ?? []
  const suppliers = suppliersData?.suppliers ?? []
  const families  = buildFamilyTree(familiesData?.families ?? [])
  const secondaryCount = products.filter(p => p.status === 'secondary').length

  const [filter,         setFilter]         = useState<CatalogFilter>('All')
  const [showAdd,        setShowAdd]        = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showFamilies,   setShowFamilies]   = useState(false)
  const [expandedId,     setExpandedId]     = useState<string | null>(null)
  const [deleteConfirm,  setDeleteConfirm]  = useState<string | null>(null)
  const [generatingId,   setGeneratingId]   = useState<string | null>(null)
  const [syncingId,      setSyncingId]      = useState<string | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [form,           setForm]           = useState({ ...BLANK_CATALOG_FORM })
  const [attrValues,     setAttrValues]     = useState<Record<string, any>>({})
  const [uploadingImgId, setUploadingImgId] = useState<string | null>(null)
  const imgInputRef                         = useRef<HTMLInputElement>(null)
  const [imgTargetId,    setImgTargetId]    = useState<string | null>(null)

  // 30s Express Product Form & Guardrails State
  const [showFastAdd, setShowFastAdd] = useState(false)
  const [fastForm, setFastForm] = useState({ name: '', sellingPrice: '', purchaseCost: '', category: '', stock: '10' })
  const [showMarginWarning, setShowMarginWarning] = useState(false)
  const [pendingProductPayload, setPendingProductPayload] = useState<any>(null)

  // Bulk CSV Import State
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvParsed, setCsvParsed] = useState<Array<{ name: string; price: number; cost: number; stock: number; category: string }>>([])
  const [bulkImporting, setBulkImporting] = useState(false)

  // Quick Quotation Wizard & Sales Intelligence State
  const [quoteWizardOpen, setQuoteWizardOpen] = useState(false)
  const [selectedQuoteProduct, setSelectedQuoteProduct] = useState<Product | null>(null)
  const [salesIntelOpen, setSalesIntelOpen] = useState(false)
  const [selectedIntelProduct, setSelectedIntelProduct] = useState<Product | null>(null)

  const formOpen = showAdd || !!editingProduct

  function openEdit(p: Product) {
    setEditingProduct(p)
    setForm(productToCatalogForm(p))
    setAttrValues(p.attributes ?? {})
    setShowAdd(false)
  }

  function closeForm() {
    setShowAdd(false)
    setEditingProduct(null)
    setForm({ ...BLANK_CATALOG_FORM })
    setAttrValues({})
  }

  const { data: effectiveAttrsData } = useApi<{ attributes: AttributeDefinition[] }>(
    token && form.familyId ? `/api/product-families/${form.familyId}/effective-attributes` : null, token,
  )
  const formAttributeDefs = effectiveAttrsData?.attributes ?? []

  const visibleProducts = showSecondary ? products : products.filter(p => p.status !== 'secondary')
  const filtered = filter === 'All' ? visibleProducts : visibleProducts.filter(p => p.itemType === filter)

  async function promoteToActive(p: Product) {
    try {
      await apiClient(`/api/products/${p.id}`, { method: 'PATCH', token, body: JSON.stringify({ status: 'active' }) })
      addToast({ variant: 'success', title: `${p.name} promoted to active` })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to promote' })
    }
  }

  async function setStatus(p: Product, status: 'active' | 'archived' | 'discontinued', label: string) {
    try {
      await apiClient(`/api/products/${p.id}`, { method: 'PATCH', token, body: JSON.stringify({ status }) })
      addToast({ variant: 'success', title: `${p.name} ${label}` })
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
      const payload = {
        name:         form.name.trim(),
        itemType:     form.itemType,
        sku:          form.sku          || null,
        category:     form.category     || null,
        brand:        form.brand        || null,
        description:  form.description  || null,
        sellingPrice: form.sellingPrice ? parseFloat(form.sellingPrice) : null,
        currency:     form.currency,
        stock:        form.stock        ? parseInt(form.stock)          : 0,
        minimumStock: form.minimumStock ? parseInt(form.minimumStock)   : 0,
        purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : 0,
        supplierId:   form.supplierId   || null,
        warranty:     form.warranty     || null,
        tags:         form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        familyId:     form.familyId     || null,
        attributes:   attrValues,
      }
      if (editingProduct) {
        await apiClient(`/api/products/${editingProduct.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
        addToast({ variant: 'success', title: 'Item updated' })
      } else {
        await apiClient('/api/products', { method: 'POST', token, body: JSON.stringify(payload) })
        addToast({ variant: 'success', title: 'Item added' })
      }
      closeForm()
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save item' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient(`/api/products/${id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Item deleted' })
      setDeleteConfirm(null)
      setExpandedId(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete' })
    }
  }

  async function handleGenerate(id: string) {
    setGeneratingId(id)
    try {
      await apiClient(`/api/products/${id}/generate`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'AI content generated' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Generation failed' })
    } finally {
      setGeneratingId(null)
    }
  }

  async function handleWASync(id: string) {
    setSyncingId(id)
    try {
      await apiClient(`/api/products/${id}/whatsapp-catalog`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Synced to WhatsApp catalog' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'WA sync failed' })
    } finally {
      setSyncingId(null)
    }
  }

  async function handleImageUpload(file: File, product: Product) {
    setUploadingImgId(product.id)
    try {
      const url = await uploadProductImage(product.id, file)
      const newImages = [...(product.images ?? []), url]
      await apiClient(`/api/products/${product.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ images: newImages }),
      })
      addToast({ variant: 'success', title: 'Image uploaded' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Upload failed' })
    } finally {
      setUploadingImgId(null)
    }
  }

  async function handleRemoveImage(product: Product, imgUrl: string) {
    const newImages = product.images.filter(u => u !== imgUrl)
    try {
      await apiClient(`/api/products/${product.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ images: newImages }),
      })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to remove image' })
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs + Add button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 overflow-x-auto pb-1 flex-shrink-0 min-w-0">
          {CATALOG_FILTER_LIST.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
              }`}
              style={{ minHeight: '36px' }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 shrink-0">
          {secondaryCount > 0 && (
            <Button
              variant={showSecondary ? 'primary' : 'secondary'}
              onClick={() => setShowSecondary(v => !v)}
              title="A secondary item is recorded but hidden from the main catalog by default — e.g. a one-off part sourced for a single job."
            >
              {showSecondary ? 'Hide' : 'Show'} secondary ({secondaryCount})
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
                const res = await fetch(`${apiUrl}/api/studio/catalog/export-pdf`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                })
                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}))
                  throw new Error(errData.error || `HTTP ${res.status}`)
                }
                const html = await res.text()
                const win = window.open('', '_blank')
                if (win) {
                  win.document.write(html)
                  win.document.close()
                }
              } catch (e: any) {
                addToast({ variant: 'error', title: e.message || 'Failed to export catalog PDF' })
              }
            }}
          >
            <FileText className="w-4 h-4 mr-1.5" />
            PDF Catalog
          </Button>
          <Button variant="secondary" onClick={() => setShowFamilies(true)}>
            <Layers className="w-4 h-4 mr-1.5" />
            Product Types
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowBulkImport(true)}
            className="text-xs font-semibold"
          >
            <Upload className="w-3.5 h-3.5 mr-1" /> Bulk CSV Import
          </Button>

          <Button
            onClick={() => {
              setSelectedQuoteProduct(null)
              setQuoteWizardOpen(true)
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
          >
            <FileText className="w-3.5 h-3.5 mr-1" /> ⚡ Express Quote Wizard
          </Button>

          <Button
            onClick={() => setShowFastAdd(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> 30s Express Item
          </Button>

          <Button onClick={() => { closeForm(); setShowAdd(true) }} className="text-xs font-bold">
            <Plus className="w-3.5 h-3.5 mr-1" /> Full Product
          </Button>
        </div>
      </div>

      {showFamilies && (
        <ProductFamiliesManager
          token={token}
          onClose={() => { setShowFamilies(false); refetchFamilies() }}
        />
      )}

      {/* Add/Edit form */}
      {formOpen && (
        <form onSubmit={handleAdd} className="bg-white rounded-[1.75rem] border border-indigo-200 shadow-sm shadow-indigo-100/70 p-4 space-y-4">
          <p className="font-semibold text-gray-900 text-sm">{editingProduct ? `Edit ${editingProduct.name}` : 'New Catalog Item'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Product name"
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
                <option value="product">Product</option>
                <option value="service">Service</option>
                <option value="bundle">Bundle</option>
                <option value="subscription">Subscription</option>
                <option value="package">Package</option>
                <option value="digital_product">Digital Product</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKU</label>
              <input
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="SKU-001"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Electronics, Clothing..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Brand</label>
              <input
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                placeholder="Brand name"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Supplier</label>
              <select
                value={form.supplierId}
                onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No supplier</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.company}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Selling Price</label>
              <input
                type="number" min="0" step="0.01"
                value={form.sellingPrice}
                onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
                placeholder="0.00"
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
            {TRACKS_INVENTORY_TYPES.includes(form.itemType) && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Stock</label>
                  <input
                    type="number" min="0"
                    value={form.stock}
                    onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Minimum Stock</label>
                  <input
                    type="number" min="0"
                    value={form.minimumStock}
                    onChange={e => setForm(f => ({ ...f, minimumStock: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Purchase Cost</label>
              <input
                type="number" min="0" step="0.01"
                value={form.purchaseCost}
                onChange={e => setForm(f => ({ ...f, purchaseCost: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Warranty</label>
              <input
                value={form.warranty}
                onChange={e => setForm(f => ({ ...f, warranty: e.target.value }))}
                placeholder="12 months"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Product Type</label>
              <select
                value={form.familyId}
                onChange={e => { setForm(f => ({ ...f, familyId: e.target.value })); setAttrValues({}) }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">None (generic)</option>
                {families.map(f => (
                  <option key={f.id} value={f.id}>{'—'.repeat(familyDepth(f))} {f.name}</option>
                ))}
              </select>
            </div>
            <DynamicAttributeFields
              definitions={formAttributeDefs}
              values={attrValues}
              onChange={(key, value) => setAttrValues(v => ({ ...v, [key]: value }))}
            />
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe this item..."
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Tags (comma-separated)</label>
              <input
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="tag1, tag2, tag3"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
              {editingProduct ? 'Save Changes' : 'Save Item'}
            </Button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No catalog items yet"
          description="Add your first product or service to get started."
          action={<Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1.5" />Add item</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(p => {
            const isExpanded = expandedId === p.id
            const sv     = stockVariant(p.available, p.minimumStock)
            const margin = calcMargin(p.sellingPrice, p.purchaseCost)
            return (
              <div key={p.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                        <Badge variant={itemTypeBadgeVariant(p.itemType)}>
                          {p.itemType.replace('_', ' ')}
                        </Badge>
                        {p.status === 'secondary' && <Badge variant="purple">secondary</Badge>}
                        {p.status === 'archived' && <Badge variant="default">archived</Badge>}
                        {p.status === 'discontinued' && <Badge variant="error">discontinued</Badge>}
                      </div>
                      {p.category && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {p.category}{p.brand ? ` · ${p.brand}` : ''}
                        </p>
                      )}
                      {p.sku && <p className="text-xs text-gray-400 mt-0.5">SKU: {p.sku}</p>}
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(p.sellingPrice, p.currency)}
                    </span>
                    {p.trackInventory ? (
                      <Badge variant={sv}>
                        {sv === 'error' ? 'Low stock' : sv === 'warning' ? 'Limited' : 'In stock'} ({p.available})
                      </Badge>
                    ) : p.pricingModel ? (
                      <Badge variant="default">{PRICING_MODEL_LABELS[p.pricingModel] ?? p.pricingModel}</Badge>
                    ) : null}
                    {p.whatsappCatalogStatus && (
                      <Badge variant={p.whatsappCatalogStatus === 'synced' ? 'success' : 'default'}>
                        WA: {p.whatsappCatalogStatus}
                      </Badge>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-4">
                    {p.description && <p className="text-sm text-gray-600">{p.description}</p>}

                    {/* Images */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                        <Image className="w-3.5 h-3.5" />
                        Images
                      </p>
                      <div className="flex gap-2 flex-wrap items-start">
                        {p.images?.map(url => (
                          <div key={url} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => handleRemoveImage(p, url)}
                              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                            >
                              <X className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        ))}
                        <label
                          className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-400 flex flex-col items-center justify-center cursor-pointer transition-colors gap-1"
                          title="Upload image"
                        >
                          {uploadingImgId === p.id
                            ? <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />
                            : <>
                                <Upload className="w-4 h-4 text-gray-400" />
                                <span className="text-[10px] text-gray-400">Add</span>
                              </>
                          }
                          <input
                            type="file"
                            accept="image/*,video/*"
                            className="sr-only"
                            disabled={uploadingImgId === p.id}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (file) handleImageUpload(file, p)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-gray-500">Cost:</span> <span className="font-medium">{formatCurrency(p.purchaseCost, p.currency)}</span></div>
                      <div>
                        <span className="text-gray-500">Margin:</span>{' '}
                        <span className={`font-medium ${margin != null ? marginColor(margin) : ''}`}>
                          {margin != null ? `${margin.toFixed(1)}%` : '—'}
                        </span>
                      </div>
                      {p.trackInventory && (
                        <>
                          <div><span className="text-gray-500">Reserved:</span> <span className="font-medium">{p.reserved}</span></div>
                          <div><span className="text-gray-500">Min stock:</span> <span className="font-medium">{p.minimumStock}</span></div>
                        </>
                      )}
                      {p.warranty  && <div><span className="text-gray-500">Warranty:</span> <span className="font-medium">{p.warranty}</span></div>}
                      {p.leadTime > 0 && <div><span className="text-gray-500">Lead time:</span> <span className="font-medium">{p.leadTime}d</span></div>}
                      {(p.discountMinPct > 0 || p.discountMaxPct > 0) && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Discount range:</span>{' '}
                          <span className="font-medium text-amber-700">{p.discountMinPct}% – {p.discountMaxPct}%</span>
                        </div>
                      )}
                      {(p.minPrice != null || p.maxPrice != null) && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Price range:</span>{' '}
                          <span className="font-medium">{formatCurrency(p.minPrice, p.currency)} – {formatCurrency(p.maxPrice, p.currency)}</span>
                        </div>
                      )}
                    </div>

                    {p.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {p.tags.map(t => <Badge key={t} variant="default">{t}</Badge>)}
                      </div>
                    )}

                    <ProductVariantsPanel token={token} product={p} onChanged={refetch} />
                    <CoPurchasesPanel token={token} product={p} onChanged={refetch} />

                    {p.aiNotes && (
                      <div className="bg-indigo-50 rounded-lg p-3">
                        <p className="text-xs text-indigo-700 font-medium mb-1">AI Notes</p>
                        <p className="text-xs text-indigo-600">{p.aiNotes}</p>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                        onClick={() => {
                          setSelectedQuoteProduct(p)
                          setQuoteWizardOpen(true)
                        }}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" />
                        ⚡ Create Quote
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 font-bold"
                        onClick={() => {
                          setSelectedIntelProduct(p)
                          setSalesIntelOpen(true)
                        }}
                      >
                        <BarChart2 className="w-3.5 h-3.5 mr-1" />
                        📊 Sales Intelligence
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                        <Edit2 className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                      {(p.status === 'secondary' || p.status === 'archived' || p.status === 'discontinued') && (
                        <Button size="sm" variant="secondary" onClick={() => promoteToActive(p)}>
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Promote to active
                        </Button>
                      )}
                      {p.status === 'active' && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setStatus(p, 'archived', 'archived')}>
                            <Archive className="w-3.5 h-3.5 mr-1" />
                            Archive
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setStatus(p, 'discontinued', 'discontinued')}>
                            <Ban className="w-3.5 h-3.5 mr-1" />
                            Discontinue
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => handleGenerate(p.id)} disabled={generatingId === p.id}>
                        {generatingId === p.id
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                          : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                        Generate AI content
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleWASync(p.id)} disabled={syncingId === p.id}>
                        {syncingId === p.id
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                          : <MessageSquare className="w-3.5 h-3.5 mr-1" />}
                        Sync to WA catalog
                      </Button>
                      {deleteConfirm === p.id ? (
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="text-gray-500">Delete?</span>
                          <button onClick={() => handleDelete(p.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-gray-500 hover:underline">No</button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(p.id)}>
                          <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 30-SECOND EXPRESS PRODUCT CREATION MODAL */}
      <Modal
        open={showFastAdd}
        onClose={() => setShowFastAdd(false)}
        title="⚡ 30-Second Express Product Form"
        description="Add a new catalog item with required fields only in under 30 seconds."
      >
        <div className="space-y-4 text-sm pt-2">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Product Name *</label>
            <input
              type="text"
              value={fastForm.name}
              onChange={(e) => setFastForm({ ...fastForm, name: e.target.value })}
              placeholder="e.g. Wireless Bluetooth Earbuds"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Selling Price (ZMW) *</label>
              <input
                type="number"
                value={fastForm.sellingPrice}
                onChange={(e) => setFastForm({ ...fastForm, sellingPrice: e.target.value })}
                placeholder="250"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Purchase Cost (ZMW) *</label>
              <input
                type="number"
                value={fastForm.purchaseCost}
                onChange={(e) => setFastForm({ ...fastForm, purchaseCost: e.target.value })}
                placeholder="150"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <input
                type="text"
                value={fastForm.category}
                onChange={(e) => setFastForm({ ...fastForm, category: e.target.value })}
                placeholder="Electronics"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Initial Stock *</label>
              <input
                type="number"
                value={fastForm.stock}
                onChange={(e) => setFastForm({ ...fastForm, stock: e.target.value })}
                placeholder="10"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {fastForm.sellingPrice && fastForm.purchaseCost && (
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex justify-between items-center text-xs">
              <span className="font-medium text-indigo-700">Calculated Profit Margin:</span>
              <span className="font-bold text-indigo-900">
                {(calcMargin(parseFloat(fastForm.sellingPrice), parseFloat(fastForm.purchaseCost))?.toFixed(1) ?? '0.0')}%
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" size="sm" onClick={() => setShowFastAdd(false)}>Cancel</Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              onClick={async () => {
                if (!fastForm.name || !fastForm.sellingPrice) {
                  addToast({ title: 'Validation Error', description: 'Product name and selling price are required.', variant: 'error' })
                  return
                }

                const price = parseFloat(fastForm.sellingPrice)
                const cost = parseFloat(fastForm.purchaseCost) || 0
                const margin = calcMargin(price, cost)

                const payload = {
                  name: fastForm.name,
                  sellingPrice: price,
                  purchaseCost: cost,
                  category: fastForm.category || 'General',
                  stock: parseInt(fastForm.stock) || 0,
                  currency: 'ZMW',
                  itemType: 'product'
                }

                if (cost > 0 && margin != null && margin < 15) {
                  setPendingProductPayload(payload)
                  setShowMarginWarning(true)
                  return
                }

                try {
                  await apiClient('/api/products', { method: 'POST', token, body: JSON.stringify(payload) })
                  addToast({ title: 'Product Added', description: `${fastForm.name} saved successfully!`, variant: 'success' })
                  setShowFastAdd(false)
                  setFastForm({ name: '', sellingPrice: '', purchaseCost: '', category: '', stock: '10' })
                  refetch()
                } catch (e: any) {
                  addToast({ title: 'Error', description: e.message || 'Failed to add product', variant: 'error' })
                }
              }}
            >
              Save Product
            </Button>
          </div>
        </div>
      </Modal>

      {/* MARGIN GUARDRAIL WARNING MODAL */}
      <Modal
        open={showMarginWarning}
        onClose={() => setShowMarginWarning(false)}
        title="⚠️ Margin Guardrail Safety Warning"
      >
        <div className="space-y-4 text-sm pt-2">
          <p className="text-xs text-rose-700 font-semibold bg-rose-50 p-3 rounded-xl border border-rose-200">
            Warning: The calculated profit margin for this product is below the target 15% minimum safety threshold (or cost exceeds selling price).
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowMarginWarning(false)}>Cancel & Adjust Price</Button>
            <Button
              size="sm"
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              onClick={async () => {
                if (!pendingProductPayload) return
                try {
                  await apiClient('/api/products', { method: 'POST', token, body: JSON.stringify(pendingProductPayload) })
                  addToast({ title: 'Override Approved', description: 'Product saved with low-margin override.', variant: 'warning' })
                  setShowMarginWarning(false)
                  setShowFastAdd(false)
                  setPendingProductPayload(null)
                  refetch()
                } catch (e: any) {
                  addToast({ title: 'Error', description: e.message, variant: 'error' })
                }
              }}
            >
              Admin Override & Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* BULK CSV IMPORT MODAL */}
      <Modal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        title="📦 Bulk CSV Catalog Import"
        description="Paste CSV lines or upload a CSV catalog file to import multiple products at once."
      >
        <div className="space-y-4 text-sm pt-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-700">CSV Data Format: Name, SellingPrice, PurchaseCost, Category, Stock</span>
            <Button
              size="sm"
              variant="secondary"
              className="text-xs"
              onClick={() => {
                const sample = "Wireless Mouse, 250, 120, Electronics, 20\nMechanical Keyboard, 850, 500, Electronics, 15\nUSB-C Cable, 90, 35, Accessories, 50"
                setCsvText(sample)
              }}
            >
              Load Sample Data
            </Button>
          </div>

          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Name, SellingPrice, PurchaseCost, Category, Stock"
            className="w-full h-36 font-mono text-xs rounded-xl border border-gray-200 p-3 focus:ring-2 focus:ring-indigo-500"
          />

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowBulkImport(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={bulkImporting || !csvText.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              onClick={async () => {
                setBulkImporting(true)
                try {
                  const lines = csvText.trim().split('\n').filter(l => l.trim().length > 0)
                  let count = 0
                  for (const line of lines) {
                    const [name, price, cost, cat, stock] = line.split(',').map(s => s.trim())
                    if (!name || isNaN(parseFloat(price))) continue

                    await apiClient('/api/products', {
                      method: 'POST',
                      token,
                      body: JSON.stringify({
                        name,
                        sellingPrice: parseFloat(price) || 0,
                        purchaseCost: parseFloat(cost) || 0,
                        category: cat || 'Imported',
                        stock: parseInt(stock) || 0,
                        currency: 'ZMW',
                        itemType: 'product'
                      })
                    })
                    count++
                  }

                  addToast({ title: 'Import Complete', description: `Successfully imported ${count} items!`, variant: 'success' })
                  setShowBulkImport(false)
                  setCsvText('')
                  refetch()
                } catch (e: any) {
                  addToast({ title: 'Import Error', description: e.message || 'Failed to import CSV lines', variant: 'error' })
                } finally {
                  setBulkImporting(false)
                }
              }}
            >
              {bulkImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
              Import Items
            </Button>
          </div>
        </div>
      </Modal>

      {/* QUICK QUOTATION WIZARD MODAL */}
      {quoteWizardOpen && (
        <QuickQuoteWizardModal
          token={token}
          initialProduct={selectedQuoteProduct}
          onClose={() => {
            setQuoteWizardOpen(false)
            setSelectedQuoteProduct(null)
          }}
        />
      )}

      {/* PRODUCT SALES INTELLIGENCE MODAL */}
      {salesIntelOpen && selectedIntelProduct && (
        <ProductSalesIntelligenceModal
          token={token}
          product={selectedIntelProduct}
          onClose={() => {
            setSalesIntelOpen(false)
            setSelectedIntelProduct(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Quick Quotation Wizard Modal ─────────────────────────────────────────────

export function QuickQuoteWizardModal({
  token,
  initialProduct,
  onClose,
}: {
  token: string | undefined
  initialProduct?: Product | null
  onClose: () => void
}) {
  const { addToast } = useToast()
  const { data: contactsData } = useApi<{ contacts: any[] }>(token ? '/api/contacts' : null, token)
  const { data: sigsData } = useApi<{ signatures: any[] }>(token ? '/api/signatures' : null, token)

  const contacts = contactsData?.contacts || []
  const signatures = sigsData?.signatures || []

  const [mode, setMode] = useState<'quick' | 'ai'>('quick')
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [previewDocId, setPreviewDocId] = useState<string | null>(null)

  // Customer State
  const [contactId, setContactId] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactCompany, setContactCompany] = useState('')

  // Line Items
  const [lineItems, setLineItems] = useState<Array<{ name: string; quantity: number; unitPrice: number; description?: string }>>([
    initialProduct ? {
      name: initialProduct.name,
      quantity: 1,
      unitPrice: initialProduct.sellingPrice ?? 100,
      description: initialProduct.description || ''
    } : {
      name: 'Standard Product / Service',
      quantity: 1,
      unitPrice: 100,
      description: ''
    }
  ])

  // Signature
  const [useSignature, setUseSignature] = useState(true)
  const [selectedSignatureId, setSelectedSignatureId] = useState<string>('')
  const [drawnSignatureData, setDrawnSignatureData] = useState<string | null>(null)

  // AI & Polish
  const [termsNotes, setTermsNotes] = useState('Quote valid for 14 days. Payment terms: 50% upfront, 50% upon delivery.')
  const [isPolishing, setIsPolishing] = useState(false)

  // AI Generator Mode
  const [aiPrompt, setAiPrompt] = useState('')
  const [isAiGenerating, setIsAiGenerating] = useState(false)

  // Document creation
  const [isSubmitting, setIsSubmitting] = useState(false)

  const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  const tax = subtotal * 0.16
  const total = subtotal + tax

  const addItem = () => {
    setLineItems([...lineItems, { name: 'Additional Line Item', quantity: 1, unitPrice: 50 }])
  }

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  const removeItem = (index: number) => {
    if (lineItems.length <= 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const handleAiPolish = async () => {
    setIsPolishing(true)
    try {
      const res = await apiClient<{ reply: string }>('/api/advisor/chat', {
        method: 'POST',
        token,
        body: JSON.stringify({
          message: `Polish these quote payment terms and notes to sound highly professional, clear, and reassuring: "${termsNotes}"`
        })
      })
      if (res?.reply) {
        setTermsNotes(res.reply.replace(/['"]/g, ''))
        addToast({ title: 'Terms Polished', description: 'AI polished quote terms successfully.', variant: 'success' })
      }
    } catch {
      setTermsNotes('Quote valid for 14 banking days. Prompt payment guarantees expedited delivery and service continuity.')
    } finally {
      setIsPolishing(false)
    }
  }

  const handleAiGenerateQuote = async () => {
    if (!aiPrompt.trim()) {
      addToast({ title: 'Prompt Required', description: 'Describe what quote you want AI to generate.', variant: 'error' })
      return
    }
    setIsAiGenerating(true)
    try {
      const res = await apiClient<{ document: any }>('/api/documents/ai-generate', {
        method: 'POST',
        token,
        body: JSON.stringify({
          prompt: aiPrompt,
          documentType: 'quotation',
          contactId: contactId || undefined
        })
      })
      if (res?.document) {
        if (res.document.lineItems?.length) {
          setLineItems(res.document.lineItems.map((l: any) => ({
            name: l.description || l.name || 'Quotation Item',
            quantity: l.quantity || 1,
            unitPrice: l.unitPrice || l.amount || 100,
            description: l.notes || ''
          })))
        }
        if (res.document.terms) setTermsNotes(res.document.terms)
        setMode('quick')
        setStep(2)
        addToast({ title: 'Quote AI Generated', description: 'Review and confirm generated line items.', variant: 'success' })
      }
    } catch (e: any) {
      addToast({ title: 'Generation Error', description: e?.message || 'Failed to AI generate quote', variant: 'error' })
    } finally {
      setIsAiGenerating(false)
    }
  }

  const handleCreateDocument = async (action: 'download' | 'whatsapp') => {
    setIsSubmitting(true)
    try {
      const sigObj = useSignature ? signatures.find(s => s.id === selectedSignatureId) : null
      const sigData = useSignature ? (drawnSignatureData || sigObj?.signatureData || null) : null

      const created = await apiClient<{ document: { id: string } }>('/api/documents', {
        method: 'POST',
        token,
        body: JSON.stringify({
          documentType: 'quotation',
          templateKey: 'standard_quotation',
          contactId: contactId || undefined,
          title: `Quotation for ${contactName || contactCompany || 'Client'}`,
          notes: termsNotes,
          signatureData: sigData,
          signatureId: useSignature && selectedSignatureId ? selectedSignatureId : undefined,
          structuredData: {
            requireSignatures: useSignature,
            signingParties: useSignature ? 'provider' : 'none',
          },
          signerName: useSignature ? (sigObj?.signerName || 'Authorized Signatory') : undefined,
          signerTitle: useSignature ? (sigObj?.signerTitle || 'Managing Director') : undefined,
          items: lineItems.map(item => ({
            description: item.name,
            quantity: Number(item.quantity) || 1,
            unitPriceCents: Math.round((Number(item.unitPrice) || 0) * 100),
            discountPct: 0,
            taxPct: 0,
          }))
        })
      })

      const docId = created.document.id
      await apiClient(`/api/documents/${docId}/generate`, { method: 'POST', token }).catch(() => {})

      if (action === 'whatsapp') {
        const calcTotal = lineItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
        const text = encodeURIComponent(`Hi ${contactName || 'there'},\n\nHere is your official quotation for ${lineItems[0]?.name || 'services'}.\n\nTotal: ZMW ${calcTotal.toFixed(2)}\n\nYou can view and download your document here. Thank you for your business!`)
        const waUrl = contactPhone ? `https://wa.me/${contactPhone.replace(/[^0-9]/g, '')}?text=${text}` : `https://wa.me/?text=${text}`
        window.open(waUrl, '_blank')
        addToast({ title: 'Quotation Created', description: 'Opening WhatsApp & PDF Preview Modal...', variant: 'success' })
      } else {
        addToast({ title: 'Quotation Created', description: 'Opening Document PDF Preview...', variant: 'success' })
      }

      setPreviewDocId(docId)
    } catch (err: any) {
      addToast({ title: 'Error Creating Quote', description: err?.message || 'Could not generate quotation.', variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (previewDocId) {
    return (
      <DocumentPreviewModal
        open={!!previewDocId}
        onClose={() => {
          setPreviewDocId(null)
          onClose()
        }}
        documentId={previewDocId}
        token={token}
      />
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="⚡ Express Quotation Wizard"
      description="Generate, e-sign, and download professional client quotations in under 60 seconds."
      size="lg"
    >
      {/* Mode Switcher */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-4 text-xs font-bold">
        <button
          onClick={() => setMode('quick')}
          className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mode === 'quick' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText size={14} /> Quick Step Wizard
        </button>
        <button
          onClick={() => setMode('ai')}
          className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mode === 'ai' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles size={14} className="text-amber-500" /> ✨ AI Auto-Generate Quote
        </button>
      </div>

      {mode === 'ai' ? (
        <div className="space-y-4 pt-1">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-2xl border border-indigo-100">
            <label className="block text-xs font-extrabold text-indigo-950 mb-1.5">
              Describe Client Request & Scope
            </label>
            <textarea
              rows={4}
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="e.g. Client requested 5 High-Spec Laptops plus installation, 1-year support agreement, with 5% discount for bulk payment."
              className="w-full text-xs rounded-xl border border-indigo-200 p-3 focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              disabled={isAiGenerating || !aiPrompt.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5"
              onClick={handleAiGenerateQuote}
            >
              {isAiGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generate Quote with AI
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Step Indicator */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-xs">
            <span className={`font-bold ${step === 1 ? 'text-indigo-600' : 'text-slate-400'}`}>1. Contact & Brand</span>
            <span className={`font-bold ${step === 2 ? 'text-indigo-600' : 'text-slate-400'}`}>2. Line Items</span>
            <span className={`font-bold ${step === 3 ? 'text-indigo-600' : 'text-slate-400'}`}>3. E-Signature</span>
            <span className={`font-bold ${step === 4 ? 'text-indigo-600' : 'text-slate-400'}`}>4. Preview & Send</span>
          </div>

          {step === 1 && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Existing Contact</label>
                <select
                  value={contactId}
                  onChange={e => {
                    const cid = e.target.value
                    setContactId(cid)
                    const found = contacts.find(c => c.id === cid)
                    if (found) {
                      setContactName(found.name || '')
                      setContactEmail(found.email || '')
                      setContactPhone(found.phone || '')
                      setContactCompany(found.company || '')
                    }
                  }}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose CRM Contact or enter manually below --</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ''} - {c.phone || c.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full text-xs rounded-xl border border-slate-200 p-2 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Organization</label>
                  <input
                    type="text"
                    value={contactCompany}
                    onChange={e => setContactCompany(e.target.value)}
                    placeholder="e.g. Nexus Tech Ltd"
                    className="w-full text-xs rounded-xl border border-slate-200 p-2 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp / Phone</label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    placeholder="+260 971 234 567"
                    className="w-full text-xs rounded-xl border border-slate-200 p-2 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="sarah@nexustech.com"
                    className="w-full text-xs rounded-xl border border-slate-200 p-2 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <Button size="sm" onClick={() => setStep(2)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                  Next: Line Items →
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 pt-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700">Quotation Line Items</span>
                <Button size="sm" variant="secondary" onClick={addItem} className="text-xs">
                  <Plus size={12} className="mr-1" /> Add Line Item
                </Button>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6">
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => updateItem(idx, 'name', e.target.value)}
                          placeholder="Item Name"
                          className="w-full text-xs rounded-lg border border-slate-200 p-1.5 bg-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 1)}
                          placeholder="Qty"
                          className="w-full text-xs rounded-lg border border-slate-200 p-1.5 bg-white text-center"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                          placeholder="Price"
                          className="w-full text-xs rounded-lg border border-slate-200 p-1.5 bg-white"
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals Summary */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-bold">{formatCurrency(subtotal, 'ZMW')}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax (16%):</span>
                  <span className="font-bold">{formatCurrency(tax, 'ZMW')}</span>
                </div>
                <div className="flex justify-between text-indigo-950 font-black text-sm pt-1 border-t border-indigo-200/60">
                  <span>Total Amount:</span>
                  <span>{formatCurrency(total, 'ZMW')}</span>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button size="sm" variant="secondary" onClick={() => setStep(1)}>← Back</Button>
                <Button size="sm" onClick={() => setStep(3)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                  Next: E-Signature →
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Attach Official Brand E-Signature</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSignature}
                    onChange={e => setUseSignature(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  Include E-Signature
                </label>
              </div>

              {useSignature && (
                <div className="space-y-3">
                  {signatures.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Select Saved Signature</label>
                      <select
                        value={selectedSignatureId}
                        onChange={e => {
                          setSelectedSignatureId(e.target.value)
                          setDrawnSignatureData(null)
                        }}
                        className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white"
                      >
                        <option value="">-- Draw new signature below --</option>
                        {signatures.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.signerName} - {s.signerTitle})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {!selectedSignatureId && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Draw or Type Signature</label>
                      <SignaturePad onSave={dataUrl => setDrawnSignatureData(dataUrl)} height={160} />
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button size="sm" variant="secondary" onClick={() => setStep(2)}>← Back</Button>
                <Button size="sm" onClick={() => setStep(4)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                  Next: Terms & Preview →
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 pt-1">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700">Payment Terms & Notes</label>
                  <button
                    onClick={handleAiPolish}
                    disabled={isPolishing}
                    className="inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-600 hover:text-indigo-800"
                  >
                    {isPolishing ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} className="text-amber-500" />}
                    AI Polish Terms
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={termsNotes}
                  onChange={e => setTermsNotes(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Quote Summary Box */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2 text-xs shadow-lg">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-slate-300">Quotation Summary</span>
                  <span className="text-emerald-400 font-bold">{lineItems.length} Item(s)</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Client:</span>
                  <span className="text-white font-medium">{contactName || contactCompany || 'General Client'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Grand Total:</span>
                  <span className="text-emerald-400 font-extrabold text-sm">{formatCurrency(total, 'ZMW')}</span>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button size="sm" variant="secondary" onClick={() => setStep(3)}>← Back</Button>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isSubmitting}
                    onClick={() => handleCreateDocument('whatsapp')}
                    className="text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 font-bold"
                  >
                    <Send size={12} className="mr-1" /> Send via WA
                  </Button>
                  <Button
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => handleCreateDocument('download')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    {isSubmitting ? <RefreshCw size={12} className="animate-spin mr-1" /> : <Download size={12} className="mr-1" />}
                    Download PDF Quote
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ─── Product Sales Intelligence Modal ───────────────────────────────────────

export function ProductSalesIntelligenceModal({
  token,
  product,
  onClose,
}: {
  token: string | undefined
  product: Product
  onClose: () => void
}) {
  const { addToast } = useToast()
  const margin = calcMargin(product.sellingPrice, product.purchaseCost)
  const isHealthyMargin = margin != null && margin >= 30
  const isThinMargin = margin != null && margin < 15

  const copyToClipboard = (text: string, title: string) => {
    navigator.clipboard.writeText(text)
    addToast({ title: 'Copied to Clipboard', description: title, variant: 'success' })
  }

  const pitchWhatsapp = `Hi! 👋 We have the original ${product.name} in stock right now for ${formatCurrency(product.sellingPrice, product.currency)}. Limited units remaining! Would you like me to reserve one for you today?`
  const pitchValue = `Looking for top quality ${product.category || 'gear'}? ${product.name} offers unbeatable durability and official warranty (${product.warranty || 'Included'}). Price: ${formatCurrency(product.sellingPrice, product.currency)}. Shall I send over the official quotation?`

  return (
    <Modal
      open
      onClose={onClose}
      title={`📊 Sales Intelligence & Selling Coach — ${product.name}`}
      description="Deep AI analysis, objection handling, and high-converting pitch scripts to sell this product faster."
      size="lg"
    >
      <div className="space-y-4 pt-1">
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-indigo-50/80 border border-indigo-100 rounded-2xl text-center">
            <p className="text-[10px] font-bold text-indigo-700 uppercase">Selling Price</p>
            <p className="text-sm font-black text-indigo-950 mt-0.5">{formatCurrency(product.sellingPrice, product.currency)}</p>
          </div>
          <div className={`p-3 rounded-2xl text-center border ${
            isHealthyMargin ? 'bg-emerald-50/80 border-emerald-100' : isThinMargin ? 'bg-rose-50/80 border-rose-100' : 'bg-amber-50/80 border-amber-100'
          }`}>
            <p className={`text-[10px] font-bold uppercase ${
              isHealthyMargin ? 'text-emerald-700' : isThinMargin ? 'text-rose-700' : 'text-amber-700'
            }`}>Profit Margin</p>
            <p className={`text-sm font-black mt-0.5 ${
              isHealthyMargin ? 'text-emerald-950' : isThinMargin ? 'text-rose-950' : 'text-amber-950'
            }`}>{margin != null ? `${margin.toFixed(1)}%` : '—'}</p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
            <p className="text-[10px] font-bold text-slate-600 uppercase">Stock Velocity</p>
            <p className="text-sm font-black text-slate-900 mt-0.5">
              {product.stock > 10 ? '⚡ Grade A+' : product.stock > 0 ? '🟡 Grade B' : '⚠️ Restock'}
            </p>
          </div>
        </div>

        {/* Ideal Customer Persona */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-4 rounded-2xl space-y-1 text-xs">
          <p className="text-[10px] font-extrabold uppercase text-indigo-300">🎯 Ideal Customer Persona (ICP)</p>
          <p className="text-slate-200 leading-relaxed font-medium">
            Best suited for customers looking for high-reliability {product.category || 'solutions'}. They prioritize product quality, fast delivery, and official warranty over cheap unverified alternatives.
          </p>
        </div>

        {/* High Converting WhatsApp Pitch Scripts */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <MessageSquare size={14} className="text-emerald-600" /> High-Converting Pitch Scripts
          </p>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-extrabold text-slate-700">1. Fast Direct WhatsApp Pitch</span>
              <button
                onClick={() => copyToClipboard(pitchWhatsapp, 'WhatsApp pitch copied!')}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
              >
                <Copy size={12} /> Copy
              </button>
            </div>
            <p className="text-xs text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100">{pitchWhatsapp}</p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-extrabold text-slate-700">2. Value & Warranty Pitch</span>
              <button
                onClick={() => copyToClipboard(pitchValue, 'Value pitch copied!')}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
              >
                <Copy size={12} /> Copy
              </button>
            </div>
            <p className="text-xs text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100">{pitchValue}</p>
          </div>
        </div>

        {/* Top Objections & Counter Responses */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <ShieldAlert size={14} className="text-amber-600" /> Top Customer Objections & AI Responses
          </p>

          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs space-y-1">
            <p className="font-extrabold text-amber-950">Objection: "Can I get a discount or lower price?"</p>
            <p className="text-amber-900">
              <strong className="font-bold">AI Recommended Response:</strong> "Our price includes full warranty and official after-sales support. I can offer free delivery or throw in a complementary accessory if we complete the order today!"
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}
