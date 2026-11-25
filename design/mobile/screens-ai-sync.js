/* E · AI & local models, F · Synchronisation */
{
  var E = 'E · AI & models', F = 'F · Sync';

  Z.add({ id: 'A01', name: 'Model library', group: E, data: 'L', ms: 'M3', purpose: 'Installed and available on-device models, with what each is used for.',
    notes: ['The catalog is data (signed JSON), so models can change without an app release.', 'Gemini Nano is offered only for quick foreground rewrites: Android blocks it in the background.'],
    render: function () {
      function m(t, s, meta, g, icon) { return row({ lead: '<span class="ico ' + (icon ? 'br' : 'c') + '">' + I(icon || 'neurology') + '</span>', t: t, s: s, meta: meta, go: g, wrap: 1 }); }
      return frame({ ctx: 'personal', top: stop('AI & models'), body:
        card('<div style="display:flex;justify-content:space-between;align-items:center"><div><div class="small">This phone</div><h3>Standard tier · 8 GB</h3><p>Runs a 2B model comfortably</p></div>' + btn('Details', 'tonal', { go: 'A03' }) + '</div>') +
        sec('Installed') + list([m('Gemma 4 E2B', 'Understanding, replies, documents · 1.5 GB', tag('Active', 'ok'), 'A04', 'neurology'), m('EmbeddingGemma 300M', 'Search and Ask · 180 MB', tag('Active', 'ok'), 'A04')]) +
        sec('Available') + list([m('Gemma 4 E4B', 'Better reasoning · 3.1 GB · slower here', btn('Get', 'tonal', { go: 'A02' })), m('Qwen 2.5 1.5B', 'Alternative · strong at structured output · 1.6 GB', btn('Get', 'out')), m('Gemini Nano (Android)', 'Quick rewrites while Zuri is open · no download', tag('Available'))]) +
        list([row({ lead: '<span class="ico">' + I('tune') + '</span>', t: 'Processing preferences', meta: I('chevron_right'), go: 'A05' }), row({ lead: '<span class="ico">' + I('route') + '</span>', t: 'Recent AI activity', meta: I('chevron_right'), go: 'A06' }), row({ lead: '<span class="ico">' + I('cloud') + '</span>', t: 'Cloud AI', s: 'Off except document drafting in Kalulu', meta: I('chevron_right'), go: 'A07' })]) });
    } });

  Z.add({ id: 'A02', name: 'Model download', group: E, data: 'L', ms: 'M3', purpose: 'Resumable, verified download that keeps going in the background.',
    notes: ['Survives app kill, reboot and network loss (HTTP range resume).', 'SHA-256 checked before the model can run; a corrupted file is deleted.'],
    render: function () {
      return frame({ ctx: 'personal', top: stop('Gemma 4 E4B'), body:
        card('<div style="display:flex;justify-content:space-between"><h3>Downloading</h3><b class="tnum">46%</b></div><div class="prog" style="margin:10px 0"><i style="width:46%"></i></div><p class="tnum">1.4 of 3.1 GB · about 6 min on Wi-Fi</p><div class="btns" style="margin-top:12px">' + btn('Pause', 'out', { toast: 'Paused · resumes where it left off' }) + btn('Cancel', 'text') + '</div>') +
        card('<dl class="kv"><dt>Network</dt><dd>Wi-Fi only</dd><dt>Space after install</dt><dd>37.9 GB free</dd><dt>Licence</dt><dd>Apache 2.0</dd><dt>Verified by</dt><dd>SHA-256 after download</dd></dl>') +
        hint('Zuri keeps using Gemma 4 E2B until this finishes. Models are never included in phone backups.', 'info') });
    } });

  Z.add({ id: 'A03', name: 'Model compatibility', group: E, data: 'L', ms: 'M3', purpose: 'What this phone can run, measured rather than guessed.',
    render: function () {
      function b(t, v, w, st) { return '<div class="bar" style="margin-bottom:10px"><span style="width:110px">' + t + '</span><span class="tr"><i style="width:' + w + '%;' + (st || '') + '"></i></span><span class="v">' + v + '</span></div>'; }
      return frame({ ctx: 'personal', top: stop('Compatibility'), body:
        card('<dl class="kv"><dt>Memory</dt><dd>8 GB (5.1 GB free now)</dd><dt>Processor</dt><dd>8-core arm64 · GPU available</dd><dt>Android</dt><dd>16</dd><dt>Storage free</dt><dd>41 GB</dd><dt>Temperature</dt><dd>Normal</dd></dl>') +
        sec('Measured speed · words per second') + card(b('Gemma 4 E2B', '14', 70) + b('Gemma 4 E4B', '6', 30) + b('Qwen 2.5 1.5B', '16', 80) + b('Phi-4-mini', 'won’t fit', 4, 'background:var(--bad)') + '<p class="small">Phi-4-mini needs about 6 GB free memory.</p>') +
        '<div class="pad">' + btn('Run the test again', 'out blk', { icon: 'speed', toast: 'Benchmark running · about 30 s' }) + '</div>' });
    } });

  Z.add({ id: 'A04', name: 'Model settings', group: E, data: 'L', ms: 'M3', purpose: 'Which model does which task, and how it treats the battery.',
    render: function () {
      function t(a, b) { return row({ t: a, s: b, meta: I('chevron_right') }); }
      return frame({ ctx: 'personal', top: stop('Model settings'), body:
        sec('Who does what') + list([t('Understanding messages', 'Gemma 4 E2B'), t('Reply drafts', 'Gemma 4 E2B'), t('Documents', 'Gemma 4 E2B'), t('Search & Ask', 'EmbeddingGemma + Gemma 4 E2B'), t('Quick rewrites', 'Gemini Nano, while Zuri is open')]) +
        sec('Resources') + list([row({ t: 'Keep model ready while Zuri is open', s: 'Faster answers; released after 60 s idle', meta: sw(true) }), row({ t: 'Pause when the phone is warm', s: 'Recommended', meta: sw(true) })]) });
    } });

  Z.add({ id: 'A05', name: 'AI processing preferences', group: E, data: 'L', ms: 'M3', purpose: 'When and how much Zuri processes.',
    render: function () {
      return frame({ ctx: 'personal', top: stop('Processing'), body:
        list([row({ t: 'Understand new messages', s: 'Right away for a few; big batches while charging', meta: I('chevron_right'), wrap: 1 }), row({ t: 'Analyse group chats', s: 'Off · groups are stored but not analysed', meta: sw(false), wrap: 1 }), row({ t: 'Business details in messages', s: 'Prices, orders, suppliers · business workspaces only', meta: sw(true), wrap: 1 }), row({ t: 'Keep raw notifications', s: '7 days, for reprocessing', meta: I('chevron_right') })]) +
        hint('On phones without a model, Zuri still finds dates, promises and follow-ups with rules, just less precisely.', 'bolt') });
    } });

  Z.add({ id: 'A06', name: 'Router status', group: E, data: 'L', ms: 'M3', purpose: 'Recent AI tasks: which model ran, where, and how long it took.',
    render: function () {
      function r(t, s, m) { return row({ lead: '<span class="ico c">' + I('smartphone') + '</span>', t: t, s: s, meta: m }); }
      return frame({ ctx: 'personal', top: stop('Recent AI activity'), body:
        '<div class="chips">' + chip('All', { on: 1 }) + chip('On phone · 41') + chip('Cloud · 2') + '</div>' +
        list([r('Understood 6 messages', 'Gemma 4 E2B · Personal · 9:52', '7.1 s'), r('Embedded 6 messages', 'EmbeddingGemma · Personal · 9:52', '0.4 s'), r('Drafted proposal', 'Gemma 4 E2B · Kalulu · 10:42', '38 s'), r('Parsed a business question', 'Gemma 4 E2B · Kalulu · 10:55', '0.9 s'),
          row({ lead: '<span class="ico warn">' + I('cloud') + '</span>', t: 'Quality check on proposal', s: 'Zuri cloud · Kalulu · 10:20 · you allowed', meta: '2.2 s', go: 'A08' })]) });
    } });

  Z.add({ id: 'A07', name: 'Local & remote processing', group: E, data: 'L', ms: 'M3', purpose: 'Cloud AI per task and per workspace. Off unless you choose.',
    notes: ['Every cloud request passes one gate and is written to the ledger (D-13).', 'ID numbers and other vault items are never sent, whatever these switches say.'],
    q: ['Offer “use your own API key” on the phone (Q-02)?'],
    render: function () {
      function t(a, b, v) { return row({ t: a, s: b, meta: v, wrap: 1 }); }
      return frame({ ctx: 'personal', top: stop('Cloud AI'), body:
        hint('With cloud AI off, Zuri uses only the models on this phone. Nothing switches over silently if a model is missing.', 'cloud_off') +
        sec('Personal') + list([t('All tasks', 'Never send personal content', tag('Off'))]) +
        sec('Kalulu Irrigation') + list([t('Document drafting & checks', 'Zuri cloud · via your account', tag('Allowed', 'warn')), t('Business questions', 'Ask me each time', tag('Ask')), t('Understanding messages', 'Always on this phone', tag('Off'))]) +
        sec('Mwale Design Studio') + list([t('All tasks', 'This workspace is on this phone only', tag('Off'))]) +
        sec('Providers') + list([row({ t: 'Zuri cloud', s: 'Uses your Zuri account and plan', meta: tag('Connected', 'ok') }), row({ t: 'Your own API key', s: 'Not set', meta: I('chevron_right') })]) });
    } });

  Z.add({ id: 'A08', name: 'What leaves my phone', group: E, data: 'L', ms: 'M3', purpose: 'A plain record of everything sent to cloud AI: when, why, where, how much.',
    notes: ['Content isn’t stored in the ledger unless you turn that on; references to records are.'],
    render: function () {
      function e(t, s, m) { return row({ lead: '<span class="ico warn">' + I('outbound') + '</span>', t: t, s: s, meta: m, wrap: 1 }); }
      return frame({ ctx: 'personal', top: stop('What leaves my phone'), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico ok">' + I('verified_user', 'f') + '</span><div><h3>Nothing from Personal, ever</h3><p>2 requests today, both from Kalulu Irrigation, both allowed by you.</p></div></div>') +
        sec('Today') + list([e('Quality check · proposal draft', 'Kalulu · Zuri cloud · 3.1 KB · “always for documents”', '10:20'), e('Document drafting · section rewrite', 'Kalulu · Zuri cloud · 2.4 KB · “always for documents”', '08:31')]) +
        sec('Never sent') + card('<ul style="margin:0;padding-left:18px;font-size:13.5px;color:var(--muted)"><li>Your messages for understanding</li><li>Anything in Personal or Mwale Design Studio</li><li>Vault items (ID numbers, bank details)</li></ul>') +
        '<div class="pad">' + btn('Export this record', 'out blk', { icon: 'download' }) + '</div>' });
    } });

  /* ---------- sync ---------- */
  Z.add({ id: 'S01', name: 'Cloud connection (not connected)', group: F, data: 'L', ms: 'M7', purpose: 'Where you connect a Zuri account, with what it does and doesn’t do.',
    render: function () {
      return frame({ ctx: 'personal', top: stop('Zuri account'), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico">' + I('cloud_off') + '</span><div style="flex:1"><h3>Not connected</h3><p>Everything works on this phone. Connect to bring your Zuri web history and business data here.</p></div></div><div style="margin-top:12px">' + btn('Connect account', 'brand blk', { go: 'G05' }) + '</div>') +
        hint('You’ll choose separately what to import, whether to keep syncing, what to upload and whether to use cloud AI.', 'checklist') });
    } });

  Z.add({ id: 'S01C', name: 'Cloud connection (connected)', group: F, data: 'C', ms: 'M7', purpose: 'Account summary and the next, separate choices.',
    render: function () {
      return frame({ ctx: 'personal', top: stop('Zuri account'), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico ok">' + I('cloud_done', 'f') + '</span><div style="flex:1"><h3>Connected</h3><p>natasha@kalulu.example</p></div></div><div class="hr"></div><dl class="kv"><dt>Plan</dt><dd>Business</dd><dt>Organisation</dt><dd>Kalulu Irrigation · owner</dd><dt>Cloud WhatsApp line</dt><dd>+260 97 ••• ••20 · online</dd></dl>') +
        sec('Next steps') + list([row({ lead: '<span class="ico c">' + I('download') + '</span>', t: 'Bring your history to this phone', s: '1,284 contacts · 212 chats · 146 documents', meta: I('chevron_right'), go: 'G06' }), row({ lead: '<span class="ico c">' + I('sync') + '</span>', t: 'Sync preferences', s: 'Not set', meta: I('chevron_right'), go: 'G07' })]) +
        list([row({ lead: '<span class="ico bad">' + I('link_off') + '</span>', t: 'Disconnect account', s: 'Your data on this phone stays', go: 'S08' })]) });
    } });

  Z.add({ id: 'S02', name: 'Initial import progress', group: F, data: 'C → L', ms: 'M8', purpose: 'Batched, resumable import with honest progress.',
    notes: ['Checkpoints per category: safe to close the app or lose signal.', 'Re-running an import creates no duplicates.'],
    render: function () {
      function p(t, v, w, st) { return '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>' + t + '</span><span class="muted tnum">' + v + '</span></div><div class="prog" style="margin-top:6px"><i style="width:' + w + '%;' + (st || '') + '"></i></div></div>'; }
      return frame({ ctx: 'neutral', top: stop('Importing', { sub: 'Wi-Fi · safe to leave' }), body:
        card(p('People & companies', 'done · 1,284', 100) + p('WhatsApp chats', 'done · 212', 100) + p('Messages', '11,430 of 18,430', 62) + p('Documents', 'waiting', 0) + p('Projects, deals, calendar, goals', 'waiting', 0) + p('Products & services', 'waiting', 0)) +
        list([row({ lead: '<span class="ico warn">' + I('person_search') + '</span>', t: '18 possible same-person matches', s: 'Review when import finishes', meta: I('chevron_right') })]) +
        '<div class="pad btns">' + btn('Pause', 'out', { toast: 'Import paused · resumes from here' }) + btn('Finish in background', 'fill', { go: 'S01C', toast: 'Import continues in the background' }) + '</div>' });
    } });

  Z.add({ id: 'S03', name: 'Sync status', group: F, data: 'L', ms: 'M9', purpose: 'Per-category state, pending changes and conflicts.',
    render: function () {
      return frame({ ctx: 'personal', top: stop('Sync', { actions: '<button class="ibtn" data-go="S04">' + I('history') + '</button>' }), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico ok">' + I('sync', 'f') + '</span><div style="flex:1"><h3>Up to date</h3><p>Last sync 4 min ago · Wi-Fi</p></div>' + btn('Pause', 'out', { go: 'S07' }) + '</div>') +
        list([row({ lead: '<span class="ico bad">' + I('merge_type') + '</span>', t: '1 conflict needs you', s: 'QUO-0045 changed on the web and here', meta: I('chevron_right'), go: 'S06' })]) +
        sec('Categories', 'Choose', 'S05') + list([row({ t: 'People & companies', s: '1,291 · pulled 4 min ago', meta: tag('Synced', 'ok') }), row({ t: 'Chats & messages', s: 'From cloud only', meta: tag('Synced', 'ok') }), row({ t: 'Kalulu documents & deals', s: '2 changes waiting to upload', meta: tag('2 pending', 'warn') }), row({ t: 'Captured WhatsApp messages', s: 'Stay on this phone', meta: tag('Not uploaded') })]) });
    } });

  Z.add({ id: 'S04', name: 'Sync history', group: F, data: 'L', ms: 'M9', purpose: 'A log of sync runs.',
    render: function () {
      return frame({ ctx: 'personal', top: stop('Sync history'), body: list([row({ t: 'Today 10:58', s: '↓ 14 changes · ↑ 2 · no errors' }), row({ t: 'Today 10:42', s: '↓ 3 changes · ↑ 1' }), row({ t: 'Today 08:10', s: '↓ 61 changes · ↑ 0' }), row({ t: 'Yesterday 21:30', s: 'Paused by you' }), row({ t: 'Yesterday 18:02', s: '↓ 9 · 1 conflict (resolved)' })]) });
    } });

  Z.add({ id: 'S05', name: 'Data categories', group: F, data: 'L', ms: 'M9', purpose: 'What syncs in which direction, and what has been uploaded.',
    render: function () {
      function c(t, d, on) { return row({ t: t, s: d, meta: sw(on), wrap: 1 }); }
      return frame({ ctx: 'personal', top: stop('What syncs'), body:
        sec('From Zuri cloud') + list([c('People, chats, documents, projects', 'Kept up to date', true), c('Sensitive insights', 'Emotional and personality insights', false)]) +
        sec('Uploaded from this phone') + list([c('Kalulu documents & deals', '37 items uploaded', true), c('Captured WhatsApp messages', 'None uploaded', false), c('Memories', 'None uploaded', false)]) +
        list([row({ lead: '<span class="ico bad">' + I('cloud_off') + '</span>', t: 'Delete uploaded data from the cloud', s: 'Removes items this phone uploaded' })]) +
        '<div class="pad">' + btn('Done', 'fill blk', { go: 'S03' }) + '</div>' });
    } });

  Z.add({ id: 'S06', name: 'Conflict resolution', group: F, data: 'L + C', ms: 'M9', purpose: 'Money is never merged automatically: you choose.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Resolve conflict', { sub: 'QUO-0045 · Banda Orchards' }), body:
        '<div class="grid2"><div class="card"><div class="small">On the web · 10:31 by Kabwe</div><h3 style="margin-top:6px">Drip kit × <span class="diff-old">3</span></h3><p class="tnum">Total K 7,800.00</p></div><div class="card"><div class="small">On this phone · 10:36 by you</div><h3 style="margin-top:6px">Drip kit × <span class="diff-new">4</span></h3><p class="tnum">Total K 10,400.00</p></div></div>' +
        hint('Quotes and invoices are never merged automatically, so the totals always match one person’s decision.', 'lock') +
        list([row({ t: 'Keep mine as a new version', s: 'The web version stays in history', meta: I('radio_button_checked', 'f') }), row({ t: 'Use the web version', s: 'Your change is kept in history for 30 days', meta: I('radio_button_unchecked') }), row({ t: 'Compare line by line', s: 'Pick each line', meta: I('radio_button_unchecked') })]) +
        '<div class="pad">' + btn('Apply', 'fill blk', { go: 'S03', toast: 'Resolved · saved as version 3' }) + '</div>' });
    } });

  Z.add({ id: 'S07', name: 'Pause sync', group: F, data: 'L', ms: 'M9', purpose: 'Pausing is safe; this explains what keeps working.',
    render: function () {
      return withSheet('S03', '<h2>Pause sync?</h2><p>Everything on this phone keeps working. Changes you make wait here and upload when you resume.</p>' +
        '<div class="list" style="margin:0 12px 12px">' + row({ t: 'For 1 hour' }) + row({ t: 'Until tomorrow' }) + row({ t: 'Until I resume' }) + '</div><div class="pad">' + btn('Pause', 'fill blk', { go: 'S03', toast: 'Sync paused until you resume' }) + '</div>');
    } });

  Z.add({ id: 'S08', name: 'Disconnect account', group: F, data: 'L', ms: 'M7', purpose: 'Disconnect without losing what’s on the phone.',
    notes: ['Default keeps everything. Signing out revokes this phone’s token on the server (RFC G1).'],
    render: function () {
      function o(t, s, on) { return row({ t: t, s: s, meta: I(on ? 'radio_button_checked' : 'radio_button_unchecked', on ? 'f' : ''), wrap: 1 }); }
      return frame({ ctx: 'neutral', top: stop('Disconnect'), body:
        '<div class="big"><h1>Disconnect from Zuri cloud?</h1><p>Choose what stays on this phone.</p></div>' +
        list([o('Keep everything', 'Cloud copies stay here, read-only and no longer updated', true), o('Keep only what this phone created', 'Removes imported cloud data from this phone', false), o('Remove all cloud data from this phone', 'Phone-created data stays', false)]) +
        card('<div style="display:flex;gap:10px"><span class="ico warn">' + I('upload') + '</span><div><b>2 changes haven’t uploaded</b><p>Upload them first, export them, or discard them.</p></div></div>') +
        '<div class="pad btns">' + btn('Upload first', 'out', { toast: 'Uploaded 2 changes' }) + btn('Disconnect', 'fill', { go: 'P01', toast: 'Disconnected · your data is still here' }) + '</div>' });
    } });
}
