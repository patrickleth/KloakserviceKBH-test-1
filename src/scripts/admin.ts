// Mini-CRM i browseren. Al data bygges med textContent (aldrig innerHTML med brugerdata), så indsendt tekst ikke kan køre som kode.
type Lead = {
  id: string; status: string; kilde: string; navn: string; telefon?: string; email?: string; adresse?: string; postnr?: string; by?: string;
  ydelse?: string; beskrivelse?: string; ansvarlig?: string; vaerdi: number | null; side?: string; utm?: string; gclid?: string; fbclid?: string;
  filer: { n: number; navn: string; type: string; kb: number }[]; noter: { ts: string; af: string; tekst: string }[];
  historik: { ts: string; af: string; hvad: string }[]; oprettet: string; opdateret: string;
};

const API = '/administrator-system/api/';
const COLS: [string, string][] = [['ny', 'Nye'], ['kontaktet', 'Kontaktet'], ['tilbud', 'Tilbud sendt'], ['vundet', 'Vundet'], ['tabt', 'Tabt']];
const LABEL: Record<string, string> = { ny: 'Ny', kontaktet: 'Kontaktet', tilbud: 'Tilbud sendt', vundet: 'Vundet', tabt: 'Tabt', arkiveret: 'Arkiveret' };
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const el = (tag: string, cls?: string, text?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const kr = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 0 }) + ' kr.';
const when = (iso: string) => {
  const d = new Date(iso), diff = (Date.now() - +d) / 60000;
  if (diff < 60) return `${Math.max(1, Math.round(diff))} min. siden`;
  if (diff < 60 * 24) return `${Math.round(diff / 60)} t. siden`;
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

let leads: Lead[] = [];
let query = '';
let showArchived = false;
let resetToken = '';

async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', 'X-VK-Admin': '1', ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== 'login') { showLogin(); throw new Error('login'); }
  if (!r.ok) throw Object.assign(new Error(body.message || 'Noget gik galt. Prøv igen.'), { status: r.status });
  return body;
}

function showCard(which: 'login' | 'forgot' | 'reset') {
  for (const k of ['login', 'forgot', 'reset']) $(`[data-${k}]`).hidden = k !== which;
}
function showLogin(msg?: string, ok?: string) {
  $('#app').hidden = true; $('#login').hidden = false; showCard('login');
  const err = $('[data-login] .crm-error'); err.hidden = !msg; err.textContent = msg || '';
  const okEl = $('[data-login] .crm-ok'); okEl.hidden = !ok; okEl.textContent = ok || '';
  $<HTMLInputElement>('[data-login] input[name=bruger]').focus();
}

async function boot() {
  // Link fra "Glemt adgangskode"-mailen: ?nulstil=<token>. Fjernes fra adresselinjen med det samme.
  const token = new URLSearchParams(location.search).get('nulstil');
  if (token) {
    history.replaceState(null, '', location.pathname);
    resetToken = token;
    $('#app').hidden = true; $('#login').hidden = false; showCard('reset');
    return;
  }
  try { await api('me'); } catch (e: any) {
    if (e.status === 503) return showLogin(e.message);
    return showLogin();
  }
  $('#login').hidden = true; $('#app').hidden = false;
  await refresh();
}

async function refresh() {
  try { leads = (await api('leads')).leads; render(); } catch { /* login vises */ }
}

function matches(l: Lead) {
  if (!query) return true;
  return [l.navn, l.telefon, l.email, l.adresse, l.by, l.postnr, l.ydelse, l.beskrivelse].join(' ').toLowerCase().includes(query);
}

function render() {
  const visible = leads.filter(matches);
  // Overblik
  const stats = $('[data-stats]'); stats.replaceChildren();
  const month = new Date().toISOString().slice(0, 7);
  const sum = (s: string, f = (l: Lead) => true) => leads.filter(l => l.status === s && f(l)).reduce((a, l) => a + (l.vaerdi || 0), 0);
  const items: [string, string][] = [
    ['Nye henvendelser', String(leads.filter(l => l.status === 'ny').length)],
    ['Leads denne måned', String(leads.filter(l => l.oprettet.startsWith(month)).length)],
    ['Åbne tilbud', kr(sum('tilbud'))],
    ['Vundet denne måned', kr(sum('vundet', l => (l.historik.findLast?.(h => /→ vundet/.test(h.hvad))?.ts || l.opdateret).startsWith(month)))]
  ];
  for (const [k, v] of items) { const d = el('div', 'stat'); d.append(el('strong', '', v), el('span', '', k)); stats.append(d); }

  // Board
  const board = $('[data-board]'); board.replaceChildren();
  const cols = showArchived ? [...COLS, ['arkiveret', 'Arkiveret'] as [string, string]] : COLS;
  for (const [key, title] of cols) {
    const list = visible.filter(l => l.status === key);
    const col = el('div', `col col-${key}`); col.dataset.col = key;
    const head = el('div', 'col-head'); head.append(el('h2', '', title), el('span', 'count', String(list.length)));
    const v = list.reduce((a, l) => a + (l.vaerdi || 0), 0); if (v) head.append(el('span', 'col-sum', kr(v)));
    const ul = el('ul', 'cards'); ul.setAttribute('aria-label', title);
    for (const l of list) ul.append(card(l));
    if (!list.length) ul.append(el('li', 'empty', key === 'ny' ? 'Ingen nye henvendelser' : 'Træk et kort hertil'));
    col.append(head, ul);
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer?.getData('text/plain'); if (id) move(id, key); });
    board.append(col);
  }
}

function card(l: Lead) {
  const li = el('li', 'lcard'); li.draggable = true; li.tabIndex = 0; li.dataset.id = l.id;
  li.setAttribute('aria-label', `${l.navn}, ${LABEL[l.status]}. Åbn detaljer`);
  const top = el('div', 'lc-top');
  top.append(el('strong', 'lc-name', l.navn || 'Uden navn'));
  if (l.kilde === 'manuel') top.append(el('span', 'tag', 'Manuel'));
  if (l.status === 'ny' && Date.now() - +new Date(l.oprettet) < 864e5) top.append(el('span', 'tag tag-new', 'Ny'));
  li.append(top);
  if (l.ydelse) li.append(el('p', 'lc-job', l.ydelse));
  if (l.beskrivelse) li.append(el('p', 'lc-desc', l.beskrivelse.slice(0, 110) + (l.beskrivelse.length > 110 ? '…' : '')));
  const meta = el('div', 'lc-meta');
  meta.append(el('span', '', when(l.oprettet)));
  if (l.by || l.postnr) meta.append(el('span', '', [l.postnr, l.by].filter(Boolean).join(' ')));
  if (l.filer?.length) meta.append(el('span', '', `📎 ${l.filer.length}`));
  if (l.noter?.length) meta.append(el('span', '', `💬 ${l.noter.length}`));
  if (l.vaerdi) meta.append(el('span', 'lc-val', kr(l.vaerdi)));
  li.append(meta);
  li.addEventListener('dragstart', e => { e.dataTransfer?.setData('text/plain', l.id); li.classList.add('dragging'); });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));
  li.addEventListener('click', () => open(l.id));
  li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(l.id); } });
  return li;
}

async function move(id: string, status: string) {
  const l = leads.find(x => x.id === id); if (!l || l.status === status) return;
  const before = l.status; l.status = status; render();
  try { const r = await api(`leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); Object.assign(l, r.lead); render(); }
  catch (e: any) { l.status = before; render(); alert(e.message); }
}

// ---------- detaljevindue ----------
const modal = $<HTMLDialogElement>('[data-modal]');
const form = $<HTMLFormElement>('[data-detail]');
let currentId: string | null = null;

function open(id: string | null) {
  currentId = id;
  const l: Partial<Lead> = id ? leads.find(x => x.id === id)! : { status: 'ny', kilde: 'manuel', noter: [], historik: [], filer: [], vaerdi: null };
  form.replaceChildren(($<HTMLTemplateElement>('#tpl-detail')).content.cloneNode(true));
  const f = (k: string) => form.querySelector(`[data-f="${k}"]`) as HTMLElement;
  f('titel').textContent = id ? l.navn || 'Lead' : 'Nyt lead';
  f('kildeTxt').textContent = id ? (l.kilde === 'manuel' ? 'Oprettet manuelt' : 'Fra hjemmesidens formular') + ' · ' + when(l.oprettet!) : 'Opret lead manuelt';
  const sel = $<HTMLSelectElement>('[data-status]', form);
  for (const k of Object.keys(LABEL)) { const o = el('option', '', LABEL[k]) as HTMLOptionElement; o.value = k; sel.append(o); }
  sel.value = l.status || 'ny';
  for (const k of ['navn', 'telefon', 'email', 'adresse', 'postnr', 'by', 'ydelse', 'ansvarlig', 'beskrivelse']) {
    const inp = form.elements.namedItem(k) as HTMLInputElement; if (inp) inp.value = (l as any)[k] || '';
  }
  (form.elements.namedItem('vaerdi') as HTMLInputElement).value = l.vaerdi ? String(l.vaerdi) : '';
  const quick = $('[data-quick]', form);
  if (l.telefon) { const a = el('a', 'cbtn cbtn-call', `Ring ${l.telefon}`) as HTMLAnchorElement; a.href = 'tel:' + l.telefon.replace(/[^\d+]/g, ''); quick.append(a); }
  if (l.email) { const a = el('a', 'cbtn cbtn-ghost', 'Skriv mail') as HTMLAnchorElement; a.href = 'mailto:' + l.email; quick.append(a); }
  const files = $('[data-files]', form);
  if (l.filer?.length) {
    files.append(el('h3', '', 'Vedhæftede filer'));
    const ul = el('ul');
    for (const fi of l.filer) { const a = el('a', '', `${fi.navn} (${fi.kb} kB)`) as HTMLAnchorElement; a.href = `${API}filer/${l.id}/${fi.n}`; a.target = '_blank'; a.rel = 'noopener'; const li = el('li'); li.append(a); ul.append(li); }
    files.append(ul);
  }
  const meta = [(l as any).fundet && `Fandt os via: ${(l as any).fundet}`, l.side && `Side: ${l.side}`, l.utm && `UTM: ${l.utm}`, l.gclid && 'Google Ads-klik', l.fbclid && 'Meta-klik'].filter(Boolean).join(' · ');
  $('[data-meta]', form).textContent = meta;
  const notes = $('[data-notes]', form);
  for (const n of [...(l.noter || [])].reverse()) { const li = el('li'); li.append(el('p', '', n.tekst), el('small', '', `${n.af} · ${when(n.ts)}`)); notes.append(li); }
  const hist = $('[data-hist]', form);
  for (const h of [...(l.historik || [])].reverse()) hist.append(el('li', '', `${new Date(h.ts).toLocaleString('da-DK')} · ${h.af}: ${h.hvad}`));
  const arch = $<HTMLButtonElement>('[data-archive]', form);
  arch.hidden = !id;
  if (l.status === 'arkiveret') arch.textContent = 'Gendan';
  arch.addEventListener('click', () => save(l.status === 'arkiveret' ? 'ny' : 'arkiveret'));
  $('[data-save]', form).addEventListener('click', () => save());
  modal.showModal();
  (form.elements.namedItem(id ? 'note' : 'navn') as HTMLElement).focus();
}

async function save(forceStatus?: string) {
  const err = $('.crm-error', form);
  const data: Record<string, string> = {};
  for (const k of ['status', 'navn', 'telefon', 'email', 'adresse', 'postnr', 'by', 'ydelse', 'ansvarlig', 'beskrivelse', 'vaerdi', 'note']) data[k] = ((form.elements.namedItem(k) as HTMLInputElement)?.value || '').trim();
  if (forceStatus) data.status = forceStatus;
  data.vaerdi = data.vaerdi.replace(/\D/g, '');
  if (!data.navn) { err.hidden = false; err.textContent = 'Skriv et navn.'; return; }
  try {
    const r = currentId
      ? await api(`leads/${currentId}`, { method: 'PATCH', body: JSON.stringify(data) })
      : await api('leads', { method: 'POST', body: JSON.stringify(data) });
    const i = leads.findIndex(x => x.id === r.lead.id);
    if (i >= 0) leads[i] = r.lead; else leads.unshift(r.lead);
    modal.close(); render();
  } catch (e: any) { if (e.message !== 'login') { err.hidden = false; err.textContent = e.message; } }
}

// Enter i et felt gemmer i stedet for at lukke vinduet.
form.addEventListener('submit', e => { if ((e as SubmitEvent).submitter?.getAttribute('value') !== 'luk') { e.preventDefault(); save(); } });

// ---------- hændelser ----------
$<HTMLFormElement>('[data-login]').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement;
  const btn = f.querySelector('button')!; btn.disabled = true;
  try {
    await api('login', { method: 'POST', body: JSON.stringify({ bruger: (f.elements.namedItem('bruger') as HTMLInputElement).value, kode: (f.elements.namedItem('kode') as HTMLInputElement).value }) });
    (f.elements.namedItem('kode') as HTMLInputElement).value = '';
    await boot();
  } catch (err: any) { showLogin(err.message); }
  finally { btn.disabled = false; }
});
$('[data-show-forgot]').addEventListener('click', () => { showCard('forgot'); $<HTMLInputElement>('[data-forgot] input').focus(); });
$('[data-show-login]').addEventListener('click', () => showLogin());
$<HTMLFormElement>('[data-forgot]').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement; const btn = f.querySelector('button[type=submit]') as HTMLButtonElement; btn.disabled = true;
  const ok = $('.crm-ok', f);
  try { const r = await api('glemt', { method: 'POST', body: JSON.stringify({ bruger: (f.elements.namedItem('bruger') as HTMLInputElement).value }) }); ok.textContent = r.message; }
  catch (err: any) { ok.textContent = err.message; }
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
$('[data-new]').addEventListener('click', () => open(null));
$<HTMLInputElement>('[data-search]').addEventListener('input', e => { query = (e.target as HTMLInputElement).value.trim().toLowerCase(); render(); });
$('[data-show-archived]').addEventListener('click', e => { showArchived = !showArchived; (e.target as HTMLElement).textContent = showArchived ? 'Skjul arkiverede' : 'Vis arkiverede'; render(); });
setInterval(() => { if (!$('#app').hidden && !modal.open && document.visibilityState === 'visible') refresh(); }, 60000);
boot();
