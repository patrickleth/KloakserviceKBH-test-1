// Mini-CRM i browseren. Al data bygges med textContent (aldrig innerHTML med brugerdata), så indsendt tekst ikke kan køre som kode.
// Mobil først: liste som standard på telefon, smarte lister som chips, stort plus-knap, opgaver som ark der glider op.
type Lead = {
  id: string; status: string; kilde: string; navn: string; telefon?: string; email?: string; adresse?: string; postnr?: string; by?: string;
  ydelse?: string; beskrivelse?: string; ansvarlig?: string; fundet?: string; vaerdi: number | null; naesteKontakt?: string; prioritet?: string;
  side?: string; utm?: string; gclid?: string; fbclid?: string;
  filer: { n: number; navn: string; type: string; kb: number }[]; noter: { ts: string; af: string; tekst: string }[];
  historik: { ts: string; af: string; hvad: string }[]; oprettet: string; opdateret: string;
};
type Stage = { id: string; navn: string; farve: string };
type FilterKey = 'status' | 'kilde' | 'ansvarlig' | 'fundet' | 'kontakt' | 'periode' | 'prioritet';
type Filters = Record<FilterKey, string[]>;
type View = { id: string; navn: string; mode: 'board' | 'list'; group: 'status' | 'none'; sort: { key: string; dir: 'asc' | 'desc' }; filters: Filters };

const API = '/administrator-system/api/';
const ARCH: Stage = { id: 'arkiveret', navn: 'Arkiveret', farve: '#aeaeb2' };
const PRIO: Record<string, { navn: string; farve: string }> = { haster: { navn: 'Haster', farve: '#ff3b30' }, hoej: { navn: 'Høj', farve: '#ff9f0a' }, normal: { navn: 'Normal', farve: '#0a84ff' }, lav: { navn: 'Lav', farve: '#8e8e93' } };
const SORTS: [string, string][] = [['oprettet', 'Nyeste først'], ['naesteKontakt', 'Næste opfølgning'], ['opdateret', 'Senest ændret'], ['navn', 'Navn'], ['vaerdi', 'Værdi'], ['prioritet', 'Prioritet']];
const emptyFilters = (): Filters => ({ status: [], kilde: [], ansvarlig: [], fundet: [], kontakt: [], periode: [], prioritet: [] });
const isMobile = () => matchMedia('(max-width: 760px)').matches;

// ---------- hjælpere ----------
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
function h(tag: string, attrs: Record<string, any> = {}, ...kids: any[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}
const svg = (d: string, size = 20) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('width', String(size)); s.setAttribute('height', String(size)); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = d; return s; };
const ICON = {
  phone: '<path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/>',
  sms: '<path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" opacity=".95"/>',
  mail: '<path fill="currentColor" d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/>',
  map: '<path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>',
  clip: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M21 12.5 12.6 21a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  note: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 5h16v11H9l-5 4z"/>',
  chev: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/>',
  close: '<path stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/>',
  send: '<path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/>',
  more: '<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>'
};
const kr = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 0 }) + ' kr.';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => iso(new Date());
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const ago = (t: string) => {
  const diff = (Date.now() - +new Date(t)) / 60000;
  if (diff < 1) return 'Lige nu';
  if (diff < 60) return `${Math.round(diff)} min.`;
  if (diff < 1440) return `${Math.round(diff / 60)} t.`;
  if (diff < 2880) return 'I går';
  return new Date(t).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
};
const dueState = (d?: string) => !d ? 'none' : d < todayStr() ? 'overdue' : d === todayStr() ? 'today' : 'future';
const dueText = (d?: string) => {
  if (!d) return '';
  const days = Math.round((+new Date(d + 'T12:00') - +new Date(todayStr() + 'T12:00')) / 864e5);
  if (days === 0) return 'I dag';
  if (days === 1) return 'I morgen';
  if (days === -1) return 'I går';
  if (days < 0) return `${-days} dage over`;
  if (days < 7) return new Date(d + 'T12:00').toLocaleDateString('da-DK', { weekday: 'long' });
  return new Date(d + 'T12:00').toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
};
const initials = (s?: string) => (s || '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]!.toUpperCase()).join('');
const hue = (s: string) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
// Farver sættes via CSSOM (ikke style-attributter), så sidens strenge CSP overholdes.
const paint = <T extends Element>(e: T, props: Record<string, string>) => { for (const [k, v] of Object.entries(props)) (e as any).style.setProperty(k, v); return e; };

// ---------- tilstand ----------
let leads: Lead[] = [];
let stages: Stage[] = [];
let views: View[] = [];
let me = '';
let listKey = 'alle';
let title = 'Alle';
let filters: Filters = emptyFilters();
let sort = { key: 'oprettet', dir: 'desc' as 'asc' | 'desc' };
let group: 'status' | 'none' = 'status';
let mode: 'list' | 'board' = (localStorage.getItem('vk_crm_mode') as any) || (isMobile() ? 'list' : 'board');
let query = '';
let resetToken = '';

async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', 'X-VK-Admin': '1', ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 && !['login', 'glemt', 'nulstil'].includes(path)) { showLogin(); throw new Error('login'); }
  if (!r.ok) throw Object.assign(new Error(body.message || 'Noget gik galt. Prøv igen.'), { status: r.status });
  return body;
}
const stageOf = (id: string) => stages.find(s => s.id === id) || (id === 'arkiveret' ? ARCH : { id, navn: id, farve: '#8e8e93' });

// ---------- login ----------
function showCard(which: 'login' | 'forgot' | 'reset') { for (const k of ['login', 'forgot', 'reset']) $(`[data-${k}]`).hidden = k !== which; }
function showLogin(err?: string, ok?: string) {
  $('#app').hidden = true; $('#login').hidden = false; showCard('login');
  const e = $('[data-login] .err'); e.hidden = !err; e.textContent = err || '';
  const o = $('[data-login] .ok'); o.hidden = !ok; o.textContent = ok || '';
  $<HTMLInputElement>('[data-login] input[name=bruger]').focus();
}
async function boot() {
  const token = new URLSearchParams(location.search).get('nulstil');
  if (token) { history.replaceState(null, '', location.pathname); resetToken = token; $('#app').hidden = true; $('#login').hidden = false; showCard('reset'); return; }
  let r;
  try { r = await api('me'); } catch (e: any) { return showLogin(e.status === 503 ? e.message : undefined); }
  me = r.bruger; $('[data-me]').textContent = me;
  $('#login').hidden = true; $('#app').hidden = false;
  const cfg = await api('config'); stages = cfg.stages; views = cfg.views;
  await refresh();
  // Direkte link fra leadmailen: ?lead=<id> åbner leadet med det samme (også efter login).
  const want = new URLSearchParams(location.search).get('lead');
  if (want && leads.some(l => l.id === want)) { history.replaceState(null, '', location.pathname); openTask(want); }
}
async function refresh() { try { leads = (await api('leads')).leads; render(); } catch { /* login vises */ } }

// ---------- lister (smarte lister, stages, gemte visninger) ----------
const SMART: { key: string; navn: string; apply: () => void; count: () => number }[] = [
  { key: 'alle', navn: 'Alle', apply: () => {}, count: () => leads.filter(l => l.status !== 'arkiveret').length },
  { key: 'opfoelg', navn: 'Opfølgning', apply: () => { filters.kontakt = ['overdue', 'today']; sort = { key: 'naesteKontakt', dir: 'asc' }; group = 'none'; }, count: () => leads.filter(l => l.status !== 'arkiveret' && ['overdue', 'today'].includes(dueState(l.naesteKontakt))).length },
  { key: 'mine', navn: 'Tildelt mig', apply: () => { filters.ansvarlig = ['__me']; }, count: () => leads.filter(l => l.status !== 'arkiveret' && (l.ansvarlig || '').toLowerCase() === me).length },
  { key: 'arkiv', navn: 'Arkiveret', apply: () => { filters.status = ['arkiveret']; group = 'none'; }, count: () => leads.filter(l => l.status === 'arkiveret').length }
];
function selectList(key: string) {
  filters = emptyFilters(); sort = { key: 'oprettet', dir: 'desc' }; group = 'status'; listKey = key;
  const smart = SMART.find(s => s.key === key);
  if (smart) { smart.apply(); title = smart.navn; }
  else if (key.startsWith('stage:')) { const s = stageOf(key.slice(6)); filters.status = [s.id]; group = 'none'; title = s.navn; }
  else if (key.startsWith('view:')) { const v = views.find(x => x.id === key.slice(5)); if (v) { filters = structuredClone(v.filters); sort = { ...v.sort }; group = v.group; mode = v.mode; title = v.navn; } }
  closeDrawer(); render();
}

// ---------- filtrering og sortering ----------
function passes(l: Lead) {
  const f = filters;
  if (l.status === 'arkiveret' && !f.status.includes('arkiveret')) return false;
  if (query && ![l.navn, l.telefon, l.email, l.adresse, l.by, l.postnr, l.ydelse, l.beskrivelse, l.ansvarlig].join(' ').toLowerCase().includes(query)) return false;
  if (f.status.length && !f.status.includes(l.status)) return false;
  if (f.kilde.length && !f.kilde.includes(l.kilde)) return false;
  if (f.ansvarlig.length && !f.ansvarlig.map(a => a === '__me' ? me : a).includes((l.ansvarlig || '').toLowerCase())) return false;
  if (f.fundet.length && !f.fundet.includes(l.fundet || '')) return false;
  if (f.prioritet.length && !f.prioritet.includes(l.prioritet || '')) return false;
  if (f.kontakt.length) {
    const st = dueState(l.naesteKontakt);
    const week = !!l.naesteKontakt && l.naesteKontakt <= plusDays(7);
    if (!f.kontakt.some(k => k === st || (k === 'week' && week && st !== 'overdue'))) return false;
  }
  if (f.periode.length && +new Date(l.oprettet) < Date.now() - Math.max(...f.periode.map(Number)) * 864e5) return false;
  return true;
}
function sorted(list: Lead[]) {
  const { key, dir } = sort;
  const val = (l: Lead): any => key === 'prioritet' ? ['haster', 'hoej', 'normal', 'lav', ''].indexOf(l.prioritet || '') : key === 'vaerdi' ? (l.vaerdi ?? -1) : key === 'naesteKontakt' ? (l.naesteKontakt || '9999') : String((l as any)[key] || '').toLowerCase();
  const d = key === 'prioritet' || key === 'naesteKontakt' || key === 'navn' ? (dir === 'desc' ? 1 : -1) : (dir === 'asc' ? 1 : -1);
  return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * d; });
}
const filterCount = () => Object.entries(filters).filter(([k]) => !(listKey !== 'alle' && ((k === 'status' && listKey.startsWith('stage:')) || (k === 'kontakt' && listKey === 'opfoelg') || (k === 'ansvarlig' && listKey === 'mine') || (k === 'status' && listKey === 'arkiv')))).reduce((a, [, v]) => a + v.length, 0);

// ---------- tegning ----------
function render() {
  $('[data-title]').textContent = title;
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  const fc = filterCount(); $('[data-filter-count]').textContent = fc ? ` ${fc}` : '';
  renderSidebar(); renderChips(); renderSummary();
  const list = sorted(leads.filter(passes));
  $('[data-view]').replaceChildren(mode === 'board' ? board(list) : listView(list));
}
function navItem(key: string, label: string, count: number, color?: string) {
  const b = h('button', { type: 'button', class: 'sb-item' + (listKey === key ? ' on' : ''), onclick: () => selectList(key) },
    color ? paint(h('span', { class: 'dot' }), { background: color }) : null, h('span', { class: 'sb-name', text: label }), h('span', { class: 'sb-count', text: count ? String(count) : '' }));
  return b;
}
function renderSidebar() {
  $('[data-smart]').replaceChildren(...SMART.map(s => navItem(s.key, s.navn, s.count())));
  $('[data-stage-list]').replaceChildren(...stages.map(s => navItem('stage:' + s.id, s.navn, leads.filter(l => l.status === s.id).length, s.farve)));
  $('[data-views-label]').hidden = !views.length;
  $('[data-views]').replaceChildren(...views.map(v => h('div', { class: 'sb-row' }, navItem('view:' + v.id, v.navn, 0),
    h('button', { type: 'button', class: 'sb-del', 'aria-label': `Slet ${v.navn}`, text: '×', onclick: async () => {
      if (!confirm(`Slet visningen "${v.navn}"?`)) return;
      views = views.filter(x => x.id !== v.id); await api('config/views', { method: 'PUT', body: JSON.stringify({ views }) });
      if (listKey === 'view:' + v.id) selectList('alle'); else render();
    } }))));
}
function renderChips() {
  const items = [...SMART.slice(0, 3).map(s => ({ key: s.key, navn: s.navn, n: s.count(), c: '' })), ...stages.map(s => ({ key: 'stage:' + s.id, navn: s.navn, n: leads.filter(l => l.status === s.id).length, c: s.farve }))];
  $('[data-chips]').replaceChildren(...items.map(i => h('button', { type: 'button', class: 'chip' + (listKey === i.key ? ' on' : ''), onclick: () => selectList(i.key) },
    i.c ? paint(h('span', { class: 'dot' }), { background: i.c }) : null, i.navn, i.n ? h('span', { class: 'chip-n', text: String(i.n) }) : null)));
  $('[data-chips] .on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}
function renderSummary() {
  const month = new Date().toISOString().slice(0, 7);
  const active = leads.filter(l => l.status !== 'arkiveret');
  const open = active.filter(l => !['vundet', 'tabt'].includes(l.status));
  const won = leads.filter(l => l.status === 'vundet' && l.opdateret.startsWith(month));
  const items: [string, string, string][] = [
    ['Nye', String(active.filter(l => l.status === stages[0]?.id).length), ''],
    ['Til opfølgning', String(active.filter(l => ['overdue', 'today'].includes(dueState(l.naesteKontakt))).length), 'warn'],
    ['I pipeline', kr(open.reduce((a, l) => a + (l.vaerdi || 0), 0)), ''],
    ['Vundet denne måned', kr(won.reduce((a, l) => a + (l.vaerdi || 0), 0)), 'good']
  ];
  $('[data-stats]').replaceChildren(...items.map(([k, v, c]) => h('div', { class: 'sum ' + c }, h('span', { text: k }), h('strong', { text: v }))));
}

const pill = (id: string) => { const s = stageOf(id); return paint(h('span', { class: 'pill', text: s.navn }), { '--c': s.farve }); };
const due = (l: Lead) => l.naesteKontakt ? h('span', { class: `due ${dueState(l.naesteKontakt)}`, text: dueText(l.naesteKontakt) }) : null;
const avatar = (n?: string) => n ? paint(h('span', { class: 'av', title: n, text: initials(n) }), { '--h': String(hue(n.toLowerCase())) }) : null;
const prio = (p?: string) => p && PRIO[p] ? paint(h('span', { class: 'prio', title: 'Prioritet', text: PRIO[p].navn }), { '--c': PRIO[p].farve }) : null;
const counters = (l: Lead) => [l.filer?.length ? h('span', { class: 'cnt' }, svg(ICON.clip, 13), String(l.filer.length)) : null, l.noter?.length ? h('span', { class: 'cnt' }, svg(ICON.note, 13), String(l.noter.length)) : null];

function row(l: Lead) {
  const sub = [l.ydelse, [l.postnr, l.by].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || l.telefon || l.email || '';
  const r = h('button', { type: 'button', class: 'row', onclick: () => openTask(l.id) },
    paint(h('span', { class: 'row-dot' }), { background: stageOf(l.status).farve }),
    h('span', { class: 'row-main' }, h('span', { class: 'row-name', text: l.navn || 'Uden navn' }), h('span', { class: 'row-sub', text: sub })),
    h('span', { class: 'row-meta' }, prio(l.prioritet), ...counters(l), avatar(l.ansvarlig)),
    h('span', { class: 'row-end' }, due(l) || h('span', { class: 'row-time', text: ago(l.oprettet) }), l.vaerdi ? h('span', { class: 'row-val', text: kr(l.vaerdi) }) : null),
    h('span', { class: 'row-chev' }, svg(ICON.chev, 16)));
  return r;
}
function listView(list: Lead[]) {
  const wrap = h('div', { class: 'list' });
  if (!list.length) return empty();
  const groups = group === 'status' && !filters.status.length ? [...stages, ARCH].map(s => ({ s, items: list.filter(l => l.status === s.id) })).filter(g => g.items.length) : [{ s: null as Stage | null, items: list }];
  for (const g of groups) {
    const sec = h('section', { class: 'group' });
    if (g.s) sec.append(h('h2', { class: 'group-title' }, paint(h('span', { class: 'dot' }), { background: g.s.farve }), g.s.navn, h('span', { class: 'group-n', text: String(g.items.length) })));
    sec.append(h('div', { class: 'card-list' }, ...g.items.map(row)));
    wrap.append(sec);
  }
  return wrap;
}
function empty() {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title', text: query || filterCount() ? 'Ingen leads matcher' : 'Ingen leads her endnu' }),
    h('p', { text: query || filterCount() ? 'Prøv en anden søgning eller fjern et filter.' : 'Nye henvendelser fra hjemmesiden dukker op her automatisk.' }),
    query || filterCount() ? h('button', { type: 'button', class: 'btn btn-quiet', text: 'Ryd søgning og filtre', onclick: () => { query = ''; $<HTMLInputElement>('[data-search]').value = ''; selectList('alle'); } }) : null);
}
function card(l: Lead) {
  const c = h('li', { class: 'kcard', draggable: 'true', tabindex: '0' },
    h('div', { class: 'k-top' }, h('span', { class: 'k-name', text: l.navn || 'Uden navn' }), avatar(l.ansvarlig)),
    l.ydelse || l.by ? h('p', { class: 'k-sub', text: [l.ydelse, l.by].filter(Boolean).join(' · ') }) : null,
    h('div', { class: 'k-meta' }, due(l), prio(l.prioritet), ...counters(l), h('span', { class: 'k-end', text: l.vaerdi ? kr(l.vaerdi) : ago(l.oprettet) })));
  c.addEventListener('click', () => openTask(l.id));
  c.addEventListener('keydown', e => { if (e.key === 'Enter') openTask(l.id); });
  c.addEventListener('dragstart', e => { e.dataTransfer?.setData('text/plain', l.id); c.classList.add('drag'); });
  c.addEventListener('dragend', () => c.classList.remove('drag'));
  return c;
}
function board(list: Lead[]) {
  const wrap = h('div', { class: 'board' });
  const cols = filters.status.length ? [...stages, ARCH].filter(s => filters.status.includes(s.id)) : stages;
  for (const s of cols) {
    const items = list.filter(l => l.status === s.id);
    const sum = items.reduce((a, l) => a + (l.vaerdi || 0), 0);
    const col = paint(h('section', { class: 'col' },
      h('header', { class: 'col-head' }, paint(h('span', { class: 'dot' }), { background: s.farve }), h('span', { class: 'col-name', text: s.navn }), h('span', { class: 'col-n', text: String(items.length) }), sum ? h('span', { class: 'col-sum', text: kr(sum) }) : null),
      h('ul', { class: 'col-cards' }, ...items.map(card)),
      h('button', { type: 'button', class: 'col-add', text: '+ Nyt lead', onclick: () => openTask(null, s.id) })), { '--c': s.farve });
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer?.getData('text/plain'); if (id) patch(id, { status: s.id }); });
    wrap.append(col);
  }
  return wrap;
}

async function patch(id: string, data: Record<string, any>) {
  const l = leads.find(x => x.id === id); if (!l) return;
  const before = { ...l }; Object.assign(l, data); render();
  try { const r = await api(`leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); Object.assign(l, r.lead); render(); return r.lead as Lead; }
  catch (e: any) { Object.assign(l, before); render(); if (e.message !== 'login') toast(e.message); }
}
function toast(msg: string) {
  const t = h('div', { class: 'toast', role: 'status', text: msg }); document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3000);
}

// ---------- filter og sortering (popover på computer, ark på mobil) ----------
function closePops() { document.querySelectorAll<HTMLElement>('[data-pop]').forEach(p => p.hidden = true); }
function openPop(kind: 'filter' | 'sort') {
  const pop = $(`[data-pop="${kind}"]`); const was = !pop.hidden; closePops(); if (was) return;
  pop.replaceChildren(kind === 'filter' ? filterPanel() : sortPanel()); pop.hidden = false;
}
function opts(title: string, key: FilterKey, list: [string, string][]) {
  if (!list.length) return null;
  return h('fieldset', { class: 'opt-group' }, h('legend', { text: title }), h('div', { class: 'opt-chips' }, ...list.map(([v, label]) => {
    const on = filters[key].includes(v);
    return h('button', { type: 'button', class: 'ochip' + (on ? ' on' : ''), 'aria-pressed': String(on), text: label, onclick: () => {
      filters[key] = on ? filters[key].filter(x => x !== v) : [...filters[key], v]; render(); $('[data-pop="filter"]').replaceChildren(filterPanel());
    } });
  })));
}
const uniq = (k: keyof Lead) => [...new Set(leads.map(l => String(l[k] || '')).filter(Boolean))].sort().map(v => [v, v] as [string, string]);
function popHead(t: string, right?: HTMLElement) { return h('div', { class: 'pop-head' }, h('strong', { text: t }), right || null, h('button', { type: 'button', class: 'pop-done', text: 'Færdig', onclick: closePops })); }
function filterPanel() {
  return h('div', { class: 'pop-body' }, popHead('Filtre', h('button', { type: 'button', class: 'link', text: 'Nulstil', onclick: () => { filters = emptyFilters(); listKey = 'alle'; title = 'Alle'; render(); $('[data-pop="filter"]').replaceChildren(filterPanel()); } })),
    opts('Opfølgning', 'kontakt', [['overdue', 'Overskredet'], ['today', 'I dag'], ['week', 'Næste 7 dage'], ['none', 'Ingen dato']]),
    opts('Stage', 'status', [...stages, ARCH].map(s => [s.id, s.navn])),
    opts('Prioritet', 'prioritet', Object.entries(PRIO).map(([k, p]) => [k, p.navn])),
    opts('Ansvarlig', 'ansvarlig', uniq('ansvarlig').map(([v]) => [v.toLowerCase(), v])),
    opts('Oprettet', 'periode', [['7', '7 dage'], ['30', '30 dage'], ['90', '90 dage']]),
    opts('Kilde', 'kilde', [['formular', 'Hjemmeside'], ['manuel', 'Manuel']]),
    opts('Fandt os via', 'fundet', uniq('fundet')));
}
function sortPanel() {
  return h('div', { class: 'pop-body' }, popHead('Sortér'),
    h('div', { class: 'menu' }, ...SORTS.map(([k, label]) => h('button', { type: 'button', class: 'menu-item' + (sort.key === k ? ' on' : ''), onclick: () => { sort = { key: k, dir: 'desc' }; render(); $('[data-pop="sort"]').replaceChildren(sortPanel()); } }, label, sort.key === k ? h('span', { class: 'check', text: '✓' }) : null))),
    mode === 'list' ? h('label', { class: 'switch-row' }, 'Gruppér efter stage', h('input', { type: 'checkbox', role: 'switch', checked: group === 'status', onchange: (e: Event) => { group = (e.target as HTMLInputElement).checked ? 'status' : 'none'; render(); } })) : null);
}

// ---------- drawer (mobil) ----------
function openDrawer() { $('[data-sidebar]').classList.add('open'); $('[data-scrim]').hidden = false; }
function closeDrawer() { $('[data-sidebar]').classList.remove('open'); $('[data-scrim]').hidden = true; }

// ---------- lead-ark med autosave ----------
const task = $<HTMLDialogElement>('[data-task]');
let taskId: string | null = null;
let saveTimer: number | undefined;
let pending: Record<string, any> = {};

function setSaved(state: 'saving' | 'saved' | 'error' | 'idle') {
  const el = task.querySelector('[data-saved]'); if (!el) return;
  el.className = 'saved s-' + state; el.textContent = state === 'saving' ? 'Gemmer…' : state === 'saved' ? 'Gemt' : state === 'error' ? 'Ikke gemt' : '';
}
async function flush() {
  if (!taskId || !Object.keys(pending).length) return;
  const data = pending; pending = {}; setSaved('saving');
  const l = await patch(taskId, data);
  if (l) { setSaved('saved'); renderActivity(l); } else setSaved('error');
}
function queue(field: string, value: any, delay = 800) {
  pending[field] = value; clearTimeout(saveTimer);
  if (taskId) { setSaved('saving'); saveTimer = window.setTimeout(flush, delay); }
}
function input(name: string, value: string, o: Record<string, any> = {}) {
  const el = (o.multiline ? h('textarea', { name, rows: 4, maxlength: o.max, placeholder: o.placeholder || '', class: 'cell-input' }) : h('input', { name, value, type: o.type || 'text', maxlength: o.max, inputmode: o.inputmode, autocomplete: 'off', placeholder: o.placeholder || '', class: 'cell-input', enterkeyhint: 'done' })) as HTMLInputElement;
  if (o.multiline) el.value = value;
  el.addEventListener('input', () => queue(name, name === 'vaerdi' ? el.value.replace(/\D/g, '') : el.value));
  el.addEventListener('blur', () => flush());
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !o.multiline) (e.target as HTMLElement).blur(); });
  return el;
}
const cellRow = (label: string, control: HTMLElement) => h('label', { class: 'cell' }, h('span', { class: 'cell-label', text: label }), control);
function select(name: string, value: string, list: [string, string][], onChange: (v: string) => void) {
  const s = h('select', { name, class: 'cell-input' }, ...list.map(([v, t]) => h('option', { value: v, selected: v === value, text: t }))) as HTMLSelectElement;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function openTask(id: string | null, status?: string) {
  clearTimeout(saveTimer); pending = {}; taskId = id;
  const l: Partial<Lead> = id ? leads.find(x => x.id === id)! : { status: status || stages[0]?.id, kilde: 'manuel', noter: [], historik: [], filer: [], vaerdi: null };
  const err = h('p', { class: 'msg err', role: 'alert', hidden: true });

  // status som tydelig "menu"-knap øverst
  const statusSel = select('status', l.status || stages[0]?.id || 'ny', [...stages, ARCH].map(s => [s.id, s.navn]), v => { tint(); if (taskId) { pending.status = v; flush(); } });
  statusSel.className = 'status-select';
  const tint = () => paint(statusSel, { '--c': stageOf(statusSel.value).farve }); tint();

  const nameIn = h('input', { class: 'name-input', name: 'navn', value: l.navn || '', placeholder: 'Navn', maxlength: '120', autocomplete: 'off', 'aria-label': 'Navn', enterkeyhint: 'done' }) as HTMLInputElement;
  nameIn.addEventListener('input', () => queue('navn', nameIn.value));
  nameIn.addEventListener('blur', () => flush());
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') nameIn.blur(); });

  const addr = [l.adresse, [l.postnr, l.by].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const action = (label: string, icon: string, href?: string) => href
    ? h('a', { class: 'act-btn', href, target: label === 'Kort' ? '_blank' : undefined, rel: 'noopener' }, h('span', { class: 'act-ico' }, svg(icon, 20)), label)
    : h('span', { class: 'act-btn off', 'aria-disabled': 'true' }, h('span', { class: 'act-ico' }, svg(icon, 20)), label);
  const tel = l.telefon?.replace(/[^\d+]/g, '');
  const actions = id ? h('div', { class: 'actions' },
    action('Ring', ICON.phone, tel ? 'tel:' + tel : undefined), action('SMS', ICON.sms, tel ? 'sms:' + tel : undefined),
    action('Mail', ICON.mail, l.email ? 'mailto:' + l.email : undefined), action('Kort', ICON.map, addr ? 'https://maps.google.com/?q=' + encodeURIComponent(addr) : undefined)) : null;

  // næste opfølgning med ét-tryks-genveje
  const dateIn = h('input', { type: 'date', class: 'date-input', value: l.naesteKontakt || '', 'aria-label': 'Næste opfølgning' }) as HTMLInputElement;
  const dueBadge = h('span', { class: 'due-big' });
  const setDue = (v: string) => { dateIn.value = v; drawDue(); queue('naesteKontakt', v, 0); };
  const drawDue = () => { const st = dueState(dateIn.value); dueBadge.className = 'due-big ' + st; dueBadge.textContent = dateIn.value ? dueText(dateIn.value) : 'Ingen dato'; };
  dateIn.addEventListener('change', () => { drawDue(); queue('naesteKontakt', dateIn.value, 0); });
  drawDue();
  const follow = h('section', { class: 'block follow' },
    h('div', { class: 'follow-top' }, h('div', {}, h('p', { class: 'block-label', text: 'Næste opfølgning' }), dueBadge), dateIn),
    h('div', { class: 'quick-dates' }, ...([['I dag', 0], ['I morgen', 1], ['Om 3 dage', 3], ['Om 1 uge', 7]] as [string, number][]).map(([t, n]) => h('button', { type: 'button', class: 'qd', text: t, onclick: () => setDue(plusDays(n)) })),
      h('button', { type: 'button', class: 'qd quiet', text: 'Ryd', onclick: () => setDue('') })));

  const details = h('section', { class: 'block' }, h('p', { class: 'block-label', text: 'Detaljer' }), h('div', { class: 'cells' },
    cellRow('Telefon', input('telefon', l.telefon || '', { max: 30, type: 'tel', inputmode: 'tel', placeholder: 'Tilføj' })),
    cellRow('E-mail', input('email', l.email || '', { max: 160, type: 'email', placeholder: 'Tilføj' })),
    cellRow('Adresse', input('adresse', l.adresse || '', { max: 160, placeholder: 'Tilføj' })),
    cellRow('Postnr.', input('postnr', l.postnr || '', { max: 8, inputmode: 'numeric', placeholder: 'Tilføj' })),
    cellRow('By', input('by', l.by || '', { max: 80, placeholder: 'Tilføj' })),
    cellRow('Opgave', input('ydelse', l.ydelse || '', { max: 120, placeholder: 'Tilføj' })),
    cellRow('Værdi', input('vaerdi', l.vaerdi ? String(l.vaerdi) : '', { max: 12, inputmode: 'numeric', placeholder: 'kr.' })),
    cellRow('Prioritet', select('prioritet', l.prioritet || '', [['', 'Ingen'], ...Object.entries(PRIO).map(([k, p]) => [k, p.navn] as [string, string])], v => { if (taskId) { pending.prioritet = v; flush(); } })),
    cellRow('Ansvarlig', input('ansvarlig', l.ansvarlig || '', { max: 60, placeholder: 'Tilføj' })),
    cellRow('Fandt os via', input('fundet', l.fundet || '', { max: 60, placeholder: 'Tilføj' }))));

  const desc = h('section', { class: 'block' }, h('p', { class: 'block-label', text: 'Beskrivelse' }), input('beskrivelse', l.beskrivelse || '', { multiline: true, max: 4000, placeholder: 'Hvad drejer opgaven sig om?' }));
  const files = l.filer?.length ? h('section', { class: 'block' }, h('p', { class: 'block-label', text: 'Vedhæftede filer' }),
    h('div', { class: 'files' }, ...l.filer.map(f => h('a', { class: 'file', href: `${API}filer/${l.id}/${f.n}`, target: '_blank', rel: 'noopener' }, svg(ICON.clip, 16), h('span', { text: f.navn }), h('small', { text: `${f.kb} kB` }))))) : null;
  const meta = [l.side && `Fra ${l.side.replace(/^https?:\/\/[^/]+/, '') || '/'}`, l.utm && `UTM: ${l.utm}`, l.gclid && 'Google Ads', l.fbclid && 'Meta'].filter(Boolean).join(' · ');

  const note = h('textarea', { class: 'composer-input', rows: 1, maxlength: '2000', placeholder: id ? 'Skriv en note' : 'Noter kan skrives, når leadet er oprettet', disabled: !id, 'aria-label': 'Ny note' }) as HTMLTextAreaElement;
  const sendBtn = h('button', { type: 'button', class: 'send', 'aria-label': 'Send note', disabled: true }, svg(ICON.send, 18)) as HTMLButtonElement;
  note.addEventListener('input', () => { sendBtn.disabled = !note.value.trim(); note.style.height = 'auto'; note.style.height = Math.min(note.scrollHeight, 140) + 'px'; });
  const sendNote = async () => { const t = note.value.trim(); if (!t || !taskId) return; sendBtn.disabled = true; const r = await patch(taskId, { note: t }); if (r) { note.value = ''; note.style.height = 'auto'; renderActivity(r); } else sendBtn.disabled = false; };
  note.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendNote(); } });
  sendBtn.addEventListener('click', sendNote);
  const activity = h('section', { class: 'block activity' }, h('p', { class: 'block-label', text: 'Aktivitet' }), h('ul', { class: 'feed', 'data-feed': '' }), h('div', { class: 'composer' }, note, sendBtn));

  const more = id ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': l.status === 'arkiveret' ? 'Gendan' : 'Arkivér', title: l.status === 'arkiveret' ? 'Gendan' : 'Arkivér', onclick: async () => {
    if (l.status !== 'arkiveret' && !confirm('Arkivér leadet? Du kan finde det igen under Arkiveret.')) return;
    pending.status = l.status === 'arkiveret' ? (stages[0]?.id || 'ny') : 'arkiveret'; await flush(); closeTask(); toast(l.status === 'arkiveret' ? 'Lead arkiveret' : 'Lead gendannet');
  } }, svg(ICON.more, 20)) : null;

  const head = h('header', { class: 'sheet-bar' },
    h('button', { type: 'button', class: 'bar-btn', text: id ? 'Luk' : 'Annullér', onclick: () => closeTask() }),
    h('span', { class: 'saved s-idle', 'data-saved': '' }),
    id ? more : h('button', { type: 'button', class: 'bar-btn strong', text: 'Opret', onclick: () => createLead() }));

  const top = h('div', { class: 'sheet-top' }, statusSel, nameIn,
    h('p', { class: 'sheet-sub', text: id ? `${l.kilde === 'manuel' ? 'Oprettet manuelt' : 'Fra hjemmesiden'} · ${ago(l.oprettet!)}${meta ? ' · ' + meta : ''}` : 'Nyt lead' }), actions);

  task.replaceChildren(head, h('div', { class: 'sheet-body' }, h('div', { class: 'sheet-main' }, top, err, follow, details, desc, files), h('div', { class: 'sheet-side' }, activity)));
  if (id) renderActivity(l as Lead);
  task.showModal();
  if (!id) nameIn.focus();

  async function createLead() {
    const data: Record<string, any> = { status: statusSel.value, navn: nameIn.value.trim(), naesteKontakt: dateIn.value };
    task.querySelectorAll<HTMLInputElement>('.cell-input[name]').forEach(i => { data[i.name] = i.name === 'vaerdi' ? i.value.replace(/\D/g, '') : i.value; });
    if (!data.navn) { err.hidden = false; err.textContent = 'Skriv et navn for at oprette leadet.'; nameIn.focus(); return; }
    try { const r = await api('leads', { method: 'POST', body: JSON.stringify(data) }); leads.unshift(r.lead); render(); openTask(r.lead.id); toast('Lead oprettet'); }
    catch (x: any) { if (x.message !== 'login') { err.hidden = false; err.textContent = x.message; } }
  }
}
function renderActivity(l: Lead) {
  const ul = task.querySelector('[data-feed]'); if (!ul) return;
  const items = [...(l.noter || []).map(n => ({ ts: n.ts, el: h('li', { class: 'f-note' }, h('div', { class: 'f-head' }, avatar(n.af), h('strong', { text: n.af }), h('time', { text: ago(n.ts) })), h('p', { text: n.tekst })) })),
    ...(l.historik || []).map(x => ({ ts: x.ts, el: h('li', { class: 'f-log' }, h('span', { text: x.hvad }), h('time', { text: `${x.af} · ${ago(x.ts)}` })) }))].sort((a, b) => a.ts.localeCompare(b.ts));
  ul.replaceChildren(...items.map(i => i.el));
  ul.scrollTop = ul.scrollHeight;
}
async function closeTask() { clearTimeout(saveTimer); await flush(); taskId = null; task.classList.add('closing'); setTimeout(() => { task.close(); task.classList.remove('closing'); }, 160); }
task.addEventListener('cancel', e => { e.preventDefault(); closeTask(); });
task.addEventListener('click', e => { if (e.target === task) closeTask(); });

// ---------- redigér stages ----------
const stDlg = $<HTMLDialogElement>('[data-stages-dlg]');
function openStages() {
  const draft = stages.map(s => ({ ...s }));
  const list = h('ul', { class: 'stage-list' });
  const err = h('p', { class: 'msg err', role: 'alert', hidden: true });
  const draw = () => list.replaceChildren(...draft.map((s, i) => h('li', { class: 'stage-row' },
    h('input', { type: 'color', value: s.farve, 'aria-label': 'Farve', oninput: (e: Event) => { s.farve = (e.target as HTMLInputElement).value; } }),
    h('input', { class: 'stage-name', value: s.navn, maxlength: '40', 'aria-label': 'Navn', oninput: (e: Event) => { s.navn = (e.target as HTMLInputElement).value; } }),
    h('span', { class: 'stage-n', text: String(leads.filter(l => l.status === s.id).length) }),
    h('button', { type: 'button', class: 'sq', 'aria-label': 'Flyt op', text: '↑', disabled: i === 0, onclick: () => { [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]]; draw(); } }),
    h('button', { type: 'button', class: 'sq', 'aria-label': 'Flyt ned', text: '↓', disabled: i === draft.length - 1, onclick: () => { [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]]; draw(); } }),
    h('button', { type: 'button', class: 'sq danger', 'aria-label': 'Fjern', text: '−', onclick: () => { draft.splice(i, 1); draw(); } }))));
  draw();
  stDlg.replaceChildren(
    h('header', { class: 'sheet-bar' }, h('button', { type: 'button', class: 'bar-btn', text: 'Annullér', onclick: () => stDlg.close() }), h('strong', { class: 'bar-title', text: 'Stages' }),
      h('button', { type: 'button', class: 'bar-btn strong', text: 'Gem', onclick: async () => {
        try { const r = await api('config/stages', { method: 'PUT', body: JSON.stringify({ stages: draft }) }); stages = r.stages; stDlg.close(); render(); toast('Stages gemt'); }
        catch (x: any) { err.hidden = false; err.textContent = x.message; }
      } })),
    h('div', { class: 'stages-body' },
      h('p', { class: 'hint', text: 'Nye henvendelser lander i den første stage. En stage med leads kan først fjernes, når leadsene er flyttet.' }),
      list, err,
      h('button', { type: 'button', class: 'btn btn-quiet', text: '+ Tilføj stage', onclick: () => { if (draft.length < 12) { draft.push({ id: '', navn: 'Ny stage', farve: '#0a84ff' }); draw(); } } })));
  stDlg.showModal();
}

// ---------- hændelser ----------
$<HTMLFormElement>('[data-login]').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement; const btn = f.querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  try { await api('login', { method: 'POST', body: JSON.stringify({ bruger: (f.elements.namedItem('bruger') as HTMLInputElement).value, kode: (f.elements.namedItem('kode') as HTMLInputElement).value }) }); (f.elements.namedItem('kode') as HTMLInputElement).value = ''; await boot(); }
  catch (err: any) { showLogin(err.message); } finally { btn.disabled = false; }
});
$('[data-show-forgot]').addEventListener('click', () => { showCard('forgot'); $<HTMLInputElement>('[data-forgot] input').focus(); });
$('[data-show-login]').addEventListener('click', () => showLogin());
$<HTMLFormElement>('[data-forgot]').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.currentTarget as HTMLFormElement; const ok = $('.ok', f); const btn = f.querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  try { const r = await api('glemt', { method: 'POST', body: JSON.stringify({ bruger: (f.elements.namedItem('bruger') as HTMLInputElement).value }) }); ok.textContent = r.message; } catch (x: any) { ok.textContent = x.message; }
  ok.hidden = false; btn.disabled = false;
});
$<HTMLFormElement>('[data-reset]').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.currentTarget as HTMLFormElement; const err = $('.err', f);
  const a = (f.elements.namedItem('kode') as HTMLInputElement).value, b = (f.elements.namedItem('kode2') as HTMLInputElement).value;
  if (a !== b) { err.hidden = false; err.textContent = 'De to adgangskoder er ikke ens.'; return; }
  try { const r = await api('nulstil', { method: 'POST', body: JSON.stringify({ token: resetToken, kode: a }) }); resetToken = ''; f.reset(); showLogin(undefined, r.message); }
  catch (x: any) { err.hidden = false; err.textContent = x.message; }
});
$('[data-logout]').addEventListener('click', async () => { await api('logout', { method: 'POST' }).catch(() => {}); leads = []; closeDrawer(); showLogin(); });
$('[data-new]').addEventListener('click', () => openTask(null));
$('[data-new-fab]').addEventListener('click', () => openTask(null));
$('[data-stages]').addEventListener('click', () => { closeDrawer(); openStages(); });
$('[data-menu]').addEventListener('click', openDrawer);
$('[data-scrim]').addEventListener('click', closeDrawer);
document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode as any; localStorage.setItem('vk_crm_mode', mode); render(); }));
$<HTMLInputElement>('[data-search]').addEventListener('input', e => { query = (e.target as HTMLInputElement).value.trim().toLowerCase(); render(); });
document.querySelectorAll<HTMLElement>('[data-open]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openPop(b.dataset.open as any); }));
document.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('[data-pop]')) closePops(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePops(); closeDrawer(); } });
$('[data-save-view]').addEventListener('click', async () => {
  const navn = prompt('Navn på visningen, fx "Mine tilbud":', ''); if (!navn) return;
  const v: View = { id: 'v' + Date.now().toString(36), navn: navn.slice(0, 40), mode, group, sort: { ...sort }, filters: structuredClone(filters) };
  try { const r = await api('config/views', { method: 'PUT', body: JSON.stringify({ views: [...views, v] }) }); views = r.views; selectList('view:' + views[views.length - 1].id); toast('Visning gemt'); }
  catch (x: any) { toast(x.message); }
});
setInterval(() => { if (!$('#app').hidden && !task.open && !stDlg.open && document.visibilityState === 'visible') refresh(); }, 60000);
boot();
