/* Zuri Android prototype — core helpers, sample data and frame builders.
   All people, businesses, numbers and messages are fictional sample data. */
window.Z = { screens: {}, order: [], journeys: [] };
Z.add = function (s) { Z.screens[s.id] = s; Z.order.push(s.id); };

/* ---------- sample data ---------- */
var COL = { teal: '#0f8c7a', indigo: '#4f46e5', rust: '#c2410c', plum: '#a3367f', sky: '#0369a1', green: '#15803d', amber: '#b45309', violet: '#7c3aed', slate: '#475569' };
var PEOPLE = {
  chanda: { n: 'Chanda Phiri', c: COL.rust, rel: 'Close friend' },
  mama: { n: 'Grace Mwale', c: COL.plum, rel: 'Mum' },
  kasonde: { n: 'Kasonde Mwale', c: COL.violet, rel: 'Sister' },
  bwalya: { n: 'Bwalya Kunda', c: COL.sky, rel: 'Friend · former colleague' },
  mwila: { n: 'Mwila Tembo', c: COL.green, rel: 'Client · Mwila Farms' },
  lubinda: { n: 'Lubinda Sitali', c: COL.amber, rel: 'Supplier · Sitali Pumps & Pipes' },
  thoko: { n: 'Thokozani Banda', c: COL.indigo, rel: 'Lead · Banda Orchards' },
  nalu: { n: 'Nalumino Mbewe', c: COL.teal, rel: 'Book club' }
};
var CTX = {
  personal: { label: 'Personal', icon: 'person' },
  biz: { label: 'Kalulu Irrigation', icon: 'water_drop' },
  biz2: { label: 'Mwale Design Studio', icon: 'palette' },
  hybrid: { label: 'Personal + Kalulu', icon: 'join' },
  neutral: { label: 'Zuri', icon: 'person' }
};
var SRC = { wa: 'W', wab: 'B', tg: 'T', sg: 'S', gm: 'G', sm: 'M', sl: 'S', fb: 'M' };
var SRCNAME = { wa: 'WhatsApp', wab: 'WhatsApp Business', tg: 'Telegram', sg: 'Signal', gm: 'Gmail', sm: 'Messages', sl: 'Slack', fb: 'Messenger' };

/* ---------- atoms ---------- */
function I(n, c) { return '<span class="ms ' + (c || '') + '" aria-hidden="true">' + n + '</span>'; }
function initials(n) { return n.split(' ').map(function (p) { return p[0]; }).slice(0, 2).join(''); }
function av(key, opt) {
  opt = opt || {};
  var p = PEOPLE[key] || { n: key, c: COL.slate };
  var s = opt.src ? '<span class="src ' + opt.src + '">' + SRC[opt.src] + '</span>' : '';
  return '<span class="av ' + (opt.size || '') + '" style="background:' + p.c + '">' + initials(p.n) + s + '</span>';
}
function srcSq(code, big) { return '<span class="src-sq ' + code + '"' + (big ? ' style="width:32px;height:32px;border-radius:10px;font-size:14px"' : '') + ' title="' + SRCNAME[code] + '">' + SRC[code] + '</span>'; }
function tag(t, cls, icon) { return '<span class="tag ' + (cls || '') + '">' + (icon ? I(icon) : '') + t + '</span>'; }
function chip(t, o) {
  o = o || {};
  return '<button class="chip ' + (o.on ? 'on ' : '') + (o.x ? 'x' : '') + '"' + go(o.go) + '>' + (o.icon ? I(o.icon) : '') + t + (o.x ? I('close') : '') + '</button>';
}
function go(id) { return id ? ' data-go="' + id + '"' : ''; }
function toast(t) { return ' data-toast="' + t + '"'; }
function btn(t, cls, o) {
  o = o || {};
  return '<button class="btn ' + cls + (o.blk ? ' blk' : '') + '"' + go(o.go) + (o.toast ? toast(o.toast) : '') + (o.back ? ' data-back="1"' : '') + '>' + (o.icon ? I(o.icon) : '') + t + '</button>';
}
function sw(on) { return '<span class="sw ' + (on ? 'on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"></span>'; }
function meter(n) { var s = ''; for (var i = 0; i < 5; i++) s += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return '<span class="meter" title="confidence">' + s + '</span>'; }
function row(o) {
  return '<div class="row"' + go(o.go) + (o.toast ? toast(o.toast) : '') + '>' + (o.lead || '') +
    '<div class="tx"><b>' + o.t + '</b>' + (o.s ? '<span class="' + (o.wrap ? 'wrap' : '') + '">' + o.s + '</span>' : '') + '</div>' +
    (o.meta !== undefined ? '<div class="meta">' + o.meta + '</div>' : '') + '</div>';
}
function list(rows) { return '<div class="list">' + rows.join('') + '</div>'; }
function sec(t, link, id) { return '<div class="sec"><span>' + t + '</span>' + (link ? '<a' + go(id) + '>' + link + '</a>' : '') + '</div>'; }
function card(inner, cls, id) { return '<div class="card ' + (cls || '') + (id ? ' cc' : '') + '"' + go(id) + '>' + inner + '</div>'; }
function hint(t, icon) { return '<div class="hint">' + I(icon || 'info') + '<div>' + t + '</div></div>'; }
function field(label, val, cls) { return '<div class="field ' + (cls || '') + '"><label>' + label + '</label><div>' + val + '</div></div>'; }
function scopeBar(t) { return '<div class="scope">' + I('filter_center_focus') + '<span>' + t + '</span></div>'; }

/* ---------- chrome ---------- */
function sb() { return '<div class="sb"><span>9:41</span><span class="ic">' + I('signal_cellular_alt') + I('wifi') + I('battery_5_bar') + '</span></div>'; }
function rootTop(ctx, o) {
  o = o || {};
  var c = CTX[ctx] || CTX.personal;
  return '<div class="rtop"><button class="cchip" data-go="G08" aria-label="Switch context"><span class="dot">' + I(c.icon, 'f') + '</span><span class="t">' + c.label + '</span>' + I('expand_more', 'dn') + '</button><span class="grow"></span>' +
    '<button class="ibtn" data-go="G09" aria-label="Search">' + I('search') + '</button>' +
    '<button class="ibtn" data-go="G04" aria-label="Capture status">' + I('sensors') + '<span class="capdot ' + (o.cap || '') + '"></span></button></div>';
}
function stop(title, o) {
  o = o || {};
  return '<div class="stop"><button class="ibtn" data-back="1" aria-label="Back">' + I('arrow_back') + '</button><h1>' + title + (o.sub ? '<span class="sub">' + o.sub + '</span>' : '') + '</h1>' + (o.actions || '') + '</div>';
}
var NAV = {
  personal: [['P01', 'today', 'Today'], ['P02', 'forum', 'Inbox'], ['P04', 'group', 'People'], ['P13', 'auto_awesome', 'Ask'], ['G13', 'apps', 'More']],
  biz: [['B01', 'today', 'Today'], ['P02B', 'forum', 'Inbox'], ['B02', 'storefront', 'Studio'], ['B05', 'auto_awesome', 'Ask'], ['D01', 'description', 'Documents']]
};
function navbar(active, ctx) {
  var items = (ctx === 'biz' || ctx === 'biz2') ? NAV.biz : NAV.personal;
  return '<nav class="nav">' + items.map(function (it) {
    return '<button class="' + (it[0] === active ? 'on' : '') + '" data-go="' + it[0] + '"><i>' + I(it[1]) + '</i>' + it[2] + '</button>';
  }).join('') + '</nav>';
}
function frame(o) {
  var ctx = o.ctx || 'personal';
  var fab = o.fab ? '<button class="fab"' + go(o.fab.go) + (o.fab.toast ? toast(o.fab.toast) : '') + (o.nav ? '' : ' style="bottom:30px"') + '>' + I(o.fab.icon) + o.fab.t + '</button>' : '';
  return '<div class="app ctx-' + ctx + '">' + sb() + (o.top || '') + '<div class="scr">' + o.body + '<div style="height:' + (o.fab ? 84 : 16) + 'px"></div></div>' + (o.bottom || '') +
    (o.nav ? navbar(o.nav, ctx) : '') + fab + '<div class="gest"><i></i></div>' + (o.overlay || '') + '</div>';
}
function sheet(inner) { return '<div class="sheetwrap"><div class="scrim" data-back="1"></div><div class="sheet"><div class="grab"></div>' + inner + '</div></div>'; }
function withSheet(baseId, inner) {
  var base = Z.screens[baseId].render();
  return base.replace(/<\/div>$/, sheet(inner) + '</div>');
}
