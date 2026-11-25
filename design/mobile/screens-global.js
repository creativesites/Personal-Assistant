/* A · Global screens + Android system screens */
{
  var G = 'A · Global';

  Z.add({ id: 'G01', name: 'Welcome', group: G, data: '—', ms: 'M1',
    purpose: 'First launch. Sets the promise: intelligence that lives on the phone.',
    notes: ['No account wall: “Get started” goes local-first.', 'The thread illustration is the product idea: messages connected to what Zuri understood.'],
    q: ['Final product name is a placeholder (Q-11).'],
    render: function () {
      var dots = '', lines = '';
      var pts = [[60, 70], [300, 58], [42, 200], [320, 210], [96, 300], [270, 300], [180, 40]];
      pts.forEach(function (p, i) {
        lines += '<path d="M' + p[0] + ' ' + p[1] + ' Q ' + (180 + (p[0] - 180) * 0.3) + ' ' + (180 + (p[1] - 180) * 0.2) + ' 180 180" stroke="url(#gl)" stroke-width="1.5" fill="none" opacity=".7"/>';
        dots += '<rect x="' + (p[0] - 22) + '" y="' + (p[1] - 12) + '" width="44" height="24" rx="12" fill="var(--surface)" stroke="var(--line)"/><circle cx="' + (p[0] - 10) + '" cy="' + p[1] + '" r="5" fill="' + ['#1fa855', '#229ed9', '#d93025', '#1fa855', '#1a73e8', '#128c7e', '#3a76f0'][i] + '"/><rect x="' + (p[0] - 2) + '" y="' + (p[1] - 3) + '" width="16" height="6" rx="3" fill="var(--surface3)"/>';
      });
      var art = '<svg viewBox="0 0 360 340" width="100%" style="display:block;max-height:330px"><defs><linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#0f8c7a"/><stop offset="1" stop-color="#4f46e5"/></linearGradient><radialGradient id="orb" cx=".35" cy=".3"><stop offset="0" stop-color="#a5f3fc"/><stop offset=".45" stop-color="#06b6d4"/><stop offset="1" stop-color="#4f46e5"/></radialGradient></defs>' + lines + dots +
        '<circle cx="180" cy="180" r="58" fill="var(--ctx-weak)"/><circle cx="180" cy="180" r="40" fill="url(#orb)"/><circle cx="168" cy="168" r="9" fill="#fff" opacity=".55"/></svg>';
      return frame({ ctx: 'neutral', body:
        '<div style="padding:18px 22px 0">' + art + '</div>' +
        '<div class="big" style="padding-top:8px"><h1>Your conversations, remembered. Your promises, kept.</h1>' +
        '<p>Zuri understands the messages you choose to share with it, remembers what matters, and helps you run your personal life and your business, privately on this phone.</p></div>' +
        '<div class="pad" style="display:flex;flex-direction:column;gap:10px;margin-top:8px">' + btn('Get started', 'brand blk', { go: 'G02' }) + btn('I already use Zuri on the web', 'out blk', { go: 'G03' }) + '</div>' });
    } });

  Z.add({ id: 'G02', name: 'How Zuri works (privacy)', group: G, data: '—', ms: 'M1',
    purpose: 'Explain on-device processing before asking for anything.',
    notes: ['Plain commitments, each later verifiable in Privacy Center.', 'No permission is requested on this screen.'],
    render: function () {
      function pt(icon, t, s) { return '<div class="row" style="cursor:default"><span class="ico c">' + I(icon) + '</span><div class="tx"><b>' + t + '</b><span class="wrap">' + s + '</span></div></div>'; }
      return frame({ ctx: 'neutral', top: stop(''), body:
        '<div class="big"><h1>Private by design</h1><p>Here is exactly how Zuri treats what it sees.</p></div>' +
        list([pt('smartphone', 'Understood on this phone', 'An on-device model reads and summarises. Your messages stay in an encrypted database here.'),
          pt('toggle_on', 'You choose every source', 'Zuri ignores every app until you switch it on, and you can exclude any chat or person.'),
          pt('cloud_off', 'Nothing leaves without asking', 'Cloud AI, sync and uploads are separate switches, all off until you turn them on.'),
          pt('fact_check', 'Every insight shows its source', 'Tap any memory to see the message it came from, then correct or delete it.')]) +
        hint('Zuri can only see what other apps show in notifications. It can’t read old chats or open apps on your behalf.', 'visibility') +
        '<div class="pad">' + btn('Continue', 'brand blk', { go: 'G03' }) + '</div>' });
    } });

  Z.add({ id: 'G03', name: 'Local or cloud setup', group: G, data: '—', ms: 'M1 / M7',
    purpose: 'Choose to start locally (recommended) or connect an existing Zuri account.',
    notes: ['Local path never requires an account.', 'Connecting later is always possible from Settings → Cloud.'],
    render: function () {
      return frame({ ctx: 'neutral', top: stop(''), body:
        '<div class="big"><h1>How would you like to start?</h1></div>' +
        card('<div style="display:flex;gap:12px;align-items:flex-start"><span class="ico c">' + I('smartphone', 'f') + '</span><div style="flex:1"><h3>Start on this phone</h3><p>No account. Everything stays here. You can connect a Zuri account later.</p><div style="margin-top:8px">' + tag('Recommended', 'c') + '</div></div></div>', '', 'G07b') +
        card('<div style="display:flex;gap:12px;align-items:flex-start"><span class="ico">' + I('cloud') + '</span><div style="flex:1"><h3>Connect my Zuri account</h3><p>Sign in to bring your web history, documents and business data to this phone. You choose what to import.</p></div></div>', '', 'G05') +
        hint('Connecting does not upload anything from this phone and does not turn on cloud AI. Those are separate choices.', 'lock') });
    } });

  Z.add({ id: 'G07b', name: 'Local model selection', group: G, data: 'L', ms: 'M3',
    purpose: 'Recommend an on-device model for this exact phone, or start without one.',
    notes: ['Verdict comes from DeviceProfile + a 10-second benchmark, not RAM alone.', 'Essential mode keeps rules-based understanding, reminders and relationship rhythms.'],
    q: ['Should the model download start before or after source selection? (currently in parallel)'],
    render: function () {
      return frame({ ctx: 'neutral', top: stop('On-device intelligence'), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico ok">' + I('verified', 'f') + '</span><div><h3>This phone can run Zuri’s model</h3><p>8 GB memory · arm64 · 41 GB free</p></div></div>' +
          '<div class="hr"></div><dl class="kv"><dt>Your tier</dt><dd>Standard</dd><dt>Measured speed</dt><dd class="tnum">≈ 14 words/s</dd><dt>Runs</dt><dd>While charging or idle</dd></dl>') +
        sec('Recommended') +
        card('<div style="display:flex;gap:12px"><span class="ico br">' + I('neurology') + '</span><div style="flex:1"><h3>Gemma 4 E2B</h3><p>Understands messages, drafts replies and documents. 1.5 GB download.</p><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' + tag('Apache 2.0') + tag('Works offline', 'ok') + tag('+ EmbeddingGemma 180 MB') + '</div></div></div>') +
        list([row({ lead: '<span class="ico">' + I('bolt') + '</span>', t: 'Start in Essential mode', s: 'No download. Rules-based understanding only.', meta: I('chevron_right'), go: 'G04' })]) +
        '<div class="pad">' + btn('Download on Wi-Fi and continue', 'brand blk', { go: 'G04', toast: 'Downloading in the background · 1.7 GB' }) + '</div>' });
    } });

  function srcRow(code, on, s, extra) {
    return row({ lead: '<span style="display:grid;place-items:center;width:40px">' + srcSq(code, true) + '</span>', t: SRCNAME[code], s: s, meta: sw(on) + (extra || '') });
  }
  Z.add({ id: 'G04', name: 'Notification sources (before access)', group: G, data: 'L', ms: 'M2',
    purpose: 'Pick which apps Zuri may read. Access to notifications is a separate Android permission.',
    notes: ['Selecting an app does nothing until Android access is granted.', 'Coverage chips set honest expectations per app.', 'Default: every app off.'],
    q: ['Should SMS be pre-selected for business users? (default: no)'],
    render: function () {
      return frame({ ctx: 'personal', top: stop('Sources', { sub: 'What Zuri may observe' }), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico warn">' + I('notifications_off') + '</span><div style="flex:1"><h3>Notification access is off</h3><p>Android needs your permission before Zuri can see any notification.</p></div></div><div style="margin-top:12px">' + btn('Grant access', 'fill blk', { go: 'G04b' }) + '</div>') +
        sec('Apps Zuri may read') +
        list([srcRow('wa', true, 'Full message text in most chats'), srcRow('wab', true, 'Full message text · goes to Kalulu Irrigation'), srcRow('sm', false, 'One-time codes are hidden by Android'), srcRow('tg', false, 'Full text unless previews are off'), srcRow('sg', false, 'Often shows only “New message”'), srcRow('gm', false, 'Sender, subject and a short snippet'), srcRow('sl', false, 'Direct messages and mentions only')]) +
        hint('Zuri never sees chats you have open, muted chats, or anything sent before you turned it on.', 'visibility') });
    } });

  Z.add({ id: 'G04b', name: 'Notification access disclosure', group: G, data: '—', ms: 'M2',
    purpose: 'Play-required prominent disclosure shown before the Android settings screen.',
    notes: ['Must appear in-app, before the system screen, with an affirmative action.', 'Copy mirrors the Data safety answers.'],
    render: function () {
      function li(i, t) { return '<div style="display:flex;gap:10px;margin:0 20px 10px">' + I(i) + '<div style="font-size:14px">' + t + '</div></div>'; }
      return withSheet('G04', '<h2>Let Zuri read notifications from the apps you chose</h2><p>Only WhatsApp and WhatsApp Business are selected.</p>' +
        li('description', '<b>What Zuri reads:</b> the sender, chat name and text shown in their notifications.') +
        li('block', '<b>What it can’t read:</b> other apps, old messages, photos or files.') +
        li('lock', '<b>Where it goes:</b> an encrypted database on this phone. Nothing is uploaded unless you turn on upload later.') +
        li('delete', '<b>Your control:</b> pause anytime, exclude chats, delete by person, chat or date.') +
        '<div style="display:flex;gap:8px;padding:8px 20px 0">' + btn('Not now', 'out', { back: 1 }) + btn('Continue to Android settings', 'fill', { go: 'X01' }) + '</div>');
    } });

  Z.add({ id: 'X01', name: 'Android: notification access', group: 'System (Android)', data: 'System', ms: 'M2',
    purpose: 'The real Android settings screen the user is sent to. Shown for journey continuity.',
    notes: ['On sideloaded builds Android 13+ blocks this toggle behind “Allow restricted settings” — use Play internal testing (Q-12).'],
    render: function () {
      return '<div class="app ctx-neutral">' + sb() + '<div class="stop"><button class="ibtn">' + I('arrow_back') + '</button><h1>Device & app notifications</h1></div><div class="scr">' +
        '<div class="card" style="display:flex;gap:12px;align-items:center"><span class="ico br">' + I('neurology') + '</span><div style="flex:1"><h3>Zuri</h3><p>Allow notification access</p></div>' + sw(true) + '</div>' +
        '<p class="small" style="margin:4px 24px 14px">Zuri will be able to read all notifications, including personal information such as contact names and the text of messages you receive.</p>' +
        '<div class="pad">' + btn('Back to Zuri', 'brand blk', { go: 'G04G' }) + '</div></div><div class="gest"><i></i></div></div>';
    } });

  Z.add({ id: 'G04G', name: 'Notification sources (listening)', group: G, data: 'L', ms: 'M2',
    purpose: 'Access granted: live listening state, health, and per-app controls.',
    notes: ['Health card shows last capture; amber if the listener looks unbound (battery killers).', 'Each app opens a detail page: analyse vs store-only, retention, excluded chats.'],
    render: function () {
      return frame({ ctx: 'personal', top: stop('Sources', { sub: 'What Zuri may observe' }), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico ok">' + I('sensors', 'f') + '</span><div style="flex:1"><h3>Listening</h3><p>2 apps · last capture 2 min ago</p></div>' + btn('Pause', 'out', { toast: 'Capture paused for 1 hour' }) + '</div>') +
        list([srcRow('wa', true, 'Analyse · keep 1 year · 3 chats excluded', ''), srcRow('wab', true, 'Analyse · Kalulu Irrigation'), srcRow('sm', false, 'One-time codes are hidden by Android'), srcRow('tg', false, 'Full text unless previews are off'), srcRow('sg', false, 'Often shows only “New message”'), srcRow('gm', false, 'Sender, subject and a short snippet')]) +
        sec('Coverage this week') +
        card('<div class="bar" style="margin-bottom:8px"><span style="width:92px">Full text</span><span class="tr"><i style="width:91%"></i></span><span class="v">91%</span></div><div class="bar" style="margin-bottom:8px"><span style="width:92px">Placeholder</span><span class="tr"><i style="width:7%;background:var(--warn)"></i></span><span class="v">7%</span></div><div class="bar"><span style="width:92px">Hidden by OS</span><span class="tr"><i style="width:2%;background:var(--faint)"></i></span><span class="v">2%</span></div><p class="small" style="margin-top:10px">Placeholders are photos, voice notes and stickers, which notifications don’t include.</p>') +
        list([row({ lead: '<span class="ico">' + I('battery_alert') + '</span>', t: 'Keep Zuri running on Samsung', s: 'Two settings stop Android from pausing capture', meta: I('chevron_right') })]), nav: null });
    } });

  Z.add({ id: 'X02', name: 'Android: notification shade', group: 'System (Android)', data: 'System', ms: 'M2',
    purpose: 'A WhatsApp notification arrives. Zuri captures it silently, without posting its own notification.',
    notes: ['The capture callback only encrypts and stores (under 5 ms); understanding runs later in a background batch.'],
    render: function () {
      return '<div class="app ctx-neutral sysbar">' + sb() + '<div class="scr"><div style="padding:6px 22px 10px;font:600 40px/1 Manrope,sans-serif">9:41<div style="font:500 14px Roboto Flex,sans-serif;color:var(--muted);margin-top:6px">Tuesday, 24 November</div></div><div class="shade">' +
        '<div class="notif hot cc" data-go="P02N"><div class="hd">' + srcSq('wa') + 'WhatsApp · now</div><b>Chanda Phiri</b><div>Hey! Are you still bringing the wedding photos on Friday? Also mum’s 60th is on the 14th 🎉</div></div>' +
        '<div class="notif"><div class="hd">' + srcSq('gm') + 'Gmail · 8 min</div><b>Zesco Prepaid</b><div class="muted">Your token purchase receipt</div></div>' +
        '<div class="notif"><div class="hd">' + srcSq('sm') + 'Messages · 20 min</div><b>Airtel Money</b><div class="muted">Sensitive notification content hidden</div></div>' +
        '<p class="small" style="text-align:center;margin-top:10px">Tap the WhatsApp notification to continue the journey</p></div></div><div class="gest"><i></i></div></div>';
    } });

  Z.add({ id: 'G05', name: 'Account connection', group: G, data: 'C', ms: 'M7',
    purpose: 'Sign in with Clerk (same account as the web). Connecting grants read access only (P1).',
    notes: ['Clerk Android SDK → /api/auth/clerk-exchange (backend RFC G1). The internal secret never ships in the app.', 'Next steps (import, sync, upload, cloud AI) are offered separately.'],
    render: function () {
      return frame({ ctx: 'neutral', top: stop('Connect Zuri account'), body:
        '<div class="big"><h1>Sign in to Zuri</h1><p>Use the same account as zuri on the web.</p></div>' +
        '<div class="pad" style="display:flex;flex-direction:column;gap:10px">' + btn('Continue with Google', 'out blk', { icon: 'account_circle', go: 'S01C' }) + btn('Continue with email', 'out blk', { icon: 'mail', go: 'S01C' }) + btn('Use a passkey', 'out blk', { icon: 'passkey', go: 'S01C' }) + '</div>' +
        sec('Connecting will') + list([row({ lead: '<span class="ico ok">' + I('check') + '</span>', t: 'Let this phone read your cloud data', s: 'Contacts, chats, documents, projects' }), row({ lead: '<span class="ico">' + I('close') + '</span>', t: 'Not upload anything from this phone', s: 'Upload is a separate choice' }), row({ lead: '<span class="ico">' + I('close') + '</span>', t: 'Not turn on cloud AI', s: 'Local models keep working' })]) });
    } });

  Z.add({ id: 'G06', name: 'Initial cloud import', group: G, data: 'C', ms: 'M8',
    purpose: 'Choose what to bring to this phone, with counts, size and sensitivity.',
    notes: ['Counts come from the account (sync manifest after RFC G3; list endpoints before).', 'Sensitive categories are off by default and explained.', 'Before RFC G3: “Recent snapshot” only (≤500 contacts, last 150 messages per chat).'],
    q: ['Default message window: 90 days or 1 year?'],
    render: function () {
      function c(t, n, on, s) { return row({ lead: '<span class="ico c">' + I(t[1]) + '</span>', t: t[0], s: s || n, meta: sw(on) }); }
      return frame({ ctx: 'neutral', top: stop('Import from Zuri cloud', { sub: 'natasha@kalulu.example' }), body:
        '<div class="chips">' + chip('Last 30 days') + chip('Last 90 days', { on: 1 }) + chip('Last year') + chip('Everything') + '</div>' +
        list([c(['People & companies', 'group'], '1,284 contacts', true), c(['WhatsApp chats', 'forum'], '212 chats · 18,430 messages', true), c(['Documents', 'description'], '146 quotes, invoices, proposals', true), c(['Projects & deals', 'work'], '9 projects · 27 deals', true), c(['Calendar & goals', 'event'], '88 events · 6 goals', true), c(['Products & services', 'inventory_2'], '64 items', true)]) +
        sec('Sensitive · off unless you choose') +
        list([c(['Emotional & personality insights', 'psychology'], '', false, 'Zuri’s interpretations about people'), c(['Advisor memories about you', 'person_book'], '', false, 'Preferences, beliefs, moods'), c(['Payment records', 'payments'], '', false, 'Mobile-money confirmations')]) +
        card('<dl class="kv"><dt>Estimated size</dt><dd>≈ 210 MB</dd><dt>Time on Wi-Fi</dt><dd>about 12 min</dd><dt>Network</dt><dd>Wi-Fi only</dd></dl>', 'flat') +
        '<div class="pad">' + btn('Review where things go', 'brand blk', { go: 'G06M' }) + '</div>' });
    } });

  Z.add({ id: 'G06M', name: 'Import: workspace mapping', group: G, data: 'C → L', ms: 'M8',
    purpose: 'Decide which imported records belong to Personal and which to each business workspace.',
    notes: ['The cloud has no workspaces today (single owner). Mapping rules use customer status, relationship category and brand profile (D-04).', '“Needs review” items are never guessed.'],
    render: function () {
      function m(ctx, t, s, n) { return row({ lead: '<span class="ico" style="background:' + ctx + ';color:#fff">' + I('arrow_forward') + '</span>', t: t, s: s, meta: '<b class="tnum">' + n + '</b>' }); }
      return frame({ ctx: 'neutral', top: stop('Where should things go?'), body:
        '<p class="muted" style="margin:0 20px 12px;font-size:13.5px">Zuri keeps each workspace separate. Business knowledge never mixes with personal life unless you ask.</p>' +
        list([m('#4f46e5', 'Kalulu Irrigation', 'Customers, leads, suppliers, business documents', '412'), m('#0f8c7a', 'Personal', 'Friends, family, everyone else', '854'), m('#b45309', 'Needs your review', 'Could be either', '18')]) +
        sec('Rules', 'Edit') + card('<div style="font-size:13.5px;display:flex;flex-direction:column;gap:8px"><div>' + tag('customer', 'br') + ' or ' + tag('lead', 'br') + ' → Kalulu Irrigation</div><div>Documents with brand <b>Kalulu Irrigation</b> → Kalulu Irrigation</div><div>WhatsApp Business chats → Kalulu Irrigation</div><div>Everything else → Personal</div></div>') +
        '<div class="pad">' + btn('Start import', 'brand blk', { go: 'S02' }) + '</div>' });
    } });

  Z.add({ id: 'G07', name: 'Sync preferences', group: G, data: 'L', ms: 'M9',
    purpose: 'The separate consents after connecting: ongoing sync, uploads per category, cloud AI.',
    notes: ['Each switch maps to one permission (P3, P4, P6). None implies another.', 'Ongoing sync requires backend RFCs G3/G4.'],
    render: function () {
      function t(i, a, b, on) { return row({ lead: '<span class="ico c">' + I(i) + '</span>', t: a, s: b, meta: sw(on), wrap: 1 }); }
      return frame({ ctx: 'neutral', top: stop('Sync preferences'), body:
        sec('From the cloud') + list([t('sync', 'Keep this phone up to date', 'New chats, documents and changes made on the web', true), t('wifi', 'Wi-Fi only', 'Saves mobile data', true)]) +
        sec('From this phone to the cloud') + list([t('description', 'Kalulu Irrigation documents & deals', 'So the web and the team see them', true), t('chat', 'Captured WhatsApp messages', 'Off: they stay only on this phone', false), t('psychology', 'Memories Zuri learned on this phone', 'Off: stays private', false)]) +
        sec('Cloud AI') + list([row({ lead: '<span class="ico">' + I('cloud') + '</span>', t: 'Cloud AI is off', s: 'Choose per task in AI processing', meta: I('chevron_right'), go: 'A07' })]) +
        list([row({ lead: '<span class="ico">' + I('backup') + '</span>', t: 'Cloud backup', s: 'Not available yet', meta: tag('Later') })]) +
        '<div class="pad">' + btn('Save', 'brand blk', { go: 'S05' }) + '</div>' });
    } });

  Z.add({ id: 'G08', name: 'Context switcher', group: G, data: 'L', ms: 'M5',
    purpose: 'Switch the active context. The tint of the top bar always shows where you are.',
    notes: ['Personal is always one workspace; businesses are many and isolated (D-04).', 'Hybrid is a view, not a workspace: reading across, never merging.'],
    q: ['Allow more than one Hybrid view?'],
    render: function () {
      function w(ctx, icon, t, s, on, gid, b) { return row({ lead: '<span class="ico" style="background:' + ctx + ';color:#fff">' + I(icon, 'f') + '</span>', t: t, s: s, meta: (b || '') + (on ? I('check_circle', 'f') : ''), go: gid }); }
      return withSheet('P01', '<h2>Switch context</h2><p>Each workspace keeps its own people, memories and documents.</p>' +
        '<div class="list" style="margin:0 12px 10px">' + w('#0f8c7a', 'person', 'Personal', 'Family, friends, your life', true, 'P01') + w('#4f46e5', 'water_drop', 'Kalulu Irrigation', 'Business · synced with Zuri cloud', false, 'B01', tag('cloud', '', 'cloud')) + w('#a3367f', 'palette', 'Mwale Design Studio', 'Business · on this phone only', false, 'B01') + '</div>' +
        '<div class="list" style="margin:0 12px 10px">' + w('#475569', 'join', 'Personal + Kalulu', 'Hybrid view · read across both', false, 'P01') + row({ lead: '<span class="ico">' + I('add') + '</span>', t: 'New business workspace', toast: 'New workspace' }) + '</div>');
    } });

  Z.add({ id: 'G09', name: 'Global search', group: G, data: 'L (+C cached)', ms: 'M4',
    purpose: 'Search everything in the active context; widening is explicit.',
    notes: ['Results are filtered by workspace before ranking.', '“Also search Personal” widens scope for this search only and is logged.'],
    render: function () {
      return frame({ ctx: 'biz', top: '<div class="stop"><button class="ibtn" data-back="1">' + I('arrow_back') + '</button><div class="field focus" style="flex:1;margin:0 8px 0 0;padding:6px 12px"><div>Mwila</div></div></div>', body:
        '<div class="chips">' + chip('Kalulu Irrigation', { on: 1, icon: 'water_drop' }) + chip('Also search Personal', { icon: 'add' }) + '</div>' +
        sec('People') + list([row({ lead: av('mwila', { src: 'wab' }), t: 'Mwila Tembo', s: 'Client · Mwila Farms', go: 'P05B' })]) +
        sec('Messages') + list([row({ lead: srcSq('wab'), t: '“we need someone to check both sites monthly”', s: 'Mwila Tembo · 18 Nov', go: 'P03B' }), row({ lead: srcSq('wab'), t: '“Can you send the new proposal by Friday?”', s: 'Mwila Tembo · 21 Nov', go: 'P03B' })]) +
        sec('Memories') + list([row({ lead: '<span class="ico c">' + I('lightbulb') + '</span>', t: 'Mwila Farms has two drip sites (Chisamba, Kafue)', s: 'Fact · high confidence', meta: meter(4) })]) +
        sec('Documents') + list([row({ lead: '<span class="ico">' + I('description') + '</span>', t: 'QUO-0042 · Drip system service', s: 'Quotation · accepted · K 9,604.80', go: 'D01' })]) });
    } });

  Z.add({ id: 'G10', name: 'Settings', group: G, data: 'L', ms: 'M1', purpose: 'All settings, grouped by what the user is trying to control.',
    notes: ['Only real toggles. The web’s decorative “AI Engines” list is not copied.'],
    render: function () {
      function s(i, t, d, g) { return row({ lead: '<span class="ico">' + I(i) + '</span>', t: t, s: d, meta: I('chevron_right'), go: g }); }
      return frame({ ctx: 'personal', top: stop('Settings'), body:
        list([s('cloud', 'Zuri account & sync', 'Not connected', 'S01'), s('sensors', 'Sources', '2 apps listening', 'G04G'), s('neurology', 'AI & models', 'Gemma 4 E2B · on device', 'A01'), s('workspaces', 'Workspaces', 'Personal + 2 businesses', 'G08')]) +
        list([s('shield_lock', 'Privacy Center', 'What’s stored, shared and sent', 'G11'), s('lock', 'Security & app lock', 'Lock after 5 min', 'G12'), s('notifications', 'Zuri notifications', 'Daily brief 07:00')]) +
        list([s('help', 'Help & feedback', ''), s('info', 'About', 'Version 0.1 · prototype')]) });
    } });

  Z.add({ id: 'G11', name: 'Privacy Center', group: G, data: 'L', ms: 'M1 → M9',
    purpose: 'Answers: what is stored, what is synced, which sources and models, what leaves, which permissions, how to revoke.',
    notes: ['Every row links to the control that changes it.', 'The storage figure is per workspace and per category.'],
    render: function () {
      return frame({ ctx: 'personal', top: stop('Privacy Center'), body:
        card('<div style="display:flex;justify-content:space-between;align-items:flex-end"><div><div class="small">Stored on this phone</div><div class="num">312 MB</div></div><span class="tag ok">' + I('lock') + 'Encrypted</span></div>' +
          '<div style="display:flex;height:10px;border-radius:6px;overflow:hidden;margin:12px 0 8px"><i style="width:48%;background:#0f8c7a"></i><i style="width:30%;background:#4f46e5"></i><i style="width:8%;background:#a3367f"></i><i style="flex:1;background:var(--surface3)"></i></div>' +
          '<div class="small">Personal 150 MB · Kalulu 94 MB · Mwale Design 25 MB · other 43 MB</div>') +
        list([row({ lead: '<span class="ico c">' + I('sensors') + '</span>', t: 'Sources', s: 'WhatsApp, WhatsApp Business', meta: I('chevron_right'), go: 'G04G' }),
          row({ lead: '<span class="ico c">' + I('neurology') + '</span>', t: 'Models processing your data', s: 'Gemma 4 E2B, EmbeddingGemma · on device', meta: I('chevron_right'), go: 'A06' }),
          row({ lead: '<span class="ico c">' + I('outbound') + '</span>', t: 'What leaves my phone', s: 'Nothing from Personal · 2 requests from Kalulu today', meta: I('chevron_right'), go: 'A08' }),
          row({ lead: '<span class="ico c">' + I('cloud_sync') + '</span>', t: 'What has been synced', s: 'Kalulu documents & deals only', meta: I('chevron_right'), go: 'S05' })]) +
        sec('Permissions') +
        list([row({ t: 'Notification access', s: 'Android permission', meta: tag('On', 'ok') }), row({ t: 'Contacts', s: 'Used to recognise people', meta: tag('On', 'ok') }), row({ t: 'Calendar', s: 'Read only', meta: tag('Off') }),
          row({ t: 'Connect account', s: 'P1', meta: tag('On', 'ok') }), row({ t: 'Ongoing sync', s: 'P3', meta: tag('On', 'ok') }), row({ t: 'Upload phone data', s: 'P4 · 1 of 3 categories', meta: tag('Partial', 'warn') }), row({ t: 'Cloud AI', s: 'P6 · document drafting in Kalulu', meta: tag('Partial', 'warn'), go: 'A07' })]) +
        list([row({ lead: '<span class="ico bad">' + I('delete_forever') + '</span>', t: 'Delete data…', s: 'By source, person, chat, date or everything' })]) });
    } });

  Z.add({ id: 'G12', name: 'Security & app lock', group: G, data: 'L', ms: 'M1 / M15', purpose: 'App lock, vault, screenshot and recents protection.',
    notes: ['The main database stays writable while locked so capture works; the vault needs fresh biometric auth.'],
    render: function () {
      function t(a, b, on) { return row({ t: a, s: b, meta: sw(on), wrap: 1 }); }
      return frame({ ctx: 'personal', top: stop('Security'), body:
        list([t('Lock Zuri', 'Fingerprint, face or screen lock', true), row({ t: 'Lock after', s: '5 minutes in the background', meta: I('chevron_right') })]) +
        sec('Vault') + card('<div style="display:flex;gap:12px;align-items:center"><span class="ico">' + I('encrypted', 'f') + '</span><div style="flex:1"><h3>Vault is locked</h3><p>ID numbers, bank details and health notes need a fresh fingerprint each time.</p></div></div>') +
        list([t('Block screenshots of chats and memories', 'Also hides content when screen sharing', true), t('Hide Zuri in recent apps', 'Shows a blank preview', true), t('Show message text in Zuri notifications', 'Off: “You have 3 follow-ups”', false)]) });
    } });

  Z.add({ id: 'G13', name: 'More', group: G, data: '—', ms: 'M1', purpose: 'Secondary destinations for the personal context.',
    render: function () {
      function t(i, a, b, g) { return '<div class="tile"' + go(g) + '><span class="ico c">' + I(i) + '</span><div><b>' + a + '</b><br><span>' + b + '</span></div></div>'; }
      return frame({ ctx: 'personal', top: rootTop('personal'), nav: 'G13', body:
        '<div class="big"><h1>More</h1></div><div class="grid2">' + t('flag', 'Goals', '3 active', 'P08') + t('timeline', 'Timeline', 'Your life, by month', 'P10') + t('calendar_month', 'Calendar', '2 today', 'P11') + t('menu_book', 'Knowledge', 'Notes & files', 'P12') +
        t('psychology', 'Memory', '1,204 memories', 'P07') + t('handshake', 'Commitments', '4 open', 'P15') + t('recommend', 'Recommendations', '3 new', 'P14') + t('description', 'Documents', 'Personal letters', 'D01') +
        t('work', 'Career', 'Cloud · 4 matches', 'G13') + t('settings', 'Settings', '', 'G10') + '</div>' });
    } });
}
