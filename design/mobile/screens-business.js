/* C · Business screens (workspace: Kalulu Irrigation, synced with Zuri cloud) */
{
  var B = 'C · Business';
  function kpi(label, val, sub, cls) { return '<div class="card"><div class="small">' + label + '</div><div class="num">' + val + '</div><div class="small ' + (cls || '') + '">' + sub + '</div></div>'; }
  function syncPill() { return '<span class="tag" style="margin-left:4px">' + I('cloud_done') + 'Synced 4 min ago</span>'; }

  Z.add({ id: 'B01', name: 'Business Today', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'The business brief: money, pipeline, what’s due, what Zuri noticed.',
    notes: ['Indigo tint and the context chip make the workspace unmistakable.', 'Money figures are server-authoritative when the workspace is cloud-bound; every figure opens its source list.'],
    render: function () {
      return frame({ ctx: 'biz', top: rootTop('biz'), nav: 'B01', body:
        '<div class="big"><p style="margin:0 0 2px">Tuesday, 24 November ' + syncPill() + '</p><h1>Kalulu Irrigation</h1></div>' +
        '<div class="grid2">' + kpi('Invoiced · Nov', 'K 48,200', '16 invoices') + kpi('Paid · Nov', 'K 31,600', '66% collected') + '<div class="card cc" data-go="B05A"><div class="small">Overdue 30+ days</div><div class="num" style="color:var(--bad)">K 23,480</div><div class="small">2 clients · why?</div></div>' + kpi('Open pipeline', 'K 112,000', '7 deals') + '</div>' +
        sec('Due this week') + list([row({ lead: av('mwila', { src: 'wab' }), t: 'Proposal for Mwila Farms', s: 'They asked for it by Fri 27 Nov', meta: tag('3 days', 'warn'), go: 'P03B' }), row({ lead: '<span class="ico">' + I('construction') + '</span>', t: 'Chisamba pump replacement', s: 'Milestone: commissioning · Thu', go: 'B09' })]) +
        sec('Zuri noticed', 'All', 'B02') +
        card('<div style="display:flex;gap:12px">' + av('thoko', { src: 'wab' }) + '<div style="flex:1"><h3>New lead: Banda Orchards wants a 2 ha drip quote</h3><p>From Thokozani on WhatsApp. Create the lead and a draft quotation?</p></div></div><div class="btns" style="margin-top:10px">' + btn('Review 2 actions', 'fill', { toast: 'Lead and draft quotation created' }) + btn('Dismiss', 'text') + '</div>') +
        card('<div style="display:flex;gap:12px">' + av('lubinda', { src: 'wab' }) + '<div style="flex:1"><h3>Filter kits are back at K 1,240</h3><p>Lubinda’s price is unchanged from August. You have 14 in stock.</p></div></div>') });
    } });

  Z.add({ id: 'B02', name: 'Studio overview', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'The business hub: everything you run, one tap away.',
    render: function () {
      function t(i, a, b, g) { return '<div class="tile"' + go(g) + '><span class="ico c">' + I(i) + '</span><div><b>' + a + '</b><br><span>' + b + '</span></div></div>'; }
      return frame({ ctx: 'biz', top: rootTop('biz'), nav: 'B02', body:
        '<div class="big"><h1>Studio</h1><p>Kalulu Irrigation ' + syncPill() + '</p></div><div class="grid2">' +
        t('contacts', 'Clients & CRM', '412 contacts', 'B03') + t('filter_alt', 'Leads', '5 hot', 'B04') + t('view_kanban', 'Pipeline', 'K 112,000 open', 'B06') + t('work', 'Projects', '2 active · 1 at risk', 'B08') +
        t('checklist', 'Tasks', '6 due this week', 'B10') + t('inventory_2', 'Products & services', '64 items', 'B13') + t('warehouse', 'Inventory', '1 low', 'B14') + t('local_shipping', 'Suppliers & orders', '1 PO pending') +
        t('menu_book', 'Business knowledge', 'Rules & facts', 'B11') + t('query_stats', 'Reports', 'Sales, cash, clients', 'B12') + t('smart_toy', 'Agents & automation', 'Cloud · 1 agent') + t('apartment', 'Team', '3 members') + '</div>' });
    } });

  Z.add({ id: 'B03', name: 'CRM · Contacts', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'Business contacts with value and balance.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Clients & CRM', { actions: '<button class="ibtn" data-go="B03b">' + I('apartment') + '</button>' }), fab: { icon: 'person_add', t: 'Contact' }, body:
        '<div class="chips">' + chip('Customers', { on: 1 }) + chip('Leads', { go: 'B04' }) + chip('Suppliers') + chip('Owes money · 2') + '</div>' +
        list([row({ lead: av('mwila'), t: 'Mwila Tembo', s: 'Mwila Farms · Gold', meta: '<b class="tnum">K 41,200</b><span>paid up</span>', go: 'P05B' }),
          row({ lead: '<span class="av" style="background:#15803d">CG</span>', t: 'Chongwe Greens Co-op', s: 'Silver · invoice 41 days overdue', meta: '<b class="tnum" style="color:var(--bad)">K 14,200</b><span>owed</span>' }),
          row({ lead: '<span class="av" style="background:#0369a1">LW</span>', t: 'Lusaka West Nursery', s: 'Silver · invoice 36 days overdue', meta: '<b class="tnum" style="color:var(--bad)">K 9,280</b><span>owed</span>' }),
          row({ lead: '<span class="av" style="background:#7c3aed">KE</span>', t: 'Kafue Estate', s: 'Gold · project in progress', meta: '<b class="tnum">K 63,500</b><span>paid up</span>' })]) });
    } });

  Z.add({ id: 'B03b', name: 'Companies', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'Organisations, with their people.',
    notes: ['The server models a company as a field on contacts; Android groups contacts by company.'],
    render: function () {
      return frame({ ctx: 'biz', top: stop('Companies'), body: list([row({ lead: '<span class="ico c">' + I('apartment') + '</span>', t: 'Mwila Farms', s: '2 people · 2 sites', meta: I('chevron_right'), go: 'P05B' }), row({ lead: '<span class="ico c">' + I('apartment') + '</span>', t: 'Chongwe Greens Co-op', s: '3 people', meta: I('chevron_right') }), row({ lead: '<span class="ico c">' + I('apartment') + '</span>', t: 'Sitali Pumps & Pipes', s: 'Supplier · 1 person', meta: I('chevron_right') })]) });
    } });

  Z.add({ id: 'B04', name: 'Leads', group: B, ctx: 'biz', data: 'C', ms: 'M10', purpose: 'Lead stages with score and the message that created each lead.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Leads'), body: '<div class="chips">' + chip('Hot · 2', { on: 1 }) + chip('Warm · 3') + chip('Cold · 6') + '</div>' +
        list([row({ lead: av('thoko', { src: 'wab' }), t: 'Thokozani Banda · Banda Orchards', s: '“How much for a 2 ha drip setup?” · Thu', meta: '<b class="tnum">82</b><span>score</span>' }), row({ lead: '<span class="av" style="background:#b45309">MS<span class="src wab">B</span></span>', t: 'Mapalo Sakala', s: 'Asked about solar pumps · 5 Nov', meta: '<b class="tnum">71</b><span>score</span>' })]) });
    } });

  Z.add({ id: 'B05', name: 'Business Intelligence · Ask', group: B, ctx: 'biz', data: 'L (+C cached)', ms: 'M12', purpose: 'Ask business questions in plain words; key metrics underneath, each explainable.',
    notes: ['Questions become a structured query over local tables first (port of the server’s ASK_ANYTHING). No text-to-SQL.', 'Cloud AI is used only if allowed for this workspace.'],
    render: function () {
      return frame({ ctx: 'biz', top: rootTop('biz'), nav: 'B05', body:
        '<div class="big"><h1>Ask your business</h1><p>Answers come from Kalulu Irrigation’s records only.</p></div>' + scopeBar('Kalulu Irrigation · invoices, deals, clients, stock') +
        list([row({ t: 'Which clients owe us money for more than 30 days?', meta: I('north_west'), go: 'B05A' }), row({ t: 'What did we sell most this month?', meta: I('north_west') }), row({ t: 'Which deals have gone quiet?', meta: I('north_west') })]) +
        sec('This month', 'Reports', 'B12') + '<div class="grid2">' + kpi('Revenue', 'K 31,600', '▲ 12% vs Oct', '') + kpi('Win rate', '38%', '5 of 13 quotes') + '</div>',
        bottom: '<div class="composer"><div class="in">Ask about Kalulu Irrigation…</div><button class="btn fill" data-go="B05A">' + I('arrow_upward') + '</button></div>' });
    } });

  Z.add({ id: 'B05A', name: 'BI answer with evidence', group: B, ctx: 'biz', data: 'L (+C cached)', ms: 'M12', purpose: 'An answer whose every number is traceable to records.',
    notes: ['Amounts are summed by code from invoice records; the model only parsed the question.', 'Shows data freshness for cloud-sourced numbers.'],
    render: function () {
      return frame({ ctx: 'biz', top: stop('Overdue clients'), body: '<div class="thread"><div class="bub out">Which clients owe us money for more than 30 days?</div></div>' +
        card('<div class="small">Overdue more than 30 days</div><div class="num" style="color:var(--bad)">K 23,480.00</div><p style="margin-top:4px">2 clients · 2 invoices</p>') +
        list([row({ lead: '<span class="av" style="background:#15803d">CG</span>', t: 'Chongwe Greens Co-op', s: 'INV-0098 · due 14 Oct · 41 days', meta: '<b class="tnum">K 14,200.00</b>' }), row({ lead: '<span class="av" style="background:#0369a1">LW</span>', t: 'Lusaka West Nursery', s: 'INV-0101 · due 19 Oct · 36 days', meta: '<b class="tnum">K 9,280.00</b>' })]) +
        '<div class="pad btns">' + btn('How was this calculated?', 'out', { icon: 'manage_search', go: 'B05E' }) + btn('Draft reminders', 'fill', { icon: 'edit', toast: '2 reminder drafts ready for review' }) + '</div>' });
    } });

  Z.add({ id: 'B05E', name: 'BI evidence', group: B, ctx: 'biz', data: '—', ms: 'M12', purpose: 'The exact query and records behind the answer.',
    render: function () {
      return withSheet('B05A', '<h2>How this was calculated</h2><p>Zuri turned your question into this query, then added up the matching invoices.</p>' +
        '<div class="card flat"><dl class="kv"><dt>Records</dt><dd>Invoices</dd><dt>Status</dt><dd>sent or viewed</dd><dt>Due before</dt><dd>25 Oct 2026</dd><dt>Workspace</dt><dd>Kalulu Irrigation</dd></dl></div>' +
        '<div class="card flat"><dl class="kv"><dt>Matched</dt><dd>2 of 146 documents</dd><dt>Data from</dt><dd>Zuri cloud · synced 4 min ago</dd><dt>Question parsed by</dt><dd>Gemma 4 E2B · on this phone</dd><dt>Sent to cloud AI</dt><dd>Nothing</dd></dl></div>');
    } });

  Z.add({ id: 'B06', name: 'Opportunity pipeline', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'Deals by stage, swipeable columns sized for a phone.',
    render: function () {
      function col(t, n, v, deals) { return '<div class="stage-col"><h4><span>' + t + ' · ' + n + '</span><span class="tnum">' + v + '</span></h4>' + deals + '</div>'; }
      function d(t, s, v, g) { return '<div class="deal"' + go(g) + '><b>' + t + '</b><span class="muted">' + s + '</span><div class="tnum" style="margin-top:4px;font-weight:650">' + v + '</div></div>'; }
      return frame({ ctx: 'biz', top: stop('Pipeline', { sub: 'K 112,000 open · 7 deals' }), fab: { icon: 'add', t: 'Deal' }, body: '<div class="stages">' +
        col('Proposal', 2, 'K 57,000', d('Mwila Farms · monthly maintenance', 'Proposal due Fri', 'K 15,800', 'B07') + d('Kafue Estate · phase 2', 'Sent 12 Nov', 'K 41,200')) +
        col('Qualified', 2, 'K 34,000', d('Chongwe Greens · new block', 'Site visit done', 'K 22,000') + d('Lusaka West · pump upgrade', 'Needs quote', 'K 12,000')) +
        col('Lead', 3, 'K 21,000', d('Banda Orchards · 2 ha drip', 'From WhatsApp Thu', 'K 9,000') + d('Mapalo Sakala · solar pump', '5 Nov', 'K 7,500') + d('Kitwe Greens · tanks', '28 Oct', 'K 4,500')) + '</div>' });
    } });

  Z.add({ id: 'B07', name: 'Opportunity detail', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'One deal with its stage history, conversation and documents.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Mwila Farms · maintenance'), body:
        '<div class="stepper"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i></div><div class="small" style="display:flex;justify-content:space-between;padding:0 16px 10px"><span>Lead</span><span>Qualified</span><b style="color:var(--ink)">Proposal</b><span>Negotiation</span><span>Won</span></div>' +
        card('<dl class="kv"><dt>Client</dt><dd>Mwila Tembo · Mwila Farms</dd><dt>Estimated value</dt><dd>K 15,800 / quarter</dd><dt>Next step</dt><dd>Send proposal by Fri 27 Nov</dd><dt>Source</dt><dd>WhatsApp Business · 18 Nov</dd></dl>') +
        sec('Related') + list([row({ lead: srcSq('wab'), t: 'Conversation with Mwila', s: '“check both sites monthly”', go: 'P03B' }), row({ lead: '<span class="ico">' + I('description') + '</span>', t: 'QUO-0042 · accepted', s: 'Rates to reuse', go: 'D01' })]) +
        '<div class="pad">' + btn('Create proposal', 'fill blk', { icon: 'description', go: 'D03' }) + '</div>' });
    } });

  Z.add({ id: 'B08', name: 'Projects', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'Projects with progress and budget health.',
    render: function () {
      function p(t, s, pct, st, g) { return card('<div style="display:flex;justify-content:space-between;gap:8px"><div><h3>' + t + '</h3><p>' + s + '</p></div>' + st + '</div><div class="prog" style="margin-top:10px"><i style="width:' + pct + '%"></i></div>', '', g); }
      return frame({ ctx: 'biz', top: stop('Projects'), fab: { icon: 'add', t: 'Project' }, body: '<div class="chips">' + chip('Active · 2', { on: 1 }) + chip('On hold · 1') + chip('Done') + '</div>' +
        p('Chisamba pump replacement', 'Mwila Farms · 9 of 10 tasks', 90, tag('Budget at risk', 'warn'), 'B09') + p('Kafue Estate drip install', 'Phase 1 · 17 of 25 tasks', 68, tag('On budget', 'ok')) });
    } });

  Z.add({ id: 'B09', name: 'Project detail', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'Tasks, milestones, time and budget for one project.',
    notes: ['The timer is a native foreground timer; one running timer per user (mirrors the server’s rule).'],
    render: function () {
      return frame({ ctx: 'biz', top: stop('Chisamba pump replacement'), body:
        card('<div style="display:flex;align-items:center;gap:12px"><span class="ico warn">' + I('timer', 'f') + '</span><div style="flex:1"><h3>Timer running · 1:24</h3><p>Commissioning test</p></div>' + btn('Stop', 'out', { toast: 'Logged 1 h 24 min' }) + '</div>') +
        sec('Budget') + card('<div class="bar" style="margin-bottom:8px"><span style="width:84px">Estimate</span><span class="tr"><i style="width:100%;background:var(--surface3)"></i></span><span class="v">K 30,000</span></div><div class="bar" style="margin-bottom:8px"><span style="width:84px">Invoiced</span><span class="tr"><i style="width:92%"></i></span><span class="v">K 27,600</span></div><div class="bar"><span style="width:84px">Purchases</span><span class="tr"><i style="width:63%;background:var(--warn)"></i></span><span class="v">K 18,900</span></div>') +
        sec('Tasks') + list([row({ lead: I('check_circle', 'f'), t: 'Remove old pump', s: 'Done 18 Nov' }), row({ lead: I('radio_button_unchecked'), t: 'Commissioning test', s: 'Thu 26 Nov · you' })]) });
    } });

  Z.add({ id: 'B10', name: 'Tasks', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'All business tasks by due date, including ones Zuri found in chats.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Tasks'), fab: { icon: 'add', t: 'Task' }, body:
        sec('Overdue') + list([row({ lead: I('radio_button_unchecked'), t: 'Chase INV-0098 (Chongwe Greens)', s: 'Suggested from overdue invoice' })]) +
        sec('This week') + list([row({ lead: I('radio_button_unchecked'), t: 'Send proposal to Mwila Farms', s: 'Fri · from WhatsApp', go: 'P03B' }), row({ lead: I('radio_button_unchecked'), t: 'Commissioning test', s: 'Thu · Chisamba project', go: 'B09' })]) });
    } });

  Z.add({ id: 'B11', name: 'Business knowledge', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'Rules and facts Zuri uses for this business, each editable.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Business knowledge'), body:
        sec('Rules') + list([row({ t: 'VAT is 16% on all services', s: 'Used in every document', meta: tag('Rule', 'br') }), row({ t: 'Payment terms: 30 days', s: 'Default for invoices', meta: tag('Rule', 'br') }), row({ t: 'Never quote below 20% margin', s: 'Checked when drafting', meta: tag('Rule', 'br') })]) +
        sec('Learned facts') + list([row({ t: 'Filter kit supplier price K 1,240', s: 'Lubinda · 20 Nov', meta: meter(4) }), row({ t: 'Mwila Farms has 2 sites: Chisamba, Kafue', s: 'Mwila · 18 Nov', meta: meter(4) })]) });
    } });

  Z.add({ id: 'B12', name: 'Reports', group: B, ctx: 'biz', data: 'O (cached)', ms: 'M12', purpose: 'Mobile-composed BI sections (the web’s 11 analytics pages).',
    notes: ['Online, cached; offline shows the last snapshot and its time. Errors are shown as errors, never as zeros.'],
    render: function () {
      function r(i, a, b) { return row({ lead: '<span class="ico c">' + I(i) + '</span>', t: a, s: b, meta: I('chevron_right') }); }
      return frame({ ctx: 'biz', top: stop('Reports', { sub: 'Snapshot 10:12 today' }), body: list([r('monitoring', 'Executive summary', 'Health score B+ · 78'), r('payments', 'Sales', 'K 31,600 this month'), r('groups', 'Customers', 'Retention 81%'), r('forum', 'Conversations', 'Reply time 2 h 10 min'), r('precision_manufacturing', 'Operations', '2 projects · 1 at risk'), r('trending_up', 'Opportunities', 'K 112,000 open'), r('online_prediction', 'Predictions', '3 likely renewals'), r('savings', 'ROI', 'Hours saved: estimate'), r('campaign', 'Campaigns', '1 running')]) });
    } });

  Z.add({ id: 'B13', name: 'Products & services', group: B, ctx: 'biz', data: 'L + C', ms: 'M10', purpose: 'Catalog with prices, margins and stock, used by document drafting.',
    render: function () {
      return frame({ ctx: 'biz', top: stop('Products & services'), fab: { icon: 'add', t: 'Item' }, body: '<div class="chips">' + chip('All', { on: 1 }) + chip('Services') + chip('Products') + chip('Low stock · 1') + '</div>' +
        list([row({ lead: '<span class="ico c">' + I('engineering') + '</span>', t: 'Pressure inspection visit', s: 'Service · per visit · margin 64%', meta: '<b class="tnum">K 850</b>' }), row({ lead: '<span class="ico c">' + I('filter_alt') + '</span>', t: 'Filter replacement kit', s: 'Product · 14 in stock · margin 31%', meta: '<b class="tnum">K 1,240</b>' }), row({ lead: '<span class="ico c">' + I('water') + '</span>', t: 'Drip line flush', s: 'Service · per site · margin 58%', meta: '<b class="tnum">K 600</b>' }), row({ lead: '<span class="ico warn">' + I('inventory_2') + '</span>', t: '16 mm drip line, 500 m roll', s: 'Product · 3 left · reorder at 5', meta: '<b class="tnum">K 2,150</b>', go: 'B14' })]) });
    } });

  Z.add({ id: 'B14', name: 'Inventory', group: B, ctx: 'biz', data: 'C (ledger)', ms: 'M10', purpose: 'Stock levels and movements; levels are computed, never edited.',
    notes: ['Cloud-bound workspace: stock is a server ledger. Adjustments are movements sent through the outbox (needs RFC G4).'],
    render: function () {
      return frame({ ctx: 'biz', top: stop('Inventory', { sub: 'Main store · cloud ledger' }), body:
        card('<div style="display:flex;gap:12px;align-items:center"><span class="ico warn">' + I('warning') + '</span><div style="flex:1"><h3>16 mm drip line is low</h3><p>3 rolls left. Lubinda last supplied at K 1,620 a roll.</p></div></div><div class="btns" style="margin-top:10px">' + btn('Draft purchase order', 'fill', { toast: 'Draft PO created' }) + '</div>') +
        sec('Recent movements') + list([row({ t: '−2 · 16 mm drip line', s: 'Sale · Kafue Estate · 20 Nov', meta: '3 left' }), row({ t: '+10 · Filter replacement kit', s: 'Restock · PO-0019 · 20 Nov', meta: '14 left' })]) });
    } });
}
