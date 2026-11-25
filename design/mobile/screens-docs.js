/* D · Document Studio (workspace: Kalulu Irrigation). Money is computed by code, never by the model. */
{
  var D = 'D · Documents';
  var LINES = [
    { d: 'Pressure inspection visit', s: '6 visits · 2 sites × 3 months', q: 6, u: '850.00', t: '5,100.00', src: 'QUO-0042 rate · catalog' },
    { d: 'Filter replacement kit', s: '4 kits · 2 per site, Dec and Feb', q: 4, u: '1,240.00', t: '4,960.00', src: 'Catalog price' },
    { d: 'Drip line flush', s: '6 flushes · monthly per site', q: 6, u: '600.00', t: '3,600.00', src: 'QUO-0042 rate · catalog' }
  ];
  function lines(goId) {
    return '<div class="list">' + LINES.map(function (l) {
      return '<div class="doc-line"' + go(goId) + '><b>' + l.d + '</b><span class="amt">K ' + l.t + '</span><span>' + l.q + ' × K ' + l.u + ' · ' + l.s + '</span><span></span></div>';
    }).join('') + '<div class="tot"><span class="muted">Subtotal</span><span class="r">K 13,660.00</span><span class="muted">VAT 16% · business rule</span><span class="r">K 2,185.60</span><span class="g">Total</span><span class="r g">K 15,845.60</span></div></div>';
  }
  function steps(n) { var s = ''; for (var i = 0; i < 5; i++) s += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return '<div class="stepper">' + s + '</div>'; }

  Z.add({ id: 'D01', name: 'Document Studio home', group: D, ctx: 'biz', data: 'L + C', ms: 'M11', purpose: 'All documents in this workspace; drafts that need information come first.',
    notes: ['Cloud-bound workspace: drafts get an official number only when finalised online (D-10).'],
    render: function () {
      return frame({ ctx: 'biz', top: rootTop('biz'), nav: 'D01', fab: { icon: 'add', t: 'Create', go: 'D02' }, body:
        '<div class="big" style="padding-bottom:8px"><h1>Documents</h1></div><div class="chips">' + chip('All', { on: 1 }) + chip('Drafts · 2') + chip('Quotations') + chip('Invoices') + chip('Proposals') + chip('Overdue · 2') + '</div>' +
        sec('Needs your input') + list([row({ lead: '<span class="ico warn">' + I('edit_document') + '</span>', t: 'Proposal · Mwila Farms maintenance', s: 'Draft · 1 question left · K 15,845.60', meta: tag('Draft', 'warn'), go: 'D07' })]) +
        sec('Recent') + list([row({ lead: '<span class="ico ok">' + I('receipt_long') + '</span>', t: 'INV-0103 · Kafue Estate', s: 'Invoice · paid 20 Nov', meta: '<b class="tnum">K 22,040.00</b>' }), row({ lead: '<span class="ico bad">' + I('receipt_long') + '</span>', t: 'INV-0098 · Chongwe Greens Co-op', s: 'Invoice · 41 days overdue', meta: '<b class="tnum">K 14,200.00</b>' }), row({ lead: '<span class="ico">' + I('request_quote') + '</span>', t: 'QUO-0042 · Mwila Farms', s: 'Quotation · accepted 14 Oct', meta: '<b class="tnum">K 9,604.80</b>' })]) });
    } });

  Z.add({ id: 'D02', name: 'Document type selector', group: D, ctx: 'biz', data: '—', ms: 'M11', purpose: 'Pick a type, or describe what you need.',
    notes: ['Types mirror the server registry (18 business types) plus personal letters.'],
    render: function () {
      function t(i, a, g) { return '<div class="tile"' + go(g || 'D03') + ' style="min-height:76px;flex-direction:row;align-items:center"><span class="ico c">' + I(i) + '</span><b>' + a + '</b></div>'; }
      return frame({ ctx: 'biz', top: stop('New document'), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico br">' + I('auto_awesome', 'f') + '</span><div style="flex:1"><h3>Describe it instead</h3><p>“Proposal for Mwila Farms, monthly maintenance, same rates as last time”</p></div>' + I('chevron_right') + '</div>', 'tint', 'D03') +
        sec('Sales') + '<div class="grid2">' + t('request_quote', 'Quotation') + t('article', 'Proposal') + t('receipt_long', 'Invoice') + t('receipt', 'Receipt') + t('summarize', 'Statement') + t('undo', 'Credit note') + '</div>' +
        sec('Agreements') + '<div class="grid2">' + t('handshake', 'Service agreement') + t('assignment', 'Scope of work') + t('gavel', 'Contract') + t('lock', 'NDA') + '</div>' +
        sec('Operations & personal') + '<div class="grid2">' + t('local_shipping', 'Purchase order') + t('summarize', 'Meeting summary') + t('mail', 'Business letter') + t('edit_note', 'Personal letter') + '</div>' });
    } });

  Z.add({ id: 'D03', name: 'Create from natural language', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'Say what you need in your own words.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Describe your document'), body: steps(1) +
        '<div class="field focus" style="min-height:140px"><label>What should Zuri prepare?</label><div style="line-height:1.5">Proposal for Mwila Farms: monthly maintenance of both drip sites for 3 months, starting December. Same rates as the last quote.</div></div>' +
        '<div class="chips">' + chip('Kalulu Irrigation', { on: 1, icon: 'water_drop' }) + chip('Proposal', { icon: 'article' }) + chip('Dictate', { icon: 'mic' }) + '</div>' +
        hint('Zuri drafts the wording. Prices come only from your catalog and past documents, and anything missing becomes a question for you.', 'calculate') +
        '<div class="pad">' + btn('Next: choose what Zuri can use', 'fill blk', { go: 'D04' }) + '</div>' });
    } });

  Z.add({ id: 'D04', name: 'Context selection', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'You see and control exactly what Zuri may read for this draft.',
    notes: ['Context is limited to this workspace; Personal is never offered unless you widen it.', 'Each chip becomes a provenance source in the editor.'],
    render: function () {
      return frame({ ctx: 'biz', top: stop('What Zuri can use'), body: steps(2) +
        sec('Included') + '<div class="chips" style="flex-wrap:wrap">' + chip('Mwila Tembo · client', { on: 1, icon: 'person', x: 1 }) + chip('Chat · last 30 days', { on: 1, icon: 'forum', x: 1 }) + chip('QUO-0042 · rates', { on: 1, icon: 'request_quote', x: 1 }) + chip('3 catalog items', { on: 1, icon: 'inventory_2', x: 1 }) + chip('Brand: Kalulu Irrigation', { on: 1, icon: 'palette', x: 1 }) + chip('Business rules', { on: 1, icon: 'rule', x: 1 }) + '</div>' +
        sec('Suggested') + '<div class="chips" style="flex-wrap:wrap">' + chip('Kafue Estate proposal (similar)', { icon: 'add' }) + chip('Chisamba project notes', { icon: 'add' }) + '</div>' +
        card('<div style="display:flex;gap:10px"><span class="ico">' + I('block') + '</span><div><b>Not used</b><p>Personal workspace, Mwale Design Studio, other clients’ chats.</p></div></div>', 'flat') +
        card('<dl class="kv"><dt>Drafting model</dt><dd>Gemma 4 E2B · on this phone</dd><dt>Cloud AI</dt><dd>Off for this workspace</dd></dl>') +
        '<div class="pad">' + btn('Draft proposal', 'fill blk', { icon: 'auto_awesome', go: 'D05' }) + '</div>' });
    } });

  Z.add({ id: 'D05', name: 'Missing information', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'Zuri asks instead of guessing. Required answers block finalising.',
    notes: ['Values Zuri could source are shown with their source and can be changed.', 'Optional fields may be left blank, visibly; nothing is invented.'],
    render: function () {
      function found(t, v, s) { return row({ lead: '<span class="ico ok">' + I('check') + '</span>', t: t + ': ' + v, s: s }); }
      return frame({ ctx: 'biz', top: stop('A few details'), body: steps(3) +
        sec('Zuri found') + list([found('Sites', 'Chisamba and Kafue', 'Mwila · WhatsApp 18 Nov'), found('Rates', 'K 850 visit · K 600 flush', 'QUO-0042 · accepted 14 Oct'), found('Payment terms', '30 days', 'Business rule')]) +
        sec('Please confirm') + field('Start date · required', '1 December 2026', 'focus') + field('Proposal valid until · required', '24 December 2026 (default 30 days)') + field('Filter kits · how many?', '4 (2 per site, Dec and Feb)') +
        field('Client tax number (TPIN) · optional', 'Leave blank', 'empty') +
        '<div class="pad">' + btn('Continue to template', 'fill blk', { go: 'D06' }) + '</div>' });
    } });

  Z.add({ id: 'D06', name: 'Template selector', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'The same 8 layouts as the web, rendered on the phone.',
    notes: ['Renders the shared @zuri/pdf-templates package in an offline WebView, so output matches the web exactly (D-09).'],
    render: function () {
      var names = ['Executive', 'Modern', 'Classic', 'Corporate', 'Elegant', 'Minimal', 'Compact', 'Creative'];
      var tiles = names.map(function (n, i) {
        var col = ['#1e1b4b', '#4f46e5', '#111827', '#0f766e', '#7c2d12', '#6b7280', '#374151', '#a3367f'][i];
        return '<div class="tmpl ' + (i === 0 ? 'on' : '') + '"' + go('D07') + '><div class="pg"><i style="background:' + col + ';height:8px;width:60%"></i><i style="width:40%"></i><i style="width:90%;margin-top:6px"></i><i style="width:80%"></i><i style="width:85%"></i><i style="width:50%;margin-top:auto;background:' + col + '"></i></div><b>' + n + (i === 0 ? ' · brand default' : '') + '</b></div>';
      }).join('');
      return frame({ ctx: 'biz', top: stop('Choose a layout'), body: steps(4) + '<div class="grid2">' + tiles + '</div>' });
    } });

  Z.add({ id: 'D07', name: 'Document editor', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'Structured editing: sections you can regenerate, lines you can edit, totals you can’t.',
    notes: ['Totals are calculated (lock icon): integer ngwee, same rounding as the server.', 'AI-drafted sections stay marked until you review them.'],
    render: function () {
      function s(t, st, g) { return row({ lead: '<span class="ico c">' + I('notes') + '</span>', t: t, s: st, meta: I('chevron_right'), go: g }); }
      return frame({ ctx: 'biz', top: stop('Proposal · Mwila Farms', { sub: 'Draft · number assigned when finalised', actions: '<button class="ibtn" data-go="D13">' + I('history') + '</button>' }), body:
        '<div class="chips">' + chip('Validate', { icon: 'rule', go: 'D11' }) + chip('Preview', { icon: 'visibility', go: 'D10' }) + chip('Sources', { icon: 'account_tree', go: 'D12' }) + chip('Template', { icon: 'palette', go: 'D06' }) + '</div>' +
        card('<dl class="kv"><dt>Client</dt><dd>Mwila Tembo · Mwila Farms</dd><dt>Issued</dt><dd>24 Nov 2026</dd><dt>Valid until</dt><dd>24 Dec 2026</dd><dt>Currency</dt><dd>ZMW</dd></dl>') +
        sec('Sections') + list([s('Overview', 'Reviewed', 'D08'), s('Scope of work', 'From Mwila’s message · reviewed', 'D08'), s('Schedule', tag('AI-drafted · review', 'warn'), 'D08'), s('Terms', 'From business rules', 'D08')]) +
        sec('Pricing', 'Add line', 'D09') + lines('D09') +
        '<div class="small" style="padding:0 20px">' + I('lock') + ' Totals are calculated from the lines and can’t be typed over.</div>',
        bottom: '<div class="composer">' + btn('Preview', 'out', { go: 'D10' }) + '<span style="flex:1"></span>' + btn('Validate & finalise', 'fill', { go: 'D11' }) + '</div>' });
    } });

  Z.add({ id: 'D08', name: 'Section editing', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'Edit one section; regenerate with guidance; see its sources.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Scope of work'), body:
        '<div class="field focus" style="min-height:170px"><label>Section text</label><div style="line-height:1.55">Kalulu Irrigation will inspect and maintain the drip systems at both Mwila Farms sites, Chisamba and Kafue, once a month from December 2026 to February 2027. Each visit covers a pressure inspection and a line flush. Filters are replaced at both sites in December and February.</div></div>' +
        sec('Sources') + '<div class="chips" style="flex-wrap:wrap">' + chip('Mwila · 18 Nov “check both sites monthly”', { icon: 'forum', go: 'P03B' }) + chip('Your answers · start date, filters', { icon: 'edit' }) + '</div>' +
        sec('Rewrite') + '<div class="chips" style="flex-wrap:wrap">' + chip('Shorter') + chip('More formal') + chip('Add what’s not included') + chip('Explain in my words…') + '</div>' +
        hint('Rewrites can change wording, never the scope facts: sites, months and quantities come from the sources above.', 'verified') +
        '<div class="pad">' + btn('Done', 'fill blk', { back: 1 }) + '</div>' });
    } });

  Z.add({ id: 'D09', name: 'Financial line editing', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'Edit a line; the line total and tax are calculated live.',
    notes: ['Catalog price is the default; overriding needs a reason, which is recorded in provenance.'],
    render: function () {
      return withSheet('D07', '<h2>Pressure inspection visit</h2><p>From your catalog · used in QUO-0042</p>' +
        '<div class="grid2" style="margin:0 12px 10px">' + '<div class="field" style="margin:0"><label>Quantity</label><div>6</div></div><div class="field" style="margin:0"><label>Unit price (K)</label><div>850.00 ' + I('lock') + '</div></div><div class="field" style="margin:0"><label>Discount</label><div>0%</div></div><div class="field" style="margin:0"><label>VAT</label><div>16%</div></div></div>' +
        '<div class="card flat"><div class="tot" style="padding:0"><span class="muted">Line total</span><span class="r">K 5,100.00</span><span class="muted">VAT</span><span class="r">K 816.00</span></div></div>' +
        '<div class="pad btns">' + btn('Change price…', 'out') + '<span style="flex:1"></span>' + btn('Save line', 'fill', { back: 1 }) + '</div>');
    } });

  Z.add({ id: 'D10', name: 'Document preview', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'The rendered PDF, identical to what the web would produce.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Preview', { sub: 'Executive · page 1 of 2', actions: '<button class="ibtn" data-go="D14">' + I('ios_share') + '</button>' }), body:
        '<div class="paper"><div class="band"></div><div style="display:flex;justify-content:space-between"><div><h4>Kalulu Irrigation Ltd</h4><div>Plot 12, Great East Road, Lusaka</div></div><div style="text-align:right"><b style="font-size:12px">PROPOSAL</b><div>DRAFT · not yet numbered</div><div>24 Nov 2026</div></div></div>' +
        '<div style="margin-top:12px"><b>Prepared for</b><div>Mwila Tembo, Mwila Farms</div></div><div style="margin-top:10px"><b>Scope of work</b><div>Monthly inspection and maintenance of the Chisamba and Kafue drip systems, Dec 2026 to Feb 2027.</div></div>' +
        '<table><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr><tr><td>Pressure inspection visit</td><td class="r">6</td><td class="r">850.00</td><td class="r">5,100.00</td></tr><tr><td>Filter replacement kit</td><td class="r">4</td><td class="r">1,240.00</td><td class="r">4,960.00</td></tr><tr><td>Drip line flush</td><td class="r">6</td><td class="r">600.00</td><td class="r">3,600.00</td></tr><tr><td></td><td></td><td class="r">Subtotal</td><td class="r">13,660.00</td></tr><tr><td></td><td></td><td class="r">VAT 16%</td><td class="r">2,185.60</td></tr><tr><td></td><td></td><td class="r"><b>Total ZMW</b></td><td class="r"><b>15,845.60</b></td></tr></table></div>' +
        '<p class="small" style="text-align:center;margin-top:10px">Rendered on this phone in 1.4 s · template v2026.11</p>' });
    } });

  Z.add({ id: 'D11', name: 'Validation', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'Checks before finalising, each with a fix.',
    render: function () {
      function v(s, t, d, g) { var i = { ok: 'check_circle', warn: 'warning', bad: 'error' }[s]; return row({ lead: '<span class="ico ' + s + '">' + I(i, 'f') + '</span>', t: t, s: d, meta: g ? I('chevron_right') : '', go: g, wrap: 1 }); }
      return frame({ ctx: 'biz', top: stop('Checks'), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico ok">' + I('task_alt', 'f') + '</span><div><h3>Ready, with 2 notes</h3><p>Nothing blocks finalising.</p></div></div>') +
        list([v('ok', 'Totals match the lines', 'K 15,845.60 recalculated'), v('ok', 'Prices match your catalog', '3 of 3 lines'), v('ok', 'Dates make sense', 'Valid until is after the issue date'), v('ok', 'Only Kalulu Irrigation data used', 'No other workspace referenced', 'D12'),
          v('warn', 'Schedule section not reviewed yet', 'It was drafted by the on-device model', 'D08'), v('warn', 'Client tax number is blank', 'Optional for proposals')]) +
        hint('Finalising assigns the next proposal number (PRO-0017) from Zuri cloud, so you need to be online.', 'tag') +
        '<div class="pad btns">' + btn('Review schedule', 'out', { go: 'D08' }) + btn('Finalise', 'fill', { go: 'D14', toast: 'Finalised as PRO-0017' }) + '</div>' });
    } });

  Z.add({ id: 'D12', name: 'Provenance inspector', group: D, ctx: 'biz', data: 'L', ms: 'M11', purpose: 'Where every part of the document came from.',
    render: function () {
      function p(t, s, i) { return row({ lead: '<span class="ico c">' + I(i) + '</span>', t: t, s: s, wrap: 1 }); }
      return frame({ ctx: 'biz', top: stop('Sources'), body:
        list([p('Scope of work', 'Mwila’s WhatsApp message, 18 Nov · your answers', 'forum'), p('Schedule', 'Drafted by Gemma 4 E2B on this phone · not reviewed', 'auto_awesome'), p('Rates: inspection, flush', 'QUO-0042, accepted 14 Oct · matches catalog', 'request_quote'), p('Filter kit price', 'Catalog · Lubinda’s price unchanged', 'inventory_2'), p('VAT 16%', 'Business rule', 'rule'), p('Valid until', 'Default 30 days · you confirmed', 'event'), p('Client details', 'CRM · Mwila Tembo', 'person')]) +
        hint('Nothing in this document came from Personal or another business workspace.', 'lock') });
    } });

  Z.add({ id: 'D13', name: 'Version history', group: D, ctx: 'biz', data: 'L + C', ms: 'M11', purpose: 'Every version, with what changed.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Versions'), body:
        list([row({ lead: '<span class="ico c">' + I('edit') + '</span>', t: 'v3 · you', s: 'Today 10:51 · current draft', meta: tag('Current', 'c') }), row({ lead: '<span class="ico">' + I('edit') + '</span>', t: 'v2 · you', s: 'Today 10:47 · changed filter kits' }), row({ lead: '<span class="ico">' + I('auto_awesome') + '</span>', t: 'v1 · Zuri draft', s: 'Today 10:42 · on this phone' })]) +
        sec('v2 → v3') + card('<div style="font-size:14px;line-height:1.8">Filter replacement kit: quantity <span class="diff-old">2</span> <span class="diff-new">4</span><br>Total: <span class="diff-old">K 12,968.80</span> <span class="diff-new">K 15,845.60</span><br>Schedule: <span class="diff-new">filters in Dec and Feb</span></div>') });
    } });

  Z.add({ id: 'D14', name: 'Export & share', group: D, ctx: 'biz', data: 'L + C', ms: 'M11', purpose: 'PDF, Word, Android share sheet, or send through your Zuri WhatsApp line.',
    notes: ['Cloud send uses POST /api/documents/:id/send (works today). The web’s /send-whatsapp route is broken and not used.', 'Sending via Zuri cloud needs RFC G4 (no duplicate sends on retry).'],
    render: function () {
      function e(i, t, s, tt) { return row({ lead: '<span class="ico c">' + I(i) + '</span>', t: t, s: s, meta: I('chevron_right'), toast: tt }); }
      return frame({ ctx: 'biz', top: stop('PRO-0017 · Mwila Farms', { sub: 'Finalised · K 15,845.60' }), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico ok">' + I('verified', 'f') + '</span><div><h3>Finalised as PRO-0017</h3><p>Synced to Zuri cloud · visible on the web</p></div></div>') +
        list([e('picture_as_pdf', 'Share PDF', 'Executive layout · 2 pages · 184 KB', 'Android share sheet'), e('description', 'Share Word (.docx)', 'Editable copy', 'Android share sheet'), e('forum', 'Send to Mwila on WhatsApp', 'Through Kalulu’s Zuri WhatsApp line', 'Sent to Mwila Tembo · PRO-0017'), e('link', 'Copy client link', 'Mwila can view, accept and sign', 'Link copied')]) +
        hint('Zuri will remind you on Wednesday if Mwila hasn’t opened it.', 'notifications') });
    } });
}
