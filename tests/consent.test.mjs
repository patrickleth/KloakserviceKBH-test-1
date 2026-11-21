// Samtykkelog: kun gyldige valg gemmes, ingen persondata, og CRM kan slå op og eksportere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleConsent, listConsents, consentsCsv } from '../server/consent-core.mjs';

function memStore() {
  const m = new Map();
  return {
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async get(k, o = {}) { const v = m.get(k); return v == null ? null : o.type === 'json' ? JSON.parse(v) : v; },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
    _m: m
  };
}
const good = { id: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', version: 'abcdef1234', method: 'reject_all', preferences: false, statistics: false, marketing: false, path: '/terrasse/' };
const req = (body, headers = {}) => new Request('https://firma.dk/api/consent', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://firma.dk', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('samtykke: gyldigt valg gemmes uden IP og browserdata', async () => {
  const store = memStore();
  const r = await handleConsent(req(good, { 'cf-connecting-ip': '1.2.3.4', 'user-agent': 'Test' }), {}, { store, now: Date.UTC(2026, 10, 21) });
  assert.equal(r.status, 204);
  const [raw] = [...store._m.values()];
  const rec = JSON.parse(raw);
  assert.deepEqual(Object.keys(rec).sort(), ['id', 'marketing', 'method', 'path', 'preferences', 'statistics', 'ts', 'version']);
  assert.equal(rec.ts, '2026-11-21T00:00:00.000Z');
  assert.doesNotMatch(raw, /1\.2\.3\.4|Test/);
});

test('samtykke: ugyldige felter og fremmede domæner afvises', async () => {
  const store = memStore();
  assert.equal((await handleConsent(req({ ...good, id: 'x' }), {}, { store })).status, 400);
  assert.equal((await handleConsent(req({ ...good, method: 'maybe' }), {}, { store })).status, 400);
  assert.equal((await handleConsent(req({ ...good, statistics: 'ja' }), {}, { store })).status, 400);
  assert.equal((await handleConsent(req('{ikke json'), {}, { store })).status, 400);
  assert.equal((await handleConsent(req(good, { origin: 'https://ond.example' }), {}, { store })).status, 403);
  assert.equal((await handleConsent(req({ ...good, path: 'x'.repeat(3000) }), {}, { store })).status, 413);
  assert.equal(store._m.size, 0);
});

test('samtykke: opslag på id, nyeste først, og CSV-eksport', async () => {
  const store = memStore();
  await handleConsent(req({ ...good, method: 'accept_all', statistics: true, marketing: true, preferences: true }), {}, { store, now: 1000 });
  await handleConsent(req(good), {}, { store, now: 2000 });
  await handleConsent(req({ ...good, id: 'ffffffff-0000' }), {}, { store, now: 3000 });
  const mine = await listConsents(store, { id: good.id.toUpperCase() });
  assert.deepEqual(mine.map(r => r.method), ['reject_all', 'accept_all']);
  const csv = consentsCsv(mine);
  assert.match(csv, /^ts;id;version;method;preferences;statistics;marketing;path\n/);
  assert.equal(csv.trim().split('\n').length, 3);
});
