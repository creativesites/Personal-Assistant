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
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await apiClient('/api/products', {
        method: 'POST', token,
        body: JSON.stringify({
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
        }),
      })
      addToast({ variant: 'success', title: 'Item added' })
      setForm({ ...BLANK_CATALOG_FORM })
      setAttrValues({})
      setShowAdd(false)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add item' })
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
          <Button variant="secondary" onClick={() => setShowFamilies(true)}>
            <Layers className="w-4 h-4 mr-1.5" />
            Product Types
          </Button>
          <Button onClick={() => setShowAdd(v => !v)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add item
          </Button>
        </div>
      </div>

      {showFamilies && (
        <ProductFamiliesManager
          token={token}
          onClose={() => { setShowFamilies(false); refetchFamilies() }}
        />
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-[1.75rem] border border-indigo-200 shadow-sm shadow-indigo-100/70 p-4 space-y-4">
          <p className="font-semibold text-gray-900 text-sm">New Catalog Item</p>
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
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setForm({ ...BLANK_CATALOG_FORM }); setAttrValues({}) }}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
              Save Item
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
                      {p.status === 'secondary' && (
                        <Button size="sm" variant="secondary" onClick={() => promoteToActive(p)}>
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Promote to active
                        </Button>
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
    </div>
  )
}
