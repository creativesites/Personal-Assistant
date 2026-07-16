"""Project-progress notifications (docs/SERVICES_PROJECTS_PLAN.md §11.7) —
a pragmatic stand-in for a generic Automation Engine (which doesn't exist
in this codebase yet — see docs/SERVICES_PROJECTS_PLAN.md Part D). Plain
SQL scan for two concrete, high-value crossings, deduped via project_events
(mirrors document_events' role for document_followups.py):

1. A milestone reaches `completed` with `requires_client_approval=true`
   and `approved_at IS NULL` — "ready for client approval."
2. A project's `done_task_count / task_count` crosses >=75% — the user's
   own worked example ("project reaches 75% -> notify client / prepare
   next invoice"), inserted as an approvable draft in the existing
   proactive dock, not auto-sent.

Deliberately not an AI call — same reasoning as document_followups.py:
whether a milestone is done and unapproved, or a ratio has crossed a
threshold, is a plain comparison, not something that needs an LLM to
determine honestly.
"""
import structlog

from ..database import get_pool
from .credits import try_consume_credit

log = structlog.get_logger()

_PROGRESS_THRESHOLD = 0.75


class ProjectProgressService:
    async def generate_for_all_users(self) -> int:
        pool = await get_pool()
        created = 0

        async with pool.acquire() as conn:
            milestones_ready = await conn.fetch(
                """
                SELECT pm.id, p.id AS project_id, p.user_id, p.contact_id, p.title AS project_title,
                       pm.title AS milestone_title,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                FROM project_milestones pm
                JOIN projects p ON p.id = pm.project_id
                JOIN contacts c ON c.id = p.contact_id
                WHERE pm.status = 'completed' AND pm.requires_client_approval = TRUE AND pm.approved_at IS NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM project_events pe
                    WHERE pe.project_id = p.id AND pe.event_type = 'milestone_approval_suggested'
                      AND pe.metadata->>'milestoneId' = pm.id::text
                  )
                """
            )

            projects_at_threshold = await conn.fetch(
                """
                SELECT p.id, p.user_id, p.contact_id, p.title,
                       COUNT(pt.id) AS task_count,
                       COUNT(pt.id) FILTER (WHERE pt.status = 'done') AS done_task_count,
                       COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                FROM projects p
                JOIN contacts c ON c.id = p.contact_id
                JOIN project_tasks pt ON pt.project_id = p.id
                WHERE p.status = 'active'
                  AND NOT EXISTS (
                    SELECT 1 FROM project_events pe
                    WHERE pe.project_id = p.id AND pe.event_type = 'progress_threshold_suggested'
                  )
                GROUP BY p.id, p.user_id, p.contact_id, p.title, c.custom_name, c.display_name, c.phone_number
                HAVING COUNT(pt.id) > 0
                   AND COUNT(pt.id) FILTER (WHERE pt.status = 'done')::float / COUNT(pt.id) >= $1
                """,
                _PROGRESS_THRESHOLD,
            )

            for row in milestones_ready:
                if not await try_consume_credit(row['user_id'], 'nudge'):
                    log.info('project_progress_skipped_no_credits', milestone_id=row['id'])
                    continue
                title = f"Milestone ready for approval: {row['milestone_title']}"
                body = (
                    f"{row['contact_name']}'s milestone \"{row['milestone_title']}\" on "
                    f"{row['project_title']} is complete and awaiting client approval."
                )
                draft = (
                    f"Hi {row['contact_name']}, the \"{row['milestone_title']}\" milestone on "
                    f"{row['project_title']} is complete — could you confirm you're happy with it?"
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, draft_message, priority,
                          status, suggested_for_date)
                       VALUES ($1, $2, 'follow_up', $3, $4, $5, 3, 'pending', CURRENT_DATE)""",
                    row['user_id'], row['contact_id'], title, body, draft,
                )
                await conn.execute(
                    """INSERT INTO project_events (project_id, event_type, metadata)
                       VALUES ($1, 'milestone_approval_suggested', jsonb_build_object('milestoneId', $2::text))""",
                    row['project_id'], str(row['id']),
                )
                created += 1

            for row in projects_at_threshold:
                if not await try_consume_credit(row['user_id'], 'nudge'):
                    log.info('project_progress_skipped_no_credits', project_id=row['id'])
                    continue
                pct = round(row['done_task_count'] / row['task_count'] * 100)
                title = f"Project {pct}% complete: {row['title']}"
                body = (
                    f"{row['contact_name']}'s project \"{row['title']}\" has crossed {pct}% task "
                    f"completion — consider notifying them or preparing the next invoice."
                )
                draft = (
                    f"Hi {row['contact_name']}, quick update — {row['title']} is now {pct}% complete. "
                    f"Let me know if you'd like a status call or the next invoice prepared."
                )
                await conn.execute(
                    """INSERT INTO proactive_queue
                         (user_id, contact_id, suggestion_type, title, body, draft_message, priority,
                          status, suggested_for_date)
                       VALUES ($1, $2, 'follow_up', $3, $4, $5, 3, 'pending', CURRENT_DATE)""",
                    row['user_id'], row['contact_id'], title, body, draft,
                )
                await conn.execute(
                    """INSERT INTO project_events (project_id, event_type, metadata)
                       VALUES ($1, 'progress_threshold_suggested', '{}'::jsonb)""",
                    row['id'],
                )
                created += 1

        log.info('project_progress_generated', count=created)
        return created
