# Zuri AI plan — replies that sound like the owner, and Networking

Status: agreed with the owner on 2026-11-28. Parts A (routing) and B (reply engine v3 and blind test) are built and live; the API is in `docs/AI_API.md`. Part C's warm list, warmth and keep-warm nudges are built server-side (`docs/AI_API.md`, Networking). Still to build: the CreativeSites growth coach and weekly review (Part C 3–4), and the app surfaces in Part D (in progress on Android).

Zuri is now the owner's own personal system, not a product for other users. Decisions below favour one person's quality over multi-tenant concerns.

## Owner decisions (2026-11-28)

| Topic | Decision |
|---|---|
| Privacy | Full chat history may go to the chosen cloud provider for **every** chat. The owner turns AI off per chat in the app. |
| Languages | English first. Local languages are used **sparingly**, as a fun touch. **Bemba and Nyanja** more often (the owner is learning both). **Shona** only in chats that already use Shona, and with the owner's girlfriend now and then. |
| Groups | Ignored entirely: no drafts, no analysis, no auto-replies. Same as today. |
| Networking | Replaces Career OS (shelved). Keeps important business contacts warm with a list and a warmth bar, and actively grows the owner's network to make **CreativeSites** (the owner's software company, being registered) succeed. |
| Cost | Quality over cost, always. Use the strongest model for anything the owner sees or sends. Spend is shown, never used to pick a weaker model. |

## Why current replies sound generic

`services/intelligence/app/services/reply_gen.py`:

- sees only the last **10 messages** of the chat;
- uses **one** writing style for every contact, built by `voice_builder.py` from one ~10,000-character sample across all chats;
- discards the owner's edits, so it never learns.

## Part A — AI providers and routing (server)

Builds on what exists: `byok_keys`, `/api/byok/*`, `ai/byok_resolver.py`, `ai/claude.py`, `ai/client.py`, `token_usage_logs`.

1. **Providers:** Anthropic, Google, OpenAI, plus **DeepSeek** (new). Keys are stored encrypted on the server, so web and phone share them.
2. **Per-job routing.** Each job has an ordered fallback chain, set in settings:

   | Job | Default chain |
   |---|---|
   | `reply_draft`, `auto_reply` | Claude Opus → Claude Sonnet → Gemini Pro → GPT → DeepSeek |
   | `chat_summary`, `catch_up` | Claude Sonnet → Gemini → GPT |
   | `analysis`, `extraction` | Claude Haiku → Gemini Flash → DeepSeek |
   | `networking_coach` | Claude Opus → Claude Sonnet |

   The phone's own model (Gemma, D-08) is the last link when offline or for chats marked private.
3. **Settings API:** `GET/PUT /api/ai/routing` (chains per job), key CRUD and test via the existing `/api/byok/*`.
4. **Visibility:** each reply records the model that wrote it. Spend per job and per month is shown, using `token_usage_logs`.

## Part B — Reply engine v3 (server)

For one incoming message, the server builds a context in layers, then writes the reply with the strongest model in the chain.

1. **Recent thread verbatim:** last 80 messages (or ~12k tokens), with quotes, reactions, media captions and voice-note transcripts.
2. **Whole-history summary:** a rolling summary per conversation, updated incrementally as messages arrive. It is never rebuilt from scratch on each reply.
3. **Relevant old moments:** semantic search over the whole chat (`message_analyses.embedding`, backfilled for every 1:1 message) for the 5–10 most relevant earlier exchanges.
4. **What Zuri knows:** contact facts, life events, open promises, unanswered questions, upcoming calendar items, and deals or projects for business contacts.
5. **Per-contact voice:**
   - **Examples:** 30–60 of the owner's real replies to *this* contact, each with the message it answered.
   - **Fingerprint:** computed by code, not the model. It records message length, how often a thought is split into several messages, emoji rate and which emoji, capitals or lowercase, punctuation, greetings and sign-offs, response style, and language mix.
   - **Language policy:** a per-contact allowance.
     - English is the base.
     - Bemba and Nyanja: occasional words or phrases, at most about one in four replies, a little more where the contact uses them.
     - Shona: only where the chat already contains Shona, or for the contact marked as partner.
     - Never invent phrases the owner hasn't used. Prefer phrases the owner has sent before, plus a small vetted list.
6. **Rules:**
   - **Never invent facts, plans or commitments.** When the reply depends on something only the owner knows, return a question with quick answers ("Coming Saturday?" Yes / No / Maybe) instead of a draft.
   - **Output** is 1–3 options. Each option is a list of messages, sent as separate messages when the owner splits thoughts.
   - **Groups** never reach the engine.
7. **Learning:** store draft-vs-sent pairs. The owner's edits become per-contact corrections included in later prompts.
8. **Blind test (the quality bar):**
   - Hold out the owner's real replies and generate replies for the same moments.
   - Score them on fingerprint distance and a judge model asked "which one is the real owner?"
   - The app gets a "spot the real me" game.
   - Target: the judge picks the real one ≤ 60% of the time, i.e. close to chance.
   - The test runs after every prompt or model change.
9. **Caching:** the stable per-contact block (summary, voice, facts) is cached with the provider's prompt cache. This is for speed, not cost.

Endpoint: `POST /api/conversations/:id/reply-drafts` returns `{ options: [{ messages: [string] }], question?: { text, answers[] }, model }`. Auto-replies (D-22) call the same engine.

## Part C — Networking (replaces Career OS)

Reuses the relationship graph, `relationships.health_score`, cadence learning and the introduction-path code built for Career OS. Career-specific features are shelved, not deleted.

1. **Warm list:**
   - Important business contacts, each with a **warmth bar**.
   - Warmth comes from recency against your usual rhythm with that person, who started the last contact, reply speed, tone trend and open promises.
   - Contacts are marked important by the owner, or suggested by Zuri.
2. **Keep-warm urging:**
   - A daily nudge for contacts cooling down.
   - Each nudge carries a ready draft in the owner's voice and a reason to reach out (their news, a past topic, a useful link).
   - Nudges escalate when the owner keeps skipping someone important.
3. **Grow the circle for CreativeSites:**
   - **Goal:** a networking goal linked to `goal_profiles`, e.g. "10 new decision-maker contacts a month".
   - **Who to meet:** Zuri suggests people to meet and how to reach them (warm introductions through existing contacts first).
   - **After a meeting:** a prompt to log the new contact and how you met, and a follow-up schedule.
   - **Who to talk to:** "who should I talk to about X?"
4. **Weekly networking review:** who warmed up, who went cold, new connections, and progress against the goal.

## Part D — App surfaces (Android session)

**Now (AI v1):**
- AI settings: keys, test, chains per job, spend view.
- In each chat:
  - reply options shown as message bubbles you can tap to send or edit;
  - the quick-answer question card;
  - "why this reply" (model, and which context it used).
- "What did I miss?" catch-up across unread chats.
- Ask Zuri about the open chat.
- Per-chat AI off switch.
- Partner marker on a contact (for Shona).
- Auto-reply (D-22) on the new engine.

**Next:** the warm list and warmth bars, keep-warm nudges, promise tracker, events added to the calendar, contact profiles, daily brief, voice-note transcripts.

**Later:** the networking growth coach and the weekly review UI, business tools, statuses, offline semantic search, audio replies in the owner's voice.

## Build order

1. Part A routing and settings (server), plus the settings screen (app).
2. Part B reply engine v3 and the blind test (server). The app shows drafts.
3. Part C warm list, warmth and nudges (server), plus the warm-list screen (app).
4. Part C growth coach and review.
