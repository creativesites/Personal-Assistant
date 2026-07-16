import { apiClient } from './api'

// Zuri Neural Layer Phase 6 — Action Engine (docs/NEURAL_LAYER_PLAN.md
// §4.9/§10). Extracted out of action-bundle-card.tsx so the same
// {type, params} dispatch/label logic is available to any future consumer
// — most notably the separately planned, unchanged Automation Engine
// (PRODUCT_VISION.md Engine 9), which the plan calls out as sharing this
// same executor layer rather than growing its own copy. Action Engine
// bundles (system-detected, approved once) and Automation Engine workflows
// (user-designed, run indefinitely) stay two different systems — only the
// "how do I actually run a create_deal/reserve_stock/generate_document/
// reminder action" part is shared.

export interface BundleAction {
  type: 'create_deal' | 'reserve_stock' | 'generate_document' | 'reminder' | 'create_product' | 'create_supplier'
  params: string[]
  // Indices (into the same actions array) that must be 'done' before this
  // action can run — additive to Business OS Phase E's shipped shape, so a
  // consumer that ignores dependsOn still sees the same flat action list.
  dependsOn?: number[]
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  quotation: 'Quotation', invoice: 'Invoice', proposal: 'Proposal', contract: 'Contract',
}

export function actionLabel(action: BundleAction): string {
  switch (action.type) {
    case 'create_deal': {
      const [, , productName, quantity] = action.params
      return `Create deal — ${quantity}× ${productName}`
    }
    case 'reserve_stock': {
      const [, productName, quantity] = action.params
      return `Reserve ${quantity}× ${productName} in stock`
    }
    case 'generate_document': {
      const [documentType] = action.params
      return `Draft a ${DOCUMENT_TYPE_LABELS[documentType] ?? documentType}`
    }
    case 'reminder': {
      const [title, date] = action.params
      const formatted = (() => {
        try { return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
        catch { return date }
      })()
      return `Schedule reminder: ${title} (${formatted})`
    }
    case 'create_product': {
      const [name] = action.params
      return `Add "${name}" to catalog (secondary)`
    }
    case 'create_supplier': {
      const [company] = action.params
      return `Add supplier: ${company}`
    }
    default:
      return 'Unknown action'
  }
}

export async function executeAction(action: BundleAction, token: string): Promise<void> {
  switch (action.type) {
    case 'create_deal': {
      const [contactId, productId, productName, quantity] = action.params
      await apiClient('/api/deals', {
        method: 'POST', token,
        body: JSON.stringify({
          contactId,
          title: `Order: ${quantity}× ${productName}`,
          stage: 'proposal',
          productIds: [productId],
        }),
      })
      return
    }
    case 'reserve_stock': {
      const [productId, , quantity] = action.params
      await apiClient(`/api/products/${productId}/reserve`, {
        method: 'POST', token,
        body: JSON.stringify({ quantity: parseInt(quantity, 10), reason: 'Reserved for detected order' }),
      })
      return
    }
    case 'generate_document': {
      const [documentType, contactId, brief] = action.params
      const created = await apiClient<{ document: { id: string } }>('/api/documents/ai-generate', {
        method: 'POST', token,
        body: JSON.stringify({ contactId, documentType, instruction: brief }),
      })
      await apiClient(`/api/documents/${created.document.id}/generate`, { method: 'POST', token })
      return
    }
    case 'reminder': {
      const [title, date] = action.params
      await apiClient('/api/calendar/events', {
        method: 'POST', token,
        body: JSON.stringify({ title, eventDate: date, eventType: 'reminder' }),
      })
      return
    }
    case 'create_product': {
      const [name, category, estimatedPrice, currency] = action.params
      // Business Events Plan §6 — a chat-detected product starts as
      // 'secondary' (recorded, hidden from the main catalog by default),
      // not 'active'.
      await apiClient('/api/products', {
        method: 'POST', token,
        body: JSON.stringify({
          name,
          category: category || undefined,
          sellingPrice: estimatedPrice ? parseFloat(estimatedPrice) : undefined,
          currency: currency || undefined,
          status: 'secondary',
          trackInventory: false,
        }),
      })
      return
    }
    case 'create_supplier': {
      const [company] = action.params
      await apiClient('/api/suppliers', { method: 'POST', token, body: JSON.stringify({ company }) })
      return
    }
  }
}
