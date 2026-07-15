// Advisor Companion Plan Phase 3 (docs/ADVISOR_COMPANION_PLAN.md §4.3/§5.3/
// §9) — shared shape for advisor_action_requests rows, used by both
// routes/conversations.ts (where a proposed action first gets persisted)
// and routes/advisor.ts (the approve/cancel/execute CRUD surface).

export function actionRequestApiShape(r: any) {
  return {
    id: r.id,
    actionType: r.action_type,
    status: r.status,
    payload: r.payload,
    riskLevel: r.risk_level,
    result: r.result ?? null,
    createdAt: r.created_at,
    approvedAt: r.approved_at ?? null,
    executedAt: r.executed_at ?? null,
  };
}
