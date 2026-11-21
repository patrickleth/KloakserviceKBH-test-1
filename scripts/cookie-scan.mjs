// Månedlig cookiescanning af den live side. Kører i GitHub Actions (.github/workflows/cookie-scan.yml) og kan køres lokalt:
//   node scripts/cookie-scan.mjs https://kundens-side.dk
// Uden adresse bruges consent.scanUrl (eller domain) fra sites/<SITE_ID>/site.json, hvor SITE_ID står i wrangler.jsonc.
//
// Tjekker:
//   1. Før valg: ingen cookies ud over de nødvendige og ingen kald til sporingstjenester.
//   2. Efter "Afvis alle" (og genindlæsning): stadig intet.
//   3. Efter "Accepter alle": alle cookies står i cookieerklæringen (/cookies.json).
// Fejler et tjek, fejler kørslen, og GitHub sender en mail til ejeren af repoet.
import fs from 'node:fs';
import { chromium } from 'playwright';

const TRACKERS = /google-analytics\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|facebook\.(com|net)|bing\.com|clarity\.ms|hotjar\.com|tiktok\.com|linkedin\.com|snap\.licdn|pinterest\.com/;

function targetUrl() {
  if (process.argv[2]) return process.argv[2];
  if (process.env.SCAN_URL) return process.env.SCAN_URL;
  const id = (fs.readFileSync('wrangler.jsonc', 'utf8').match(/"SITE_ID"\s*:\s*"([^"]+)"/) || [])[1];
  if (!id) throw new Error('Ingen adresse: angiv en URL, SCAN_URL eller SITE_ID i wrangler.jsonc');
  const site = JSON.parse(fs.readFileSync(`sites/${id}/site.json`, 'utf8'));
  return site.consent?.scanUrl || site.domain;
}

const url = targetUrl().replace(/\/?$/, '/');
const host = new URL(url).hostname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [], warnings = [];

const decl = await (await fetch(new URL('cookies.json', url))).json().catch(() => null);
if (!decl?.cookies) { console.error('cookies.json kunne ikke hentes fra ' + url); process.exit(1); }
const known = decl.cookies.map(c => ({ ...c, re: new RegExp(c.pattern) }));
const necessary = known.filter(c => c.category === 'necessary');
const match = (name, list) => list.find(c => c.re.test(name));
const firstParty = d => d.replace(/^\./, '') === host || host.endsWith(d.replace(/^\./, ''));

async function visit(label, action) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const calls = [];
  page.on('request', r => { const u = new URL(r.url()); if (TRACKERS.test(u.hostname)) calls.push(u.hostname + u.pathname); });
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url));
  const cmode = await page.evaluate(() => document.documentElement.dataset.cmode);
  if (action) {
    const btn = page.locator(`[data-consent-banner] .consent-main [data-consent-action=${action}]`);
    if (!(await btn.isVisible())) errors.push(`${label}: cookiebanneret blev ikke vist`);
    else { await btn.click(); await page.waitForTimeout(1500); }
    if (action === 'deny') { calls.length = 0; await page.reload({ waitUntil: 'networkidle' }).catch(() => {}); }
  }
  await page.waitForTimeout(3000);
  const cookies = await ctx.cookies();
  await ctx.close();
  return { cookies, calls: [...new Set(calls)], cmode };
}

// 1 og 2: før valg og efter afvisning må der kun være nødvendige cookies og ingen sporing.
for (const [label, action] of [['Før valg', null], ['Efter "Afvis alle"', 'deny']]) {
  const { cookies, calls, cmode } = await visit(label, action);
  const extra = cookies.filter(c => !match(c.name, necessary));
  if (extra.length) errors.push(`${label}: cookies uden samtykke: ${extra.map(c => `${c.name} (${c.domain})`).join(', ')}`);
  // Avanceret Consent Mode må indlæse GTM med alt afvist; den må stadig ikke sætte cookies.
  const bad = calls.filter(c => !(cmode === 'advanced' && /googletagmanager\.com\/gtm\.js/.test(c)));
  if (bad.length) errors.push(`${label}: kald til sporingstjenester uden samtykke: ${bad.join(', ')}`);
  console.log(`${label}: ${cookies.length} cookies, ${calls.length} sporingskald`);
}

// 3: efter accept skal alle cookies stå i erklæringen.
const { cookies } = await visit('Efter "Accepter alle"', 'grant');
for (const c of cookies) {
  if (match(c.name, known)) continue;
  (firstParty(c.domain) ? errors : warnings).push(`Ikke i cookieerklæringen: ${c.name} (${c.domain})`);
}
console.log(`Efter "Accepter alle": ${cookies.length} cookies`);
await browser.close();

for (const w of warnings) console.log('ADVARSEL: ' + w);
for (const e of errors) console.log('FEJL: ' + e);
if (warnings.length) console.log('Tredjepartscookies uden for erklæringen tilføjes med consent.cookies i site.json.');
console.log(errors.length ? `\n${errors.length} fejl på ${url}` : `\nIngen fejl på ${url}`);
process.exit(errors.length ? 1 : 0);
