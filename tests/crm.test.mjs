// Tests af mini-CRM'et (login, lås, leads, filer) og af at lead-modtageren gemmer i CRM'et.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdmin, crmStore } from '../netlify/lib/crm-core.mjs';
import { hashPassword, readSession } from '../netlify/lib/admin-auth.mjs';
import { handleLead } from '../netlify/lib/lead-core.mjs';

function memStore() {
  const m = new Map();
  return {
    m,
    async get(k, o) { const v = m.get(k); if (!v) return null; return o?.type === 'json' ? JSON.parse(v.data) : v.data; },
    async getWithMetadata(k) { const v = m.get(k); return v ? { data: v.data, metadata: v.metadata } : null; },
    async setJSON(k, obj) { m.set(k, { data: JSON.stringify(obj) }); },
    async set(k, data, o = {}) { m.set(k, { data, metadata: o.metadata || {} }); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const SECRET = 'x'.repeat(40);
const env = { ADMIN_SECRET: SECRET, ADMIN_USERS: `patrick:${hashPassword('korrekt-hest-batteri')}` };
const BASE = 'https://kunde.dk/administrator-system/api/';
const req = (path, { method = 'GET', body, cookie, headers = {} } = {}) => new Request(BASE + path, {
  method, body: body ? JSON.stringify(body) : undefined,
  headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'X-VK-Admin': '1', Origin: 'https://kunde.dk' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }
});
async function login(store, now = Date.now()) {
  const r = await handleAdmin(req('login', { method: 'POST', body: { bruger: 'Patrick', kode: 'korrekt-hest-batteri' } }), env, { store, now: () => now, ip: '1.2.3.4' });
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(sc, /Path=\/administrator-system/);
  return sc.split(';')[0];
}

test('uden opsætning svarer API 503', async () => {
  const r = await handleAdmin(req('me'), {}, { store: memStore() });
  assert.equal(r.status, 503);
});

test('kræver login', async () => {
  const r = await handleAdmin(req('leads'), env, { store: memStore() });
  assert.equal(r.status, 401);
});

test('login, opret manuelt lead, flyt status og tilføj note', async () => {
  const store = memStore();
  const cookie = await login(store);
  let r = await handleAdmin(req('leads', { method: 'POST', cookie, body: { navn: 'Jens Hansen', telefon: '12345678', ydelse: 'Kloakrens', vaerdi: '12500', note: 'Ringede ind' } }), env, { store });
  assert.equal(r.status, 201);
  const { lead } = await r.json();
  assert.equal(lead.kilde, 'manuel');
  assert.equal(lead.vaerdi, 12500);
  assert.equal(lead.noter.length, 1);
  r = await handleAdmin(req(`leads/${lead.id}`, { method: 'PATCH', cookie, body: { status: 'tilbud', note: 'Tilbud sendt på mail' } }), env, { store });
  const upd = (await r.json()).lead;
  assert.equal(upd.status, 'tilbud');
  assert.equal(upd.noter.length, 2);
  assert.ok(upd.historik.some(h => /ny → tilbud/.test(h.hvad)));
  r = await handleAdmin(req('leads', { cookie }), env, { store });
  assert.equal((await r.json()).leads.length, 1);
});

test('ugyldig status afvises', async () => {
  const store = memStore();
  const cookie = await login(store);
  const { lead } = await (await handleAdmin(req('leads', { method: 'POST', cookie, body: { navn: 'A' } }), env, { store })).json();
  const r = await handleAdmin(req(`leads/${lead.id}`, { method: 'PATCH', cookie, body: { status: 'hacket' } }), env, { store });
  assert.equal(r.status, 400);
});

test('ændringer uden X-VK-Admin eller fra fremmed domæne afvises', async () => {
  const store = memStore();
  const cookie = await login(store);
  let r = await handleAdmin(new Request(BASE + 'leads', { method: 'POST', body: '{"navn":"x"}', headers: { Cookie: cookie, 'Content-Type': 'application/json' } }), env, { store });
  assert.equal(r.status, 403);
  r = await handleAdmin(req('leads', { method: 'POST', cookie, body: { navn: 'x' }, headers: { Origin: 'https://ond.dk' } }), env, { store });
  assert.equal(r.status, 403);
});

test('forkert kode 5 gange låser i 15 minutter', async () => {
  const store = memStore();
  const t0 = 1_800_000_000_000;
  for (let i = 0; i < 5; i++) {
    const r = await handleAdmin(req('login', { method: 'POST', body: { bruger: 'patrick', kode: 'forkert' } }), env, { store, now: () => t0, ip: '9.9.9.9' });
    assert.equal(r.status, 401);
  }
  let r = await handleAdmin(req('login', { method: 'POST', body: { bruger: 'patrick', kode: 'korrekt-hest-batteri' } }), env, { store, now: () => t0 + 1000, ip: '9.9.9.9' });
  assert.equal(r.status, 429);
  r = await handleAdmin(req('login', { method: 'POST', body: { bruger: 'patrick', kode: 'korrekt-hest-batteri' } }), env, { store, now: () => t0 + 16 * 60e3, ip: '9.9.9.9' });
  assert.equal(r.status, 200);
});

test('forfalsket eller udløbet session afvises', async () => {
  const store = memStore();
  const cookie = await login(store, 1_000);
  const token = cookie.split('=')[1];
  assert.equal(readSession(token, SECRET, 13 * 3600e3), null);
  assert.equal(readSession(token.slice(0, -2) + 'xx', SECRET, 2_000), null);
  const r = await handleAdmin(req('leads', { cookie: 'vk_admin=abc.def' }), env, { store });
  assert.equal(r.status, 401);
});

test('lead fra formularen lander i CRM med filer, også når Make og Mailgun ikke er sat op', async () => {
  const store = memStore();
  const fd = new FormData();
  for (const [k, v] of Object.entries({ navn: 'Mette', telefon: '22334455', email: 'm@ex.dk', beskrivelse: 'Stoppet afløb', side: 'https://kunde.dk/', t: '9000', fundet: 'Google', postnr: '2650', by: 'Hvidovre' })) fd.append(k, v);
  fd.append('filer', new File([new Uint8Array([255, 216, 255, 0])], 'afløb.jpg', { type: 'image/jpeg' }));
  const r = await handleLead(new Request('https://kunde.dk/api/lead', { method: 'POST', body: fd, headers: { Accept: 'application/json' } }), {}, { crm: crmStore(store), log: () => {} });
  assert.equal(r.status, 200);
  const cookie = await login(store);
  const leads = (await (await handleAdmin(req('leads', { cookie }), env, { store })).json()).leads;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].status, 'ny');
  assert.equal(leads[0].fundet, 'Google');
  assert.equal(leads[0].by, 'Hvidovre');
  assert.equal(leads[0].filer[0].navn, 'afløb.jpg');
  const f = await handleAdmin(req(`filer/${leads[0].id}/0`, { cookie }), env, { store });
  assert.equal(f.status, 200);
  assert.equal(f.headers.get('content-type'), 'image/jpeg');
  assert.match(f.headers.get('content-security-policy'), /sandbox/);
});

test('CRM-fejl giver alarm, men leadet går igennem via mail', async () => {
  const sent = [];
  const fakeFetch = async (url, init) => { sent.push(String(url)); return new Response('{}', { status: 200 }); };
  const env2 = { MAILGUN_API_KEY: 'k', MAILGUN_DOMAIN: 'mg.ex.dk', LEAD_TO: 'kunde@ex.dk', ALERT_EMAIL: 'alarm@ex.dk', CONFIRM_TO_LEAD: 'false' };
  const r = await handleLead(new Request('https://kunde.dk/api/lead', { method: 'POST', body: JSON.stringify({ navn: 'A', telefon: '12345678', email: 'a@ex.dk', beskrivelse: 'x', t: 9000 }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }), env2, { fetch: fakeFetch, crm: { saveFromForm: async () => { throw new Error('blobs nede'); } }, log: () => {} });
  assert.equal(r.status, 200);
  assert.equal(sent.filter(u => u.includes('mailgun')).length, 2); // leadmail + alarm
});

test('glemt adgangskode: mail med link, ny kode virker, gammel kode og gamle sessioner gør ikke', async () => {
  const store = memStore();
  const mails = [];
  const fetchMock = async (u, init) => { mails.push(Object.fromEntries(init.body)); return new Response('{}', { status: 200 }); };
  const env3 = { ...env, ADMIN_USERS: `patrick:ple@vaekster.dk:${hashPassword('korrekt-hest-batteri')}`, MAILGUN_API_KEY: 'k', MAILGUN_DOMAIN: 'mg.ex.dk' };
  const login3 = async kode => handleAdmin(req('login', { method: 'POST', body: { bruger: 'patrick', kode } }), env3, { store, ip: '5.5.5.5' });
  const old = (await login3('korrekt-hest-batteri')).headers.get('set-cookie').split(';')[0];
  // ukendt bruger får samme svar og ingen mail
  let r = await handleAdmin(req('glemt', { method: 'POST', body: { bruger: 'ukendt' } }), env3, { store, fetch: fetchMock });
  assert.equal(r.status, 200); assert.equal(mails.length, 0);
  r = await handleAdmin(req('glemt', { method: 'POST', body: { bruger: 'PLE@vaekster.dk' } }), env3, { store, fetch: fetchMock });
  assert.equal(r.status, 200); assert.equal(mails.length, 1); assert.equal(mails[0].to, 'ple@vaekster.dk');
  const token = mails[0].text.match(/nulstil=([\w-]+)/)[1];
  r = await handleAdmin(req('nulstil', { method: 'POST', body: { token, kode: 'kort' } }), env3, { store });
  assert.equal(r.status, 400);
  r = await handleAdmin(req('nulstil', { method: 'POST', body: { token, kode: 'en-helt-ny-kode-2026' } }), env3, { store });
  assert.equal(r.status, 200);
  // linket kan kun bruges én gang
  r = await handleAdmin(req('nulstil', { method: 'POST', body: { token, kode: 'en-tredje-kode-2026' } }), env3, { store });
  assert.equal(r.status, 400);
  assert.equal((await login3('korrekt-hest-batteri')).status, 401);
  assert.equal((await login3('en-helt-ny-kode-2026')).status, 200);
  r = await handleAdmin(req('leads', { cookie: old }), env3, { store });
  assert.equal(r.status, 401, 'gammel session skal være logget ud');
});

test('nulstillingslink udløber efter 30 minutter', async () => {
  const store = memStore();
  const mails = [];
  const env3 = { ...env, ADMIN_USERS: `patrick:ple@vaekster.dk:${hashPassword('korrekt-hest-batteri')}`, MAILGUN_API_KEY: 'k', MAILGUN_DOMAIN: 'mg.ex.dk' };
  const t0 = 1_800_000_000_000;
  await handleAdmin(req('glemt', { method: 'POST', body: { bruger: 'patrick' } }), env3, { store, now: () => t0, fetch: async (u, i) => { mails.push(Object.fromEntries(i.body)); return new Response('{}'); } });
  const token = mails[0].text.match(/nulstil=([\w-]+)/)[1];
  const r = await handleAdmin(req('nulstil', { method: 'POST', body: { token, kode: 'en-helt-ny-kode-2026' } }), env3, { store, now: () => t0 + 31 * 60e3 });
  assert.equal(r.status, 400);
});

test('stages kan tilpasses, men ikke fjernes mens der ligger leads i dem', async () => {
  const store = memStore();
  const cookie = await login(store);
  const { lead } = await (await handleAdmin(req('leads', { method: 'POST', cookie, body: { navn: 'A', naesteKontakt: '2026-12-01', prioritet: 'haster' } }), env, { store })).json();
  assert.equal(lead.naesteKontakt, '2026-12-01'); assert.equal(lead.prioritet, 'haster');
  let r = await handleAdmin(req('config/stages', { method: 'PUT', cookie, body: { stages: [{ id: 'kontaktet', navn: 'Kontaktet', farve: '#000000' }] } }), env, { store });
  assert.equal(r.status, 409);
  r = await handleAdmin(req('config/stages', { method: 'PUT', cookie, body: { stages: [{ id: 'ny', navn: 'Indbakke', farve: '#123456' }, { navn: 'Besigtigelse', farve: '#abcdef' }] } }), env, { store });
  assert.equal(r.status, 200);
  const { stages } = await r.json();
  assert.equal(stages[1].id, 'besigtigelse');
  r = await handleAdmin(req(`leads/${lead.id}`, { method: 'PATCH', cookie, body: { status: 'besigtigelse' } }), env, { store });
  assert.equal(r.status, 200);
  r = await handleAdmin(req(`leads/${lead.id}`, { method: 'PATCH', cookie, body: { status: 'tilbud' } }), env, { store });
  assert.equal(r.status, 400, 'gammel stage findes ikke længere');
  r = await handleAdmin(req(`leads/${lead.id}`, { method: 'PATCH', cookie, body: { naesteKontakt: 'i morgen' } }), env, { store });
  assert.equal(r.status, 400);
  r = await handleAdmin(req('config/views', { method: 'PUT', cookie, body: { views: [{ id: 'v1', navn: 'Haster', mode: 'list', filters: { prioritet: ['haster'] }, sort: { key: 'naesteKontakt', dir: 'asc' } }] } }), env, { store });
  const cfg = await (await handleAdmin(req('config', { cookie }), env, { store })).json();
  assert.equal(cfg.views[0].filters.prioritet[0], 'haster');
  assert.equal(cfg.stages.length, 2);
});
