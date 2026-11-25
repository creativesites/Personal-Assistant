# Golden notification fixtures

Each file holds one `NotificationSnapshot` and the exact parse the adapter must produce.

**Most are synthetic.** Files whose `comment` says so (e.g. `whatsapp_media_s20.json`) copy the structure of a real notification from the owner's test phone, with invented names and text. They follow the formats documented in `docs/mobile/ANDROID_FEASIBILITY.md` §2
and use invented names. The M0 notification spike replaces and extends them with anonymised
captures from real devices and app versions. Record a fixture whenever an app changes its format.

`expected` is either `["SKIPPED: <reason>"]`, `["FAILED: <reason>"]` or one line per message:
`chatKey | title | group | senderKey | senderName | fromMe | text | placeholder | detail | sentAt | exactTime`.
