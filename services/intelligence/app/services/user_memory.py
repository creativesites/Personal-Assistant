"""
User Memory v2 — mines suggested_replies outcomes (approved/dismissed/edited)
into a learned preference profile.

approval_rate and tone_acceptance are derivable today from the status/tone
columns that already existed. frequently_edited_words only starts producing
results once edited_text rows accumulate — that capture point (the approve
endpoint accepting an edited draft) didn't exist before this change, so this
signal is empty until real edits happen going forward.
"""

import re
import structlog
from ..database import get_pool

log = structlog.get_logger()

_LOOKBACK = 500
_MIN_TONE_SAMPLE = 3
_STOPWORDS = {
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'it',
    'i', 'you', 'we', 'me', 'my', 'your', 'that', 'this', 'be', 'with', 'at',
    'so', 'but', 'just', 'was', 'are', 'have', 'has',
}
_WORD_RE = re.compile(r"[a-zA-Z']+")
_ACCEPTED_STATUSES = {'approved', 'sent', 'edited_and_sent'}


class UserMemoryService:
    async def learn(self, user_id: str) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT sr.status, sr.tone, sr.suggestion_text, sr.edited_text
                FROM suggested_replies sr
                JOIN messages m ON m.id = sr.message_id
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.user_id = $1 AND sr.status != 'pending'
                ORDER BY sr.updated_at DESC
                LIMIT $2
                """,
                user_id, _LOOKBACK,
            )

        if not rows:
            return

        total = len(rows)
        accepted = sum(1 for r in rows if r['status'] in _ACCEPTED_STATUSES)
        approval_rate = round(accepted / total, 4)

        tone_counts: dict[str, dict[str, int]] = {}
        for r in rows:
            tone = r['tone'] or 'unspecified'
            bucket = tone_counts.setdefault(tone, {'accepted': 0, 'total': 0})
            bucket['total'] += 1
            if r['status'] in _ACCEPTED_STATUSES:
                bucket['accepted'] += 1
        tone_acceptance = {
            tone: round(b['accepted'] / b['total'], 4)
            for tone, b in tone_counts.items()
            if b['total'] >= _MIN_TONE_SAMPLE
        }

        removed_word_counts: dict[str, int] = {}
        for r in rows:
            if not r['edited_text']:
                continue
            original_words = set(_WORD_RE.findall(r['suggestion_text'].lower()))
            edited_words = set(_WORD_RE.findall(r['edited_text'].lower()))
            for word in original_words - edited_words:
                if word in _STOPWORDS or len(word) < 3:
                    continue
                removed_word_counts[word] = removed_word_counts.get(word, 0) + 1
        frequently_edited_words = [
            w for w, _ in sorted(removed_word_counts.items(), key=lambda kv: kv[1], reverse=True)[:10]
        ]

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO user_communication_profiles
                    (user_id, approval_rate, tone_acceptance, frequently_edited_words,
                     preferences_learned_at, updated_at)
                VALUES ($1, $2, $3, $4, NOW(), NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    approval_rate           = EXCLUDED.approval_rate,
                    tone_acceptance         = EXCLUDED.tone_acceptance,
                    frequently_edited_words = EXCLUDED.frequently_edited_words,
                    preferences_learned_at  = NOW(),
                    updated_at              = NOW()
                """,
                user_id, approval_rate, tone_acceptance, frequently_edited_words,
            )

        log.info(
            'user_memory_learned', user_id=user_id, approval_rate=approval_rate,
            sample_size=total, edited_words=len(frequently_edited_words),
        )
