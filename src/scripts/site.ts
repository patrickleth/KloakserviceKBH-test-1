// Vækster klientscript: samtykke, GTM og Meta Pixel efter samtykke, sporing, menu, formular med filer og takkesider.
// Ingen afhængigheder. Konverteringen (generate_lead) sendes på takkesiden, først når leadet er bekræftet modtaget.
type DL = any[];
const w = window as any;
const dl: DL = (w.dataLayer = w.dataLayer || []);
function gtag(..._args: any[]) { dl.push(arguments); }
const root = document.documentElement;
const GTM_ID = root.dataset.gtm || '';
const PIXEL_ID = root.dataset.pixel || '';
const CMODE = root.dataset.cmode === 'advanced' ? 'advanced' : 'basic';
const CONSENT_MODE = root.dataset.consent; // 'intern' | 'cookiebot'

function store(k: string, v?: string | null) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* privat vindue */ } return null; }
function sess(k: string, v?: string | null) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* */ } return null; }

// ---------- Kampagnedata til leadloggen ----------
// Læses fra adressen og holdes i hukommelsen. Gemmes først i sessionStorage efter samtykke til markedsføring.
const q = new URLSearchParams(location.search);
const campaign: Record<string, string> = {
  gclid: q.get('gclid') || '',
  fbclid: q.get('fbclid') || '',
  utm: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].filter(k => q.get(k)).map(k => `${k}=${q.get(k)}`).join('&')
};
function saveCampaign() { for (const [k, v] of Object.entries(campaign)) if (v) sess('vk_' + k, v); }
const fromCampaign = (k: string) => campaign[k] || sess('vk_' + k) || '';

// ---------- Samtykke (Google Consent Mode v2) ----------
type Consent = { v: 1; ts: number; preferences: boolean; statistics: boolean; marketing: boolean };
const CONSENT_KEY = 'vk_consent_v2';
const all = (on: boolean): Consent => ({ v: 1, ts: Date.now(), preferences: on, statistics: on, marketing: on });

function readConsent(): Consent | null {
  if (CONSENT_MODE === 'cookiebot') {
    const cb = w.Cookiebot;
    if (!cb?.hasResponse) return null;
    return { v: 1, ts: 0, preferences: !!cb.consent.preferences, statistics: !!cb.consent.statistics, marketing: !!cb.consent.marketing };
  }
  const raw = store(CONSENT_KEY);
  if (raw) { try { const c = JSON.parse(raw); if (c && c.v === 1) return c; } catch { /* */ } }
  const old = store('vk_consent'); // tidligere version: 'grant' eller 'deny'
  if (old === 'grant' || old === 'deny') return all(old === 'grant');
  return null;
}
const marketingOk = () => !!readConsent()?.marketing;

function loadGTM() {
  if (!GTM_ID || w.__gtm) return;
  w.__gtm = true;
  dl.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
  document.head.appendChild(s);
}
function loadPixel() {
  if (!PIXEL_ID || w.fbq) return;
  const n: any = (w.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
  if (!w._fbq) w._fbq = n;
  n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
  const s = document.createElement('script');
  s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  w.fbq('init', PIXEL_ID);
  w.fbq('track', 'PageView');
}
function applyConsent(c: Consent) {
  const g = (on: boolean) => (on ? 'granted' : 'denied');
  if (CONSENT_MODE === 'intern') {
    gtag('consent', 'update', {
      ad_storage: g(c.marketing), ad_user_data: g(c.marketing), ad_personalization: g(c.marketing),
      analytics_storage: g(c.statistics), functionality_storage: g(c.preferences), personalization_storage: g(c.preferences)
    });
  }
  dl.push({ event: 'consent_update', consent_preferences: c.preferences, consent_statistics: c.statistics, consent_marketing: c.marketing });
  if (c.marketing) { saveCampaign(); loadPixel(); }
  if (c.statistics || c.marketing) loadGTM();
  document.dispatchEvent(new CustomEvent('vk:consent', { detail: c }));
}
// Avanceret tilstand: GTM indlæses straks, og Googles tags sender kun cookieløse signaler indtil samtykke.
if (CMODE === 'advanced') loadGTM();

if (CONSENT_MODE === 'cookiebot') {
  const onCb = () => { const c = readConsent(); if (c) applyConsent(c); };
  w.addEventListener('CookiebotOnConsentReady', onCb);
}
const banner = document.querySelector<HTMLElement>('[data-consent-banner]');
if (CONSENT_MODE === 'intern' && banner) {
  const form = banner.querySelector<HTMLFormElement>('[data-consent-form]')!;
  const main = banner.querySelector<HTMLElement>('.consent-main')!;
  const save = (c: Consent) => { store(CONSENT_KEY, JSON.stringify(c)); store('vk_consent', null); applyConsent(c); banner.hidden = true; };
  const openSettings = () => {
    const c = readConsent() || all(false);
    (['preferences', 'statistics', 'marketing'] as const).forEach(k => { (form.elements.namedItem(k) as HTMLInputElement).checked = c[k]; });
    banner.hidden = false; main.hidden = true; form.hidden = false;
    form.querySelector<HTMLInputElement>('input:not([disabled])')?.focus();
  };
  const saved = readConsent();
  if (saved) applyConsent(saved); else banner.hidden = false;
  banner.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest('[data-consent-action]')?.getAttribute('data-consent-action');
    if (a === 'grant') save(all(true));
    else if (a === 'deny') save(all(false));
    else if (a === 'settings') openSettings();
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = (k: string) => (form.elements.namedItem(k) as HTMLInputElement).checked;
    save({ v: 1, ts: Date.now(), preferences: v('preferences'), statistics: v('statistics'), marketing: v('marketing') });
  });
  document.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('[data-cookie-settings]')) { e.preventDefault(); openSettings(); }
  });
} else if (CONSENT_MODE === 'cookiebot') {
  document.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('[data-cookie-settings]')) { e.preventDefault(); w.Cookiebot?.renew(); }
  });
}

// ---------- Klik-sporing ----------
document.addEventListener('click', e => {
  const a = (e.target as HTMLElement).closest('[data-track]');
  if (a) dl.push({ event: a.getAttribute('data-track'), link_url: a.getAttribute('href'), page_path: location.pathname });
});

// ---------- Mobilmenu ----------
const mb = document.querySelector<HTMLButtonElement>('.menu-btn');
const nav = document.getElementById('nav');
mb?.addEventListener('click', () => {
  const open = nav!.classList.toggle('open');
  mb.setAttribute('aria-expanded', String(open));
  mb.setAttribute('aria-label', open ? 'Luk menu' : 'Åbn menu');
});
document.addEventListener('click', e => {
  document.querySelectorAll('.has-sub details[open]').forEach(d => { if (!d.contains(e.target as Node)) d.removeAttribute('open'); });
});

// ---------- Hero-video: stop for dem der har slået bevægelse fra ----------
const vid = document.querySelector<HTMLVideoElement>('.hero-video');
if (vid && (matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator as any).connection?.saveData)) { vid.pause(); vid.removeAttribute('autoplay'); }

// ---------- Filer: billeder gøres mindre i browseren, før de sendes ----------
const MAX_FILES = 6;
const MAX_TOTAL = 4.5 * 1024 * 1024; // Netlify tillader ca. 6 MB pr. forespørgsel
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  if (file.size < 400 * 1024 && file.type === 'image/jpeg') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; } // fx HEIC i en browser der ikke kan læse det: sendes som det er
}
const kb = (n: number) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');

// ---------- Tilbudsformular ----------
document.querySelectorAll<HTMLFormElement>('form.lead-form').forEach(form => {
  const steps = form.querySelectorAll<HTMLFieldSetElement>('.step');
  const err = form.querySelector<HTMLElement>('.form-error')!;
  const label = form.querySelector('.progress b');
  const bar = form.querySelector<HTMLElement>('.progress .bar i');
  const prev = form.querySelector<HTMLButtonElement>('[data-prev]');
  const next = form.querySelector<HTMLButtonElement>('[data-next]');
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const submitLabel = submit.textContent || 'Indhent tilbud';
  const formId = form.id || 'tilbud';
  const phone = form.dataset.phone || '';
  const thanks = form.dataset.thanks || '';
  const el = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  let i = 0, started = false;
  let files: File[] = [];
  form.classList.add('js');
  const t0 = performance.now(); // tidstjek mod robotter: forløbet tid, ikke klokkeslæt

  // Filvælger
  const fileInput = form.querySelector<HTMLInputElement>('input[type=file]');
  const fileList = form.querySelector<HTMLElement>('.file-list');
  const renderFiles = () => {
    if (!fileList) return;
    fileList.innerHTML = '';
    files.forEach((f, k) => {
      const li = document.createElement('li');
      li.textContent = `${f.name} (${kb(f.size)}) `;
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'file-rm'; rm.textContent = 'Fjern';
      rm.setAttribute('aria-label', `Fjern ${f.name}`);
      rm.addEventListener('click', () => { files.splice(k, 1); renderFiles(); });
      li.appendChild(rm); fileList.appendChild(li);
    });
  };
  fileInput?.addEventListener('change', async () => {
    const picked = Array.from(fileInput.files || []);
    fileInput.value = '';
    for (const f of picked) {
      if (files.length >= MAX_FILES) { fail(`Du kan vedhæfte op til ${MAX_FILES} filer.`); break; }
      if (!/^image\//.test(f.type) && f.type !== 'application/pdf' && !/\.(heic|heif)$/i.test(f.name)) { fail(`${f.name} kan ikke vedhæftes. Brug billeder eller PDF.`); continue; }
      const s = await shrink(f);
      if (files.reduce((a, b) => a + b.size, 0) + s.size > MAX_TOTAL) { fail('Filerne fylder for meget tilsammen (højst 4,5 MB). Send færre billeder, eller send dem bagefter på mail.'); break; }
      files.push(s);
    }
    renderFiles();
  });

  function show(n: number) {
    i = n;
    steps.forEach((s, k) => s.classList.toggle('active', k === n));
    form.classList.toggle('last', n === steps.length - 1);
    if (prev) prev.hidden = n === 0;
    if (label) label.textContent = String(n + 1);
    if (bar) bar.style.width = ((n + 1) / steps.length) * 100 + '%';
    err.hidden = true;
  }
  function fail(msg: string, focus?: HTMLElement) { err.textContent = msg; err.hidden = false; focus?.focus(); return false; }
  function valid(step: HTMLElement) {
    let bad: HTMLInputElement | null = null;
    step.querySelectorAll<HTMLInputElement>('[required]').forEach(f => {
      const v = f.value.trim();
      const ok = v !== '' && (f.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) && (f.type !== 'tel' || v.replace(/\D/g, '').length >= 8);
      f.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok && !bad) bad = f;
    });
    if (step.querySelector('[name=ydelser][type=checkbox]') && !step.querySelector('[name=ydelser]:checked') && !el('andet')?.value.trim()) {
      return fail('Vælg mindst én ydelse, eller skriv kort hvad du har brug for.');
    }
    if (bad) {
      const b = bad as HTMLInputElement;
      return fail(b.type === 'tel' ? 'Skriv et telefonnummer med mindst 8 cifre.' : b.type === 'email' ? 'Skriv en gyldig e-mailadresse.' : 'Udfyld de markerede felter.', b);
    }
    return true;
  }
  form.addEventListener('focusin', () => {
    if (started) return; started = true;
    dl.push({ event: 'form_start', form_id: formId, page_path: location.pathname });
  });
  next?.addEventListener('click', () => {
    if (!valid(steps[i])) return;
    dl.push({ event: 'form_step', form_id: formId, step: i + 2 });
    show(i + 1);
    steps[i].querySelector<HTMLElement>('input, textarea')?.focus();
  });
  prev?.addEventListener('click', () => show(i - 1));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!valid(steps[i])) return;
    submit.disabled = true; submit.textContent = 'Sender…';
    // Klik-id'er sendes kun med, hvis der er givet samtykke til markedsføring (ad_user_data).
    const ok = marketingOk();
    el('gclid').value = ok ? fromCampaign('gclid') : '';
    el('fbclid').value = ok ? fromCampaign('fbclid') : '';
    el('utm').value = fromCampaign('utm');
    el('t').value = String(Math.round(performance.now() - t0));
    const fd = new FormData(form);
    fd.delete('filer');
    const data = Object.fromEntries(fd.entries()) as Record<string, any>;
    data.ydelser = fd.getAll('ydelser');
    try {
      let res: { ok: boolean; id: string };
      if (form.dataset.test === 'true') {
        await new Promise(r => setTimeout(r, 400));
        res = { ok: true, id: 'test-' + Date.now() };
      } else if (files.length) {
        files.forEach(f => fd.append('filer', f, f.name));
        const r = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: fd });
        if (!r.ok) throw new Error(String(r.status));
        res = await r.json();
      } else {
        const r = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
        if (!r.ok) throw new Error(String(r.status));
        res = await r.json();
      }
      // Leadet er bekræftet. Oplysninger til takkesiden gemmes kort i fanen (e-mail og telefon kun med samtykke,
      // til Googles udvidede konverteringer) og slettes, så snart takkesiden har brugt dem.
      sess('vk_lead', JSON.stringify({
        id: res.id, type: data.leadtype, form: formId, name: String(data.navn || '').split(' ')[0],
        ydelser: data.ydelser.join(', '), page: location.pathname, test: form.dataset.test === 'true',
        ...(ok ? { email: data.email, phone: data.telefon } : {})
      }));
      if (thanks) { location.href = thanks; return; }
      fireLead(); // ingen takkeside: konverteringen sendes her
      form.classList.add('sent');
      const done = form.querySelector<HTMLElement>('.form-done')!;
      done.hidden = false; done.focus();
    } catch {
      submit.disabled = false; submit.textContent = submitLabel;
      fail(`Forespørgslen blev ikke sendt. Prøv igen, eller ring på ${phone}.`);
    }
  });
  show(0);
});

// ---------- Konvertering (kører på takkesiden) ----------
function fireLead(kind = 'formular') {
  let lead: any = null;
  try { lead = JSON.parse(sess('vk_lead') || 'null'); } catch { /* */ }
  // Prisberegnere (fx Fillout) sender folk hertil med ?id= og evt. ?navn= i adressen.
  if (!lead && kind === 'prisberegner') lead = { id: q.get('id') || 'pb-' + Date.now(), type: 'prisberegner', name: (q.get('navn') || '').split(' ')[0] };
  if (!lead) return null;
  if (lead.name) document.querySelectorAll('[data-thanks-name]').forEach(n => { n.textContent = ', ' + lead.name; });
  const firedKey = 'vk_fired_' + lead.id;
  if (!lead.test && !sess(firedKey)) {
    sess(firedKey, '1');
    if (marketingOk() && (lead.email || lead.phone)) {
      dl.push({ user_data: { email: lead.email || undefined, phone_number: lead.phone ? '+45' + String(lead.phone).replace(/\D/g, '').slice(-8) : undefined } });
    }
    dl.push({ event: 'generate_lead', lead_id: lead.id, lead_type: lead.type || kind, form_id: lead.form, ydelser: lead.ydelser, page_path: lead.page || location.pathname });
    const track = () => w.fbq?.('track', 'Lead', {}, { eventID: lead.id });
    if (w.fbq) track(); else document.addEventListener('vk:consent', track, { once: true });
  }
  // Personoplysningerne slettes igen; id og navn bevares, så siden kan genindlæses uden ny konvertering.
  sess('vk_lead', JSON.stringify({ id: lead.id, name: lead.name, type: lead.type, test: lead.test }));
  return lead;
}
const thanksKind = document.body.dataset.thanks;
if (thanksKind) fireLead(thanksKind);

// ---------- Header over hero: bliver hvid og fast efter lidt scroll ----------
const header = document.querySelector<HTMLElement>('[data-header].over-hero');
if (header) {
  let stuck = false;
  const onScroll = () => {
    const s = window.scrollY > 140;
    if (s !== stuck) { stuck = s; header.classList.toggle('stuck', s); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
