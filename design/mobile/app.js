/* Viewer: journeys, screen index, router, notes panel. Loaded last. */
{
  Z.journeys = [
    { t: 'Start locally, no account', s: [['G01', 'Fresh install: no account wall, the promise in one sentence.'], ['G02', 'How Zuri treats data, before any permission is asked.'], ['G03', 'Choose to start on this phone (recommended).'], ['G07b', 'This phone is measured and a model recommended, or Essential mode with no download.'], ['G04', 'Pick which apps Zuri may read. Nothing is read yet.'], ['P01', 'The first Today screen. Everything so far happened offline.']] },
    { t: 'Enable WhatsApp notification access', s: [['G04', 'WhatsApp and WhatsApp Business selected; Android access still off.'], ['G04b', 'Play-required disclosure, in plain words, before the system screen.'], ['X01', 'Android’s own notification-access switch.'], ['G04G', 'Back in Zuri: listening, with health and honest coverage per app.'], ['P02', 'Captured conversations appear in the Inbox.']] },
    { t: 'A notification is understood locally', s: [['X02', 'Chanda’s WhatsApp notification arrives. Zuri stores it, encrypted, in milliseconds.'], ['P02N', 'Minutes later, a background batch on the phone has understood it.'], ['P03', 'The understanding hangs under the exact message: a promise, an event, a question.'], ['P15', 'The promise now lives in Commitments with its source.']] },
    { t: 'What did I promise someone?', s: [['P13', 'Ask in plain words. The scope bar shows what Zuri may read.'], ['P13A', 'A cited answer from the on-device model. Each number is a message.'], ['P03', 'Tapping a citation opens the exact message.']] },
    { t: 'Review a memory and its source', s: [['P07', 'Memory Inspector: everything Zuri remembers, with confidence.'], ['P07b', 'Full provenance: quoted words, model, time, and whether it left the phone.'], ['P03', 'Open it in the conversation.']] },
    { t: 'Connect an existing Zuri account', s: [['G10', 'Settings → Zuri account.'], ['S01', 'What connecting does, and doesn’t, do.'], ['G05', 'Sign in with the same Clerk account as the web.'], ['S01C', 'Connected. Import, sync, upload and cloud AI are still separate choices.']] },
    { t: 'Import existing cloud history', s: [['S01C', 'Start from the account screen.'], ['G06', 'Pick categories and a time window; sensitive items are off by default.'], ['G06M', 'Decide where things go: Personal or a business workspace.'], ['S02', 'Batched, resumable import with honest progress.']] },
    { t: 'Configure ongoing sync', s: [['G07', 'Separate switches for syncing down, uploading up, and cloud AI.'], ['S05', 'See exactly which categories move in which direction.'], ['S03', 'Sync status with pending changes and a conflict to resolve.']] },
    { t: 'Disconnect, keep local data', s: [['S01C', 'From the account screen.'], ['S08', 'Choose what stays. The default keeps everything.'], ['P01', 'Today still works: your data is still here.']] },
    { t: 'Switch personal → business', s: [['P01', 'Personal context: teal chrome.'], ['G08', 'The context chip opens the switcher. Each workspace is isolated.'], ['B01', 'Kalulu Irrigation: indigo chrome, business brief, business navigation.']] },
    { t: 'Ask a business question', s: [['B05', 'Ask about this business only.'], ['B05A', 'The answer and the records behind it. Code adds up the money.'], ['B05E', 'The exact query, data freshness, and what (nothing) went to the cloud.']] },
    { t: 'Create a client proposal', s: [['P03B', 'Mwila asked for a proposal on WhatsApp; Zuri suggests drafting one.'], ['D03', 'Describe it in your own words.'], ['D04', 'Choose what Zuri may read: this chat, the last quote, the catalog.'], ['D05', 'Zuri asks for what it can’t find, instead of guessing.'], ['D06', 'The same layouts as the web.'], ['D07', 'A structured draft. Totals are calculated, not written by the model.']] },
    { t: 'Edit, validate and export it', s: [['D07', 'The draft proposal.'], ['D09', 'Edit a line; totals recalculate.'], ['D11', 'Checks before finalising, each with a fix.'], ['D12', 'Where every part came from.'], ['D10', 'The rendered PDF, identical to the web’s.'], ['D14', 'Finalised as PRO-0017 and shared.']] },
    { t: 'Review a recommendation', s: [['P14', 'Zuri suggests reconnecting with Bwalya.'], ['P14E', 'Why: the numbers and messages behind it.'], ['P14D', 'A draft, and an honest note: with no live notification, Zuri can’t send for you.']] }
  ];

  var GROUPS = ['A · Global', 'B · Personal', 'C · Business', 'D · Documents', 'E · AI & models', 'F · Sync', 'System (Android)'];
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var state = { id: null, hist: [], j: -1, step: 0, tab: 'j' };

  function renderRail() {
    var jl = Z.journeys.map(function (j, i) {
      var on = i === state.j;
      var steps = on ? '<ol class="jsteps">' + j.s.map(function (st, k) { return '<li data-js="' + i + '-' + k + '" class="' + (k === state.step ? 'on' : '') + '">' + esc(Z.screens[st[0]].name) + '</li>'; }).join('') + '</ol>' : '';
      return '<li class="jitem ' + (on ? 'on' : '') + '"><button data-j="' + i + '"><span class="jnum">' + (i + 1) + '</span><span><b>' + esc(j.t) + '</b><small>' + j.s.length + ' screens</small></span></button>' + steps + '</li>';
    }).join('');
    var sl = GROUPS.map(function (g) {
      var ids = Z.order.filter(function (id) { return Z.screens[id].group === g; });
      return '<div class="sgroup"><h3>' + esc(g) + '</h3>' + ids.map(function (id) { return '<button data-s="' + id + '" class="' + (id === state.id ? 'on' : '') + '"><code>' + id + '</code>' + esc(Z.screens[id].name) + '</button>'; }).join('') + '</div>';
    }).join('');
    $('#rail-body').innerHTML = state.tab === 'j' ? '<ul class="jlist">' + jl + '</ul>' : sl;
    $('#tab-j').setAttribute('aria-pressed', state.tab === 'j');
    $('#tab-s').setAttribute('aria-pressed', state.tab === 's');
    var act = document.querySelector('.jitem.on, .sgroup button.on');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  }
  function renderNotes() {
    var s = Z.screens[state.id];
    var li = function (a) { return a && a.length ? '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="foot">None.</p>'; };
    $('#notes').innerHTML = '<div class="id">' + s.id + ' · ' + esc(s.group) + '</div><h2>' + esc(s.name) + '</h2><p style="margin:0;font-size:14px">' + esc(s.purpose || '') + '</p>' +
      '<dl><dt>Data</dt><dd>' + esc(s.data || '—') + '</dd><dt>Milestone</dt><dd>' + esc(s.ms || '—') + '</dd><dt>Spec</dt><dd>docs/mobile/SCREEN_MAP.md</dd></dl>' +
      '<h4>Design notes</h4>' + li(s.notes) + '<h4>Open UX questions</h4>' + li(s.q) +
      '<p class="foot">Data codes: L local · C Zuri cloud (cached) · O online only. All names, businesses and amounts are fictional sample data.</p>';
  }
  function renderStep() {
    var bar = $('#stepbar');
    if (state.j < 0) { bar.innerHTML = '<div class="cap"><b>Free exploration</b>Tap anything in the phone, or pick a journey.</div>'; return; }
    var j = Z.journeys[state.j], st = j.s[state.step], on = st[0] === state.id;
    bar.innerHTML = '<button id="prev" aria-label="Previous step" ' + (state.step === 0 ? 'disabled' : '') + '>‹</button><div class="cap"><b>Journey ' + (state.j + 1) + ' · step ' + (state.step + 1) + ' of ' + j.s.length + (on ? '' : ' · exploring') + '</b>' + esc(on ? st[1] : 'You left the journey. Press › or ‹ to return to it.') + '</div><button id="next" aria-label="Next step" ' + (state.step === j.s.length - 1 && on ? 'disabled' : '') + '>›</button>';
  }
  function show(id, opt) {
    opt = opt || {};
    if (!Z.screens[id]) return;
    if (state.id && !opt.noPush) state.hist.push(state.id);
    state.id = id;
    if (state.j >= 0) {
      var j = Z.journeys[state.j];
      var k = j.s.findIndex(function (x, i) { return x[0] === id && i >= state.step; });
      if (k >= 0) state.step = k;
    }
    var html = '';
    try { html = Z.screens[id].render(); } catch (e) { html = '<div class="app"><div class="empty">Screen failed to render: ' + esc(e.message) + '</div></div>'; }
    $('#phone').innerHTML = html;
    renderNotes(); renderRail(); renderStep(); syncPicker();
    var h = state.j >= 0 && Z.journeys[state.j].s[state.step][0] === id ? '#j' + (state.j + 1) + '-' + (state.step + 1) : '#' + id;
    if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { location.hash = h; } }
  }
  function snack(t) {
    var app = $('#phone .app'); if (!app) return;
    var n = document.createElement('div'); n.className = 'snack'; n.setAttribute('role', 'status');
    n.innerHTML = '<span class="ms">check_circle</span>'; n.appendChild(document.createTextNode(t));
    app.appendChild(n); setTimeout(function () { n.remove(); }, 2400);
  }
  function startJourney(i, k) { state.j = i; state.step = k || 0; state.hist = []; show(Z.journeys[i].s[state.step][0], { noPush: true }); }
  function syncPicker() {
    var sel = $('#pick'); if (!sel) return;
    var v = state.j >= 0 ? 'j' + state.j : 's' + state.id;
    if (sel.value !== v) sel.value = v;
  }
  function buildPicker() {
    var o = '<optgroup label="Journeys">' + Z.journeys.map(function (j, i) { return '<option value="j' + i + '">' + (i + 1) + '. ' + esc(j.t) + '</option>'; }).join('') + '</optgroup>';
    GROUPS.forEach(function (g) { o += '<optgroup label="' + esc(g) + '">' + Z.order.filter(function (id) { return Z.screens[id].group === g; }).map(function (id) { return '<option value="s' + id + '">' + id + ' · ' + esc(Z.screens[id].name) + '</option>'; }).join('') + '</optgroup>'; });
    $('#pick').innerHTML = o;
  }
  function route() {
    var h = (location.hash || '').slice(1);
    var m = /^j(\d+)-(\d+)$/.exec(h);
    if (m && Z.journeys[+m[1] - 1]) { startJourney(+m[1] - 1, Math.min(+m[2] - 1, Z.journeys[+m[1] - 1].s.length - 1)); return; }
    if (Z.screens[h]) { state.j = -1; show(h, { noPush: true }); return; }
    startJourney(0, 0);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-j]'); if (t) { startJourney(+t.dataset.j, 0); return; }
    t = e.target.closest('[data-js]'); if (t) { var p = t.dataset.js.split('-'); startJourney(+p[0], +p[1]); return; }
    t = e.target.closest('[data-s]'); if (t) { state.j = -1; show(t.dataset.s); return; }
    if (e.target.closest('#prev')) { if (state.step > 0) startJourney(state.j, state.step - 1); return; }
    if (e.target.closest('#next')) { var j = Z.journeys[state.j]; var on = j.s[state.step][0] === state.id; startJourney(state.j, on ? Math.min(state.step + 1, j.s.length - 1) : state.step); return; }
    if (e.target.closest('#tab-j')) { state.tab = 'j'; renderRail(); return; }
    if (e.target.closest('#tab-s')) { state.tab = 's'; renderRail(); return; }
    var th = e.target.closest('[data-theme-set]');
    if (th) { setTheme(th.dataset.themeSet); return; }
    if (!e.target.closest('#phone')) return;
    t = e.target.closest('[data-go],[data-back],[data-toast]'); if (!t) return;
    var msg = t.dataset.toast;
    if (t.dataset.go) show(t.dataset.go);
    else if (t.dataset.back) { var prev = state.hist.pop(); if (prev) show(prev, { noPush: true }); }
    if (msg) snack(msg);
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('select,input,textarea')) return;
    if (e.key === 'ArrowRight' && state.j >= 0) { var b = $('#next'); if (b && !b.disabled) b.click(); }
    if (e.key === 'ArrowLeft' && state.j >= 0) { var p = $('#prev'); if (p && !p.disabled) p.click(); }
  });
  function setTheme(v, initial) {
    if (v === 'system') { if (!initial) delete document.documentElement.dataset.theme; } else document.documentElement.dataset.theme = v;
    document.querySelectorAll('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.themeSet === v); });
    try { localStorage.setItem('zuri-proto-theme', v); } catch (e) { }
  }
  $('#pick').addEventListener('change', function (e) { var v = e.target.value; if (v[0] === 'j') startJourney(+v.slice(1), 0); else { state.j = -1; show(v.slice(1)); } });
  window.addEventListener('hashchange', function () {
    var cur = state.j >= 0 && Z.journeys[state.j].s[state.step][0] === state.id ? 'j' + (state.j + 1) + '-' + (state.step + 1) : state.id;
    if (location.hash.slice(1) !== cur) route();
  });
  var saved = 'system'; try { saved = localStorage.getItem('zuri-proto-theme') || 'system'; } catch (e) { }
  buildPicker(); setTheme(saved, true); route();
}
