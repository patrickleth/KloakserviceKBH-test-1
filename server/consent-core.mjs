// Samtykkelog: dokumentation for hvert valg i cookiebanneret.
// Gemmer samtykke-id, tidspunkt (serverens), bannerets version, valget pr. kategori, hvordan valget blev truffet og siden.
// Gemmer IKKE IP-adresse, browser eller andet, der kan pege på personen (dataminimering). Samtykke-id'et ligger
// kun i den besøgendes browser, så et valg kan slås op, hvis den besøgende selv oplyser id'et (vises på cookiepolitikken).

const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const ID_RE = /^[a-f0-9-]{8,40}$/i;
const VERSION_RE = /^[a-f0-9]{6,16}$/;
const METHODS = new Set(['accept_all', 'reject_all', 'custom']);
const MAX_BODY = 2048;

export async function handleConsent(req, env, { store, now = Date.now() } = {}) {
  if (req.method !== 'POST') return json(405, { ok: false });
  const origin = req.headers.get('origin');
  if (origin) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (origin !== new URL(req.url).origin && !allowed.includes(origin)) return json(403, { ok: false, error: 'origin' });
  }
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return json(413, { ok: false });
  let b;
  try { const raw = await req.text(); if (raw.length > MAX_BODY) return json(413, { ok: false }); b = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'json' }); }
  if (!b || !ID_RE.test(String(b.id)) || !VERSION_RE.test(String(b.version)) || !METHODS.has(b.method)) return json(400, { ok: false, error: 'felter' });
  for (const k of ['preferences', 'statistics', 'marketing']) if (typeof b[k] !== 'boolean') return json(400, { ok: false, error: 'felter' });
  const path = String(b.path || '').replace(/[^\w\-\/.%]/g, '').slice(0, 200);
  const rec = { id: String(b.id).toLowerCase(), ts: new Date(now).toISOString(), version: b.version, method: b.method, preferences: b.preferences, statistics: b.statistics, marketing: b.marketing, path };
  await store.setJSON(`samtykke/${now.toString(36)}-${rec.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`, rec);
  return json(204, null);
}

/** Samtykker til CRM'et: de nyeste først, evt. kun ét samtykke-id. */
export async function listConsents(store, { id = '', limit = 1000 } = {}) {
  let rows;
  if (store.listJSON) rows = await store.listJSON('samtykke/');
  else {
    const { blobs } = await store.list({ prefix: 'samtykke/' });
    rows = await Promise.all(blobs.map(x => store.get(x.key, { type: 'json' })));
  }
  rows = rows.filter(Boolean);
  if (id) rows = rows.filter(r => r.id === String(id).toLowerCase());
  return rows.sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, limit);
}

export function consentsCsv(rows) {
  const cols = ['ts', 'id', 'version', 'method', 'preferences', 'statistics', 'marketing', 'path'];
  return [cols.join(';'), ...rows.map(r => cols.map(c => String(r[c] ?? '').replace(/[;\n\r"]/g, ' ')).join(';'))].join('\n') + '\n';
}
