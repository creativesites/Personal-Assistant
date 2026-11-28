# AI API — reply drafts and model routing

Server contract for the AI features in `docs/ZURI_AI_PLAN.md` (Parts A and B).

- **Engine:** `services/intelligence/app/reply/` (context, composer, summary, engine, blind_test) and `services/intelligence/app/ai/router.py`.
- **HTTP:** `services/api/src/routes/reply-drafts.ts`.
- **Schema:** `db/migrations/0139_ai_routing_reply_v3.sql`.

All endpoints take `Authorization: Bearer <Zuri JWT>`. Device tokens work (see `docs/SYNC_FEED.md`).

## Reply drafts

### `POST /api/conversations/:id/reply-drafts`

Drafts the owner's next reply to the messages they haven't answered yet in a 1:1 chat.

**Body (all optional):**
- `answer: { questionId, text }` answers the engine's question from an earlier draft.
- `instruction` is a steer such as "warmer" or "say I'll call later".

A typical call takes 8–15 s.

```json
{
  "draftId": "uuid",
  "model": "anthropic/claude-opus-5-5",
  "noReplyNeeded": false,
  "needsOwnerReason": null,
  "question": { "id": "uuid", "text": "Are you coming Saturday?", "answers": ["Yes", "No", "Not sure yet"] },
  "options": [
    { "id": "uuid", "messages": ["haha ok", "see you then"],
      "parts": [{ "text": "haha ok", "quoting": null }, { "text": "see you then", "quoting": null }],
      "tone": "casual", "why": "answers the plan" }
  ],
  "answering": ["the unanswered messages, as the engine read them"]
}
```

**Options**
- Up to 3. The first is the one the owner is most likely to send.
- Each option is **1–3 WhatsApp messages**. Send them in order, as separate messages.
- `parts[i].quoting` is set when that message should quote (swipe-to-reply) an earlier message. It holds the quoted text. The web client resolves the quote by message; on the phone, the text can be shown as context.

**Question**
- `question` appears when the reply depends on something only the owner knows.
- Show it as a quick-answer card. The options are still safe holding replies.
- When the owner taps an answer, call the same endpoint with `{ "answer": { "questionId": question.id, "text": "<answer>" } }`. That returns a fresh draft that uses the answer.

**`info`**
- With nothing to reply to, you get `{ "draftId": null, "options": [], "info": "nothing_unanswered" }`.
- Other `info` values: `newer_message_will_handle_it`, `no_response_needed`.

| Status | Meaning |
|---|---|
| 404 `not_found` | The conversation isn't the owner's |
| 409 `ai_off` | AI is switched off for this chat |
| 422 `group_chat` | Groups are never drafted for |
| 502 `engine_unavailable` / `all_models_failed` | Every model in the chain failed; `attempts` says why |

### `POST /api/reply-drafts/:draftId/outcome`

Report what the owner did. The engine learns from edits.

```json
{ "optionId": "uuid", "outcome": "sent" | "edited" | "dismissed", "sentMessages": ["what was actually sent"] }
```

- `sent` and `edited` need `optionId`. `edited` also needs `sentMessages`.
- `dismissed` can omit `optionId`; it dismisses the whole draft.
- Returns 204, or 404 for an unknown draft or option.

Sending itself goes through the normal send endpoint (`POST /api/conversations/:id/messages`), or through WhatsApp on the phone. Report the outcome after the send.

### Live drafts

- For every live incoming 1:1 message, the server also drafts on its own, after a 20 s debounce. It stores the draft in `suggested_replies`, together with its `draft_id`, `model` and `owner_question`.
- It publishes `suggestion:ready` over Socket.io.
- Auto-reply chats (decision D-22) use the `auto_reply` job's chain.

## Per-chat switch and partner marker

- **`aiEnabled`:** `PATCH /api/conversations/:id` with `{ "aiEnabled": false }` turns drafts and auto-replies off for that chat. It also dismisses pending drafts.
  - It appears as `aiEnabled` on the Conversation shape in `/api/sync/changes`, and defaults to `true`.
- **`isPartner`:** `PATCH /api/contacts/:id` with `{ "isPartner": true }` marks the owner's partner, so the engine may use Shona there now and then.
  - It appears as `isPartner` on the Contact shape.

## Model routing

Each job has an ordered fallback chain. The first model that answers wins.

**Keys:** the owner's own key for a provider (`/api/byok/keys`) is used first, then the system key. A model with no key is skipped.

| Job | Default chain |
|---|---|
| `reply_draft`, `auto_reply` | claude-opus-5-5 → claude-sonnet-5-5 → gemini-4-hydrogen → gemini-pro-latest → gpt-5 → deepseek-chat |
| `chat_summary` | claude-sonnet-5-5 → gemini-4-hydrogen → gemini-pro-latest → gpt-5 |
| `analysis` | claude-haiku-5-5 → gemini-3.6-flash → deepseek-chat |
| `networking_coach` | claude-opus-5-5 → claude-sonnet-5-5 → gemini-4-hydrogen → gemini-pro-latest |

Model ids carry a provider prefix: `anthropic/`, `gemini/`, `openai/` or `deepseek/`.

- **`GET /api/ai/routing`** returns `{ jobs: [{ job, chain, isDefault }], defaults }`.
- **`PUT /api/ai/routing`** sets one job's chain with `{ "job": "reply_draft", "chain": ["anthropic/claude-opus-5-5", "gemini/gemini-4-hydrogen"] }`. `{ "job": "reply_draft", "reset": true }` goes back to the default. Returns 204.
- **`POST /api/ai/routing/test`** takes `{ "models": [...] }` and makes one tiny call per model. It returns `{ results: [{ model, ok, error, ms, byok }] }`. Use it for a "Test" button per chain link. `error: "no key"` means no key is set for that provider.
- **Spend:** see `GET /api/ai/analytics` and `GET /api/diagnostics/token-usage`. Each routed call is logged under its job name as the `feature`.

## Blind test (quality bar)

`POST /api/ai/blind-test` takes `{ "samples": 20, "chain"?: [...], "includeTexts"?: false }`.

1. It picks real moments where the owner replied.
2. It rewinds each chat to just before that reply and drafts one.
3. It asks Claude Opus which of the two (shuffled) replies is the real one.

**Reading the result**
- It returns `judgePickedRealRate`. A rate of 0.5 means the drafts can't be told apart. The target is ≤ 0.6.
- Moments where the engine asked the owner a question aren't judged.
- The call takes 1–3 minutes.

**Results on 2026-11-28 (owner's account)**
- **Claude Opus:** 0.90 at first. After tuning the voice rules it was **0.65** over 23 judged moments; one draft was identical to the real reply.
- **Gemini 4 Hydrogen:** 1.0 over 8 judged moments. It also asked the owner far more often.
