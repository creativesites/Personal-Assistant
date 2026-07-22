// Shared types and helpers used across more than one Studio module —
// pulled out so extracted module files (catalog-module.tsx,
// services-module.tsx, etc.) and studio/page.tsx don't duplicate them.
// See CLAUDE.md "File Architecture — Avoiding Monolithic Files".

export interface Product {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: string
  quantity: number
  status: string
  itemType: string
  sku: string | null
  barcode: string | null
  category: string | null
  brand: string | null
  stock: number
  available: number
  reserved: number
  minimumStock: number
  maximumStock: number | null
  sellingPrice: number | null
  purchaseCost: number
  margin: number | null
  leadTime: number
  supplierLeadTime: number
  supplierId: string | null
  warranty: string | null
  tags: string[]
  images: string[]
  videos: any[]
  discountRules: any[]
  crossSell: any[]
  upsell: any[]
  serviceDetails: Record<string, any>
  inventoryDetails: Record<string, any>
  pricingDetails: Record<string, any>
  aiNotes: string | null
  marketingCopy: string | null
  whatsappCatalogStatus: string
  whatsappCatalogProductId: string | null
  linkedContacts: number
  attributedLeads: number
  minPrice: number | null
  maxPrice: number | null
  discountMinPct: number
  discountMaxPct: number
  createdAt: string
  updatedAt: string
  // Business OS Phase A — configurable families & attributes
  familyId: string | null
  attributes: Record<string, any>
  parentProductId: string | null
  variantCount?: number
  incoming: number
  // Services Management System
  pricingModel: string | null
  trackInventory: boolean
}

export interface ProductFamily {
  id: string
  parentId: string | null
  name: string
  path: string | null
  sortOrder: number
}

export interface AttributeDefinition {
  id: string
  familyId: string
  key: string
  label: string
  dataType: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date'
  options: string[]
  isVariantAxis: boolean
  isRequired: boolean
  sortOrder: number
}

export interface Supplier {
  id: string
  company: string
  contact: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  averageDeliveryTime: number
  reliabilityScore: number
  minimumOrder: number
  paymentTerms: string | null
  outstandingBalance: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CoPurchase {
  productId: string
  productName: string | null
  confidencePct: number
}

export function marginColor(pct: number): string {
  if (pct < 15) return 'text-red-600'
  if (pct < 30) return 'text-amber-600'
  return 'text-green-600'
}

export function stockVariant(available: number, min: number): 'error' | 'warning' | 'success' {
  if (available <= min) return 'error'
  if (available <= min * 2) return 'warning'
  return 'success'
}

export function reliabilityVariant(score: number): 'error' | 'warning' | 'success' {
  if (score < 70) return 'error'
  if (score < 85) return 'warning'
  return 'success'
}

export function itemTypeBadgeVariant(type: string): 'default' | 'info' | 'success' | 'purple' | 'warning' {
  switch (type) {
    case 'product': return 'info'
    case 'service': return 'success'
    case 'bundle': return 'purple'
    case 'subscription': return 'warning'
    case 'digital_product': return 'default'
    default: return 'default'
  }
}

export function formatCurrency(amount: number | null | undefined, currency?: string): string {
  if (amount == null) return '—'
  try {
    const savedCurrency = typeof window !== 'undefined' ? localStorage.getItem('zuri_preferred_currency') || 'ZMW' : 'ZMW'
    const savedLocale = typeof window !== 'undefined' ? localStorage.getItem('zuri_preferred_locale') || 'en-ZM' : 'en-ZM'
    
    const activeCurrency = currency || savedCurrency
    return new Intl.NumberFormat(savedLocale, { style: 'currency', currency: activeCurrency }).format(amount)
  } catch {
    const activeCurrency = currency || 'ZMW'
    return `${activeCurrency} ${amount.toFixed(2)}`
  }
}

export function calcMargin(selling: number | null, cost: number): number | null {
  if (!selling || selling === 0) return null
  return ((selling - cost) / selling) * 100
}

export function familyDepth(f: ProductFamily): number {
  return f.path ? f.path.split('/').length - 1 : 0
}

export function buildFamilyTree(families: ProductFamily[]): ProductFamily[] {
  // Sort by path so parents always precede children — good enough for a
  // flat indented list without building an explicit tree structure.
  return [...families].sort((a, b) => (a.path ?? a.name).localeCompare(b.path ?? b.name))
}

// Services Management System — used by both the Catalog tab (non-tracked
// item badge) and the Services tab (pricing-model picker/badge).
export const PRICING_MODEL_LABELS: Record<string, string> = {
  fixed: 'Fixed price',
  hourly: 'Hourly',
  daily: 'Daily rate',
  subscription: 'Subscription',
  milestone: 'Milestone-based',
  quote: 'Quote required',
  recurring: 'Recurring',
}
