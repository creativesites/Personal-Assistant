/* B · Personal screens */
{
  var P = 'B · Personal';
  function und(items) {
    return '<div class="under"><span class="lbl">' + I('auto_awesome', 'f') + 'Zuri understood · on this phone</span>' + items.map(function (u) {
      return '<div class="u"' + go(u.go) + '>' + I(u.i) + '<div style="flex:1"><b>' + u.t + '</b><div class="small">' + u.s + '</div></div>' + (u.m !== undefined ? meter(u.m) : '') + '</div>';
    }).join('') + '</div>';
  }

  Z.add({ id: 'P01', name: 'Today (Daily Brief)', group: P, data: 'L (+C when connected)', ms: 'M6',
    purpose: 'What matters today, built on the phone every morning from local signals.',
    notes: ['Built by 07:00 local time with no network.', 'Every line opens its source (conversation, commitment, person).', 'Auto-resolves when you act elsewhere (e.g. you reply in WhatsApp).'],
    q: ['Brief time default: 07:00 or user-set during onboarding?'],
    render: function () {
      return frame({ ctx: 'personal', top: rootTop('personal'), nav: 'P01', body:
        '<div class="big"><p style="margin:0 0 2px">Tuesday, 24 November</p><h1>Good morning, Natasha</h1></div>' +
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico br">' + I('auto_awesome', 'f') + '</span><div style="flex:1"><h3>3 things need you today</h3><p>Chanda asked about Friday, Bwalya has gone quiet, and you promised Mama a call.</p></div></div>', 'tint') +
        sec('You promised', 'All 4', 'P15') +
        list([row({ lead: av('chanda', { src: 'wa' }), t: 'Bring the wedding photos to Chanda', s: 'Due Fri 27 Nov · from a WhatsApp chat', meta: tag('3 days', 'warn'), go: 'P03' }),
          row({ lead: av('mama', { src: 'wa' }), t: 'Call Mama on Sunday', s: 'You said this on 21 Nov', meta: tag('Sun'), go: 'P15' })]) +
        sec('Reconnect') +
        list([row({ lead: av('bwalya', { src: 'tg' }), t: 'Bwalya Kunda', s: '23 days quiet · you usually talk every 9', meta: '<span class="pill-dot" style="background:var(--warn)"></span>', go: 'P14' })]) +
        sec('Coming up') +
        list([row({ lead: '<span class="ico c">' + I('cake') + '</span>', t: 'Chanda’s mum turns 60', s: 'Mon 14 Dec · mentioned this morning', go: 'P07b' }), row({ lead: '<span class="ico">' + I('menu_book') + '</span>', t: 'Book club · chapter 7', s: 'Thu 26 Nov, 18:30 · Google Calendar', go: 'P11' })]) +
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico c">' + I('insights') + '</span><div style="flex:1"><h3>Your week in review</h3><p>You talked with 11 people. Two friendships got warmer.</p></div>' + I('chevron_right') + '</div>', '', 'P10') });
    } });

  function inbox(fresh) {
    return frame({ ctx: 'personal', top: rootTop('personal'), nav: 'P02', body:
      '<div class="big" style="padding-bottom:8px"><h1>Inbox</h1></div>' +
      '<div class="chips">' + chip('All', { on: 1 }) + chip('Needs reply · 2') + chip('WhatsApp') + chip('Signal') + chip('Telegram') + chip('Groups') + '</div>' +
      list([row({ lead: av('chanda', { src: 'wa' }), t: 'Chanda Phiri', s: (fresh ? '<b style="color:var(--ink)">Hey! Are you still bringing the wedding photos on Friday?…</b>' : 'Hey! Are you still bringing the wedding photos on Friday?…'), meta: '<span>9:38</span>' + (fresh ? tag('2 understood', 'c', 'auto_awesome') : ''), go: 'P03' }),
        row({ lead: av('mama', { src: 'wa' }), t: 'Mum', s: 'Did you eat? Call me when you can', meta: '<span>8:02</span>' + tag('Needs reply', 'warn'), go: 'P15' }),
        row({ lead: '<span class="av" style="background:#0f766e">BC<span class="src wa">W</span></span>', t: 'Book club', s: 'Nalumino: chapter 7 for Thursday', meta: '<span>Mon</span>' + tag('Group · not analysed') }),
        row({ lead: av('kasonde', { src: 'sg' }), t: 'Kasonde Mwale', s: '<i>New message (preview hidden by Signal)</i>', meta: '<span>Sun</span>' + tag('Hidden') }),
        row({ lead: av('bwalya', { src: 'tg' }), t: 'Bwalya Kunda', s: 'You: Congrats on the new role!!', meta: '<span>1 Nov</span>', go: 'P06' }),
        row({ lead: av('nalu', { src: 'wa' }), t: 'Nalumino Mbewe', s: 'Thanks, see you Thursday', meta: '<span>23 Nov</span>' })]) +
      hint('Zuri shows only what arrived as notifications since 18 Nov. Older history can come from your Zuri account or a WhatsApp chat export.', 'history') });
  }
  Z.add({ id: 'P02', name: 'Inbox', group: P, data: 'L (+C)', ms: 'M2', purpose: 'All captured conversations in the active context.',
    notes: ['Source badge on every avatar; group chats captured but not analysed by default (Q-13).', 'Hidden-content states are shown honestly, never as errors.'], render: function () { return inbox(false); } });
  Z.add({ id: 'P02N', name: 'Inbox (new message understood)', group: P, data: 'L', ms: 'M2/M4', purpose: 'The notification from Chanda has been captured and understood in a background batch.',
    notes: ['The capture and the understanding are separate steps: capture is instant, understanding runs within minutes (or when charging, for large batches).'], render: function () { return inbox(true); } });

  Z.add({ id: 'P02B', name: 'Inbox (business scope)', group: P, data: 'L (+C)', ms: 'M5', purpose: 'Same inbox, scoped to the Kalulu Irrigation workspace.',
    notes: ['WhatsApp Business chats map to this workspace by rule; cloud WhatsApp history appears once connected.'],
    render: function () {
      return frame({ ctx: 'biz', top: rootTop('biz'), nav: 'P02B', body:
        '<div class="big" style="padding-bottom:8px"><h1>Inbox</h1></div><div class="chips">' + chip('All', { on: 1 }) + chip('Needs reply · 1') + chip('Leads') + chip('Customers') + chip('Suppliers') + '</div>' +
        list([row({ lead: av('mwila', { src: 'wab' }), t: 'Mwila Tembo · Mwila Farms', s: 'Can you send the new proposal by Friday?', meta: '<span>Sat</span>' + tag('Needs reply', 'warn'), go: 'P03B' }),
          row({ lead: av('lubinda', { src: 'wab' }), t: 'Lubinda Sitali', s: 'Filter kits back in stock, K 1,240 each', meta: '<span>Fri</span>' + tag('Price noted', 'c') }),
          row({ lead: av('thoko', { src: 'wab' }), t: 'Thokozani Banda', s: 'How much for a 2 ha drip setup?', meta: '<span>Thu</span>' + tag('Lead', 'br') })]) });
    } });

  Z.add({ id: 'P03', name: 'Conversation detail', group: P, data: 'L', ms: 'M2/M4', purpose: 'Read the thread and see what Zuri understood, each item tied to its message.',
    notes: ['The “understood” strip hangs under the message it came from (provenance by position).', 'Tap an item to confirm, edit or open its memory.', 'Photos and voice notes appear as placeholders: notifications do not carry media.'],
    render: function () {
      return frame({ ctx: 'personal', top: stop('Chanda Phiri', { sub: 'WhatsApp · Personal', actions: '<button class="ibtn" data-go="P05">' + I('info') + '</button>' }),
        body: '<div class="thread">' +
          '<span class="day">Wed 12 Nov</span><div class="bub in">Do you still have my copy of Things Fall Apart? 😅<small>19:04</small></div><div class="bub out">Yes! I’ll bring it back next time we meet, promise<small>19:10</small></div>' +
          '<span class="day">Sat 22 Nov</span><div class="bub out">The wedding photos came out so well. I’ll print a few for you<small>21:15</small></div><div class="bub in ph">' + I('photo_camera') + 'Photo · not included in notifications<small>21:17</small></div>' +
          '<span class="day">Today</span><div class="bub in hl">Hey! Are you still bringing the wedding photos on Friday? Also mum’s 60th is on the 14th 🎉<small>9:38</small></div>' +
          und([{ i: 'handshake', t: 'You → Chanda: bring the wedding photos', s: 'Commitment · due Fri 27 Nov', m: 4, go: 'P15' }, { i: 'cake', t: 'Chanda’s mum turns 60', s: 'Event · Mon 14 Dec', m: 4, go: 'P07b' }, { i: 'reply', t: 'Needs a reply', s: 'Question about Friday', go: 'P03R' }]) + '</div>',
        bottom: '<div class="composer"><div class="in">Reply…</div><button class="btn fill" data-go="P03R">' + I('auto_awesome') + 'Draft</button></div>' });
    } });

  Z.add({ id: 'P03R', name: 'Reply sheet', group: P, data: 'L', ms: 'M4', purpose: 'Drafts written on the phone in your voice; sending uses WhatsApp’s own reply action.',
    notes: ['Send uses the live notification’s reply action, only on your tap. Zuri never sends on its own (D-11).', 'If the notification is gone, the sheet offers “Copy & open WhatsApp”.', '“Report response” satisfies Play’s AI-content rule.'],
    render: function () {
      return withSheet('P03', '<h2>Reply to Chanda</h2><p>Drafted on this phone in your usual tone.</p><div class="chips">' + chip('Warm', { on: 1 }) + chip('Brief') + chip('Playful') + '</div>' +
        '<div class="field focus" style="min-height:96px"><label>Your reply</label><div>Yes! Bringing them on Friday 📸 And noted about the 14th, what time is the party?</div></div>' +
        '<div class="hint">' + I('verified_user') + '<div>Sends through WhatsApp’s reply action. The notification is still active.</div></div>' +
        '<div style="display:flex;gap:8px;padding:0 16px">' + btn('Open WhatsApp', 'out', { toast: 'Opening WhatsApp' }) + '<span style="flex:1"></span>' + btn('Send', 'fill', { icon: 'send', toast: 'Sent through WhatsApp' }) + '</div>' +
        '<div style="padding:10px 20px 0" class="small">' + I('flag') + ' <a class="link">Report this response</a></div>');
    } });

  Z.add({ id: 'P03B', name: 'Conversation (business)', group: P, data: 'L (+C)', ms: 'M4/M10', purpose: 'A client conversation in the Kalulu workspace, with business understanding.',
    notes: ['Tier B extraction (opportunities, products, prices) runs only when a cheap pre-filter fires.', '“Draft proposal” starts the Document Studio with this chat already in context.'],
    render: function () {
      return frame({ ctx: 'biz', top: stop('Mwila Tembo', { sub: 'WhatsApp Business · Kalulu Irrigation', actions: '<button class="ibtn" data-go="P05B">' + I('info') + '</button>' }), body: '<div class="thread">' +
        '<span class="day">Tue 18 Nov</span><div class="bub in">The Chisamba line is losing pressure again. Honestly we need someone to check both sites monthly, Chisamba and Kafue<small>10:12</small></div>' +
        und([{ i: 'trending_up', t: 'Opportunity: monthly maintenance, 2 sites', s: 'Est. 3 months+ · Mwila Farms', m: 4, go: 'B07' }]) +
        '<span class="day">Sat 21 Nov</span><div class="bub in hl">Can you send the new proposal by Friday? Same rates as last time if possible<small>16:40</small></div>' +
        und([{ i: 'event_upcoming', t: 'They asked you: proposal by Fri 27 Nov', s: 'Commitment · uses rates from QUO-0042', m: 4 }, { i: 'description', t: 'Draft a proposal for Mwila Farms', s: 'Suggested action', go: 'D03' }]) + '</div>',
        bottom: '<div class="composer"><div class="in">Reply…</div><button class="btn fill" data-go="D03">' + I('description') + 'Proposal</button></div>' });
    } });

  Z.add({ id: 'P04', name: 'People', group: P, data: 'L (+C)', ms: 'M6', purpose: 'Everyone in the active context, sorted by who needs attention.',
    notes: ['Health and rhythm are computed on the phone (ports of the server’s health and cadence engines).'],
    render: function () {
      function h(c) { return '<span class="pill-dot" style="background:' + c + '"></span>'; }
      return frame({ ctx: 'personal', top: rootTop('personal'), nav: 'P04', body:
        '<div class="big" style="padding-bottom:8px"><h1>People</h1></div><div class="field" style="margin-bottom:10px"><div class="muted">' + I('search') + ' Search people</div></div>' +
        '<div class="chips">' + chip('Needs attention', { on: 1 }) + chip('Close') + chip('Family') + chip('All 142') + '</div>' +
        list([row({ lead: av('bwalya'), t: 'Bwalya Kunda', s: 'Quiet for 23 days · usually 9', meta: h('var(--warn)'), go: 'P06' }),
          row({ lead: av('chanda'), t: 'Chanda Phiri', s: 'Close friend · 2 open commitments', meta: h('var(--ok)'), go: 'P05' }),
          row({ lead: av('mama'), t: 'Grace Mwale (Mum)', s: 'Family · call promised Sunday', meta: h('var(--ok)'), go: 'P05' }),
          row({ lead: av('kasonde'), t: 'Kasonde Mwale', s: 'Sister · Signal hides previews', meta: h('var(--ok)') }),
          row({ lead: av('nalu'), t: 'Nalumino Mbewe', s: 'Book club', meta: h('var(--ok)') })]) });
    } });

  Z.add({ id: 'P05', name: 'Person profile', group: P, data: 'L', ms: 'M6', purpose: 'Who this person is to you, in this workspace.',
    notes: ['A person can have separate relationships per workspace; memories are not shared across them unless you link them.'],
    render: function () {
      return frame({ ctx: 'personal', top: stop('', { actions: '<button class="ibtn">' + I('more_vert') + '</button>' }), body:
        '<div style="display:flex;gap:14px;align-items:center;padding:0 20px 12px">' + av('chanda', { size: 'lg' }) + '<div><h1 style="font:750 24px/1.1 Manrope,sans-serif;margin:0">Chanda Phiri</h1><div class="muted">Close friend · Personal</div></div></div>' +
        '<div class="chips">' + chip('Overview', { on: 1 }) + chip('Memories · 14', { go: 'P07' }) + chip('Commitments · 2', { go: 'P15' }) + chip('Chats', { go: 'P03' }) + '</div>' +
        '<div class="grid2"><div class="card" data-go="P06" style="cursor:pointer"><div class="small">Relationship</div><div class="num">86</div><div class="small">Steady · warm</div></div><div class="card"><div class="small">Rhythm</div><div class="num">4 d</div><div class="small">You talk every 4 days</div></div></div>' +
        sec('What Zuri remembers', 'Inspect', 'P07') +
        list([row({ lead: '<span class="ico c">' + I('cake') + '</span>', t: 'Her mum turns 60 on 14 Dec', s: 'From WhatsApp · today', meta: meter(4), go: 'P07b' }), row({ lead: '<span class="ico c">' + I('graphic_eq') + '</span>', t: 'Prefers voice notes at weekends', s: 'Pattern · 6 weeks', meta: meter(3) }), row({ lead: '<span class="ico c">' + I('work') + '</span>', t: 'Works in accounts at a Lusaka bank', s: 'Mentioned 3 times', meta: meter(4) })]) +
        sec('Open commitments') + list([row({ lead: '<span class="ico warn">' + I('handshake') + '</span>', t: 'Bring the wedding photos', s: 'You · Fri 27 Nov', go: 'P15' }), row({ lead: '<span class="ico">' + I('menu_book') + '</span>', t: 'Return “Things Fall Apart”', s: 'You · no date', go: 'P15' })]) });
    } });

  Z.add({ id: 'P05B', name: 'Person profile (business)', group: P, data: 'L + C', ms: 'M10', purpose: 'The same kind of profile in a business workspace: deals, documents, money.',
    notes: ['Lifetime value and outstanding balance come from the cloud (server-authoritative) when connected.'],
    render: function () {
      return frame({ ctx: 'biz', top: stop(''), body:
        '<div style="display:flex;gap:14px;align-items:center;padding:0 20px 12px">' + av('mwila', { size: 'lg' }) + '<div><h1 style="font:750 24px/1.1 Manrope,sans-serif;margin:0">Mwila Tembo</h1><div class="muted">Client · Mwila Farms · Kalulu Irrigation</div></div></div>' +
        '<div class="chips">' + chip('Overview', { on: 1 }) + chip('Deals · 1', { go: 'B07' }) + chip('Documents · 3', { go: 'D01' }) + chip('Chats', { go: 'P03B' }) + '</div>' +
        '<div class="grid2"><div class="card"><div class="small">Lifetime value</div><div class="num">K 41,200</div><div class="small">' + I('cloud') + ' Zuri cloud</div></div><div class="card"><div class="small">Outstanding</div><div class="num">K 0</div><div class="small">All invoices paid</div></div></div>' +
        sec('Open deal') + list([row({ lead: '<span class="ico c">' + I('trending_up') + '</span>', t: 'Monthly maintenance · 2 sites', s: 'Proposal stage · est. K 15,800', go: 'B07' })]) +
        sec('Documents') + list([row({ lead: '<span class="ico">' + I('description') + '</span>', t: 'QUO-0042 · Drip system service', s: 'Quotation · accepted 14 Oct', meta: '<b class="tnum">K 9,604.80</b>', go: 'D01' })]) });
    } });

  Z.add({ id: 'P06', name: 'Relationship detail', group: P, data: 'L', ms: 'M6', purpose: 'Health and rhythm for one relationship, with the reasons behind the score.',
    notes: ['Same six signals and weights as the server’s health engine, computed locally.'],
    render: function () {
      var bars = [3, 4, 3, 5, 4, 4, 3, 2, 1, 0, 0, 0].map(function (v, i) { return '<i class="' + (i > 8 ? 'dim' : '') + '" style="height:' + (v * 18 + 6) + 'px"></i>'; }).join('');
      return frame({ ctx: 'personal', top: stop('Bwalya Kunda', { sub: 'Friend · former colleague' }), body:
        card('<div style="display:flex;gap:14px;align-items:center"><div class="ring" style="background:conic-gradient(var(--warn) 54%,var(--surface3) 0)"><b>54</b></div><div><h3>Drifting</h3><p>23 days without a message. You usually talk every 9 days.</p></div></div>') +
        sec('Messages per week · last 12 weeks') + card('<div class="chart">' + bars + '</div><div class="small" style="display:flex;justify-content:space-between;margin-top:6px"><span>Sep</span><span>Oct</span><span>Nov</span></div>') +
        sec('Why this score') + card('<div class="bar" style="margin-bottom:8px"><span style="width:96px">Recency</span><span class="tr"><i style="width:22%;background:var(--warn)"></i></span><span class="v">low</span></div><div class="bar" style="margin-bottom:8px"><span style="width:96px">Reciprocity</span><span class="tr"><i style="width:70%"></i></span><span class="v">good</span></div><div class="bar"><span style="width:96px">Warmth</span><span class="tr"><i style="width:78%"></i></span><span class="v">high</span></div>') +
        '<div class="pad">' + btn('Draft a message to Bwalya', 'fill blk', { icon: 'edit', go: 'P14D' }) + '</div>' });
    } });

  Z.add({ id: 'P07', name: 'Memory Inspector', group: P, data: 'L', ms: 'M4', purpose: 'See, correct and delete what Zuri remembers. Every item shows its confidence and its source.',
    notes: ['Low-confidence items are “suggestions to confirm”, not memories, until you confirm them.', 'Deleting a source message lists the memories that came from it.'],
    render: function () {
      function m(icon, t, s, n, extra, g) { return '<div class="card cc" data-go="' + (g || 'P07b') + '"><div style="display:flex;gap:10px"><span class="ico c">' + I(icon) + '</span><div style="flex:1"><b style="font-weight:620">' + t + '</b><div class="small">' + s + '</div></div>' + meter(n) + '</div>' + (extra || '') + '</div>'; }
      return frame({ ctx: 'personal', top: stop('Memory', { sub: '1,204 memories · Personal' }), body:
        '<div class="chips">' + chip('All', { on: 1 }) + chip('To confirm · 4') + chip('Facts') + chip('Preferences') + chip('Life events') + chip('By person') + '</div>' +
        m('cake', 'Chanda’s mum turns 60 on 14 Dec', srcSq('wa') + ' Chanda Phiri · today 9:38', 4) +
        m('call', 'Mum prefers calls after 18:00', srcSq('wa') + ' Mum · pattern from 9 chats', 3) +
        m('work', 'Bwalya started a new job at a solar company', srcSq('tg') + ' Bwalya · 1 Nov', 2, '<div class="btns" style="margin-top:10px">' + btn('Confirm', 'tonal', { toast: 'Confirmed' }) + btn('Not true', 'out', { toast: 'Removed and noted' }) + '</div>') +
        m('restaurant', 'Nalumino is vegetarian', srcSq('wa') + ' Book club · 2 messages', 3) });
    } });

  Z.add({ id: 'P07b', name: 'Memory detail & source', group: P, data: 'L', ms: 'M4', purpose: 'Full provenance for one memory: the exact words, the model that read them, and its history.',
    notes: ['The quoted span must exist in the source message (grounding validator).', 'Dates are resolved by code from the message timestamp, not by the model.'],
    render: function () {
      return frame({ ctx: 'personal', top: stop('Memory'), body:
        card('<h3 style="font-size:18px">Chanda’s mum turns 60 on 14 December</h3><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' + tag('Life event', 'c') + tag('Personal only', '', 'lock') + tag('High confidence', 'ok') + '</div>' +
          '<div class="hr"></div><dl class="kv"><dt>Person</dt><dd>Chanda’s mother</dd><dt>Date</dt><dd>Mon 14 Dec 2026</dd><dt>Kind</dt><dd>60th birthday</dd></dl>') +
        sec('Source') + card('<div class="small" style="display:flex;gap:6px;align-items:center;margin-bottom:6px">' + srcSq('wa') + 'WhatsApp · Chanda Phiri · today 9:38</div><div style="font-size:14.5px">Hey! Are you still bringing the wedding photos on Friday? Also <mark style="background:var(--ctx-weak);color:var(--ink);border-radius:4px;padding:0 2px">mum’s 60th is on the 14th</mark> 🎉</div><div style="margin-top:10px">' + btn('Open in conversation', 'text', { go: 'P03', icon: 'forum' }) + '</div>') +
        sec('Why Zuri is confident') + card('<ul style="margin:0;padding-left:18px;font-size:13.5px;color:var(--muted)"><li>The date is stated explicitly (“the 14th”), resolved to December from the message date.</li><li>“mum” is resolved to Chanda’s mother because Chanda wrote it.</li><li>Matches no earlier memory, so there is no conflict.</li></ul>') +
        sec('Processing') + card('<dl class="kv"><dt>Read by</dt><dd>Gemma 4 E2B · on this phone</dd><dt>When</dt><dd>Today 9:52 · batch of 6</dd><dt>Prompt</dt><dd>extract-core v3</dd><dt>Left this phone</dt><dd>No</dd></dl>') +
        '<div class="pad btns">' + btn('Confirm', 'fill', { toast: 'Confirmed' }) + btn('Edit', 'out') + btn('Delete', 'out', { toast: 'Memory deleted' }) + '</div>' });
    } });

  Z.add({ id: 'P08', name: 'Goals', group: P, data: 'L (+C)', ms: 'M6', purpose: 'Personal goals with progress, linked to people and plans.',
    render: function () {
      function g(t, s, pct, gid) { return card('<div style="display:flex;justify-content:space-between;gap:10px"><div><h3>' + t + '</h3><p>' + s + '</p></div><b class="tnum">' + pct + '%</b></div><div class="prog" style="margin-top:10px"><i style="width:' + pct + '%"></i></div>', '', gid); }
      return frame({ ctx: 'personal', top: stop('Goals'), fab: { icon: 'add', t: 'New goal', toast: 'New goal' }, body:
        '<div class="chips">' + chip('Active · 3', { on: 1 }) + chip('Achieved · 5') + chip('Paused') + '</div>' + g('See Mum every month', '2 of 3 months this quarter', 67, 'P09') + g('Read 12 books this year', '9 read · book club helps', 75) + g('Save K 20,000 for the Kafue plot', 'K 12,400 saved', 62) });
    } });

  Z.add({ id: 'P09', name: 'Goal detail', group: P, data: 'L', ms: 'M6', purpose: 'A goal’s progress, links and the next step.',
    render: function () {
      return frame({ ctx: 'personal', top: stop('See Mum every month'), body:
        card('<div style="display:flex;gap:14px;align-items:center"><div class="ring" style="background:conic-gradient(var(--ctx) 67%,var(--surface3) 0)"><b>2/3</b></div><div><h3>On track if you visit in December</h3><p>October ✓ · November ✓ · December open</p></div></div>') +
        sec('Linked') + list([row({ lead: av('mama'), t: 'Grace Mwale (Mum)', s: 'Person', go: 'P05' }), row({ lead: '<span class="ico c">' + I('event') + '</span>', t: 'Sunday call', s: 'Commitment · 29 Nov', go: 'P15' })]) +
        sec('Next step') + card('<p style="color:var(--ink)">Kasonde is visiting Mum on 13 Dec. Want to plan the visit together?</p><div class="small" style="margin-top:6px">Suggested from a Signal chat · on this phone</div><div class="btns" style="margin-top:10px">' + btn('Add to calendar', 'tonal', { toast: 'Opened calendar' }) + btn('Not now', 'text') + '</div>') });
    } });

  Z.add({ id: 'P10', name: 'Personal timeline', group: P, data: 'L', ms: 'M6', purpose: 'Your life by month: reflections, life events, goals.',
    render: function () {
      function e(d, i, t, s) { return '<div style="display:flex;gap:12px;padding:0 16px 12px"><div style="width:44px;text-align:right" class="small"><b style="color:var(--ink)">' + d + '</b></div><div style="border-left:2px solid var(--ctx-weak);padding-left:12px;flex:1"><div style="display:flex;gap:8px;align-items:center"><span class="ico c" style="width:30px;height:30px;border-radius:10px">' + I(i) + '</span><b>' + t + '</b></div><div class="small" style="margin:4px 0 0 38px">' + s + '</div></div></div>'; }
      return frame({ ctx: 'personal', top: stop('Timeline'), body:
        sec('November 2026') + card('<h3>Week in review</h3><p>11 people · Chanda and Nalumino got warmer · 3 promises kept</p>', 'tint') + e('22', 'favorite', 'Wedding of Chanda’s cousin', 'You took the photos · 40 messages that weekend') + e('18', 'sensors', 'Zuri started listening', 'WhatsApp and WhatsApp Business') + e('9', 'flag', 'Goal: See Mum every month', 'November done') +
        sec('October 2026') + e('30', 'menu_book', 'Finished book 9', 'Book club') + e('14', 'landscape', 'Walked the Kafue plot boundary', 'Surveyor notes saved to Knowledge') +
        hint('Business events (deals, invoices) stay in their workspace’s timeline. Switch to Hybrid to see both side by side.', 'lock') });
    } });

  Z.add({ id: 'P11', name: 'Calendar', group: P, data: 'L (+device calendar)', ms: 'M6', purpose: 'Agenda combining device calendar events, commitments and events Zuri found.',
    notes: ['Reading the device calendar is a separate disclosed permission; writing uses Android’s own calendar intents.'],
    render: function () {
      function a(d, items) { return sec(d) + list(items); }
      return frame({ ctx: 'personal', top: stop('Calendar'), fab: { icon: 'add', t: 'Event', toast: 'Opened Android calendar' }, body:
        '<div class="chips">' + chip('Agenda', { on: 1 }) + chip('Month') + '</div>' +
        a('Today · Tue 24', [row({ lead: '<span class="ico">' + I('event') + '</span>', t: 'Dentist', s: '15:00 · Google Calendar' })]) +
        a('Thu 26', [row({ lead: '<span class="ico">' + I('menu_book') + '</span>', t: 'Book club · chapter 7', s: '18:30 · Google Calendar' })]) +
        a('Fri 27', [row({ lead: '<span class="ico warn">' + I('handshake') + '</span>', t: 'Bring the wedding photos to Chanda', s: 'Commitment · from WhatsApp', go: 'P15' })]) +
        a('Sun 29', [row({ lead: '<span class="ico c">' + I('call') + '</span>', t: 'Call Mum', s: 'Commitment · after 18:00 suits her', go: 'P15' })]) +
        a('Mon 14 Dec', [row({ lead: '<span class="ico c">' + I('cake') + '</span>', t: 'Chanda’s mum turns 60', s: 'Found by Zuri · not in your calendar', meta: btn('Add', 'tonal', { toast: 'Opened Android calendar' }) })]) });
    } });

  Z.add({ id: 'P12', name: 'Knowledge', group: P, data: 'L (+C)', ms: 'M6', purpose: 'Notes and files Zuri can use when you ask questions.',
    notes: ['Files are embedded on the phone (EmbeddingGemma); vectors never leave.'],
    render: function () {
      return frame({ ctx: 'personal', top: stop('Knowledge'), fab: { icon: 'add', t: 'Add', toast: 'Add note or file' }, body:
        '<div class="chips">' + chip('All', { on: 1 }) + chip('Notes') + chip('Files') + chip('From WhatsApp exports') + '</div>' +
        list([row({ lead: '<span class="ico c">' + I('note') + '</span>', t: 'Kafue plot: surveyor notes', s: 'Note · edited 2 days ago' }), row({ lead: '<span class="ico">' + I('picture_as_pdf') + '</span>', t: 'Lease agreement draft.pdf', s: 'File · 6 pages · searchable' }), row({ lead: '<span class="ico">' + I('chat') + '</span>', t: 'WhatsApp export · Family group', s: 'Imported 18 Nov · 2,310 messages' })]) +
        hint('Ask anything about these from Ask, for example “what did the surveyor say about the boundary?”', 'auto_awesome') });
    } });

  Z.add({ id: 'P13', name: 'Ask Zuri', group: P, data: 'L', ms: 'M4', purpose: 'Ask about your own life. Answers come from the phone, with sources.',
    notes: ['Scope chip shows exactly what Zuri may read for this question.', 'With no model installed, Ask still returns the matching sources (retrieval only).'],
    render: function () {
      return frame({ ctx: 'personal', top: rootTop('personal'), nav: 'P13', body:
        '<div style="display:grid;place-items:center;padding:28px 24px 10px;text-align:center"><span class="ico br" style="width:56px;height:56px;border-radius:20px">' + I('auto_awesome', 'f') + '</span><h1 style="font:750 24px/1.15 Manrope,sans-serif;margin:14px 0 6px">What would you like to know?</h1><p class="muted" style="margin:0">Answers come from your Personal conversations and notes, on this phone.</p></div>' +
        scopeBar('Personal · all sources') +
        list([row({ t: 'What did I promise Chanda?', meta: I('north_west'), go: 'P13A' }), row({ t: 'When did I last see Bwalya?', meta: I('north_west') }), row({ t: 'What does Mum need this month?', meta: I('north_west') })]),
        bottom: '<div class="composer"><div class="in">What did I promise Chanda?</div><button class="btn fill" data-go="P13A">' + I('arrow_upward') + '</button></div>' });
    } });

  Z.add({ id: 'P13A', name: 'Ask Zuri · answer', group: P, data: 'L', ms: 'M4', purpose: 'A cited answer. Each number opens the exact message.',
    notes: ['Model and location are shown under every answer.', 'If a cloud model would help, Zuri asks first (PrivacyGate) and never switches silently.'],
    render: function () {
      return frame({ ctx: 'personal', top: rootTop('personal'), nav: 'P13', body: '<div class="thread" style="padding-top:12px">' +
        '<div class="bub out">What did I promise Chanda?</div>' +
        '<div class="card" style="margin:6px 0 0"><p style="color:var(--ink);font-size:15px;line-height:1.55">You have two open promises to Chanda:</p><ul style="margin:8px 0;padding-left:18px;font-size:15px;line-height:1.55"><li>Bring the wedding photos on <b>Friday 27 Nov</b> <span class="cite" data-go="P03">1</span> <span class="cite" data-go="P03">2</span></li><li>Return her copy of <i>Things Fall Apart</i>, no date agreed <span class="cite" data-go="P03">3</span></li></ul><div class="small" style="display:flex;gap:6px;align-items:center">' + I('smartphone') + 'Gemma 4 E2B · on this phone · Personal</div></div>' +
        sec('Sources') + '</div>' + list([row({ lead: '<span class="cite">1</span>', t: '“I’ll print a few for you”', s: 'You · WhatsApp · Sat 22 Nov', go: 'P03' }), row({ lead: '<span class="cite">2</span>', t: '“still bringing the wedding photos on Friday?”', s: 'Chanda · WhatsApp · today', go: 'P03' }), row({ lead: '<span class="cite">3</span>', t: '“I’ll bring it back next time we meet, promise”', s: 'You · WhatsApp · 12 Nov', go: 'P03' })]) +
        '<div class="pad btns">' + btn('Remind me Thursday evening', 'tonal', { icon: 'alarm', toast: 'Reminder set · Thu 19:00' }) + btn('Report', 'text', { icon: 'flag' }) + '</div>',
        bottom: '<div class="composer"><div class="in">Ask a follow-up…</div><button class="btn fill">' + I('arrow_upward') + '</button></div>' });
    } });

  Z.add({ id: 'P14', name: 'Recommendations', group: P, data: 'L (+C)', ms: 'M6', purpose: 'Proactive suggestions, each with a reason you can inspect.',
    notes: ['Auto-resolved items show what made them unnecessary (Reality Engine L1 port).'],
    render: function () {
      return frame({ ctx: 'personal', top: stop('Recommendations'), body:
        card('<div style="display:flex;gap:12px">' + av('bwalya') + '<div style="flex:1"><h3>Reconnect with Bwalya</h3><p>23 days quiet. You usually talk every 9 days, and the last chat was about her new job.</p></div></div><div class="btns" style="margin-top:12px">' + btn('Draft message', 'fill', { go: 'P14D' }) + btn('Why?', 'out', { go: 'P14E' }) + btn('Snooze', 'text', { toast: 'Snoozed for 3 days' }) + '</div>') +
        card('<div style="display:flex;gap:12px">' + av('chanda') + '<div style="flex:1"><h3>Answer Chanda about Friday</h3><p>She asked a question 2 hours ago.</p></div></div><div class="btns" style="margin-top:12px">' + btn('Reply', 'fill', { go: 'P03R' }) + btn('Dismiss', 'text', { toast: 'Dismissed' }) + '</div>') +
        sec('Resolved for you') + list([row({ lead: '<span class="ico ok">' + I('task_alt') + '</span>', t: 'Follow up with Nalumino', s: 'You replied on WhatsApp yesterday, so this was cleared', meta: '' })]) });
    } });

  Z.add({ id: 'P14E', name: 'Recommendation evidence', group: P, data: 'L', ms: 'M6', purpose: 'Why Zuri suggested this: the numbers and messages behind it.',
    render: function () {
      return withSheet('P14', '<h2>Why Zuri suggested this</h2><p>Computed on this phone from your Telegram chats with Bwalya.</p>' +
        '<div class="card flat"><dl class="kv"><dt>Usual gap</dt><dd>9 days (median of 31 gaps)</dd><dt>Current gap</dt><dd>23 days</dd><dt>Last message</dt><dd>You, 1 Nov: “Congrats on the new role!!”</dd><dt>Relationship</dt><dd>54 · drifting</dd></dl></div>' +
        '<div class="hint">' + I('tune') + '<div>Not useful? Tell Zuri to use a longer rhythm for Bwalya, or stop suggesting her.</div></div><div class="pad btns">' + btn('Draft message', 'fill', { go: 'P14D' }) + btn('Adjust rhythm', 'out') + '</div>');
    } });

  Z.add({ id: 'P14D', name: 'Recommendation draft', group: P, data: 'L', ms: 'M6', purpose: 'A drafted message when no live notification exists: Zuri can’t send, so it helps you send.',
    notes: ['Shows the platform limit honestly: replying needs an active notification. Otherwise copy and open the app (D-11).'],
    render: function () {
      return withSheet('P14', '<h2>Message to Bwalya</h2><div class="chips">' + chip('Warm', { on: 1 }) + chip('Brief') + '</div>' +
        '<div class="field focus" style="min-height:90px"><label>Draft</label><div>Hey Bwalya! How are the first weeks at the new job treating you? Coffee next week?</div></div>' +
        '<div class="hint">' + I('info') + '<div>There’s no recent Telegram notification from Bwalya to reply through, so Zuri can’t send this for you. Copy it and open Telegram.</div></div>' +
        '<div class="pad btns">' + btn('Copy & open Telegram', 'fill', { icon: 'open_in_new', toast: 'Copied · opening Telegram' }) + btn('Report', 'text', { icon: 'flag' }) + '</div>');
    } });

  Z.add({ id: 'P15', name: 'Commitments', group: P, data: 'L', ms: 'M4', purpose: 'Promises you made and promises made to you, each tied to its message.',
    render: function () {
      return frame({ ctx: 'personal', top: stop('Commitments'), body:
        '<div class="chips">' + chip('I promised · 4', { on: 1 }) + chip('Promised to me · 2') + chip('Done') + '</div>' +
        list([row({ lead: av('chanda', { src: 'wa' }), t: 'Bring the wedding photos', s: 'To Chanda · Fri 27 Nov · from her message today', meta: tag('3 days', 'warn'), go: 'P03' }),
          row({ lead: av('mama', { src: 'wa' }), t: 'Call Mum on Sunday', s: 'To Mum · Sun 29 Nov', meta: tag('5 days') }),
          row({ lead: av('chanda', { src: 'wa' }), t: 'Return “Things Fall Apart”', s: 'To Chanda · no date', meta: tag('Open'), go: 'P03' }),
          row({ lead: av('nalu', { src: 'wa' }), t: 'Bring snacks to book club', s: 'To Book club · Thu 26 Nov', meta: tag('2 days') })]) +
        hint('Zuri marks a promise done when you confirm, or when a later message clearly shows it happened.', 'task_alt') });
    } });
}
