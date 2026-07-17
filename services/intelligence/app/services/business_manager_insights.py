"""Promotes Studio's passive, compute-on-read insights (GET /api/studio/insights's
lowStock/thinMargin/supplierFlags — see CLAUDE.md "Studio ERP") into durable,
business_manager_paused-gated business_events rows, so they surface in the
existing "Zuri Noticed" feed (and the Business Manager's own audit trail)
even for a user who never opens the Inventory/Pricing/Suppliers tabs that
day. Plain SQL, no LLM call — the exact thresholds Studio's insights query
already uses. Dedup is a NOT EXISTS against business_events itself within a
rolling window, the same discipline action_bundles.py/project_progress.py
already use, rather than a new marker table.
"""
import structlog

from ..database import get_pool
from .business_events import BusinessEventService

log = structlog.get_logger()

_business_events = BusinessEventService()
_DEDUP_WINDOW = "INTERVAL '7 days'"


class BusinessManagerInsightsService:
    async def generate_for_all_users(self) -> int:
        pool = await get_pool()
        created = 0

        async with pool.acquire() as conn:
            out_of_stock = await conn.fetch(
                f"""
                SELECT p.id, p.user_id, p.name
                FROM products p
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = p.user_id
                WHERE p.track_inventory AND p.available = 0
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.user_id = p.user_id AND be.event_type = 'low_stock_alert'
                      AND be.payload->>'productId' = p.id::text
                      AND be.created_at > NOW() - {_DEDUP_WINDOW}
                  )
                """
            )

            thin_margin = await conn.fetch(
                f"""
                SELECT p.id, p.user_id, p.name,
                       ROUND(((p.selling_price - p.purchase_cost) / p.selling_price) * 100, 1) AS margin_pct
                FROM products p
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = p.user_id
                WHERE p.selling_price IS NOT NULL AND p.selling_price > 0 AND p.purchase_cost > 0
                  AND ((p.selling_price - p.purchase_cost) / p.selling_price) * 100 < 15
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.user_id = p.user_id AND be.event_type = 'thin_margin_alert'
                      AND be.payload->>'productId' = p.id::text
                      AND be.created_at > NOW() - {_DEDUP_WINDOW}
                  )
                """
            )

            supplier_flags = await conn.fetch(
                f"""
                SELECT s.id, s.user_id, s.company, s.reliability_score, s.average_delivery_time
                FROM suppliers s
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = s.user_id
                WHERE (s.reliability_score < 80 OR s.average_delivery_time > 14)
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.user_id = s.user_id AND be.event_type = 'supplier_flag_alert'
                      AND be.payload->>'supplierId' = s.id::text
                      AND be.created_at > NOW() - {_DEDUP_WINDOW}
                  )
                """
            )

            # §5.3 — duplicate-contact detection. Plain SQL, no fuzzy-string
            # library: a normalized-phone match (last 9 digits) or an exact
            # case-insensitive name match between two distinct contacts for
            # the same user, same discipline as the Node-side
            # GET /api/contacts/duplicates this mirrors.
            duplicate_contacts = await conn.fetch(
                f"""
                SELECT a.id AS contact_a_id, a.user_id,
                       COALESCE(a.custom_name, a.display_name, a.phone_number) AS contact_a_name,
                       b.id AS contact_b_id,
                       COALESCE(b.custom_name, b.display_name, b.phone_number) AS contact_b_name
                FROM contacts a
                JOIN contacts b ON b.user_id = a.user_id AND b.id > a.id
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = a.user_id
                WHERE a.is_group = FALSE AND b.is_group = FALSE
                  AND a.merged_into_id IS NULL AND b.merged_into_id IS NULL
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                  AND (
                    (a.phone_number IS NOT NULL AND b.phone_number IS NOT NULL
                     AND LENGTH(REGEXP_REPLACE(a.phone_number, '\\D', '', 'g')) >= 9
                     AND RIGHT(REGEXP_REPLACE(a.phone_number, '\\D', '', 'g'), 9) =
                         RIGHT(REGEXP_REPLACE(b.phone_number, '\\D', '', 'g'), 9))
                    OR
                    (COALESCE(a.custom_name, a.display_name) IS NOT NULL
                     AND LOWER(TRIM(COALESCE(a.custom_name, a.display_name))) = LOWER(TRIM(COALESCE(b.custom_name, b.display_name))))
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM business_events be
                    WHERE be.user_id = a.user_id AND be.event_type = 'duplicate_contact_detected'
                      AND be.payload->>'contactAId' = a.id::text AND be.payload->>'contactBId' = b.id::text
                      AND be.created_at > NOW() - {_DEDUP_WINDOW}
                  )
                """
            )

            # §5.4 — repeat-enquiry / unmet-demand: 3+ distinct contacts have
            # shown interest (mentioned/interested/quoted) in a product that
            # nobody has actually bought yet. contact_products has one row
            # per (user, contact, product) — a purchase overwrites the same
            # row, so "zero purchases" is a clean NOT EXISTS, not a subtraction.
            unmet_demand = await conn.fetch(
                f"""
                SELECT cp.product_id, cp.user_id, p.name AS product_name,
                       COUNT(DISTINCT cp.contact_id) AS interested_count
                FROM contact_products cp
                JOIN products p ON p.id = cp.product_id
                LEFT JOIN advisor_user_profiles aup ON aup.user_id = cp.user_id
                WHERE cp.relation_type IN ('interested', 'quoted', 'mentioned')
                  AND COALESCE(aup.business_manager_paused, FALSE) = FALSE
                GROUP BY cp.product_id, cp.user_id, p.name
                HAVING COUNT(DISTINCT cp.contact_id) >= 3
                   AND NOT EXISTS (
                     SELECT 1 FROM contact_products cp2
                     WHERE cp2.product_id = cp.product_id AND cp2.user_id = cp.user_id
                       AND cp2.relation_type = 'purchased'
                   )
                   AND NOT EXISTS (
                     SELECT 1 FROM business_events be
                     WHERE be.user_id = cp.user_id AND be.event_type = 'unmet_demand_alert'
                       AND be.payload->>'productId' = cp.product_id::text
                       AND be.created_at > NOW() - {_DEDUP_WINDOW}
                   )
                """
            )

        for row in unmet_demand:
            await _business_events.record(
                str(row['user_id']), 'unmet_demand_alert', confidence=1.0,
                evidence=[f"{row['interested_count']} different contacts have shown interest in \"{row['product_name']}\", but none have bought it"],
                payload={'productId': str(row['product_id']), 'name': row['product_name'], 'interestedCount': row['interested_count']},
            )
            created += 1

        for row in duplicate_contacts:
            await _business_events.record(
                str(row['user_id']), 'duplicate_contact_detected', confidence=0.8,
                evidence=[f"\"{row['contact_a_name']}\" and \"{row['contact_b_name']}\" look like the same person"],
                payload={
                    'contactAId': str(row['contact_a_id']), 'contactAName': row['contact_a_name'],
                    'contactBId': str(row['contact_b_id']), 'contactBName': row['contact_b_name'],
                },
            )
            created += 1

        for row in out_of_stock:
            await _business_events.record(
                str(row['user_id']), 'low_stock_alert', confidence=1.0,
                evidence=[f"\"{row['name']}\" is out of stock (0 units available)"],
                payload={'productId': str(row['id']), 'name': row['name']},
            )
            created += 1

        for row in thin_margin:
            await _business_events.record(
                str(row['user_id']), 'thin_margin_alert', confidence=1.0,
                evidence=[f"\"{row['name']}\" is at a {row['margin_pct']}% margin, below the 15% threshold"],
                payload={'productId': str(row['id']), 'name': row['name'], 'marginPct': float(row['margin_pct'])},
            )
            created += 1

        for row in supplier_flags:
            flag = 'low_reliability' if row['reliability_score'] < 80 else 'slow_delivery'
            await _business_events.record(
                str(row['user_id']), 'supplier_flag_alert', confidence=1.0,
                evidence=[f"Supplier \"{row['company']}\" flagged: {flag.replace('_', ' ')}"],
                payload={'supplierId': str(row['id']), 'company': row['company'], 'flag': flag},
            )
            created += 1

        log.info('business_manager_insights_generated', count=created)
        return created
