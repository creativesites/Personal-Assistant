# Sync feed — server contract for device sync

The messaging slice of mobile backend item **G3** (`docs/mobile/IMPLEMENTATION_PLAN.md`), built to satisfy decision **D-21**. With sync on, a chat on the phone mirrors WhatsApp: the full thread, media, replies, reactions, deletes, edits and exact order.

- **Implementation:** `services/api/src/routes/sync.ts`
- **Schema:** `db/migrations/0137_sync_change_feed.sql`

All sync endpoints need `Authorization: Bearer <Zuri JWT>` (see "Sign-in" below for how a device gets one). None of them has side effects. In particular, none marks a chat as read, unlike the web inbox's message GET.

## Sign-in (G1)

The device signs in with the Clerk Android SDK, then exchanges its Clerk session token for a Zuri JWT. No shared secret is ever on the device.

### `POST /api/auth/clerk-exchange`
- **Header:** `Authorization: Bearer <Clerk session JWT>`, verified against the Clerk instance's JWKS.
- **Body:** `{ deviceId, deviceName?, platform?, email?, name? }`.
  - `deviceId`: 1–128 characters, stable for the install.
  - `platform` defaults to `android`.
- **Response:** `{ token, user, session: { id, deviceId } }`.
  - `user` has the same shape as clerk-sync's.
  - `token` is valid for 30 days. Its claims are `userId`, `isAdmin`, `orgId`, `sid` (device session id), `tv` (token version) and `jti`.
- **Re-exchange on any 401.** Re-exchanging from a live session keeps its token version, so other in-flight tokens for that device stay valid.
- **`email`/`name`** are used only when no Zuri account is linked to this Clerk user yet. They create a new account, and only if the email is unused. They never adopt an existing account: the email isn't verified by the token.

| Status | Meaning |
|---|---|
| 400 `invalid_body` | The body failed validation |
| 401 `invalid_clerk_session` | The Clerk token is missing, invalid or expired |
| 404 `no_account` | No linked account, and no email was sent |
| 409 | The email already has an account. Sign in on the web once to link it |

### Other endpoints

All three take the Zuri JWT as Bearer.

- **`POST /api/auth/logout`** revokes this device's session and returns 204. Every token issued to this device stops working at once. Web sessions are unaffected.
- **`GET /api/auth/devices`** lists the live device sessions: `{ devices: [{ id, deviceId, deviceName, platform, createdAt, lastExchangeAt, lastSeenAt, current }] }`.
- **`DELETE /api/auth/devices/:id`** revokes one device, for example a lost phone. It returns 204, or 404 if the session isn't yours.

### Where revocation applies

A device token is checked against `device_sessions` (migration 0138) on every request that sends it:

- Bearer requests;
- the Socket.io `authenticate` event;
- `?token=` on `/api/messages/:id/media`.

The check is cached for up to 30 s per server process. A revoke clears the cache.

## Model

Every insert or update of a **contact**, **conversation** or **message** takes the next number from one global sequence (`change_seq`). A reaction change re-publishes its message, because reactions travel inside the message. A hard delete writes a **tombstone** with its own number.

A device stores one opaque cursor and asks for everything after it.

**Writes commit in number order.** A statement-level advisory lock is taken before any synced row is written. So the changes a device sees always form a gap-free prefix, and advancing the cursor can never skip a change.

Changes are **whole-row upserts**, not diffs. Applying the same change twice is harmless. A device should ignore a change whose `seq` is lower than the `seq` it already stored for that id.

## Display order

```
ORDER BY timestamp ASC, order ASC      -- order compared as a 64-bit integer
```

- `timestamp` is WhatsApp's own message time, in ms. WhatsApp sends whole seconds, so ties are common.
- `order` is the server arrival number (`ingest_seq`), set once on insert and never changed. History batches are inserted oldest-first, so it follows WhatsApp's order within a second.
- Never order by sync time, capture time or `seq`. `seq` changes on every edit, tick or reaction.

## Endpoints

### `GET /api/sync/state`
```json
{ "head": "c1.48211", "serverTime": 1764000000000,
  "counts": { "conversations": 649, "messages": 44403, "contacts": 3120 } }
```
`head` is the cursor at "now" for this account.

### `GET /api/sync/changes?cursor=c1.48211&limit=500`
`limit` is 1–1000, default 500. With no cursor, the feed starts from the beginning.
```json
{
  "changes": [
    { "seq": "48212", "entity": "message", "op": "upsert", "id": "…", "data": { …Message } },
    { "seq": "48213", "entity": "conversation", "op": "upsert", "id": "…", "data": { …Conversation } },
    { "seq": "48214", "entity": "message", "op": "delete", "id": "…" },
    { "seq": "48215", "entity": "contact", "op": "delete", "id": "…", "data": { "mergedInto": "…" } }
  ],
  "cursor": "c1.48215",
  "hasMore": false
}
```
- Changes are sorted by `seq`. Store `cursor` once the page is applied.
- Keep calling while `hasMore` is true.
- `entity` is `contact`, `conversation` or `message`.
- `op: "delete"` covers three cases:
  - a hard delete (tombstone);
  - "delete for me" on a message;
  - a contact merged into another (`data.mergedInto`).
- A WhatsApp **delete-for-everyone** is *not* a delete. It is an upsert with `deleted: true`, so the bubble can show "This message was deleted".

### `GET /api/sync/conversations/:id/messages?before=<b1…>&limit=50`
`limit` is 1–200. This returns older history for one chat, one page at a time.
- The response is `{ messages: Message[], before, hasMore }`.
- `messages` are in display order, oldest first.
- Pass `before` back to get the next older page.
- With no `before`, you get the newest page.
- Ordering is exact: `(timestamp, order)` keyset paging, with no ties lost at page edges.

## Recommended device flow

1. **First sync.**
   - Call `/sync/state` and save `head` **before** importing anything.
   - Import contacts and conversations:
     - Full mode: page `/sync/changes` from no cursor until `hasMore` is false.
     - Light mode: take the newest page of each chat from the history endpoint.
   - Set the cursor to the saved `head`.
   - The overlap is safe, because changes are idempotent whole-row upserts.
2. **Ongoing.** Pull `/sync/changes?cursor=` when any of these happens:
   - the app comes to the foreground;
   - connectivity returns;
   - a Socket.io event arrives for the account (`message:new`, `message:status:update`, `message:reaction`, `message:changed`, `conversation:upsert`, `conversation:read`);
   - a periodic worker fires.

   FCM tickles come later (G7). Treat the socket payloads as **tickles only**. The feed is the source of truth.
3. **Scrolling up** past what's stored locally: use the history endpoint with the oldest local message's `before`. History doesn't need to come through the feed.
4. **Quotes whose original isn't stored locally.** Render from `quoted`, which is always self-contained. When a message whose `waMessageId` equals `quoted.waMessageId` arrives later, link them locally.

## Shapes

### Message
```ts
{
  id: string; conversationId: string; waMessageId: string;
  fromMe: boolean;
  sender: { jid: string | null; name: string | null } | null;   // groups
  type: 'text'|'image'|'video'|'audio'|'document'|'sticker'|'location'|'contact_card'|…;
  text: string | null;          // body / caption / contact-card name; null when deleted
  transcription: string | null; // voice notes, once transcribed
  timestamp: number;            // ms, WhatsApp time
  order: string;                // arrival tie-breaker (int64 as string)
  seq: string;                  // version: the change_seq of this row's latest change
  status: 'sending'|'sent'|'delivered'|'read'|'failed' | null;   // fromMe only
  deleted: boolean;             // WhatsApp delete-for-everyone
  editedAt: number | null;
  forwarded: boolean; starred: boolean; pinned: boolean; aiGenerated: boolean;
  quoted: {
    messageId: string | null;   // our id when the quoted message is stored
    waMessageId: string;
    fromMe: boolean | null;     // null when unknown
    senderName: string | null;
    type: string; text: string | null; deleted: boolean;
  } | null;
  media: {
    kind: 'image'|'video'|'audio'|'document'|'sticker';
    mime: string | null; size: number | null;
    width: number | null; height: number | null; seconds: number | null;
    voiceNote: boolean; roundVideo: boolean; gif: boolean; animated: boolean;
    fileName: string | null; pageCount: number | null;
    thumbnail: string | null;   // base64 JPEG, a few KB: show instantly, blur it
    available: boolean;         // false → show "media unavailable"
    path: string;               // GET with the Bearer header; supports Range
  } | null;
  location: { lat: number; lng: number; name: string | null; address: string | null } | null;
  reactions: { emoji: string; fromMe: boolean; reactorJid: string | null; at: number }[];  // one per person
}
```

### Conversation
```ts
{ id; contactId; chatJid; lastMessageAt: number | null; preview: string | null;
  unreadCount: number; archived: boolean; muted: boolean; pinned: boolean; pinnedAt: number | null }
```

### Contact
```ts
{ id; jid; phone: string | null; name: string | null; savedName: string | null; pushName: string | null;
  isGroup: boolean; isBusiness: boolean; hasAvatar: boolean;
  avatarTag: string | null;   // changes when the picture changes; equals the avatar ETag
  lastSeenAt: number | null }
```

### `GET /api/sync/contacts/:id/avatar`

Returns the contact's WhatsApp profile picture as `image/jpeg`. Send `If-None-Match: "<avatarTag>"` to get a 304 while it's unchanged; the response carries the `ETag`.

- Returns 404 `no_avatar` when the contact has no picture, or has hidden it from the owner. Show initials.
- Works for groups (`@g.us`) too: it returns the group's picture.
- **Coverage:** a background job fills the picture link for every chat with messages in the last 180 days, newest first. It runs every 6 hours, rechecks each contact after 3 days, and paces lookups at about one every 1.5 s. A contact it hasn't reached yet is looked up on its first request.
- The server caches the bytes. When WhatsApp's link has expired, the server fetches a fresh one and updates the contact, so the feed re-sends it.
- `avatarTag` is derived from the picture's path, not its expiring link parameters. It only changes when the picture itself changes. Refetch only when `avatarTag` changes.

## Media

- Download from `media.path` (`/api/messages/:id/media`) with the Bearer header.
- Range requests work, for streaming voice notes and video. Add `?download=1` for an attachment response.
- The first request for an older item can take a few seconds: the server fetches it from WhatsApp and asks the phone to re-upload it if WhatsApp's copy has expired.
- Thumbnails exist for media received after migration 0137. Older media has `thumbnail: null` until the item is downloaded.

## What the server captures now (as of 0137)

- **Reactions from contacts and from your own phone.** Previously only reactions made in Zuri were stored. History reactions are included.
- **Delete-for-everyone and edits.** Edits set `editedAt` and update `text`.
- **Quotes on every message type, history included.** Each quote stores the quoted WhatsApp id and a snapshot.
- **Media details:** dimensions, duration, voice-note flag, page count and the inline thumbnail.

## Not yet (later phases)

- **G4:** idempotent sends from the phone.
- **G5:** reconciling notification-captured messages with these rows.
- **G7:** FCM tickles.
- **Statuses and calls** are not synced.

## Scaling note

The write lock makes every write to `messages`, `conversations`, `contacts` and `message_reactions` run one transaction at a time across all accounts. These writes are milliseconds each, and a 500-row history chunk takes about a second. If write volume grows, move to per-account ordering or a logical-replication-based feed.
