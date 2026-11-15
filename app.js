(() => {
'use strict';
const CSV_URL = 'data/Processed/AllIndiaBulletinsMaster2026_openrefined.csv';
const HEATMAP = 'https://urbanemissionsinfo.github.io/AQI_bulletins/plots/calendarheats/';
const CATS = [['Good','#274e13','0–50'],['Satisfactory','#93c47d','51–100'],['Moderate','#b5b800','101–200'],
  ['Poor','#f59042','201–300'],['Very Poor','#ff0000','301–400'],['Severe','#753b3b','401+']];
const EDGES = [0,50,100,200,300,400,1e9];
const POLS = ['CO','NH3','NO2','O3','PM10','PM2.5','SO2'];
const INK = '#1d271b', MUTE = '#5e6b5a', YMAX = 550, DAY = 864e5;
const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const $ = s => document.querySelector(s);
const fd = t => { const d = new Date(t); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
const S = { by: new Map(), pts: [], city: '', pols: new Set(), opts: [], tool: 'select', sel: false, cats: new Set([0, 1, 2, 3, 4, 5]) };
const V = { x0: 0, x1: 1, f0: 0, f1: 1 };   // x view shared by both charts
let charts = [];
const all = () => charts.forEach(c => c.draw());

/* ---------- data ---------- */
function parse(t) {
  const R = []; let r = [], f = '', q = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += c; i++; } else q = 0; } else f += c; }
    else if (c === '"') q = 1;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); f = ''; if (r.length > 1) R.push(r); r = []; }
    else f += c;
  }
  if (f || r.length) { r.push(f); R.push(r); }
  return R;
}
function cols(h) {
  const k = { date: -1, city: -1, n: -1, cat: -1, aqi: -1, pol: -1 };
  h.forEach((x, i) => {
    x = x.trim().toLowerCase();
    if (x === 'date') k.date = i; else if (x === 'city') k.city = i;
    else if (x.includes('station')) k.n = i;
    else if (x.includes('air quality') || x.includes('categ')) k.cat = i;
    else if (x.includes('index') || x === 'aqi') k.aqi = i;
    else if (x.includes('pollutant')) k.pol = i;
  });
  return Object.values(k).includes(-1) ? { date: 0, city: 1, n: 2, cat: 3, aqi: 4, pol: 5 } : k;  // same order as the notebook
}
function pdate(s) {
  s = s.trim(); let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(+m[1], m[2] - 1, +m[3]).getTime();
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  return m ? new Date(+m[3], m[2] - 1, +m[1]).getTime() : Date.parse(s);
}
const catOf = a => { let i = 0; while (a > EDGES[i + 1]) i++; return i; };

function ingest(txt) {
  const R = parse(txt.replace(/^\uFEFF/, '')), k = cols(R[0]), m = new Map(), extra = new Set();
  for (const r of R.slice(1)) {
    const c = (r[k.city] || '').trim(), a = parseFloat(r[k.aqi]), t = pdate(r[k.date] || '');
    if (!c || !isFinite(a) || isNaN(t)) continue;
    const pols = (r[k.pol] || '').replace(/ozone/gi, 'O3').split(',').map(s => s.trim().toUpperCase()).filter(s => s && s !== 'NAN');
    const n = parseFloat(r[k.n]);
    let g = CATS.findIndex(x => x[0].toLowerCase() === (r[k.cat] || '').trim().toLowerCase());  // "Very poor" -> "Very Poor"
    if (g < 0) g = catOf(a);
    pols.forEach(p => extra.add(p));
    (m.get(c) || m.set(c, []).get(c)).push({ t, a, g, pols, n: isFinite(n) ? n : null, m: 1, s: 0 });
  }
  if (!m.size) throw Error('No usable rows found. Expected columns: date, city, stations, air quality, AQI, prominent pollutant.');
  m.forEach(v => v.sort((x, y) => x.t - y.t));
  S.by = m;
  S.opts = [...POLS, ...[...extra].filter(p => !POLS.includes(p)).sort()];
  S.pols = new Set(S.opts);
  const sel = $('#city');
  sel.replaceChildren(...[...m.keys()].sort((a, b) => a.localeCompare(b)).map(c => new Option(c, c)));
  sel.disabled = false;
  chips();
  $('#msg').hidden = true;
  setCity(m.has('Delhi') ? 'Delhi' : sel.options[0].value);
}
const msg = t => { const m = $('#msg'); m.hidden = false; m.textContent = t; };

/* ---------- ui state ---------- */
function chips() {
  $('#chips').replaceChildren(...S.opts.map(o => {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = o; b.setAttribute('aria-pressed', S.pols.has(o));
    b.onclick = () => { S.pols.has(o) ? S.pols.delete(o) : S.pols.add(o); b.setAttribute('aria-pressed', S.pols.has(o)); filt(); };
    return b;
  }));
}
function filt() {   // points without a selected pollutant are dimmed; all pollutants selected = no filtering
  const every = S.opts.every(o => S.pols.has(o));
  S.pts.forEach(p => p.m = (every || p.pols.some(x => S.pols.has(x))) && S.cats.has(p.g) ? 1 : 0);
  all();
}
function info() {
  const set = S.pts.filter(p => !S.sel || p.s);
  $('#legend').replaceChildren(...CATS.map((c, i) => {
    const li = document.createElement('li'), bt = document.createElement('button'), sw = document.createElement('i'), s = document.createElement('span'), b = document.createElement('b');
    sw.style.background = c[1]; s.textContent = c[0] + ' (' + c[2] + ')';
    b.textContent = set.filter(p => p.g === i).length.toLocaleString('en-IN');
    bt.type = 'button'; bt.setAttribute('aria-pressed', S.cats.has(i));
    bt.onclick = () => { S.cats.has(i) ? S.cats.delete(i) : S.cats.add(i); filt(); info(); };
    bt.append(sw, s, b); li.append(bt); return li;
  }));
  stats(set);
  $('#clr').hidden = !S.sel;
  $('#clr').textContent = 'Clear selection (' + set.length.toLocaleString('en-IN') + ' days)';
}
function render(el, items) {
  el.replaceChildren(...items.map(([k, v, s, g]) => {
    const d = document.createElement('div'), a = document.createElement('dt'), b = document.createElement('dd'), c = document.createElement('p');
    a.textContent = k; b.textContent = v; c.textContent = s; if (g >= 0) d.style.borderLeftColor = CATS[g][1];
    d.append(a, b, c); return d;
  }));
}
function stats(set) {
  const n = set.length, f = x => x.toLocaleString('en-IN'), ns = set.filter(p => p.n != null);
  $('#cov').hidden = !ns.length;
  if (!n) { render($('#stats'), []); render($('#stats2'), []); return; }
  const last = set[n - 1];
  let best = null, run = 0, start = null, prev = null;   // longest run of consecutive Poor-or-worse days
  for (const p of set) {
    if (p.g < 3) { run = 0; prev = null; continue; }
    if (prev && p.t - prev.t <= 1.5 * DAY) run++; else { run = 1; start = p; }
    prev = p; if (!best || run > best.n) best = { n: run, a: start.t, b: p.t };
  }
  const worst = set.reduce((b, p) => p.a > b.a ? p : b), bad = set.filter(p => p.g >= 3).length;
  render($('#stats'), [
    ['Latest day', Math.round(last.a), fd(last.t) + ', ' + CATS[last.g][0], last.g],
    ['Longest Poor or worse streak', best ? best.n + (best.n === 1 ? ' day' : ' days') : 'None',
      best ? (best.n > 1 ? fd(best.a) + ' to ' + fd(best.b) : fd(best.a)) : 'No Poor or worse days', 3],
    ['Worst day', Math.round(worst.a), fd(worst.t) + ', ' + CATS[worst.g][0], worst.g],
    ['Poor or worse', Math.round(bad / n * 100) + '%', f(bad) + ' of ' + f(n) + ' days', -1]]);
  if (!ns.length) return;
  const first = ns[0], end = ns[ns.length - 1], avg = ns.reduce((t, p) => t + p.n, 0) / ns.length;
  const thin = ns.filter(p => p.n < avg / 2).length, d = end.n - first.n;
  render($('#stats2'), [
    ['Stations, latest day', end.n, fd(end.t), -1],
    ['Average stations', Math.round(avg * 10) / 10, 'across ' + f(ns.length) + ' days', -1],
    ['Stations, first to latest', first.n + ' to ' + end.n, d ? (d > 0 ? '+' : '−') + Math.abs(d) + ' stations' : 'No change', -1],
    ['Thin-coverage days', f(thin), Math.round(thin / ns.length * 100) + '% of days under half the average', -1]]);
}
function setCity(c) {
  S.city = c; $('#city').value = c; S.pts = S.by.get(c); S.sel = false; S.pts.forEach(p => p.s = 0);
  const a = S.pts[0].t, b = S.pts[S.pts.length - 1].t, pad = Math.max((b - a) * .03, 10 * DAY);
  V.f0 = V.x0 = a - pad; V.f1 = V.x1 = b + pad;
  const mx = Math.max(0, ...S.pts.map(p => p.n || 0));
  charts[0].full = [0, YMAX]; charts[1].full = [0, Math.max(5, Math.ceil(mx * 1.15))];
  charts.forEach(h => h.y = [...h.full]);
  $('#title').textContent = 'AQI values for ' + c;
  $('#sub').textContent = S.pts.length.toLocaleString('en-IN') + ' bulletins, ' + fd(a) + ' to ' + fd(b);
  $('#hm').href = HEATMAP + encodeURIComponent(c) + '_calendarhm_2col.png';
  $('#hm').setAttribute('aria-label', 'Download calendar heatmap for ' + c);
  const im = $('#heat'); $('#heatwrap').hidden = false; im.alt = 'Calendar heatmap of daily AQI for ' + c;
  im.src = HEATMAP + encodeURIComponent(c) + '_calendarhm_2col.png';
  filt(); info();
}
function clearSel() { S.pts.forEach(p => p.s = 0); S.sel = false; info(); all(); }

/* ---------- axes helpers ---------- */
function nice(r, int) {
  const p = Math.pow(10, Math.floor(Math.log10(r))), f = r / p, s = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  return int ? Math.max(1, s) : s;
}
function xticks(a, b, n) {
  const C = [['d',1,1],['d',2,2],['d',7,7],['d',14,14],['m',1,30.4],['m',2,61],['m',3,91],['m',6,182],['y',1,365],['y',2,730],['y',5,1826],['y',10,3652]];
  const [u, s] = C.find(c => (b - a) / DAY / c[2] <= n) || C[11], out = [], d = new Date(a);
  d.setHours(0, 0, 0, 0); if (u === 'm') d.setDate(1); if (u === 'y') d.setMonth(0, 1);
  for (; d <= b; u === 'd' ? d.setDate(d.getDate() + 1) : u === 'm' ? d.setMonth(d.getMonth() + 1) : d.setFullYear(d.getFullYear() + 1)) {
    if (d >= a && (u === 'd' ? (d.getDate() - 1) % s === 0 : u === 'm' ? d.getMonth() % s === 0 : d.getFullYear() % s === 0)) out.push(+d);
  }
  return [out, u];
}
const tlabel = (t, u) => { const d = new Date(t); return u === 'y' ? '' + d.getFullYear() : u === 'm' ? MON[d.getMonth()] + ' ' + d.getFullYear() : d.getDate() + ' ' + MON[d.getMonth()]; };

/* ---------- tooltip ---------- */
const T = $('#tip');
function tip(p, e, o) {
  if (!p) { T.hidden = true; return; }
  T.replaceChildren();
  [['Date', fd(p.t)], ['AQI', Math.round(p.a)], ['Category', CATS[p.g][0]], ['Pollutants', p.pols.join(', ') || 'Not reported']]
    .concat(o.int ? [['Stations', p.n]] : [])
    .forEach(([k, v]) => { const r = document.createElement('div'), a = document.createElement('span'), b = document.createElement('b'); a.textContent = k; b.textContent = v; r.append(a, b); T.append(r); });
  T.hidden = false;
  const w = T.offsetWidth, h = T.offsetHeight; let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  T.style.transform = 'translate(' + x + 'px,' + y + 'px)';
}

/* ---------- chart ---------- */
class Chart {
  constructor(root, o) {
    this.r = root; this.o = o; this.c = root.querySelector('canvas'); this.g = this.c.getContext('2d');
    this.y = [0, 1]; this.full = [0, 1]; this.h = null; this.d = null; this.W = 0; this.H = 0; this.dpr = 1;
    this.m = { l: 70, r: 14, t: 10, b: 38 };
    const c = this.c;
    c.addEventListener('pointerdown', e => this.dn(e));
    c.addEventListener('pointermove', e => this.mv(e));
    c.addEventListener('pointerup', e => this.up(e));
    c.addEventListener('pointercancel', () => { this.d = null; this.draw(); });
    c.addEventListener('pointerleave', () => { if (!this.d) this.hv(null); });
    c.addEventListener('wheel', e => this.wh(e), { passive: false });
    new ResizeObserver(() => this.size()).observe(root);
  }
  size() {
    const b = this.r.getBoundingClientRect(); this.dpr = window.devicePixelRatio || 1;
    this.W = b.width; this.H = b.height; this.c.width = b.width * this.dpr; this.c.height = b.height * this.dpr;
    this.m = { l: 70, r: b.width >= 640 ? 132 : 14, t: 10, b: 38 };
    this.draw();
  }
  sx(t) { return this.m.l + (t - V.x0) / (V.x1 - V.x0) * (this.W - this.m.l - this.m.r); }
  ix(x) { return V.x0 + (x - this.m.l) / (this.W - this.m.l - this.m.r) * (V.x1 - V.x0); }
  sy(v) { return this.m.t + (1 - (v - this.y[0]) / (this.y[1] - this.y[0])) * (this.H - this.m.t - this.m.b); }
  iy(p) { return this.y[0] + (1 - (p - this.m.t) / (this.H - this.m.t - this.m.b)) * (this.y[1] - this.y[0]); }
  draw() {
    const { g, W, H, m, o } = this;
    if (!W || !S.pts.length) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.font = '14px Inter,system-ui,sans-serif';
    const pw = W - m.l - m.r, ph = H - m.t - m.b, [y0, y1] = this.y;
    const st = nice((y1 - y0) / 5, o.int), yt = [];
    for (let v = Math.ceil(y0 / st) * st; v <= y1; v += st) yt.push(v);
    const [xt, xu] = xticks(V.x0, V.x1, Math.max(2, Math.floor(pw / 175)));

    g.save(); g.beginPath(); g.rect(m.l, m.t, pw, ph); g.clip();
    if (o.bands) {
      for (let i = 0; i < 6; i++) {
        const lo = Math.max(EDGES[i], y0), hi = Math.min(EDGES[i + 1], y1);
        if (hi > lo) { g.globalAlpha = .1; g.fillStyle = CATS[i][1]; g.fillRect(m.l, this.sy(hi), pw, this.sy(lo) - this.sy(hi)); }
      }
      g.globalAlpha = 1; g.strokeStyle = 'rgba(22,77,18,.25)'; g.lineWidth = 1;
      EDGES.slice(1, 6).forEach(e => { const y = this.sy(e); g.beginPath(); g.moveTo(m.l, y); g.lineTo(m.l + pw, y); g.stroke(); });
    }
    g.strokeStyle = 'rgba(29,39,27,.08)'; g.lineWidth = 1;
    yt.forEach(v => { const y = this.sy(v); g.beginPath(); g.moveTo(m.l, y); g.lineTo(m.l + pw, y); g.stroke(); });
    const alpha = p => (o.pf && !p.m ? .12 : 1) * (S.sel && !p.s ? .25 : 1);
    for (const dim of [true, false]) {          // dimmed points first so highlighted ones sit on top
      for (const p of S.pts) {
        const v = o.v(p); if (v == null) continue;
        const x = this.sx(p.t); if (x < m.l - 6 || x > m.l + pw + 6) continue;
        const a = alpha(p); if ((a < 1) !== dim) continue;
        g.globalAlpha = a; g.beginPath(); g.arc(x, this.sy(v), 3, 0, 7);
        g.fillStyle = o.col(p); g.fill(); g.strokeStyle = '#000'; g.lineWidth = S.sel && p.s ? 1.5 : 1; g.stroke();
      }
    }
    g.globalAlpha = 1;
    if (this.h && o.v(this.h) != null) { g.beginPath(); g.arc(this.sx(this.h.t), this.sy(o.v(this.h)), 6.5, 0, 7); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(); }
    const d = this.d;
    if (d && d.moved && d.mode !== 'pan') {
      g.fillStyle = 'rgba(22,77,18,.10)'; g.strokeStyle = '#164D12'; g.setLineDash([4, 3]);
      g.fillRect(d.x, d.y, d.cx - d.x, d.cy - d.y); g.strokeRect(d.x, d.y, d.cx - d.x, d.cy - d.y); g.setLineDash([]);
    }
    g.restore();

    g.strokeStyle = '#c3ccbb'; g.beginPath(); g.moveTo(m.l, m.t); g.lineTo(m.l, m.t + ph); g.lineTo(m.l + pw, m.t + ph); g.stroke();
    g.fillStyle = MUTE; g.textAlign = 'right'; g.textBaseline = 'middle';
    yt.forEach(v => g.fillText(Math.round(v * 100) / 100 + '', m.l - 8, this.sy(v)));
    g.textAlign = 'center'; g.textBaseline = 'top'; let last = -1e9;
    xt.forEach(t => {
      const x = this.sx(t), s = tlabel(t, xu), w = g.measureText(s).width;
      if (x < m.l || x > m.l + pw) return;
      g.beginPath(); g.moveTo(x, m.t + ph); g.lineTo(x, m.t + ph + 4); g.stroke();
      if (x - w / 2 > last + 14) { g.fillText(s, x, m.t + ph + 8); last = x + w / 2; }
    });
    g.save(); g.translate(16, m.t + ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle';
    g.font = '600 14px Inter,system-ui,sans-serif'; g.fillText(o.lbl, 0, 0); g.restore();
    if (o.bands && W >= 640) {
      g.textAlign = 'left'; g.textBaseline = 'middle';
      for (let i = 0; i < 6; i++) {
        const lo = Math.max(EDGES[i], y0), hi = Math.min(EDGES[i + 1], y1);
        if (hi <= lo || this.sy(lo) - this.sy(hi) < 18) continue;
        const cy = (this.sy(lo) + this.sy(hi)) / 2;
        g.fillStyle = CATS[i][1]; g.fillRect(W - m.r + 12, cy - 5, 10, 10);
        g.fillStyle = INK; g.fillText(CATS[i][0], W - m.r + 28, cy);
      }
    }
  }
  P(e) { const b = this.c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
  IN(x, y) { const m = this.m; return x >= m.l && x <= this.W - m.r && y >= m.t && y <= this.H - m.b; }
  dn(e) {
    const [x, y] = this.P(e); if (e.button || !this.IN(x, y)) return;
    this.hv(null);
    this.d = { mode: S.tool, x, y, cx: x, cy: y, sh: e.shiftKey, moved: false, a: [V.x0, V.x1], b: [...this.y] };
    this.c.setPointerCapture(e.pointerId);
    if (S.tool === 'pan') this.c.style.cursor = 'grabbing';
  }
  mv(e) {
    const [x, y] = this.P(e), d = this.d;
    if (!d) { this.IN(x, y) ? this.near(x, y, e) : this.hv(null); return; }
    d.cx = x; d.cy = y; if (Math.hypot(x - d.x, y - d.y) > 3) d.moved = true;
    if (d.mode === 'pan' && d.moved) {
      const dx = (x - d.x) / (this.W - this.m.l - this.m.r) * (d.a[1] - d.a[0]);
      const dy = (y - d.y) / (this.H - this.m.t - this.m.b) * (d.b[1] - d.b[0]);
      V.x0 = d.a[0] - dx; V.x1 = d.a[1] - dx; this.y = [d.b[0] + dy, d.b[1] + dy]; all();
    } else this.draw();
  }
  up() {
    const d = this.d; if (!d) return; this.d = null; this.c.style.cursor = '';
    const xa = Math.min(d.x, d.cx), xb = Math.max(d.x, d.cx), ya = Math.min(d.y, d.cy), yb = Math.max(d.y, d.cy);
    if (d.mode === 'select') {
      if (!d.sh) S.pts.forEach(p => p.s = 0);
      if (d.moved) {
        const t0 = this.ix(xa), t1 = this.ix(xb), lo = this.iy(yb), hi = this.iy(ya);
        S.pts.forEach(p => { const v = this.o.v(p); if (v != null && p.t >= t0 && p.t <= t1 && v >= lo && v <= hi) p.s = 1; });
      }
      S.sel = S.pts.some(p => p.s); info();
    } else if (d.mode === 'zoom' && xb - xa > 6 && yb - ya > 6) {
      V.x0 = this.ix(xa); V.x1 = this.ix(xb); this.y = [this.iy(yb), this.iy(ya)];
    }
    all();
  }
  wh(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const [x, y] = this.P(e); if (!this.IN(x, y)) return;
    e.preventDefault();
    const f = Math.exp(e.deltaY * .002), t = this.ix(x), v = this.iy(y);
    const a = t - (t - V.x0) * f, b = t + (V.x1 - t) * f;
    if (b - a > 3 * DAY && b - a < (V.f1 - V.f0) * 2) { V.x0 = a; V.x1 = b; }
    const c = v - (v - this.y[0]) * f, d = v + (this.y[1] - v) * f;
    if (d - c > (this.o.int ? 2 : 20) && d - c < (this.full[1] - this.full[0]) * 3) this.y = [c, d];
    all();
  }
  near(x, y, e) {
    let best = null, bd = 100;
    for (const p of S.pts) {
      const v = this.o.v(p); if (v == null) continue;
      const dx = this.sx(p.t) - x; if (dx * dx > bd) continue;
      const dy = this.sy(v) - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = p; }
    }
    this.hv(best, e);
  }
  hv(p, e) { if (p !== this.h) { this.h = p; this.draw(); } tip(p, e, this.o); }
}

/* ---------- wiring ---------- */
charts = [
  new Chart($('#p1'), { v: p => p.a, col: p => CATS[p.g][1], bands: true, pf: true, lbl: 'AQI' }),
  new Chart($('#p2'), { v: p => p.n, col: () => INK, int: true, lbl: 'Stations' })
];
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
  S.tool = b.dataset.tool; document.body.dataset.tool = S.tool;
  document.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', x === b));
});
$('#city').onchange = e => setCity(e.target.value);
$('#clr').onclick = clearSel;
$('#reset').onclick = () => { V.x0 = V.f0; V.x1 = V.f1; charts.forEach(c => c.y = [...c.full]); clearSel(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.sel) clearSel(); });
$('#save').onclick = () => {
  if (!S.pts.length) return;
  const [a, b] = charts.map(c => c.c), d = charts[0].dpr, top = 54 * d, out = document.createElement('canvas');
  out.width = a.width; out.height = top + a.height + b.height;
  const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
  g.fillStyle = INK; g.font = '600 ' + 24 * d + 'px "Source Serif 4",Georgia,serif'; g.fillText('AQI values for ' + S.city, 16 * d, 34 * d);
  g.drawImage(a, 0, top); g.drawImage(b, 0, top + a.height);
  out.toBlob(blob => { const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'aqi_' + S.city.replace(/\W+/g, '_') + '.png'; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1000); });
};
$('#heat').onerror = () => { $('#heatwrap').hidden = true; };
$('#pall').onclick = () => { S.pols = new Set(S.opts); chips(); filt(); };
$('#pnone').onclick = () => { S.pols = new Set(); chips(); filt(); };
document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => {
  if (!S.pts.length) return;
  const n = +b.dataset.range, last = S.pts[S.pts.length - 1].t;
  V.x1 = V.f1; V.x0 = n ? Math.max(V.f0, last - n * DAY - 2 * DAY) : V.f0; all();
});
info();
fetch(CSV_URL).then(r => { if (!r.ok) throw Error('HTTP ' + r.status); return r.text(); }).then(ingest)
  .catch(e => msg('Couldn’t load ' + CSV_URL + ' (' + e.message + '). Check that the file is in the repository at that path.'));
})();