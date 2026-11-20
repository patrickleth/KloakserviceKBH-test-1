// Mini-CRM i browseren. Al data bygges med textContent (aldrig innerHTML med brugerdata), så indsendt tekst ikke kan køre som kode.
// Board og liste, filtre, sortering, gemte visninger, egne stages, autosave og noter med Send-knap.
type Lead = {
  id: string; status: string; kilde: string; navn: string; telefon?: string; email?: string; adresse?: string; postnr?: string; by?: string;
  ydelse?: string; beskrivelse?: string; ansvarlig?: string; fundet?: string; vaerdi: number | null; naesteKontakt?: string; prioritet?: string;
  side?: string; utm?: string; gclid?: string; fbclid?: string;
  filer: { n: number; navn: string; type: string; kb: number }[]; noter: { ts: string; af: string; tekst: string }[];
  historik: { ts: string; af: string; hvad: string }[]; oprettet: string; opdateret: string;
};
type Stage = { id: string; navn: string; farve: string };
type Filters = Record<'status' | 'kilde' | 'ansvarlig' | 'fundet' | 'kontakt' | 'periode' | 'prioritet', string[]>;
type View = { id: string; navn: string; mode: 'board' | 'list'; group: 'status' | 'none'; sort: { key: string; dir: 'asc' | 'desc' }; filters: Filters };

const API = '/administrator-system/api/';
const ARCH: Stage = { id: 'arkiveret', navn: 'Arkiveret', farve: '#b0b6bf' };
const PRIO: Record<string, { navn: string; farve: string }> = { haster: { navn: 'Haster', farve: '#d33d44' }, hoej: { navn: 'Høj', farve: '#f5a623' }, normal: { navn: 'Normal', farve: '#1090e0' }, lav: { navn: 'Lav', farve: '#87909e' } };
const emptyFilters = (): Filters => ({ status: [], kilde: [], ansvarlig: [], fundet: [], kontakt: [], periode: [], prioritet: [] });
const BUILTIN: View[] = [
  { id: 'board', navn: 'Board', mode: 'board', group: 'status', sort: { key: 'oprettet', dir: 'desc' }, filters: emptyFilters() },
  { id: 'liste', navn: 'Liste', mode: 'list', group: 'status', sort: { key: 'oprettet', dir: 'desc' }, filters: emptyFilters() },
  { id: 'opfoelgning', navn: 'Opfølgning i dag', mode: 'list', group: 'none', sort: { key: 'naesteKontakt', dir: 'asc' }, filters: { ...emptyFilters(), kontakt: ['overdue', 'today'] } }
];
const SORTS: [string, string][] = [['oprettet', 'Oprettet'], ['opdateret', 'Senest ændret'], ['naesteKontakt', 'Næste kontakt'], ['navn', 'Navn'], ['vaerdi', 'Værdi'], ['status', 'Status'], ['prioritet', 'Prioritet'], ['by', 'By'], ['ansvarlig', 'Ansvarlig']];

// ---------- små hjælpere ----------
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
function h(tag: string, attrs: Record<string, any> = {}, ...kids: (Node | string | null | undefined | false)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) e.append(c as any);
  return e;
}
const kr = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 0 }) + ' kr.';
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ago = (iso: string) => {
  const diff = (Date.now() - +new Date(iso)) / 60000;
  if (diff < 60) return `${Math.max(1, Math.round(diff))} min. siden`;
  if (diff < 1440) return `${Math.round(diff / 60)} t. siden`;
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
};
const dueState = (d?: string) => !d ? 'none' : d < todayStr() ? 'overdue' : d === todayStr() ? 'today' : 'future';
const dueLabel = (d?: string) => {
  if (!d) return '';
  const st = dueState(d);
  if (st === 'today') return 'I dag';
  const dt = new Date(d + 'T12:00:00');
  const diff = Math.round((+dt - +new Date(todayStr() + 'T12:00:00')) / 864e5);
  if (diff === 1) return 'I morgen';
  if (diff === -1) return 'I går';
  return dt.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
};
const initials = (s?: string) => (s || '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('') || '';
const colorFor = (s: string) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return `hsl(${x} 55% 46%)`; };
// Farver sættes via CSSOM (ikke style-attributter), så sidens strenge CSP overholdes.
const paint = <T extends HTMLElement>(e: T, props: Record<string, string>) => { for (const [k, v] of Object.entries(props)) e.style.setProperty(k, v); return e; };

// ---------- tilstand ----------
let leads: Lead[] = [];
let stages: Stage[] = [];
let views: View[] = [];
let current: View = structuredClone(BUILTIN[0]);
let query = '';
let showArchived = false;
let resetToken = '';
let collapsed = new Set<string>();

async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', 'X-VK-Admin': '1', ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 && !['login', 'glemt', 'nulstil'].includes(path)) { showLogin(); throw new Error('login'); }
  if (!r.ok) throw Object.assign(new Error(body.message || 'Noget gik galt. Prøv igen.'), { status: r.status });
  return body;
}
const stageOf = (id: string) => stages.find(s => s.id === id) || (id === 'arkiveret' ? ARCH : { id, navn: id, farve: '#87909e' });

// ---------- login ----------
function showCard(which: 'login' | 'forgot' | 'reset') { for (const k of ['login', 'forgot', 'reset']) $(`[data-${k}]`).hidden = k !== which; }
function showLogin(msg?: string, ok?: string) {
  $('#app').hidden = true; $('#login').hidden = false; showCard('login');
  const err = $('[data-login] .crm-error'); err.hidden = !msg; err.textContent = msg || '';
  const okEl = $('[data-login] .crm-ok'); okEl.hidden = !ok; okEl.textContent = ok || '';
  $<HTMLInputElement>('[data-login] input[name=bruger]').focus();
}

async function boot() {
  const token = new URLSearchParams(location.search).get('nulstil');
  if (token) { history.replaceState(null, '', location.pathname); resetToken = token; $('#app').hidden = true; $('#login').hidden = false; showCard('reset'); return; }
  let me;
  try { me = await api('me'); } catch (e: any) { return showLogin(e.status === 503 ? e.message : undefined); }
  $('[data-me]').textContent = me.bruger;
  $('#login').hidden = true; $('#app').hidden = false;
  const cfg = await api('config');
  stages = cfg.stages; views = cfg.views;
  const last = localStorage.getItem('vk_crm_view');
  const found = [...BUILTIN, ...views].find(v => v.id === last);
  if (found) current = structuredClone(found);
  await refresh();
}
async function refresh() { try { leads = (await api('leads')).leads; render(); } catch { /* login vises */ } }

// ---------- filtrering og sortering ----------
function passes(l: Lead) {
  const f = current.filters;
  if (!showArchived && l.status === 'arkiveret' && !f.status.includes('arkiveret')) return false;
  if (query && ![l.navn, l.telefon, l.email, l.adresse, l.by, l.postnr, l.ydelse, l.beskrivelse, l.ansvarlig].join(' ').toLowerCase().includes(query)) return false;
  if (f.status.length && !f.status.includes(l.status)) return false;
  if (f.kilde.length && !f.kilde.includes(l.kilde)) return false;
  if (f.ansvarlig.length && !f.ansvarlig.includes(l.ansvarlig || '')) return false;
  if (f.fundet.length && !f.fundet.includes(l.fundet || '')) return false;
  if (f.prioritet.length && !f.prioritet.includes(l.prioritet || '')) return false;
  if (f.kontakt.length) {
    const st = dueState(l.naesteKontakt);
    const week = l.naesteKontakt && l.naesteKontakt <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    if (!f.kontakt.some(k => k === st || (k === 'week' && week && st !== 'overdue'))) return false;
  }
  if (f.periode.length) {
    const days = Math.max(...f.periode.map(Number));
    if (+new Date(l.oprettet) < Date.now() - days * 864e5) return false;
  }
  return true;
}
function sorted(list: Lead[]) {
  const { key, dir } = current.sort;
  const order = (l: Lead): any => {
    if (key === 'status') return stages.findIndex(s => s.id === l.status);
    if (key === 'prioritet') return ['haster', 'hoej', 'normal', 'lav', ''].indexOf(l.prioritet || '');
    if (key === 'vaerdi') return l.vaerdi ?? -1;
    if (key === 'naesteKontakt') return l.naesteKontakt || (dir === 'asc' ? '9999' : '');
    return String((l as any)[key] || '').toLowerCase();
  };
  return [...list].sort((a, b) => { const x = order(a), y = order(b); return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'asc' ? 1 : -1); });
}

// ---------- tegning ----------
function render() {
  renderTabs(); renderStats();
  $('[data-filter-count]').textContent = Object.values(current.filters).flat().length ? ` · ${Object.values(current.filters).flat().length}` : '';
  for (const b of document.querySelectorAll<HTMLElement>('[data-only-list]')) b.hidden = current.mode !== 'list';
  const list = sorted(leads.filter(passes));
  const host = $('[data-view]'); host.replaceChildren(current.mode === 'board' ? board(list) : table(list));
}

function renderTabs() {
  const tabs = $('[data-tabs]'); tabs.replaceChildren();
  for (const v of [...BUILTIN, ...views]) {
    const custom = !BUILTIN.some(b => b.id === v.id);
    const t = h('div', { class: 'tab' + (v.id === current.id ? ' on' : '') },
      h('button', { type: 'button', text: (v.mode === 'board' ? '▦ ' : '☰ ') + v.navn, onclick: () => { current = structuredClone(v); localStorage.setItem('vk_crm_view', v.id); render(); } }),
      custom ? h('button', { type: 'button', class: 'tab-x', 'aria-label': `Slet visningen ${v.navn}`, text: '×', onclick: async () => {
        if (!confirm(`Slet visningen "${v.navn}"?`)) return;
        views = views.filter(x => x.id !== v.id); await api('config/views', { method: 'PUT', body: JSON.stringify({ views }) });
        if (current.id === v.id) current = structuredClone(BUILTIN[0]); render();
      } }) : null);
    tabs.append(t);
  }
}

function renderStats() {
  const month = new Date().toISOString().slice(0, 7);
  const active = leads.filter(l => l.status !== 'arkiveret');
  const last = stages[stages.length - 1]?.id;
  const items: [string, string, string][] = [
    ['Nye', String(active.filter(l => l.status === stages[0]?.id).length), ''],
    ['Opfølgning i dag', String(active.filter(l => ['overdue', 'today'].includes(dueState(l.naesteKontakt))).length), 'warn'],
    ['Leads denne måned', String(leads.filter(l => l.oprettet.startsWith(month)).length), ''],
    ['Værdi i pipeline', kr(active.filter(l => l.status !== last && !/vundet|tabt/.test(l.status)).reduce((a, l) => a + (l.vaerdi || 0), 0)), '']
  ];
  $('[data-stats]').replaceChildren(...items.map(([k, v, c]) => h('div', { class: 'stat ' + c }, h('strong', { text: v }), h('span', { text: k }))));
}

function dueChip(l: Lead) {
  if (!l.naesteKontakt) return null;
  return h('span', { class: `due due-${dueState(l.naesteKontakt)}`, title: `Næste kontakt ${l.naesteKontakt}` }, h('i', { 'aria-hidden': 'true', text: '⚑' }), dueLabel(l.naesteKontakt));
}
function avatar(name?: string) { return name ? paint(h('span', { class: 'avatar', title: name, text: initials(name) }), { background: colorFor(name) }) : null; }
function statusPill(id: string, small = false) { const s = stageOf(id); return paint(h('span', { class: 'pill' + (small ? ' sm' : ''), text: s.navn }), { '--c': s.farve }); }
function prioFlag(p?: string) { return p && PRIO[p] ? paint(h('span', { class: 'prio', title: `Prioritet: ${PRIO[p].navn}`, text: '⚑ ' + PRIO[p].navn }), { color: PRIO[p].farve }) : null; }

function board(list: Lead[]) {
  const wrap = h('div', { class: 'board' });
  const cols = showArchived || current.filters.status.includes('arkiveret') ? [...stages, ARCH] : stages;
  for (const s of cols) {
    if (current.filters.status.length && !current.filters.status.includes(s.id)) continue;
    const items = list.filter(l => l.status === s.id);
    const sum = items.reduce((a, l) => a + (l.vaerdi || 0), 0);
    const ul = h('ul', { class: 'cards' }, ...items.map(card));
    const col = paint(h('div', { class: 'col', 'data-col': s.id },
      h('div', { class: 'col-head' }, statusPill(s.id), h('span', { class: 'count', text: String(items.length) }), sum ? h('span', { class: 'col-sum', text: kr(sum) }) : null),
      ul,
      h('button', { type: 'button', class: 'col-add', text: '+ Nyt lead', onclick: () => openTask(null, s.id) })), { '--c': s.farve });
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer?.getData('text/plain'); if (id) patch(id, { status: s.id }); });
    wrap.append(col);
  }
  return wrap;
}

function card(l: Lead) {
  const li = h('li', { class: 'lcard', draggable: 'true', tabindex: '0', 'data-id': l.id, 'aria-label': `${l.navn}. Åbn` },
    h('div', { class: 'lc-top' }, h('strong', { class: 'lc-name', text: l.navn || 'Uden navn' }), l.kilde === 'manuel' ? h('span', { class: 'tag', text: 'Manuel' }) : null),
    l.ydelse ? h('p', { class: 'lc-job', text: l.ydelse }) : null,
    l.by || l.postnr ? h('p', { class: 'lc-sub', text: [l.postnr, l.by].filter(Boolean).join(' ') }) : null,
    h('div', { class: 'lc-meta' }, dueChip(l), prioFlag(l.prioritet), l.filer?.length ? h('span', { class: 'mini', text: `📎 ${l.filer.length}` }) : null, l.noter?.length ? h('span', { class: 'mini', text: `💬 ${l.noter.length}` }) : null,
      l.vaerdi ? h('span', { class: 'lc-val', text: kr(l.vaerdi) }) : null, avatar(l.ansvarlig)),
    h('p', { class: 'lc-ago', text: ago(l.oprettet) }));
  li.addEventListener('dragstart', e => { e.dataTransfer?.setData('text/plain', l.id); li.classList.add('dragging'); });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));
  li.addEventListener('click', () => openTask(l.id));
  li.addEventListener('keydown', e => { if (e.key === 'Enter') openTask(l.id); });
  return li;
}

const COLS: [string, string][] = [['navn', 'Navn'], ['status', 'Status'], ['naesteKontakt', 'Næste kontakt'], ['prioritet', 'Prioritet'], ['ydelse', 'Opgave'], ['vaerdi', 'Værdi'], ['ansvarlig', 'Ansvarlig'], ['by', 'By'], ['kilde', 'Kilde'], ['oprettet', 'Oprettet']];
function table(list: Lead[]) {
  const wrap = h('div', { class: 'list' });
  const head = h('div', { class: 'row head' }, ...COLS.map(([k, label]) => h('button', { type: 'button', class: 'cell sortable' + (current.sort.key === k ? ' on' : ''),
    text: label + (current.sort.key === k ? (current.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''),
    onclick: () => { current.sort = { key: k, dir: current.sort.key === k && current.sort.dir === 'desc' ? 'asc' : 'desc' }; render(); } })));
  const groups = current.group === 'status' ? [...stages, ARCH].map(s => ({ s, items: list.filter(l => l.status === s.id) })).filter(g => g.items.length || stages.includes(g.s)) : [{ s: null as Stage | null, items: list }];
  for (const g of groups) {
    if (g.s && g.s.id === 'arkiveret' && !g.items.length) continue;
    const key = g.s?.id || 'alle';
    const isCol = collapsed.has(key);
    const section = h('div', { class: 'group' });
    if (g.s) section.append(paint(h('button', { type: 'button', class: 'group-head', 'aria-expanded': String(!isCol), onclick: () => { isCol ? collapsed.delete(key) : collapsed.add(key); render(); } },
      h('span', { class: 'caret', text: isCol ? '▸' : '▾' }), statusPill(g.s.id), h('span', { class: 'count', text: String(g.items.length) })), { '--c': g.s.farve }));
    if (!isCol) {
      section.append(head.cloneNode(true));
      section.lastElementChild!.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => { const k = COLS[i][0]; current.sort = { key: k, dir: current.sort.key === k && current.sort.dir === 'desc' ? 'asc' : 'desc' }; render(); }));
      for (const l of g.items) section.append(row(l));
      if (!g.items.length) section.append(h('p', { class: 'empty', text: 'Ingen leads' }));
      section.append(h('button', { type: 'button', class: 'row-add', text: '+ Nyt lead', onclick: () => openTask(null, g.s?.id) }));
    }
    wrap.append(section);
  }
  if (!list.length && current.group === 'none') wrap.append(h('p', { class: 'empty', text: 'Ingen leads matcher filtrene.' }));
  return wrap;
}
function row(l: Lead) {
  const sel = h('select', { class: 'inline-status', 'aria-label': 'Status', onclick: (e: Event) => e.stopPropagation(), onchange: (e: Event) => patch(l.id, { status: (e.target as HTMLSelectElement).value }) },
    ...[...stages, ARCH].map(s => h('option', { value: s.id, selected: s.id === l.status, text: s.navn })));
  paint(sel, { '--c': stageOf(l.status).farve });
  const r = h('div', { class: 'row', tabindex: '0', role: 'button', 'aria-label': `${l.navn}. Åbn` },
    h('div', { class: 'cell name' }, h('strong', { text: l.navn || 'Uden navn' }), l.filer?.length ? h('span', { class: 'mini', text: `📎${l.filer.length}` }) : null, l.noter?.length ? h('span', { class: 'mini', text: `💬${l.noter.length}` }) : null),
    h('div', { class: 'cell' }, sel),
    h('div', { class: 'cell' }, dueChip(l) || h('span', { class: 'muted', text: '–' })),
    h('div', { class: 'cell' }, prioFlag(l.prioritet) || h('span', { class: 'muted', text: '–' })),
    h('div', { class: 'cell clip', text: l.ydelse || '' }),
    h('div', { class: 'cell num', text: l.vaerdi ? kr(l.vaerdi) : '' }),
    h('div', { class: 'cell' }, avatar(l.ansvarlig), h('span', { class: 'clip', text: l.ansvarlig || '' })),
    h('div', { class: 'cell clip', text: [l.postnr, l.by].filter(Boolean).join(' ') }),
    h('div', { class: 'cell', text: l.kilde === 'manuel' ? 'Manuel' : 'Formular' }),
    h('div', { class: 'cell muted', text: ago(l.oprettet) }));
  r.addEventListener('click', () => openTask(l.id));
  r.addEventListener('keydown', e => { if (e.key === 'Enter') openTask(l.id); });
  return r;
}

async function patch(id: string, data: Record<string, any>) {
  const l = leads.find(x => x.id === id); if (!l) return;
  const before = { ...l }; Object.assign(l, data); render();
  try { const r = await api(`leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); Object.assign(l, r.lead); render(); return r.lead as Lead; }
  catch (e: any) { Object.assign(l, before); render(); if (e.message !== 'login') alert(e.message); }
}

// ---------- popovers: filter, sortér, gruppér ----------
function closePops() { document.querySelectorAll<HTMLElement>('[data-pop]').forEach(p => p.hidden = true); }
function openPop(kind: string, btn: HTMLElement) {
  const pop = $(`[data-pop="${kind}"]`); const wasOpen = !pop.hidden; closePops(); if (wasOpen) return;
  pop.replaceChildren(kind === 'filter' ? filterPanel() : kind === 'sort' ? sortPanel() : groupPanel());
  pop.hidden = false; paint(pop, { left: btn.offsetLeft + 'px' });
}
function checkGroup(title: string, key: keyof Filters, opts: [string, string][]) {
  if (!opts.length) return null;
  return h('fieldset', { class: 'fgroup' }, h('legend', { text: title }), ...opts.map(([v, label]) => h('label', { class: 'fopt' },
    h('input', { type: 'checkbox', checked: current.filters[key].includes(v), onchange: (e: Event) => {
      const on = (e.target as HTMLInputElement).checked; const arr = current.filters[key];
      current.filters[key] = on ? [...arr, v] : arr.filter(x => x !== v); render();
    } }), label)));
}
const uniq = (k: keyof Lead) => [...new Set(leads.map(l => String(l[k] || '')).filter(Boolean))].sort().map(v => [v, v] as [string, string]);
function filterPanel() {
  return h('div', { class: 'pop-inner' },
    h('div', { class: 'pop-head' }, h('strong', { text: 'Filtre' }), h('button', { type: 'button', class: 'linkish', text: 'Ryd alle', onclick: () => { current.filters = emptyFilters(); render(); closePops(); } })),
    h('div', { class: 'fgrid' },
      checkGroup('Status', 'status', [...stages, ARCH].map(s => [s.id, s.navn])),
      checkGroup('Næste kontakt', 'kontakt', [['overdue', 'Overskredet'], ['today', 'I dag'], ['week', 'Næste 7 dage'], ['future', 'Senere'], ['none', 'Ingen dato']]),
      checkGroup('Prioritet', 'prioritet', [...Object.entries(PRIO).map(([k, p]) => [k, p.navn] as [string, string]), ['', 'Ingen']]),
      checkGroup('Kilde', 'kilde', [['formular', 'Formular'], ['manuel', 'Manuel']]),
      checkGroup('Oprettet', 'periode', [['7', 'Sidste 7 dage'], ['30', 'Sidste 30 dage'], ['90', 'Sidste 90 dage']]),
      checkGroup('Ansvarlig', 'ansvarlig', uniq('ansvarlig')),
      checkGroup('Fandt os via', 'fundet', uniq('fundet'))));
}
function sortPanel() {
  return h('div', { class: 'pop-inner' }, h('div', { class: 'pop-head' }, h('strong', { text: 'Sortér efter' })),
    ...SORTS.map(([k, label]) => h('button', { type: 'button', class: 'popt' + (current.sort.key === k ? ' on' : ''), text: label + (current.sort.key === k ? (current.sort.dir === 'asc' ? '  ↑ stigende' : '  ↓ faldende') : ''),
      onclick: () => { current.sort = { key: k, dir: current.sort.key === k && current.sort.dir === 'desc' ? 'asc' : 'desc' }; render(); $('[data-pop="sort"]').replaceChildren(sortPanel()); } })));
}
function groupPanel() {
  return h('div', { class: 'pop-inner' }, h('div', { class: 'pop-head' }, h('strong', { text: 'Gruppér efter' })),
    ...([['status', 'Status'], ['none', 'Ingen gruppering']] as const).map(([k, label]) => h('button', { type: 'button', class: 'popt' + (current.group === k ? ' on' : ''), text: label, onclick: () => { current.group = k; render(); closePops(); } })));
}

// ---------- opgavevindue (lead) med autosave ----------
const task = $<HTMLDialogElement>('[data-task]');
let taskId: string | null = null;
let saveTimer: number | undefined;
let pending: Record<string, any> = {};

function setSaved(state: 'saving' | 'saved' | 'error' | 'idle', msg = '') {
  const el = task.querySelector('[data-saved]'); if (!el) return;
  el.className = 'saved st-' + state; el.textContent = state === 'saving' ? 'Gemmer…' : state === 'saved' ? '✓ Gemt' : state === 'error' ? msg || 'Kunne ikke gemme' : '';
}
async function flush() {
  if (!taskId || !Object.keys(pending).length) return;
  const data = pending; pending = {}; setSaved('saving');
  const l = await patch(taskId, data);
  if (l) { setSaved('saved'); renderActivity(l); task.querySelector('[data-title]')!.textContent = l.navn || 'Uden navn'; } else setSaved('error');
}
function queue(field: string, value: any, delay = 700) {
  pending[field] = value; clearTimeout(saveTimer);
  if (taskId) { setSaved('saving'); saveTimer = window.setTimeout(flush, delay); }
}

function prop(label: string, control: HTMLElement) { return h('div', { class: 'prop' }, h('span', { class: 'prop-label', text: label }), control); }
function field(name: string, value: string, opts: Record<string, any> = {}) {
  const tag = opts.multiline ? 'textarea' : 'input';
  const el = h(tag, { name, value: opts.multiline ? undefined : value, rows: opts.multiline ? 5 : undefined, type: opts.type, maxlength: opts.max, inputmode: opts.inputmode, placeholder: opts.placeholder || 'Tom', class: 'pinput' }) as HTMLInputElement;
  if (opts.multiline) el.value = value;
  el.addEventListener('input', () => queue(name, name === 'vaerdi' ? el.value.replace(/\D/g, '') : el.value, opts.type === 'date' ? 0 : 900));
  el.addEventListener('blur', () => flush());
  return el;
}

function openTask(id: string | null, status?: string) {
  clearTimeout(saveTimer); pending = {};
  taskId = id;
  const l: Partial<Lead> = id ? leads.find(x => x.id === id)! : { status: status || stages[0]?.id, kilde: 'manuel', noter: [], historik: [], filer: [], vaerdi: null };
  const statusSel = h('select', { class: 'pinput status-sel', 'aria-label': 'Status' }, ...[...stages, ARCH].map(s => h('option', { value: s.id, selected: s.id === l.status, text: s.navn }))) as HTMLSelectElement;
  const tintSel = () => paint(statusSel, { '--c': stageOf(statusSel.value).farve });
  tintSel();
  statusSel.addEventListener('change', () => { tintSel(); if (taskId) { pending.status = statusSel.value; flush(); } });
  const prioSel = h('select', { class: 'pinput', 'aria-label': 'Prioritet' }, h('option', { value: '', text: 'Ingen' }), ...Object.entries(PRIO).map(([k, p]) => h('option', { value: k, selected: k === l.prioritet, text: p.navn }))) as HTMLSelectElement;
  prioSel.addEventListener('change', () => { if (taskId) { pending.prioritet = prioSel.value; flush(); } });
  const due = field('naesteKontakt', l.naesteKontakt || '', { type: 'date' });
  const dueWrap = h('div', { class: 'due-wrap' }, due, h('span', { 'data-due-badge': '' }));
  const badge = () => { const b = dueWrap.querySelector('[data-due-badge]')!; b.replaceChildren(); const st = dueState(due.value); if (st !== 'none') b.append(h('span', { class: `due due-${st}`, text: st === 'overdue' ? 'Overskredet' : st === 'today' ? 'I dag' : dueLabel(due.value) })); };
  due.addEventListener('input', badge); badge();

  const title = h('input', { class: 'title-input', name: 'navn', value: l.navn || '', placeholder: 'Navn på lead', maxlength: '120', 'aria-label': 'Navn' }) as HTMLInputElement;
  title.addEventListener('input', () => queue('navn', title.value));
  title.addEventListener('blur', () => flush());

  const quick = h('div', { class: 'quick' },
    l.telefon ? h('a', { class: 'cbtn cbtn-call cbtn-sm', href: 'tel:' + l.telefon.replace(/[^\d+]/g, ''), text: `📞 Ring ${l.telefon}` }) : null,
    l.email ? h('a', { class: 'cbtn cbtn-ghost cbtn-sm', href: 'mailto:' + l.email, text: '✉ Skriv mail' }) : null);

  const files = l.filer?.length ? h('div', { class: 'files' }, h('h3', { text: 'Vedhæftede filer' }),
    h('ul', {}, ...l.filer.map(fi => h('li', {}, h('a', { href: `${API}filer/${l.id}/${fi.n}`, target: '_blank', rel: 'noopener', text: `${fi.navn} (${fi.kb} kB)` }))))) : null;
  const meta = [l.fundet && `Fandt os via: ${l.fundet}`, l.side && `Side: ${l.side}`, l.utm && `UTM: ${l.utm}`, l.gclid && 'Google Ads-klik', l.fbclid && 'Meta-klik'].filter(Boolean).join(' · ');

  const left = h('div', { class: 'task-main' },
    h('div', { class: 'task-top' }, statusPill(l.status || stages[0]?.id || 'ny'), h('span', { class: 'muted small', text: id ? `${l.kilde === 'manuel' ? 'Oprettet manuelt' : 'Fra hjemmesidens formular'} · ${ago(l.oprettet!)}` : 'Nyt lead' })),
    title, quick,
    h('div', { class: 'props' },
      prop('Status', statusSel), prop('Næste kontakt', dueWrap), prop('Prioritet', prioSel),
      prop('Ansvarlig', field('ansvarlig', l.ansvarlig || '', { max: 60, placeholder: 'Navn' })),
      prop('Telefon', field('telefon', l.telefon || '', { max: 30, inputmode: 'tel' })),
      prop('E-mail', field('email', l.email || '', { type: 'email', max: 160 })),
      prop('Værdi (kr.)', field('vaerdi', l.vaerdi ? String(l.vaerdi) : '', { inputmode: 'numeric', max: 12 })),
      prop('Opgave', field('ydelse', l.ydelse || '', { max: 120 })),
      prop('Adresse', field('adresse', l.adresse || '', { max: 160 })),
      prop('Postnr. og by', h('div', { class: 'two' }, field('postnr', l.postnr || '', { max: 8, inputmode: 'numeric', placeholder: 'Postnr.' }), field('by', l.by || '', { max: 80, placeholder: 'By' }))),
      prop('Fandt os via', field('fundet', l.fundet || '', { max: 60 }))),
    h('label', { class: 'desc-label', text: 'Beskrivelse' }), field('beskrivelse', l.beskrivelse || '', { multiline: true, max: 4000, placeholder: 'Beskrivelse af opgaven' }),
    files, meta ? h('p', { class: 'meta', text: meta }) : null);

  const note = h('textarea', { class: 'note-input', rows: 3, maxlength: '2000', placeholder: 'Skriv en note… (Ctrl + Enter sender)', 'aria-label': 'Ny note' }) as HTMLTextAreaElement;
  const sendNote = async () => {
    const t = note.value.trim(); if (!t) return;
    if (!taskId) { alert('Opret leadet først.'); return; }
    note.disabled = true; const r = await patch(taskId, { note: t }); note.disabled = false;
    if (r) { note.value = ''; renderActivity(r); note.focus(); }
  };
  note.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendNote(); } });
  const right = h('aside', { class: 'task-side' },
    h('div', { class: 'side-head' }, h('strong', { text: 'Aktivitet' })),
    h('ul', { class: 'activity', 'data-activity': '' }),
    h('div', { class: 'composer' }, note, h('div', { class: 'composer-row' }, h('span', { class: 'muted small', text: 'Noter gemmes med det samme' }), h('button', { type: 'button', class: 'cbtn cbtn-primary cbtn-sm', text: 'Send', onclick: sendNote }))));

  const header = h('div', { class: 'task-bar' },
    h('span', { class: 'crumb', text: 'Henvendelser / ' }), h('span', { class: 'crumb strong', 'data-title': '', text: l.navn || 'Nyt lead' }),
    h('span', { class: 'saved st-idle', 'data-saved': '' }),
    id ? h('button', { type: 'button', class: 'cbtn cbtn-ghost cbtn-sm', text: l.status === 'arkiveret' ? 'Gendan' : 'Arkivér', onclick: async () => { pending.status = l.status === 'arkiveret' ? (stages[0]?.id || 'ny') : 'arkiveret'; await flush(); closeTask(); } }) : null,
    !id ? h('button', { type: 'button', class: 'cbtn cbtn-primary cbtn-sm', text: 'Opret lead', onclick: () => createLead() }) : null,
    h('button', { type: 'button', class: 'x', 'aria-label': 'Luk', text: '×', onclick: () => closeTask() }));

  const err = h('p', { class: 'crm-error', role: 'alert', hidden: true });
  task.replaceChildren(header, err, h('div', { class: 'task-body' }, left, right));
  if (id) renderActivity(l as Lead);
  else task.querySelector('[data-activity]')!.append(h('li', { class: 'muted small', text: 'Aktivitet vises, når leadet er oprettet.' }));
  task.showModal();
  (id ? note : title).focus();

  async function createLead() {
    const data: Record<string, any> = { status: statusSel.value, prioritet: prioSel.value, navn: title.value.trim() };
    task.querySelectorAll<HTMLInputElement>('.pinput[name]').forEach(i => { data[i.name] = i.name === 'vaerdi' ? i.value.replace(/\D/g, '') : i.value; });
    if (note.value.trim()) data.note = note.value.trim();
    if (!data.navn) { err.hidden = false; err.textContent = 'Skriv et navn for at oprette leadet.'; title.focus(); return; }
    try { const r = await api('leads', { method: 'POST', body: JSON.stringify(data) }); leads.unshift(r.lead); render(); openTask(r.lead.id); setSaved('saved'); }
    catch (x: any) { if (x.message !== 'login') { err.hidden = false; err.textContent = x.message; } }
  }
}
function renderActivity(l: Lead) {
  const ul = task.querySelector('[data-activity]'); if (!ul) return;
  const items = [...(l.noter || []).map(n => ({ ts: n.ts, node: h('li', { class: 'act note' }, h('div', { class: 'act-head' }, avatar(n.af), h('strong', { text: n.af }), h('span', { class: 'muted small', text: ago(n.ts) })), h('p', { text: n.tekst })) })),
    ...(l.historik || []).map(x => ({ ts: x.ts, node: h('li', { class: 'act log' }, h('span', { text: `${x.af} · ${x.hvad}` }), h('span', { class: 'muted small', text: ago(x.ts) })) }))]
    .sort((a, b) => a.ts.localeCompare(b.ts));
  ul.replaceChildren(...items.map(i => i.node));
  ul.scrollTop = ul.scrollHeight;
}
async function closeTask() { clearTimeout(saveTimer); await flush(); taskId = null; task.close(); }
task.addEventListener('cancel', e => { e.preventDefault(); closeTask(); });
task.addEventListener('click', e => { if (e.target === task) closeTask(); });

// ---------- tilpas stages ----------
const stDlg = $<HTMLDialogElement>('[data-stages-dlg]');
function openStages() {
  let draft = stages.map(s => ({ ...s }));
  const list = h('ul', { class: 'stage-list' });
  const err = h('p', { class: 'crm-error', role: 'alert', hidden: true });
  const draw = () => {
    list.replaceChildren(...draft.map((s, i) => h('li', { class: 'stage-row' },
      h('input', { type: 'color', value: s.farve, 'aria-label': 'Farve', oninput: (e: Event) => { s.farve = (e.target as HTMLInputElement).value; } }),
      h('input', { class: 'pinput', value: s.navn, maxlength: '40', 'aria-label': 'Navn', oninput: (e: Event) => { s.navn = (e.target as HTMLInputElement).value; } }),
      h('span', { class: 'muted small', text: `${leads.filter(l => l.status === s.id).length} leads` }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Flyt op', text: '↑', disabled: i === 0, onclick: () => { [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]]; draw(); } }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Flyt ned', text: '↓', disabled: i === draft.length - 1, onclick: () => { [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]]; draw(); } }),
      h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Fjern', text: '×', onclick: () => { draft.splice(i, 1); draw(); } }))));
  };
  draw();
  stDlg.replaceChildren(h('div', { class: 'stages-inner' },
    h('div', { class: 'task-bar' }, h('span', { class: 'crumb strong', text: 'Tilpas stages' }), h('button', { type: 'button', class: 'x', 'aria-label': 'Luk', text: '×', onclick: () => stDlg.close() })),
    h('p', { class: 'muted small pad', text: 'Ret navne og farver, skift rækkefølge eller tilføj nye stages. Nye henvendelser fra hjemmesiden lander i den første. En stage med leads kan først fjernes, når leadsene er flyttet.' }),
    list, err,
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'cbtn cbtn-ghost', text: '+ Tilføj stage', disabled: draft.length >= 12, onclick: () => { draft.push({ id: '', navn: 'Ny stage', farve: '#87909e' }); draw(); } }),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'cbtn cbtn-ghost', text: 'Annullér', onclick: () => stDlg.close() }),
      h('button', { type: 'button', class: 'cbtn cbtn-primary', text: 'Gem stages', onclick: async () => {
        try { const r = await api('config/stages', { method: 'PUT', body: JSON.stringify({ stages: draft }) }); stages = r.stages; stDlg.close(); render(); }
        catch (x: any) { err.hidden = false; err.textContent = x.message; }
      } }))));
  stDlg.showModal();
}

// ---------- hændelser ----------
$<HTMLFormElement>('[data-login]').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement; const btn = f.querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  try {
    await api('login', { method: 'POST', body: JSON.stringify({ bruger: (f.elements.namedItem('bruger') as HTMLInputElement).value, kode: (f.elements.namedItem('kode') as HTMLInputElement).value }) });
    (f.elements.namedItem('kode') as HTMLInputElement).value = '';
    await boot();
  } catch (err: any) { showLogin(err.message); } finally { btn.disabled = false; }
});
$('[data-show-forgot]').addEventListener('click', () => { showCard('forgot'); $<HTMLInputElement>('[data-forgot] input').focus(); });
$('[data-show-login]').addEventListener('click', () => showLogin());
$<HTMLFormElement>('[data-forgot]').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement; const btn = f.querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  const ok = $('.crm-ok', f);
  try { const r = await api('glemt', { method: 'POST', body: JSON.stringify({ bruger: (f.elements.namedItem('bruger') as HTMLInputElement).value }) }); ok.textContent = r.message; } catch (err: any) { ok.textContent = err.message; }
  ok.hidden = false; btn.disabled = false;
});
$<HTMLFormElement>('[data-reset]').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement; const err = $('.crm-error', f);
  const a = (f.elements.namedItem('kode') as HTMLInputElement).value, b = (f.elements.namedItem('kode2') as HTMLInputElement).value;
  if (a !== b) { err.hidden = false; err.textContent = 'De to adgangskoder er ikke ens.'; return; }
  try { const r = await api('nulstil', { method: 'POST', body: JSON.stringify({ token: resetToken, kode: a }) }); resetToken = ''; f.reset(); showLogin(undefined, r.message); }
  catch (x: any) { err.hidden = false; err.textContent = x.message; }
});
$('[data-logout]').addEventListener('click', async () => { await api('logout', { method: 'POST' }).catch(() => {}); leads = []; showLogin(); });
$('[data-new]').addEventListener('click', () => openTask(null));
$('[data-stages]').addEventListener('click', openStages);
$<HTMLInputElement>('[data-search]').addEventListener('input', e => { query = (e.target as HTMLInputElement).value.trim().toLowerCase(); render(); });
$<HTMLInputElement>('[data-show-archived]').addEventListener('change', e => { showArchived = (e.target as HTMLInputElement).checked; render(); });
document.querySelectorAll<HTMLElement>('[data-open]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openPop(b.dataset.open!, b); }));
document.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('[data-pop]')) closePops(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePops(); });
$('[data-save-view]').addEventListener('click', async () => {
  const navn = prompt('Navn på visningen (fx "Mine tilbud" eller "Haster"):', current.navn.startsWith('Board') || current.navn === 'Liste' ? '' : current.navn);
  if (!navn) return;
  const v: View = { ...structuredClone(current), id: 'v' + Date.now().toString(36), navn: navn.slice(0, 40) };
  views = [...views, v];
  try { const r = await api('config/views', { method: 'PUT', body: JSON.stringify({ views }) }); views = r.views; current = structuredClone(views[views.length - 1]); localStorage.setItem('vk_crm_view', current.id); render(); }
  catch (x: any) { alert(x.message); }
});
setInterval(() => { if (!$('#app').hidden && !task.open && !stDlg.open && document.visibilityState === 'visible') refresh(); }, 60000);
boot();
