// Lead-modtager. Ren funktion uden Netlify-afhængigheder, så den kan testes med en falsk fetch.
//
// Princip: et lead må aldrig gå tabt. Hvert lead leveres op til tre steder samtidig:
//   1) leadloggen (Make-webhook, som skriver til Google Sheet og/eller Pipedrive)
//   2) en mail til kunden via Mailgun
//   3) kundens mini-CRM på /administrator-system/ (Netlify Blobs, se crm-core.mjs)
// Fejler en af dem, sendes en alarm til Vækster, og den besøgende får stadig en kvittering.
// Fejler alle, svarer funktionen 502, så formularen viser telefonnummeret i stedet for "tak".

const LIMITS = { navn: 120, telefon: 30, email: 160, adresse: 160, postnr: 8, by: 80, andet: 200, fundet: 60, beskrivelse: 4000, side: 300, leadtype: 60, utm: 600, gclid: 200, fbclid: 300 };
const MIN_FILL_MS = 2500;      // udfyldt hurtigere end det (målt i browseren) er en robot
const MAX_BODY = 32 * 1024;    // 32 KB uden filer
// Med filer: Netlify tillader ca. 6 MB pr. forespørgsel. Billeder gøres mindre i browseren før afsendelse.
const MAX_MULTIPART = 6 * 1024 * 1024;
const MAX_FILES = 6;
const MAX_FILES_BYTES = 5 * 1024 * 1024;
const FILE_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;
const TIMEOUT_MS = 8000;
const SIDE_TIMEOUT_MS = 5000;  // alarm og kvittering

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
// Enlinjefelter: ingen linjeskift (de ville ellers havne i mailens emne og Reply-To).
const MULTILINE = new Set(['beskrivelse']);
const quoteName = n => '"' + n.replace(/["\\]/g, '') + '"';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

export function parseLead(raw, now) {
  const lead = {};
  for (const [k, max] of Object.entries(LIMITS)) lead[k] = MULTILINE.has(k) ? clean(raw[k], max) : clean(raw[k], max).replace(/[\r\n\t]+/g, ' ');
  const ydelser = Array.isArray(raw.ydelser) ? raw.ydelser : raw.ydelser ? [raw.ydelser] : [];
  lead.ydelser = ydelser.map(y => clean(y, 80)).filter(Boolean).slice(0, 20);
  const errors = [];
  if (!lead.navn) errors.push('navn');
  if (lead.telefon.replace(/\D/g, '').length < 8) errors.push('telefon');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) errors.push('email');
  if (!lead.beskrivelse) errors.push('beskrivelse');
  // t = millisekunder fra siden blev vist til formularen blev sendt (målt i browseren).
  const t = Number(raw.t);
  const spam = Boolean(clean(raw.hp_kontrol, 200)) || (raw.t !== undefined && raw.t !== '' && Number.isFinite(t) && t >= 0 && t < MIN_FILL_MS);
  return { lead, errors, spam };
}

async function withTimeout(fetchFn, url, init, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetchFn(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

function mailgun(env, fetchFn) {
  const base = (env.MAILGUN_REGION || 'eu').toLowerCase() === 'us' ? 'https://api.mailgun.net' : 'https://api.eu.mailgun.net';
  const auth = 'Basic ' + Buffer.from('api:' + String(env.MAILGUN_API_KEY).trim()).toString('base64');
  return async (fields, ms, attachments = []) => {
    // Med vedhæftede filer skal Mailgun have multipart; ellers almindelig formular-kodning.
    const body = attachments.length ? new FormData() : new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) if (v) body.append(k, v);
    for (const f of attachments) body.append('attachment', f, f.name);
    const r = await withTimeout(fetchFn, `${base}/v3/${env.MAILGUN_DOMAIN}/messages`, { method: 'POST', headers: { Authorization: auth }, body }, ms);
    if (!r.ok) throw new Error(`Mailgun svarede ${r.status}`);
    return true;
  };
}

function leadMail(lead, siteName) {
  const rows = [
    ['Navn', lead.navn], ['Telefon', lead.telefon], ['E-mail', lead.email],
    ['Adresse', [lead.adresse, [lead.postnr, lead.by].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
    ['Opgave', [...lead.ydelser, lead.andet].filter(Boolean).join(', ')],
    ['Beskrivelse', lead.beskrivelse],
    ['Fandt os via', lead.fundet],
    ['Vedhæftet', (lead.filer || []).map(f => f.navn).join(', ')],
    ['Sendt fra', lead.side], ['Lead-id', lead.id]
  ].filter(([, v]) => v);
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nSvar direkte på denne mail for at skrive til ${lead.navn}.`;
  const html = `<p>Ny henvendelse fra ${esc(siteName)}.</p><table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="vertical-align:top;color:#555"><strong>${esc(k)}</strong></td><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table><p>Svar direkte på denne mail for at skrive til ${esc(lead.navn)}.</p>`;
  const what = lead.ydelser[0] || lead.andet || 'Forespørgsel';
  return { subject: `Ny henvendelse: ${what} | ${lead.navn}`, text, html };
}

/**
 * @param {Request} req
 * @param {Record<string,string|undefined>} env
 * @param {{ fetch?: typeof fetch, now?: () => number, log?: (...a:any[]) => void, waitUntil?: (p: Promise<any>) => void, crm?: { saveFromForm: Function } | null }} deps
 */
/** Bekræftelsesmail til den besøgende: ren tekst, ingen links og ingen gentagelse af det, den besøgende skrev. */
export function confirmMail(lead, siteName, env = {}) {
  const raw = String(lead.navn || '').trim();
  // Navnet er det eneste fra formularen, der kommer med. Ligner det et link eller reklame, bruges det ikke.
  const safeName = raw && raw.length <= 40 && !/(https?:|www\.|\.[a-z]{2,}(\/|\b)|@|[<>])/i.test(raw) ? raw.split(/\s+/)[0] : '';
  const promise = env.CONFIRM_PROMISE || 'hurtigst muligt';
  const phone = env.CONFIRM_PHONE ? `\n\nHaster det, så ring på ${env.CONFIRM_PHONE}.` : '';
  return {
    subject: `Tak for din henvendelse til ${siteName}`,
    text: `Hej${safeName ? ' ' + safeName : ''}\n\nTak for din henvendelse til ${siteName}. Vi har modtaget den og vender tilbage ${promise}.${phone}\n\nVenlig hilsen\n${siteName}\n\n--\nDu får denne mail, fordi kontaktformularen på vores hjemmeside er udfyldt med din e-mailadresse. Var det ikke dig, kan du se bort fra den.`
  };
}

export async function handleLead(req, env, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const now = (deps.now || Date.now)();
  const log = deps.log || console.error;
  const siteName = env.BRAND_NAME || 'hjemmesiden';
  // Alarm og kvittering må ikke forsinke svaret til den besøgende. På Netlify kører de videre efter svaret.
  const background = [];
  const later = p => { const safe = p.catch(e => log('[lead] baggrundsopgave fejlede', e?.message)); if (deps.waitUntil) deps.waitUntil(safe); else background.push(safe); };
  const finish = async res => { if (background.length) await Promise.all(background); return res; };

  if (req.method !== 'POST') return json(405, { ok: false, error: 'method' }, { Allow: 'POST' });

  // Kun formularer fra kundens eget domæne (og Netlify-forhåndsvisninger, hvis tilladt).
  const origin = req.headers.get('origin');
  if (origin) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const self = new URL(req.url).origin;
    if (origin !== self && !allowed.includes(origin)) return json(403, { ok: false, error: 'origin' });
  }

  const len = Number(req.headers.get('content-length') || 0);
  const type = req.headers.get('content-type') || '';
  const isMultipart = type.includes('multipart/form-data');
  if (len > (isMultipart ? MAX_MULTIPART : MAX_BODY)) return json(413, { ok: false, error: 'size' });
  const wantsJson = (req.headers.get('accept') || '').includes('application/json');
  let raw;
  let attachments = [];
  try {
    if (isMultipart) {
      const fd = await req.formData();
      raw = {};
      for (const [k, v] of fd.entries()) if (typeof v === 'string' && k !== 'ydelser') raw[k] = v;
      raw.ydelser = fd.getAll('ydelser').filter(v => typeof v === 'string');
      attachments = fd.getAll('filer').filter(v => typeof v !== 'string' && v.size > 0);
      if (attachments.length > MAX_FILES) return json(400, { ok: false, error: 'filer', message: `Højst ${MAX_FILES} filer` });
      if (attachments.reduce((a, f) => a + f.size, 0) > MAX_FILES_BYTES) return json(413, { ok: false, error: 'size' });
      // iPhone-billeder (HEIC) kommer nogle gange uden filtype; den sættes ud fra filnavnet.
      attachments = attachments.map(f => f.type ? f : /\.hei[cf]$/i.test(f.name || '') ? new File([f], f.name, { type: 'image/heic' }) : f);
      const bad = attachments.find(f => !FILE_TYPES.test(f.type || ''));
      if (bad) return json(400, { ok: false, error: 'filtype', message: 'Kun billeder og PDF' });
      // Filnavne gøres sikre (ingen stier eller styretegn).
      attachments = attachments.map(f => new File([f], (f.name || 'fil').replace(/[\\/\u0000-\u001f]+/g, '_').slice(-100), { type: f.type }));
    } else {
    const text = await req.text();
    if (text.length > MAX_BODY) return json(413, { ok: false, error: 'size' });
    if (type.includes('application/json')) raw = JSON.parse(text);
    else { const p = new URLSearchParams(text); raw = Object.fromEntries(p); raw.ydelser = p.getAll('ydelser'); }
    }
  } catch { return json(400, { ok: false, error: 'format' }); }

  const { lead, errors, spam } = parseLead(raw || {}, now);
  // Spam får et normalt svar, så robotten ikke lærer noget. Intet sendes videre.
  if (spam) return json(200, { ok: true, id: 'x' + now.toString(36) });
  if (errors.length) {
    if (wantsJson) return json(400, { ok: false, error: 'felter', fields: errors });
    return new Response(`<!doctype html><html lang="da"><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Formularen mangler oplysninger</title><h1>Formularen mangler oplysninger</h1><p>Udfyld navn, telefon (mindst 8 cifre), e-mail og en kort beskrivelse.</p><p><a href="javascript:history.back()">Tilbage til formularen</a></p></html>`, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  lead.id = (globalThis.crypto?.randomUUID?.() || String(now)).slice(0, 8) + '-' + now.toString(36);
  lead.modtaget = new Date(now).toISOString();
  lead.site = siteName;
  lead.kvalitet = ''; // udfyldes af kunden/Vækster i leadloggen
  // Leadloggen får navn, type og størrelse på filerne; selve filerne sendes med mailen.
  lead.filer = attachments.map(f => ({ navn: f.name, type: f.type, kb: Math.round(f.size / 1024) }));

  const hasMake = Boolean(env.MAKE_WEBHOOK_URL);
  const hasMail = Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN && env.LEAD_TO);
  const hasCrm = Boolean(deps.crm);
  if (!hasMake && !hasMail && !hasCrm) {
    log('[lead] Ingen leveringskanal sat op. Sæt MAKE_WEBHOOK_URL og/eller MAILGUN_API_KEY, MAILGUN_DOMAIN, LEAD_TO.');
    return json(500, { ok: false, error: 'konfiguration' });
  }
  const send = env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN ? mailgun(env, fetchFn) : null;
  // Mail er ikke sat op, men leadet gemmes i CRM: skriv det i loggen, så en manglende leadmail ikke går ubemærket hen.
  if (!hasMail) log(`[lead] Leadmail sendes ikke. Mangler: ${['MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'LEAD_TO'].filter(k => !env[k]).join(', ')}`);
  const from = env.LEAD_FROM || `${siteName} <hjemmeside@${env.MAILGUN_DOMAIN}>`;

  const channels = {
    log: hasMake ? withTimeout(fetchFn, env.MAKE_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) })
      .then(r => { if (!r.ok) throw new Error(`Make svarede ${r.status}`); return true; }) : Promise.reject(new Error('ikke sat op')),
    mail: hasMail ? (() => { const m = leadMail(lead, siteName); return send({ from, to: env.LEAD_TO, bcc: env.LEAD_BCC, 'h:Reply-To': `${quoteName(lead.navn)} <${lead.email}>`, subject: m.subject, text: m.text, html: m.html, 'o:tag': 'lead' }, undefined, attachments); })() : Promise.reject(new Error('ikke sat op')),
    crm: hasCrm ? Promise.resolve().then(() => deps.crm.saveFromForm(lead, attachments, now)) : Promise.reject(new Error('ikke sat op'))
  };
  const [logRes, mailRes, crmRes] = await Promise.allSettled([channels.log, channels.mail, channels.crm]);
  const okLog = logRes.status === 'fulfilled', okMail = mailRes.status === 'fulfilled', okCrm = crmRes.status === 'fulfilled';
  // Kun kanaler der er sat op, tæller som fejlet. Med én kanal sendes der ikke alarm ved hvert lead.
  const failLog = hasMake && !okLog, failMail = hasMail && !okMail, failCrm = hasCrm && !okCrm;

  if (failLog || failMail || failCrm) {
    const why = [failLog && `leadlog: ${logRes.reason?.message}`, failMail && `mail: ${mailRes.reason?.message}`, failCrm && `crm: ${crmRes.reason?.message}`].filter(Boolean).join('; ');
    log(`[lead] ${lead.id} delvis fejl: ${why}`);
    // Alarmen indeholder hele leadet, så det kan reddes manuelt.
    const alertText = `Lead ${lead.id} på ${siteName} blev ikke leveret fuldt ud.\nFejl: ${why}\n\n${leadMail(lead, siteName).text}`;
    if (!okMail && env.ALERT_WEBHOOK_URL) {
      later(withTimeout(fetchFn, env.ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: alertText, lead }) }, SIDE_TIMEOUT_MS));
    }
    if (env.ALERT_EMAIL && send) {
      later(send({ from, to: env.ALERT_EMAIL, subject: `ALARM: lead ikke fuldt leveret (${siteName})`, text: alertText }, SIDE_TIMEOUT_MS));
    }
  }

  // Sidste udvej: hele leadet i funktionsloggen (Netlify gemmer den kortvarigt), så det kan genskabes.
  if (!okLog && !okMail && !okCrm) { log('[lead] TABT-LEAD ' + JSON.stringify(lead)); return finish(json(502, { ok: false, error: 'levering', id: lead.id })); }

  // Bekræftelse til den besøgende (standard slået til, CONFIRM_TO_LEAD=false slår fra). Fejl her påvirker ikke svaret.
  // Sendes fra sit eget afsenderdomæne (CONFIRM_MAILGUN_DOMAIN + CONFIRM_FROM), så spamklager aldrig rammer leadmails til kunden.
  // Sikkerhed: højst én pr. adresse pr. døgn, ingen links, og den besøgendes egen tekst gentages ikke (så formularen ikke kan bruges til spam).
  const confirmDomain = env.CONFIRM_MAILGUN_DOMAIN || env.MAILGUN_DOMAIN;
  if (env.CONFIRM_TO_LEAD !== 'false' && env.MAILGUN_API_KEY && confirmDomain) {
    later((async () => {
      if (deps.crm?.confirmOnce && !(await deps.crm.confirmOnce(lead.email, now))) return false;
      const sendC = mailgun({ ...env, MAILGUN_DOMAIN: confirmDomain }, fetchFn);
      const m = confirmMail(lead, siteName, env);
      return sendC({ from: env.CONFIRM_FROM || `${siteName} <bekraeftelse@${confirmDomain}>`, to: lead.email, 'h:Reply-To': env.LEAD_TO, subject: m.subject, text: m.text, 'o:tag': 'bekraeftelse', 'o:tracking': 'no' }, SIDE_TIMEOUT_MS);
    })());
  }

  if (wantsJson) return finish(json(200, { ok: true, id: lead.id }));
  // Uden JavaScript: videre til sidens takkeside (skjult felt "tak"), ellers en enkel takkeside.
  if (typeof raw.tak === 'string' && /^\/[a-z0-9\-\/]*$/i.test(raw.tak)) return finish(new Response(null, { status: 303, headers: { Location: raw.tak, 'Cache-Control': 'no-store' } }));
  const back = lead.side && /^https?:\/\//.test(lead.side) ? lead.side : '/';
  return finish(new Response(`<!doctype html><html lang="da"><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tak for din henvendelse</title><h1>Tak for din henvendelse</h1><p>Vi har modtaget den og vender tilbage hurtigst muligt.</p><p><a href="${esc(back)}">Tilbage til siden</a></p></html>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
}
