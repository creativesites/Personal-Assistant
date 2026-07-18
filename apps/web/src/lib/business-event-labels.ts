// Shared label map for business_events rows — used by Studio's "Zuri
// Noticed" Overview card and the first-class /feed page (Platform Polish
// Phase 5, docs/PLATFORM_POLISH_PLAN.md §7.2) so the two surfaces never
// drift out of sync with two separately-maintained copies of this dict.
export const BUSINESS_EVENT_LABELS: Record<string, string> = {
  product_detected: 'New product detected',
  supplier_detected: 'New supplier detected',
  invoice_gap: 'No invoice on file',
  career_opportunity_detected: 'Career opportunity detected',
  // Zuri Reality Engine (docs/REALITY_ENGINE_PLAN.md §4/§8)
  nudge_auto_resolved: 'A nudge resolved itself',
  contradiction_invoice_paid_deal_open: 'Invoice paid, deal still open',
  contradiction_negative_inventory: 'Negative inventory detected',
  contradiction_project_complete_tasks_incomplete: 'Project complete, tasks pending',
  // Business Manager insight promotion (docs/PLATFORM_POLISH_PLAN.md §5.2)
  low_stock_alert: 'Out of stock',
  thin_margin_alert: 'Thin margin',
  supplier_flag_alert: 'Supplier flagged',
  duplicate_contact_detected: 'Possible duplicate contact',
  unmet_demand_alert: 'Unmet demand detected',
  dormant_customer_alert: 'Dormant customer',
  // Business Feed detectors (docs/PLATFORM_POLISH_PLAN.md §7.2)
  payment_posted: 'Payment received',
  milestone_invoice_paid: 'Invoice milestone',
  milestone_deal_closed: 'Deal milestone',
  project_completed: 'Project completed',
  repeat_product_mention: 'Repeat product mention',
  contact_gone_quiet: 'Contact gone quiet',
}

export function businessEventLabel(eventType: string): string {
  return BUSINESS_EVENT_LABELS[eventType] ?? eventType.replace(/_/g, ' ')
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`
  }
}

export function businessEventDetail(
  eventType: string,
  payload: Record<string, unknown> | null | undefined,
  contactName?: string | null,
): string | null {
  const p = payload ?? {}
  if (eventType === 'payment_posted' && typeof p.totalCents === 'number') {
    return `${formatMoney(p.totalCents, (p.currency as string) ?? 'USD')}${contactName ? ` from ${contactName}` : ''}`
  }
  return (p.name as string) ?? (p.company as string) ?? (p.title as string) ?? contactName ?? null
}
