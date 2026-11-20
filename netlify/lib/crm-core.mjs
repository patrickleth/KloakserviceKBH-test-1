// Mini-CRM: lager og API til /administrator-system/. Ren logik uden Netlify-afhængigheder, så det kan testes lokalt.
//
// Lager: et "blob store" med samme metoder som Netlify Blobs (get, getWithMetadata, setJSON, set, list, delete).
//   lead/<id>        JSON med leadet, status, noter og historik
//   fil/<id>/<n>     vedhæftede filer fra formularen
//   sikkerhed/<...>  tællere til lås ved for mange loginforsøg
//   bruger/<navn>    ny adgangskode efter "Glemt adgangskode" (går forud for ADMIN_USERS)
//   nulstil/<sha256> engangslink til ny adgangskode (gyldigt i 30 minutter)
import { parseUsers, verifyPassword, hashPassword, signSession, readSession, getCookie, sessionCookie, throttleKey, passVersion, sha256, newToken } from './admin-auth.mjs';

export const STATUSES = ['ny', 'kontaktet', 'tilbud', 'vundet', 'tabt', 'arkiveret'];
const EDITABLE = { navn: 120, telefon: 30, email: 160, adresse: 160, postnr: 8, by: 80, beskrivelse: 4000, ydelse: 120, ansvarlig: 60, fundet: 60 };
const MAX_FAILS = 5;            // forkerte logins før lås
const LOCK_MS = 15 * 60e3;      // låst i 15 minutter
const MAX_BODY = 64 * 1024;
const RESET_MS = 30 * 60e3;     // nulstillingslink gælder i 30 minutter

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const newId = now => (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2)).slice(0, 8) + '-' + now.toString(36);
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', ...extra }
});

/** Lag oven på blob-lageret. Bruges både af lead-modtageren og af admin-API'et. */
export function crmStore(store) {
  const get = id => store.get(`lead/${id}`, { type: 'json' });
  const put = lead => store.setJSON(`lead/${lead.id}`, lead);
  return {
    get, put,
    /** Gem et lead fra hjemmesidens formular (inkl. filer). Kaldes af lead-core. */
    async saveFromForm(lead, files = [], now = Date.now()) {
      const filer = [];
      for (const [n, f] of files.entries()) {
        await store.set(`fil/${lead.id}/${n}`, await f.arrayBuffer(), { metadata: { navn: f.name, type: f.type } });
        filer.push({ n, navn: f.name, type: f.type, kb: Math.round(f.size / 1024) });
      }
      const rec = {
        id: lead.id, status: 'ny', kilde: 'formular',
        navn: lead.navn, telefon: lead.telefon, email: lead.email, adresse: lead.adresse, postnr: lead.postnr, by: lead.by,
        ydelse: [...(lead.ydelser || []), lead.andet].filter(Boolean).join(', '), beskrivelse: lead.beskrivelse,
        fundet: lead.fundet, side: lead.side, leadtype: lead.leadtype, utm: lead.utm, gclid: lead.gclid, fbclid: lead.fbclid,
        vaerdi: null, ansvarlig: '', filer, noter: [],
        historik: [{ ts: new Date(now).toISOString(), af: 'hjemmesiden', hvad: 'Modtaget via formularen' }],
        oprettet: lead.modtaget || new Date(now).toISOString(), opdateret: new Date(now).toISOString()
      };
      await put(rec);
      return rec;
    },
    async list() {
      const { blobs } = await store.list({ prefix: 'lead/' });
      const all = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
      return all.filter(Boolean).sort((a, b) => String(b.oprettet).localeCompare(String(a.oprettet)));
    },
    file: (id, n) => store.getWithMetadata(`fil/${id}/${n}`, { type: 'arrayBuffer' })
  };
}

/** Sender en mail via Mailgun (samme opsætning som lead-modtageren). */
async function sendMail(env, deps, to, subject, text) {
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN) throw new Error('Mailgun er ikke sat op');
  const host = (env.MAILGUN_REGION || 'eu') === 'us' ? 'api.mailgun.net' : 'api.eu.mailgun.net';
  const from = env.LEAD_FROM || `${env.BRAND_NAME || 'Hjemmesiden'} <hjemmeside@${env.MAILGUN_DOMAIN}>`;
  const body = new URLSearchParams({ from, to, subject, text });
  const res = await (deps.fetch || fetch)(`https://${host}/v3/${env.MAILGUN_DOMAIN}/messages`, { method: 'POST', body, headers: { Authorization: 'Basic ' + Buffer.from('api:' + env.MAILGUN_API_KEY).toString('base64') } });
  if (!res.ok) throw new Error('Mailgun ' + res.status);
}

async function readJson(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new Error('size');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Error('size');
  return text ? JSON.parse(text) : {};
}

/**
 * Admin-API. Alle stier ligger under /administrator-system/api/.
 * @param {Request} req
 * @param {Record<string,string|undefined>} env  ADMIN_USERS, ADMIN_SECRET
 * @param {{ store: any, now?: () => number, ip?: string }} deps
 */
export async function handleAdmin(req, env, deps) {
  const now = (deps.now || Date.now)();
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/administrator-system\/api\/?/, '').replace(/\/$/, '');
  const method = req.method;
  const secret = env.ADMIN_SECRET || '';
  const users = parseUsers(env.ADMIN_USERS);
  if (secret.length < 32 || users.size === 0) return json(503, { ok: false, error: 'ikke-sat-op', message: 'CRM er ikke sat op endnu (ADMIN_USERS og ADMIN_SECRET mangler på Netlify).' });
  const crm = crmStore(deps.store);
  const store = deps.store;
  const hashFor = async u => (await store.get(`bruger/${u}`, { type: 'json' }))?.hash || users.get(u)?.hash;

  // Ændringer skal komme fra vores egen side (CSRF-værn ud over SameSite=Strict).
  if (method !== 'GET') {
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return json(403, { ok: false, error: 'origin' });
    if (req.headers.get('x-vk-admin') !== '1') return json(403, { ok: false, error: 'header' });
  }

  // ---------- login ----------
  if (route === 'login' && method === 'POST') {
    let body; try { body = await readJson(req); } catch { return json(400, { ok: false, error: 'format' }); }
    const user = clean(body.bruger, 60).toLowerCase();
    const keys = [throttleKey('ip', deps.ip || 'ukendt', secret), throttleKey('bruger', user, secret)];
    const states = await Promise.all(keys.map(k => deps.store.get(k, { type: 'json' })));
    if (states.some(s => s && s.until > now)) return json(429, { ok: false, error: 'laast', message: 'For mange forsøg. Prøv igen om 15 minutter.' });
    const stored = users.has(user) ? await hashFor(user) : '';
    const ok = verifyPassword(String(body.kode || ''), stored);
    if (!ok) {
      await Promise.all(keys.map((k, i) => {
        const fails = (states[i]?.until && states[i].until <= now ? 0 : states[i]?.fails || 0) + 1;
        return deps.store.setJSON(k, { fails, until: fails >= MAX_FAILS ? now + LOCK_MS : 0 });
      }));
      return json(401, { ok: false, error: 'login', message: 'Forkert brugernavn eller adgangskode.' });
    }
    await Promise.all(keys.map(k => deps.store.delete(k)));
    return json(200, { ok: true, bruger: user }, { 'Set-Cookie': sessionCookie(signSession(user, secret, now, passVersion(stored))) });
  }

  // ---------- glemt adgangskode ----------
  // Svarer altid det samme, så man ikke kan bruge formularen til at finde brugernavne.
  if (route === 'glemt' && method === 'POST') {
    let body; try { body = await readJson(req); } catch { return json(400, { ok: false, error: 'format' }); }
    const q = clean(body.bruger, 160).toLowerCase();
    const generic = json(200, { ok: true, message: 'Hvis brugeren findes, har vi sendt en mail med et link til at vælge en ny adgangskode. Linket virker i 30 minutter.' });
    const entry = [...users.entries()].find(([n, u]) => n === q || (u.email && u.email === q));
    if (!entry || !entry[1].email) return generic;
    const key = throttleKey('glemt', entry[0], secret);
    const st = await store.get(key, { type: 'json' });
    const count = st && st.until > now ? st.count : 0;
    if (count >= 3) return generic;
    await store.setJSON(key, { count: count + 1, until: now + LOCK_MS });
    const token = newToken();
    await store.setJSON(`nulstil/${sha256(token)}`, { u: entry[0], exp: now + RESET_MS });
    const link = `${url.origin}/administrator-system/?nulstil=${token}`;
    try { await sendMail(env, deps, entry[1].email, 'Vælg en ny adgangskode', `Hej\n\nDer er bedt om en ny adgangskode til henvendelserne på ${url.host}.\n\nVælg en ny her (linket virker i 30 minutter og kan kun bruges én gang):\n${link}\n\nHar du ikke bedt om det, kan du se bort fra mailen. Din nuværende adgangskode virker stadig.`); }
    catch (e) { (deps.log || console.error)('[admin] nulstillingsmail fejlede', e?.message); }
    return generic;
  }
  if (route === 'nulstil' && method === 'POST') {
    let body; try { body = await readJson(req); } catch { return json(400, { ok: false, error: 'format' }); }
    const tkey = `nulstil/${sha256(String(body.token || ''))}`;
    const t = await store.get(tkey, { type: 'json' });
    if (!t || t.exp < now || !users.has(t.u)) return json(400, { ok: false, error: 'link', message: 'Linket er udløbet eller allerede brugt. Bed om et nyt.' });
    let hash; try { hash = hashPassword(String(body.kode || '')); } catch (e) { return json(400, { ok: false, error: 'kode', message: e.message }); }
    await store.setJSON(`bruger/${t.u}`, { hash, opdateret: new Date(now).toISOString() });
    await store.delete(tkey);
    return json(200, { ok: true, message: 'Din nye adgangskode er gemt. Log ind med den.' });
  }
  if (route === 'logout' && method === 'POST') return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', { clear: true }) });

  // ---------- alt herunder kræver login ----------
  const session = readSession(getCookie(req), secret, now);
  if (!session || !users.has(session.u)) return json(401, { ok: false, error: 'login' });
  // Er adgangskoden skiftet siden login, er sessionen ikke længere gyldig.
  if (session.pv !== passVersion(await hashFor(session.u))) return json(401, { ok: false, error: 'login' });
  const me = session.u;
  const stamp = hvad => ({ ts: new Date(now).toISOString(), af: me, hvad });

  if (route === 'me' && method === 'GET') return json(200, { ok: true, bruger: me, statuser: STATUSES });

  if (route === 'leads' && method === 'GET') return json(200, { ok: true, leads: await crm.list() });

  if (route === 'leads' && method === 'POST') {
    let b; try { b = await readJson(req); } catch { return json(400, { ok: false, error: 'format' }); }
    const rec = { id: newId(now), status: STATUSES.includes(b.status) ? b.status : 'ny', kilde: 'manuel', vaerdi: null, filer: [], noter: [], side: '', historik: [stamp('Oprettet manuelt')], oprettet: new Date(now).toISOString(), opdateret: new Date(now).toISOString() };
    for (const [k, max] of Object.entries(EDITABLE)) rec[k] = clean(b[k], max);
    if (!rec.navn) return json(400, { ok: false, error: 'felter', message: 'Navn mangler' });
    if (b.vaerdi !== undefined && b.vaerdi !== '' && Number.isFinite(Number(b.vaerdi))) rec.vaerdi = Math.max(0, Math.round(Number(b.vaerdi)));
    if (b.note) rec.noter.push({ ts: rec.oprettet, af: me, tekst: clean(b.note, 2000) });
    await crm.put(rec);
    return json(201, { ok: true, lead: rec });
  }

  const m = route.match(/^leads\/([a-z0-9-]{6,40})$/i);
  if (m && method === 'PATCH') {
    const rec = await crm.get(m[1]);
    if (!rec) return json(404, { ok: false, error: 'findes-ikke' });
    let b; try { b = await readJson(req); } catch { return json(400, { ok: false, error: 'format' }); }
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return json(400, { ok: false, error: 'status' });
      if (b.status !== rec.status) { rec.historik.push(stamp(`Status: ${rec.status} → ${b.status}`)); rec.status = b.status; }
    }
    for (const [k, max] of Object.entries(EDITABLE)) if (b[k] !== undefined) {
      const v = clean(b[k], max);
      if (v !== (rec[k] || '')) { rec[k] = v; rec.historik.push(stamp(`Ændrede ${k}`)); }
    }
    if (b.vaerdi !== undefined) {
      const v = b.vaerdi === '' || b.vaerdi === null ? null : Number(b.vaerdi);
      if (v !== null && !Number.isFinite(v)) return json(400, { ok: false, error: 'vaerdi' });
      rec.vaerdi = v === null ? null : Math.max(0, Math.round(v));
    }
    if (b.note) rec.noter.push({ ts: new Date(now).toISOString(), af: me, tekst: clean(b.note, 2000) });
    rec.historik = rec.historik.slice(-200);
    rec.opdateret = new Date(now).toISOString();
    await crm.put(rec);
    return json(200, { ok: true, lead: rec });
  }

  const f = route.match(/^filer\/([a-z0-9-]{6,40})\/(\d{1,2})$/i);
  if (f && method === 'GET') {
    const got = await crm.file(f[1], Number(f[2]));
    if (!got?.data) return json(404, { ok: false, error: 'findes-ikke' });
    const type = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(got.metadata?.type || '') ? got.metadata.type : 'application/octet-stream';
    const name = String(got.metadata?.navn || 'fil').replace(/[^\w.\-æøåÆØÅ ]+/g, '_');
    const inline = type.startsWith('image/');
    return new Response(got.data, { status: 200, headers: {
      'Content-Type': type, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox", 'X-Robots-Tag': 'noindex'
    } });
  }

  return json(404, { ok: false, error: 'ukendt' });
}
