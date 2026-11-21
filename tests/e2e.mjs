// Browsertest af det, der koster leads eller bøder, hvis det går i stykker.
// Kør: npm run test:e2e   (bygger demokunden i produktionstilstand med et test-GTM-ID)
// Sæt CHROME_PATH, hvis Playwright ikke selv har en browser installeret.
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const KUNDE = 'eksempel';
execSync('npx astro build', { env: { ...process.env, KUNDE, MODE: 'production', GTM_ID: 'GTM-E2ETEST', META_PIXEL_ID: '1234567890', WORKERS_CI: '' }, stdio: 'ignore' });
const root = path.resolve('dist', KUNDE);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };
// Serverer de genererede sikkerhedsheadere (_headers, blokken for /*), så CSP også testes.
const headerBlock = fs.readFileSync(path.join(root, '_headers'), 'utf8').split(/\n(?=\/)/)[0];
const siteHeaders = Object.fromEntries(headerBlock.split('\n').slice(1).map(l => l.trim()).filter(Boolean).map(l => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
delete siteHeaders['Strict-Transport-Security'];
siteHeaders['Content-Security-Policy'] = siteHeaders['Content-Security-Policy'].replace('; upgrade-insecure-requests', '');
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', ...(p.endsWith('.html') ? siteHeaders : {}) });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

let passed = 0, failed = 0;
async function test(name, fn, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const cspErrors = [];
  page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) cspErrors.push(m.text()); });
  page.on('pageerror', e => cspErrors.push('JS: ' + e.message));
  const external = [];
  let apiStatus = 200; const apiBodies = []; const consentBodies = [];
  let adminIn = false;
  const now = new Date().toISOString();
  const adminLeads = [{ id: 'abc12345-x', status: 'ny', kilde: 'formular', navn: '<img src=x onerror=alert(1)>', telefon: '12345678', ydelse: 'Kloakrens', beskrivelse: 'Stoppet afløb', vaerdi: null, filer: [], noter: [], historik: [], oprettet: now, opdateret: now }];
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin === base) {
      if (u.pathname === '/api/lead') {
        const req = route.request();
        const ct = req.headers()['content-type'] || '';
        apiBodies.push(ct.includes('application/json') ? JSON.parse(req.postData()) : { multipart: true, raw: req.postDataBuffer()?.toString('latin1') || '' });
        return route.fulfill({ status: apiStatus, contentType: 'application/json', body: JSON.stringify(apiStatus === 200 ? { ok: true, id: 'e2e-1' } : { ok: false }) }); }
      if (u.pathname === '/api/consent') { try { consentBodies.push(JSON.parse(route.request().postData() || '{}')); } catch { consentBodies.push({ ugyldig: true }); } return route.fulfill({ status: 204 }); }
      if (u.pathname.startsWith('/administrator-system/api/')) {
        // Falsk CRM-API: ikke logget ind, indtil login kaldes.
        const r = u.pathname.slice('/administrator-system/api/'.length);
        const method = route.request().method();
        if (r === 'login') { adminIn = true; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
        if (!adminIn) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
        if (r === 'me') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"bruger":"test"}' });
        if (r === 'config') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stages: [{ id: 'ny', navn: 'Ny', farve: '#87909e' }, { id: 'kontaktet', navn: 'Kontaktet', farve: '#1090e0' }, { id: 'tilbud', navn: 'Tilbud sendt', farve: '#8b5cf6' }], views: [] }) });
        if (r === 'leads' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, leads: adminLeads }) });
        if (r.startsWith('leads/') && method === 'PATCH') { const l = adminLeads.find(x => x.id === r.slice(6)); const b = JSON.parse(route.request().postData()); if (b.note) { l.noter.push({ ts: new Date().toISOString(), af: 'test', tekst: b.note }); delete b.note; } Object.assign(l, b); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, lead: l }) }); }
      }
      return route.continue();
    }
    external.push(u.host + u.pathname); return route.abort();
  });
  const t = { page, ctx, external, apiBodies, consentBodies, setApi: s => { apiStatus = s; }, dl: () => page.evaluate(() => JSON.parse(JSON.stringify(window.dataLayer.map(x => (x && x.length !== undefined && typeof x !== 'string') ? Array.from(x) : x)))) };
  try { await fn(t); assert.equal(cspErrors.length, 0, 'CSP/JS-fejl: ' + cspErrors.join(' | ')); passed++; console.log('  ok    ' + name); }
  catch (e) { failed++; console.log('  FEJL  ' + name + '\n        ' + e.message.split('\n')[0]); }
  await ctx.close();
}
// Formularen i hero (kort variant: ét trin).
const F = '#tilbud-top';
async function fillForm(page) {
  await page.fill(`${F} [name=navn]`, 'Test Testesen');
  await page.fill(`${F} [name=email]`, 'test@example.dk');
  await page.fill(`${F} [name=telefon]`, '12345678');
  await page.fill(`${F} [name=adresse]`, 'Testvej 1, Hvidovre');
  await page.fill(`${F} [name=beskrivelse]`, 'E2E test');
  await page.waitForTimeout(2600); // tidstjekket i modtageren
  await page.click(`${F} [data-submit]`);
}

console.log('E2E for demokunden (produktionstilstand):');

await test('Consent Mode default er "denied" før alt andet', async ({ page, dl }) => {
  await page.goto(base + '/');
  const first = (await dl()).find(x => Array.isArray(x) && x[0] === 'consent');
  assert.deepEqual([first[1], first[2].ad_storage, first[2].ad_user_data, first[2].analytics_storage], ['default', 'denied', 'denied', 'denied']);
});

await test('Ingen kald til Google eller Meta før samtykke', async ({ page, external }) => {
  await page.goto(base + '/terrasse/');
  await page.waitForTimeout(800);
  assert.equal(external.length, 0, 'eksterne kald: ' + external.join(', '));
});

await test('Klik uden for banneret afviser eller accepterer ikke', async ({ page }) => {
  await page.goto(base + '/');
  await page.click('h1');
  assert.ok(await page.isVisible('.consent'), 'banneret forsvandt ved klik på siden');
  assert.equal(await page.evaluate(() => localStorage.getItem('vk_consent')), null);
});

await test('"Accepter alle" opdaterer samtykke og indlæser GTM først derefter', async ({ page, external, dl }) => {
  await page.goto(base + '/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=grant]');
  await page.waitForTimeout(300);
  const upd = (await dl()).find(x => Array.isArray(x) && x[0] === 'consent' && x[1] === 'update');
  assert.equal(upd[2].ad_user_data, 'granted');
  assert.ok(external.some(e => e.startsWith('www.googletagmanager.com/gtm.js')), 'GTM blev ikke indlæst');
});

await test('"Kun nødvendige" indlæser ikke GTM (Consent Mode basis)', async ({ page, external }) => {
  await page.goto(base + '/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=deny]');
  await page.waitForTimeout(500);
  assert.equal(external.length, 0, 'eksterne kald: ' + external.join(', '));
});

await test('gclid gemmes ikke i browseren før samtykke', async ({ page }) => {
  await page.goto(base + '/terrasse/?gclid=E2EGCLID');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('vk_gclid')), null);
  await page.click('[data-consent-banner] .consent-main [data-consent-action=grant]');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('vk_gclid')), 'E2EGCLID');
});

await test('Tilpas: kun statistik giver GTM men ikke Meta Pixel', async ({ page, external }) => {
  await page.goto(base + '/');
  await page.click('[data-consent-action=settings]');
  await page.check('[data-consent-form] [name=statistics]');
  await page.click('[data-consent-form] button[type=submit]');
  await page.waitForTimeout(300);
  assert.ok(external.some(e => e.startsWith('www.googletagmanager.com/gtm.js')), 'GTM skal indlæses ved statistik');
  assert.ok(!external.some(e => e.includes('facebook')), 'Meta må ikke indlæses uden marketing');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('vk_consent_v2')));
  assert.deepEqual([saved.statistics, saved.marketing, saved.preferences], [true, false, false]);
});

await test('Marketing-samtykke indlæser Meta Pixel', async ({ page, external }) => {
  await page.goto(base + '/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=grant]');
  await page.waitForTimeout(300);
  assert.ok(external.some(e => e.startsWith('connect.facebook.net')), 'Meta Pixel skal indlæses');
});

await test('Cookieindstillinger kan åbnes igen fra footeren', async ({ page }) => {
  await page.goto(base + '/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=grant]');
  assert.ok(!(await page.isVisible('[data-consent-banner]')));
  await page.click('footer [data-cookie-settings]');
  assert.ok(await page.isVisible('[data-consent-form]'));
  assert.ok(await page.isChecked('[data-consent-form] [name=marketing]'), 'tidligere valg vises');
  await page.click('[data-consent-form] [data-consent-action=deny]');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('vk_consent_v2')));
  assert.equal(saved.marketing, false);
});

await test('Samtykke: "Afvis alle" og "Accepter alle" er lige store og ens', async ({ page }) => {
  await page.goto(base + '/');
  const look = sel => page.$eval(sel, el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor, color: s.color, weight: s.fontWeight, size: s.fontSize, border: s.borderTopWidth }; });
  const deny = await look('[data-consent-banner] .consent-main [data-consent-action=deny]');
  const grant = await look('[data-consent-banner] .consent-main [data-consent-action=grant]');
  assert.deepEqual({ ...deny, w: 0 }, { ...grant, w: 0 }, 'knapperne ser forskellige ud');
  assert.ok(Math.abs(deny.w - grant.w) <= 2, `bredde ${deny.w} mod ${grant.w}`);
}, { mobile: false });

await test('Samtykke: knapperne er også ens på mobil', async ({ page }) => {
  await page.goto(base + '/');
  const box = sel => page.locator(sel).boundingBox();
  const d = await box('[data-consent-banner] .consent-main [data-consent-action=deny]');
  const g = await box('[data-consent-banner] .consent-main [data-consent-action=grant]');
  assert.ok(Math.abs(d.width - g.width) <= 2 && Math.abs(d.height - g.height) <= 2, `deny ${d.width}x${d.height}, grant ${g.width}x${g.height}`);
}, { mobile: true });

await test('Samtykke: valget logges med samtykke-id, version og metode', async ({ page, consentBodies }) => {
  await page.goto(base + '/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=deny]');
  await page.waitForTimeout(400);
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('vk_consent_v2')));
  const version = await page.evaluate(() => document.documentElement.dataset.consentVersion);
  assert.equal(consentBodies.length, 1, 'ingen logning');
  const b = consentBodies[0];
  assert.deepEqual([b.id, b.version, b.method, b.statistics, b.marketing, b.preferences], [saved.id, version, 'reject_all', false, false, false]);
  assert.ok(/^[a-f0-9-]{16,}$/.test(saved.id), 'samtykke-id mangler');
});

await test('Samtykke: "Tilpas" logges som custom', async ({ page, consentBodies }) => {
  await page.goto(base + '/');
  await page.click('[data-consent-action=settings]');
  await page.check('[data-consent-form] [name=statistics]');
  await page.click('[data-consent-form] button[type=submit]');
  await page.waitForTimeout(400);
  assert.equal(consentBodies.at(-1)?.method, 'custom');
});

await test('Samtykke: ældre end 12 måneder giver nyt banner og ingen sporing', async ({ page, ctx, external }) => {
  await page.goto(base + '/');
  const version = await page.evaluate(() => document.documentElement.dataset.consentVersion);
  await ctx.addInitScript(v => localStorage.setItem('vk_consent_v2', JSON.stringify({ v: 2, id: 'aaaaaaaa-bbbb', ts: Date.now() - 400 * 864e5, version: v, preferences: true, statistics: true, marketing: true })), version);
  await page.goto(base + '/terrasse/');
  await page.waitForTimeout(500);
  assert.ok(await page.isVisible('[data-consent-banner]'), 'banneret skal vises igen');
  assert.equal(external.length, 0, 'eksterne kald: ' + external.join(', '));
});

await test('Samtykke: ny version af banneret giver nyt banner', async ({ page, ctx, external }) => {
  await ctx.addInitScript(() => localStorage.setItem('vk_consent_v2', JSON.stringify({ v: 2, id: 'aaaaaaaa-bbbb', ts: Date.now(), version: '0000000000', preferences: true, statistics: true, marketing: true })));
  await page.goto(base + '/');
  await page.waitForTimeout(500);
  assert.ok(await page.isVisible('[data-consent-banner]'), 'banneret skal vises igen');
  assert.equal(external.length, 0, 'eksterne kald: ' + external.join(', '));
});

await test('Samtykke: tilbagetrækning sletter cookies og genindlæser siden', async ({ page, consentBodies }) => {
  await page.goto(base + '/terrasse/?gclid=E2EGCLID');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=grant]');
  await page.evaluate(() => { for (const c of ['_ga=GA1.1.1', '_ga_ABC123=GS1.1', '_gcl_au=1.1', '_fbp=fb.1.1', 'andet=behold']) document.cookie = c + '; path=/'; });
  await page.click('.cookie-fab');
  await Promise.all([page.waitForEvent('load'), page.click('[data-consent-form] [data-consent-action=deny]')]);
  const left = await page.evaluate(() => document.cookie);
  assert.ok(!/_ga|_gcl|_fbp/.test(left), 'cookies blev ikke slettet: ' + left);
  assert.ok(/andet=behold/.test(left), 'andre cookies må ikke slettes');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('vk_gclid')), null, 'gclid skal slettes');
  assert.ok(!(await page.isVisible('[data-consent-banner]')), 'valget skal huskes efter genindlæsning');
  assert.deepEqual(consentBodies.map(b => b.method), ['accept_all', 'reject_all']);
});

await test('Samtykke: cookiepolitikken viser erklæringen og dit samtykke-id', async ({ page }) => {
  await page.goto(base + '/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=grant]');
  const id = JSON.parse(await page.evaluate(() => localStorage.getItem('vk_consent_v2'))).id;
  await page.goto(base + '/cookies/');
  const txt = await page.textContent('#cookieerklaering');
  for (const name of ['vk_consent_v2', '_ga', '_gcl_au', '_fbp']) assert.ok(txt.includes(name), `${name} mangler i erklæringen`);
  assert.ok((await page.textContent('[data-consent-id]')).includes(id), 'samtykke-id vises ikke');
});

await test('Samtykke: /cookies.json har mønstre for alle erklærede cookies', async ({ page }) => {
  const r = await page.request.get(base + '/cookies.json');
  const j = await r.json();
  const names = j.cookies.map(c => c.name);
  for (const n of ['vk_consent_v2', '_ga', '_ga_*', '_gcl_au', '_fbp']) assert.ok(names.includes(n), n + ' mangler');
  assert.ok(j.cookies.every(c => typeof c.pattern === 'string' && new RegExp(c.pattern)), 'mønster mangler');
  assert.ok(new RegExp(j.cookies.find(c => c.name === '_ga_*').pattern).test('_ga_XYZ123'));
});

await test('Vedhæftet billede sendes med som multipart', async ({ page, apiBodies }) => {
  await page.goto(base + '/terrasse/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=deny]');
  await page.setInputFiles(`${F} input[type=file]`, { name: 'skade.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await page.waitForSelector(`${F} .file-list li`);
  await fillForm(page);
  await page.waitForURL('**/henvendelse/');
  assert.ok(apiBodies[0].multipart, 'skal sendes som multipart');
  assert.match(apiBodies[0].raw, /name="filer"; filename="skade\.(png|jpg)"/);
  assert.match(apiBodies[0].raw, /name="navn"/);
});

await test('Anmeldelser glider automatisk og kan ikke rulles manuelt', async ({ page }) => {
  await page.goto(base + '/');
  const anim = await page.$eval('.marquee', el => getComputedStyle(el).animationName);
  assert.equal(anim, 'marquee');
  const ov = await page.$eval('.reviews', el => getComputedStyle(el).overflowX);
  assert.equal(ov, 'hidden');
});

await test('Takkesiden for prisberegner virker med ?id= og tæller én gang', async ({ page, dl }) => {
  await page.goto(base + '/udfyldt-prisberegner/?id=pb-77&navn=Hans%20Hansen');
  assert.match(await page.textContent('h1'), /Hans/);
  const ev = (await dl()).filter(x => x && x.event === 'generate_lead');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].lead_type, 'prisberegner');
  assert.match(await page.getAttribute('meta[name=robots]', 'content'), /noindex/);
});

await test('Tom formular sendes ikke og viser en fejl', async ({ page, apiBodies }) => {
  await page.goto(base + '/terrasse/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=deny]');
  await page.click(`${F} [data-submit]`);
  assert.ok(await page.isVisible(`${F} .form-error`));
  assert.equal(await page.getAttribute(`${F} [name=navn]`, 'aria-invalid'), 'true');
  assert.equal(apiBodies.length, 0);
});

await test('"Indhent tilbud" lander ved kontaktformularen nederst', async ({ page }) => {
  await page.goto(base + '/terrasse/');
  assert.equal(await page.locator('#tilbud').count(), 1);
  assert.equal(await page.locator('#tilbud-top').count(), 1);
  assert.equal(await page.getAttribute('.hero-actions .btn-cta', 'href'), '#tilbud');
});

await test('Header bliver fast og hvid efter scroll', async ({ page }) => {
  await page.goto(base + '/terrasse/');
  assert.ok(!(await page.locator('.site-header.stuck').count()));
  await page.mouse.wheel(0, 1200); await page.waitForTimeout(300);
  assert.equal(await page.locator('.site-header.stuck').count(), 1);
});

await test('FAQ vises som harmonika med FAQPage-schema', async ({ page }) => {
  await page.goto(base + '/terrasse/');
  assert.ok((await page.locator('.faq-item').count()) >= 2);
  const ld = await page.$$eval('script[type="application/ld+json"]', s => s.map(x => JSON.parse(x.textContent)));
  assert.ok(ld.some(j => j['@type'] === 'FAQPage'));
});

await test('Uden samtykke: lead sendes uden gclid, og generate_lead kommer efter svaret', async ({ page, apiBodies, dl }) => {
  await page.goto(base + '/terrasse/?gclid=E2EGCLID&utm_source=google&utm_campaign=test');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=deny]');
  await fillForm(page);
  await page.waitForURL('**/henvendelse/');
  assert.equal(apiBodies.length, 1);
  assert.equal(apiBodies[0].gclid, '');
  assert.match(apiBodies[0].utm, /google/);
  assert.equal(apiBodies[0].side, 'https://eksempel.vaekster.dk/terrasse/');
  const ev = (await dl()).find(x => x && x.event === 'generate_lead');
  assert.equal(ev.lead_id, 'e2e-1', 'generate_lead skal sendes på takkesiden');
  assert.ok(!(await dl()).some(x => x && x.user_data), 'ingen udvidede konverteringsdata uden samtykke');
  await page.reload();
  assert.equal((await dl()).filter(x => x && x.event === 'generate_lead').length, 0, 'genindlæsning må ikke tælle igen');
});

await test('Med samtykke: gclid kommer med i leadet', async ({ page, apiBodies, dl }) => {
  await page.goto(base + '/terrasse/?gclid=E2EGCLID');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=grant]');
  await fillForm(page);
  await page.waitForURL('**/henvendelse/');
  assert.equal(apiBodies[0].gclid, 'E2EGCLID');
  assert.deepEqual(apiBodies[0].ydelser, ['Terrasse']);
  const d = await dl();
  assert.ok(d.some(x => x && x.user_data && x.user_data.email === 'test@example.dk'), 'udvidede konverteringer med samtykke');
  assert.ok(d.some(x => x && x.event === 'generate_lead'));
});

await test('Fejl hos modtageren: telefonnummer vises, og ingen konvertering registreres', async ({ page, setApi, dl }) => {
  setApi(502);
  await page.goto(base + '/terrasse/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=deny]');
  await fillForm(page);
  await page.waitForSelector(`${F} .form-error:not([hidden])`);
  assert.match(await page.textContent(`${F} .form-error`), /12 34 56 78/);
  assert.ok(!(await dl()).some(x => x && x.event === 'generate_lead'));
});

await test('Ingen vandret rulning på mobil', async ({ page }) => {
  for (const u of ['/', '/terrasse/', '/henvendelse/']) {
    await page.goto(base + u);
    const [cw, sw] = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
    assert.ok(sw <= cw, `${u}: siden er ${sw}px bred på en ${cw}px skærm`);
  }
}, { mobile: true });

await test('Mobilmenu åbner og lukker', async ({ page }) => {
  await page.goto(base + '/');
  assert.ok(!(await page.isVisible('#nav')));
  await page.click('.menu-btn');
  assert.ok(await page.isVisible('#nav'));
  assert.equal(await page.getAttribute('.menu-btn', 'aria-expanded'), 'true');
  await page.click('.menu-btn');
  assert.ok(!(await page.isVisible('#nav')));
}, { mobile: true });

await test('Telefonknap og tilbudsknap har hver sin farve og samme størrelse', async ({ page }) => {
  await page.goto(base + '/terrasse/');
  const [call, cta] = await Promise.all(['.hero-actions .btn-call', '.hero-actions .btn-cta'].map(s => page.$eval(s, e => { const r = e.getBoundingClientRect(); return { bg: getComputedStyle(e).backgroundColor, w: Math.round(r.width), h: Math.round(r.height) }; })));
  assert.notEqual(call.bg, cta.bg);
  assert.equal(call.w, cta.w); assert.equal(call.h, cta.h);
  const formBg = await page.$eval('#tilbud-top', e => getComputedStyle(e.closest('.form-card')).backgroundColor);
  assert.notEqual(formBg, call.bg, 'formularen må ikke have telefonknappens (akut) farve');
});

await test('Mobil: burgermenu uden tekst, ingen telefon i header, lige store sticky-knapper', async ({ page }) => {
  await page.goto(base + '/');
  assert.equal((await page.textContent('.menu-btn')).trim(), '');
  assert.ok(!(await page.isVisible('.header-phone')));
  const [a, b] = await Promise.all(['.sticky-pill', '.sticky-msg'].map(s => page.$eval(s, e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })));
  assert.deepEqual(a, b);
}, { mobile: true });

await test('Anmeldelser pauser ikke ved hover og har ingen pauseknap', async ({ page }) => {
  await page.goto(base + '/');
  assert.equal(await page.locator('[data-marquee-toggle]').count(), 0);
  await page.hover('.reviews .review-card', { force: true });
  assert.equal(await page.$eval('.reviews .marquee', e => getComputedStyle(e).animationPlayState), 'running');
});

await test('Cookieknap nederst til venstre åbner indstillingerne', async ({ page }) => {
  await page.goto(base + '/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=deny]');
  const box = await page.locator('.cookie-fab').boundingBox();
  assert.ok(box && box.x < 40, 'knappen skal sidde i venstre side');
  await page.click('.cookie-fab');
  assert.ok(await page.isVisible('[data-consent-form]'));
});

await test('Ydelseskort har baggrundsbillede', async ({ page }) => {
  await page.goto(base + '/');
  const n = await page.locator('.service-card').count();
  if (n) assert.equal(await page.locator('.service-card .service-bg, .service-card img.service-bg').count() > 0, true);
});

await test('Ingen indholdssektion uden billede', async ({ page }) => {
  for (const u of ['/', '/terrasse/']) {
    await page.goto(base + u);
    assert.equal(await page.locator('.content-sec .text-only').count(), 0, u);
    assert.equal(await page.locator('.person-cta img').count() > 0, true, u + ': person-CTA uden billede');
  }
});

await test('Mega-menu åbner ved hover, viser ikon og tekst og lukker igen', async ({ page }) => {
  await page.goto(base + '/');
  await page.hover('[data-mega] summary');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-mega] details').evaluate(d => d.open), true, 'åbner ved hover');
  const panel = await page.locator('.mega-panel').boundingBox();
  assert.ok(panel.width >= 1270, 'panelet fylder hele bredden');
  assert.ok(await page.locator('.mega-panel .mega-ic svg').count() >= 2, 'ikoner');
  await page.hover('[data-mega-item] >> nth=1');
  await page.waitForTimeout(500);
  await page.mouse.move(640, 899);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-mega] details').evaluate(d => d.open), false, 'lukker med Escape');
});

await test('Rundt billede over formularen og ingen overlinje uden overskrift', async ({ page }) => {
  await page.goto(base + '/');
  assert.ok(await page.locator('#tilbud .form-avatar').count() === 1, 'billede over kontaktformularen');
  const lonely = await page.$$eval('.eyebrow', els => els.filter(e => !/^H[1-3]$/.test(e.nextElementSibling?.tagName || '')).map(e => e.textContent));
  assert.deepEqual(lonely, []);
});

await test('Billeder i sektioner har samme højde som teksten på computer og 5:4 på mobil', async ({ page }) => {
  await page.goto(base + '/terrasse/');
  const r = await page.locator('.content-sec .split').first().evaluate(el => ({ img: el.querySelector('.sec-img').getBoundingClientRect().height, text: el.querySelector('.sec-text').getBoundingClientRect().height }));
  assert.ok(r.img >= r.text - 2, `billede ${r.img} mod tekst ${r.text}`);
  await page.setViewportSize({ width: 390, height: 844 });
  const ratio = await page.locator('.sec-img img').first().evaluate(i => i.getBoundingClientRect().width / i.getBoundingClientRect().height);
  assert.ok(Math.abs(ratio - 1.25) < 0.03, 'mobil 5:4, fik ' + ratio);
});

await test('llms.txt bygges med kontakt og ydelser', async () => {
  const t = fs.readFileSync(path.join(root, 'llms.txt'), 'utf8');
  assert.match(t, /^# /);
  assert.match(t, /## Kontakt/);
  assert.match(t, /## Ydelser/);
});

await test('CRM: login, board, liste, autosave og noter uden at lukke arket', async ({ page }) => {
  let alerted = false; page.on('dialog', d => { alerted = true; d.dismiss(); });
  await page.goto(base + '/administrator-system/');
  assert.equal(await page.getAttribute('meta[name=robots]', 'content'), 'noindex, nofollow');
  await page.waitForSelector('[data-login]');
  await page.fill('[data-login] [name=bruger]', 'test'); await page.fill('[data-login] [name=kode]', 'hemmelig-kode-123');
  await page.click('[data-login] button[type=submit]');
  await page.waitForSelector('.kcard');
  assert.match(await page.textContent('.kcard .k-name'), /<img/);
  assert.equal(alerted, false);
  await page.click('.kcard');
  await page.selectOption('.sheet .status-select', 'kontaktet');
  await page.waitForSelector('.sheet .saved.s-saved');
  await page.fill('.sheet .composer-input', 'Ringet op');
  await page.click('.sheet .send');
  await page.waitForSelector('.sheet .f-note');
  assert.ok(await page.isVisible('.sheet[data-task]'), 'arket skal blive åbent efter gem og note');
  await page.click('.sheet .sheet-bar .bar-btn');
  await page.waitForSelector('.sheet[data-task]', { state: 'hidden' });
  // nyt lead kan annulleres uden navn
  await page.click('[data-new]');
  await page.click('.sheet .sheet-bar .bar-btn');
  await page.waitForSelector('.sheet[data-task]', { state: 'hidden' });
  await page.click('[data-mode=list]');
  await page.waitForSelector('.row');
});

await test('CRM på mobil: chips, plusknap og liste', async ({ page }) => {
  await page.goto(base + '/administrator-system/');
  await page.fill('[data-login] [name=bruger]', 'test'); await page.fill('[data-login] [name=kode]', 'hemmelig-kode-123');
  await page.click('[data-login] button[type=submit]');
  await page.waitForSelector('.row');
  assert.ok(await page.isVisible('[data-new-fab]'));
  assert.ok(await page.isVisible('[data-chips] .chip'));
  assert.ok(!(await page.isVisible('[data-sidebar] .sb-brand')) || (await page.locator('[data-sidebar]').boundingBox()).x < 0);
}, { mobile: true });

await test('Landingsside: noindex, ingen menu og fast ring-knap på mobil', async ({ page }) => {
  await page.goto(base + '/lp/terrasse-tilbud/');
  await page.click('[data-consent-banner] .consent-main [data-consent-action=deny]');
  assert.match(await page.getAttribute('meta[name=robots]', 'content'), /noindex/);
  assert.equal(await page.locator('#nav').count(), 0);
  assert.ok(await page.isVisible('.sticky-call'));
}, { mobile: true });

await browser.close();
server.close();
console.log(`\n${passed} bestået, ${failed} fejlet`);
process.exit(failed ? 1 : 0);
