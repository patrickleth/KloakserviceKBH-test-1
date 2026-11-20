// Kør: npm run test:lead
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleLead, confirmMail } from '../netlify/lib/lead-core.mjs';
import { crmStore } from '../netlify/lib/crm-core.mjs';

const NOW = 1_800_000_000_000;
const env = { BRAND_NAME: 'Testfirma', MAKE_WEBHOOK_URL: 'https://hook.eu1.make.com/x', MAILGUN_API_KEY: 'k', MAILGUN_DOMAIN: 'mg.example.dk', LEAD_TO: 'kunde@example.dk', ALERT_EMAIL: 'alarm@example.dk', CONFIRM_TO_LEAD: 'false' };
const good = { navn: 'Jens Hansen', telefon: '12 34 56 78', email: 'jens@example.dk', beskrivelse: 'Ny terrasse på 30 m2', ydelser: ['Terrasse'], side: 'https://example.dk/terrasse/', leadtype: 'formular', gclid: 'abc', t: '20000' };

function fakeFetch(plan = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const key = String(url).includes('make.com') ? 'make' : String(url).includes('mailgun') ? 'mailgun' : 'other';
    const status = typeof plan[key] === 'function' ? plan[key](calls) : plan[key] ?? 200;
    return new Response('{}', { status });
  };
  fn.calls = calls;
  return fn;
}
const req = (body, headers = {}) => new Request('https://example.dk/api/lead', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', origin: 'https://example.dk', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const run = (body, f, e = env, headers) => handleLead(req(body, headers), e, { fetch: f, now: () => NOW, log: () => {} });

test('godt lead leveres til både leadlog og mail', async () => {
  const f = fakeFetch();
  const r = await run(good, f);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.ok && j.id);
  assert.equal(f.calls.filter(c => c.url.includes('make.com')).length, 1);
  const mails = f.calls.filter(c => c.url.includes('mailgun'));
  assert.equal(mails.length, 1);
  assert.match(mails[0].url, /api\.eu\.mailgun\.net\/v3\/mg\.example\.dk\/messages/);
  const logged = JSON.parse(f.calls.find(c => c.url.includes('make.com')).init.body);
  for (const k of ['side', 'utm', 'gclid', 'fbclid', 'leadtype', 'kvalitet', 'id', 'modtaget']) assert.ok(k in logged, `leadlog mangler ${k}`);
  assert.equal(logged.gclid, 'abc');
});

test('mailen har reply-to til den besøgende og ingen rå HTML fra input', async () => {
  const f = fakeFetch();
  await run({ ...good, beskrivelse: '<script>alert(1)</script>' }, f);
  const body = f.calls.find(c => c.url.includes('mailgun')).init.body;
  assert.equal(body.get('h:Reply-To'), '"Jens Hansen" <jens@example.dk>');
  assert.ok(!body.get('html').includes('<script>'));
});

test('leadlog nede: lead går stadig igennem, og der sendes alarm', async () => {
  const f = fakeFetch({ make: 500 });
  const r = await run(good, f);
  assert.equal(r.status, 200);
  const mails = f.calls.filter(c => c.url.includes('mailgun')).map(c => c.init.body.get('to'));
  assert.deepEqual(mails.sort(), ['alarm@example.dk', 'kunde@example.dk']);
});

test('mail nede: lead går igennem via leadlog, alarm via webhook', async () => {
  const f = fakeFetch({ mailgun: 500 });
  const r = await run(good, f, { ...env, ALERT_WEBHOOK_URL: 'https://alarm.example.dk/hook' });
  assert.equal(r.status, 200);
  assert.ok(f.calls.some(c => c.url === 'https://alarm.example.dk/hook'));
});

test('begge kanaler nede giver 502, så formularen viser telefonnummeret', async () => {
  const r = await run(good, fakeFetch({ make: 500, mailgun: 500 }));
  assert.equal(r.status, 502);
});

test('honeypot og for hurtig udfyldning afvises stille', async () => {
  for (const body of [{ ...good, hp_kontrol: 'spam.example' }, { ...good, t: '500' }]) {
    const f = fakeFetch();
    const r = await run(body, f);
    assert.equal(r.status, 200);
    assert.equal(f.calls.length, 0, 'spam må ikke sendes videre');
  }
});

test('manglende felter giver 400 med feltnavne', async () => {
  const r = await run({ navn: '', telefon: '123', email: 'nej', beskrivelse: '' }, fakeFetch());
  assert.equal(r.status, 400);
  assert.deepEqual((await r.json()).fields, ['navn', 'telefon', 'email', 'beskrivelse']);
});

test('fremmed origin afvises', async () => {
  const r = await run(good, fakeFetch(), env, { origin: 'https://ondsindet.example' });
  assert.equal(r.status, 403);
});

test('kun GET afvises med 405', async () => {
  const r = await handleLead(new Request('https://example.dk/api/lead'), env, { fetch: fakeFetch() });
  assert.equal(r.status, 405);
});

test('formular uden JavaScript (urlencoded) virker og giver takkeside', async () => {
  const body = new URLSearchParams({ ...good, ydelser: 'Terrasse' }).toString();
  const r = await handleLead(new Request('https://example.dk/api/lead', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }), env, { fetch: fakeFetch(), now: () => NOW, log: () => {} });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Tak for din henvendelse/);
});

test('ingen kanaler sat op giver 500 med tydelig logbesked', async () => {
  const msgs = [];
  const r = await handleLead(req(good), { BRAND_NAME: 'x' }, { fetch: fakeFetch(), now: () => NOW, log: m => msgs.push(m) });
  assert.equal(r.status, 500);
  assert.match(msgs[0], /MAKE_WEBHOOK_URL/);
});

test('for stor forespørgsel afvises', async () => {
  const r = await run({ ...good, beskrivelse: 'x'.repeat(40000) }, fakeFetch());
  assert.equal(r.status, 413);
});

test('forkert ur hos den besøgende giver ikke tabt lead (t er forløbet tid, ikke klokkeslæt)', async () => {
  const f = fakeFetch();
  const r = await run({ ...good, t: '45000' }, f);
  assert.equal(r.status, 200);
  assert.equal(f.calls.filter(c => c.url.includes('make.com')).length, 1);
});

test('linjeskift i navnet fjernes fra emne og Reply-To', async () => {
  const f = fakeFetch();
  await run({ ...good, navn: 'Jens\r\nBcc: x@y.dk' }, f);
  const body = f.calls.find(c => c.url.includes('mailgun')).init.body;
  assert.ok(!/[\r\n]/.test(body.get('subject')) && !/[\r\n]/.test(body.get('h:Reply-To')));
});

test('kun én kanal sat op: ingen alarm ved hvert lead', async () => {
  const f = fakeFetch();
  const { MAKE_WEBHOOK_URL, ...mailOnly } = env;
  const r = await run(good, f, mailOnly);
  assert.equal(r.status, 200);
  assert.deepEqual(f.calls.filter(c => c.url.includes('mailgun')).map(c => c.init.body.get('to')), ['kunde@example.dk']);
});

test('alarm og kvittering lægges i baggrunden, når waitUntil findes', async () => {
  const f = fakeFetch({ make: 500 });
  const waits = [];
  const r = await handleLead(req(good), { ...env, CONFIRM_TO_LEAD: 'true' }, { fetch: f, now: () => NOW, log: () => {}, waitUntil: p => waits.push(p) });
  assert.equal(r.status, 200);
  assert.equal(waits.length, 2);
  await Promise.all(waits);
});

test('valideringsfejl uden JavaScript giver en læsbar side, ikke JSON', async () => {
  const r = await handleLead(new Request('https://example.dk/api/lead', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'navn=' }), env, { fetch: fakeFetch(), now: () => NOW, log: () => {} });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /mangler oplysninger/);
});

test('vedhæftede filer sendes med mailen, og leadloggen får filnavne', async () => {
  const f = fakeFetch();
  const fd = new FormData();
  for (const [k, v] of Object.entries(good)) fd.append(k, Array.isArray(v) ? v[0] : v);
  fd.append('filer', new File([new Uint8Array(2000)], 'kloak.jpg', { type: 'image/jpeg' }));
  fd.append('filer', new File([new Uint8Array(1000)], 'tilbud.pdf', { type: 'application/pdf' }));
  const r = await handleLead(new Request('https://example.dk/api/lead', { method: 'POST', headers: { accept: 'application/json', origin: 'https://example.dk' }, body: fd }), env, { fetch: f, now: () => NOW, log: () => {} });
  assert.equal(r.status, 200);
  const mail = f.calls.find(c => c.url.includes('mailgun')).init.body;
  assert.ok(mail instanceof FormData);
  assert.deepEqual(mail.getAll('attachment').map(a => a.name), ['kloak.jpg', 'tilbud.pdf']);
  const logged = JSON.parse(f.calls.find(c => c.url.includes('make.com')).init.body);
  assert.deepEqual(logged.filer.map(x => x.navn), ['kloak.jpg', 'tilbud.pdf']);
});

test('forkert filtype og for mange filer afvises', async () => {
  const mk = files => { const fd = new FormData(); for (const [k, v] of Object.entries(good)) fd.append(k, Array.isArray(v) ? v[0] : v); files.forEach(x => fd.append('filer', x)); return new Request('https://example.dk/api/lead', { method: 'POST', headers: { accept: 'application/json' }, body: fd }); };
  let r = await handleLead(mk([new File(['x'], 'virus.exe', { type: 'application/x-msdownload' })]), env, { fetch: fakeFetch(), now: () => NOW, log: () => {} });
  assert.equal(r.status, 400);
  r = await handleLead(mk(Array.from({ length: 7 }, (_, i) => new File(['x'], `b${i}.jpg`, { type: 'image/jpeg' }))), env, { fetch: fakeFetch(), now: () => NOW, log: () => {} });
  assert.equal(r.status, 400);
});

test('uden JavaScript sendes man videre til takkesiden', async () => {
  const body = new URLSearchParams({ ...good, ydelser: 'Terrasse', tak: '/henvendelse/' }).toString();
  const r = await handleLead(new Request('https://example.dk/api/lead', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }), env, { fetch: fakeFetch(), now: () => NOW, log: () => {} });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/henvendelse/');
});

// ---------- Bekræftelse til den besøgende ----------
function memStore() {
  const m = new Map();
  return {
    get: async (k) => m.has(k) ? JSON.parse(m.get(k)) : null,
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    set: async (k, v) => { m.set(k, JSON.stringify(null)); },
    list: async () => ({ blobs: [] }), delete: async k => m.delete(k)
  };
}

test('bekræftelse sendes som standard fra eget afsenderdomæne, uden den besøgendes tekst', async () => {
  const f = fakeFetch();
  const { CONFIRM_TO_LEAD, ...on } = env;
  const r = await handleLead(req(good), { ...on, CONFIRM_MAILGUN_DOMAIN: 'b.indsendelse.dk', CONFIRM_FROM: 'Testfirma <bekraeftelse@b.indsendelse.dk>', CONFIRM_PHONE: '12 34 56 78' }, { fetch: f, now: () => NOW, log: () => {} });
  assert.equal(r.status, 200);
  const c = f.calls.find(c => c.url.includes('mailgun') && c.init.body.get('to') === 'jens@example.dk');
  assert.ok(c, 'bekræftelsen blev sendt');
  assert.match(c.url, /b\.indsendelse\.dk/);
  assert.equal(c.init.body.get('from'), 'Testfirma <bekraeftelse@b.indsendelse.dk>');
  assert.doesNotMatch(c.init.body.get('text'), /terrasse/i);
  assert.match(c.init.body.get('text'), /12 34 56 78/);
});

test('bekræftelse: navn der ligner et link bruges ikke', () => {
  assert.match(confirmMail({ navn: 'Jens Hansen' }, 'X').text, /^Hej Jens\n/);
  assert.match(confirmMail({ navn: 'Vind nu på www.spam.dk' }, 'X').text, /^Hej\n/);
  assert.match(confirmMail({ navn: 'https://x.io' }, 'X').text, /^Hej\n/);
});

test('bekræftelse: højst én pr. adresse pr. døgn', async () => {
  const crm = crmStore(memStore());
  assert.equal(await crm.confirmOnce('Jens@Example.dk', NOW), true);
  assert.equal(await crm.confirmOnce('jens@example.dk', NOW + 1000), false);
  assert.equal(await crm.confirmOnce('jens@example.dk', NOW + 25 * 3600 * 1000), true);
});

test('bekræftelse kan slås fra pr. kunde', async () => {
  const f = fakeFetch();
  await handleLead(req(good), { ...env, CONFIRM_TO_LEAD: 'false' }, { fetch: f, now: () => NOW, log: () => {} });
  assert.equal(f.calls.filter(c => c.url.includes('mailgun') && c.init.body.get('to') === 'jens@example.dk').length, 0);
});
