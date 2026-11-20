#!/usr/bin/env node
// Opret en ny kunde ud fra demokunden.
// Brug: npm run ny-kunde -- <mappenavn> [--navn "Firma ApS"] [--domaene https://firma.dk] [--telefon "12 34 56 78"]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const opt = k => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : undefined; };

if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Brug: npm run ny-kunde -- <mappenavn> [--navn "Firma ApS"] [--domaene https://firma.dk] [--telefon "12 34 56 78"]');
  console.error('Mappenavnet må kun indeholde små bogstaver, tal og bindestreg (fx "hansen-vvs").');
  process.exit(1);
}
const src = path.join('sites', 'eksempel');
const dest = path.join('sites', slug);
if (fs.existsSync(dest)) { console.error(`sites/${slug} findes allerede. Vælg et andet navn.`); process.exit(1); }

fs.cpSync(src, dest, { recursive: true });
// Demoindlæg og demolandingsside fjernes. De øvrige sider og billeder bliver som skabeloner, der skal udskiftes;
// en produktionsbygning stopper, så længe der står demotekst, "Eksempelbillede" eller UDFYLD.
for (const f of fs.readdirSync(path.join(dest, 'blog'))) fs.rmSync(path.join(dest, 'blog', f));
fs.writeFileSync(path.join(dest, 'blog', '.gitkeep'), '');
fs.rmSync(path.join(dest, 'pages', 'lp'), { recursive: true, force: true });

const sitePath = path.join(dest, 'site.json');
const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
delete site._kommentar;
site.name = opt('navn') || 'UDFYLD firmanavn';
site.domain = opt('domaene') || 'https://UDFYLD.dk';
const tel = opt('telefon');
if (tel) site.phone = { display: tel, e164: '+45' + tel.replace(/\D/g, '').slice(-8) };
site.email = 'UDFYLD@' + (site.domain.replace(/^https?:\/\/(www\.)?/, '') || 'firma.dk');
site.address = { street: 'UDFYLD', postal: '0000', city: 'UDFYLD', country: 'DK' };
site.cvr = 'UDFYLD';
site.contactPerson = 'UDFYLD Fornavn Efternavn';
site.areaServed = ['UDFYLD'];
site.badges = ['UDFYLD', 'UDFYLD', 'UDFYLD'];
site.form.services = ['UDFYLD', 'Andet'];
site.footerLinks = site.footerLinks.filter(s => s !== 'toemrer-hvidovre');
site.reviews = [];
site.ratingNote = '';
site.footerAbout = 'UDFYLD kort tekst om firmaet til footeren.';
site.redirects = [];
fs.writeFileSync(sitePath, JSON.stringify(site, null, 2) + '\n');

console.log(`
Kunden er oprettet i sites/${slug}/

Næste skridt (se også docs/NY-KUNDE.md):
  1. Ret sites/${slug}/site.json: navn, kontakt, farver (tokens), menu, ydelser i formularen.
  2. Læg logo og favicon i sites/${slug}/public/ og billeder i sites/${slug}/images/.
  3. Skriv siderne i sites/${slug}/pages/ (se docs/INDHOLDSFORMAT.md). Demoteksterne skal ud:
     en produktionsbygning stopper, hvis der står "(demo)" eller "opdigtet" nogen steder.
  4. Se siden lokalt:      KUNDE=${slug} npm run dev
  5. Byg og tjek:          KUNDE=${slug} npm run build && KUNDE=${slug} npm run qa
  6. Netlify: nyt site fra repoet, og sæt disse miljøvariabler (aldrig i repoet):
       KUNDE=${slug}
       MODE=test                  (production når siden skal live)
       SITE_NAME=${site.name}
       MAKE_WEBHOOK_URL=...       (leadlog)
       MAILGUN_API_KEY=...        (fra 1Password, aldrig i ClickUp)
       MAILGUN_DOMAIN=...
       MAILGUN_REGION=eu
       LEAD_TO=...                (kundens mail)
       LEAD_BCC=...               (valgfri, fx Væksters leadpostkasse)
       ALERT_EMAIL=...            (Væksters alarmmodtager)
       ALERT_WEBHOOK_URL=...      (valgfri, fx Slack/Make, bruges hvis Mailgun er nede)
       CONFIRM_TO_LEAD=true       (valgfri kvitteringsmail til den besøgende)
`);
