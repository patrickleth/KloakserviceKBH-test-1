#!/usr/bin/env node
// Kvalitetstjek af en færdigbygget kunde. Kør efter build:  KUNDE=<mappe> npm run qa
// Fejl (exit 1): døde interne links, ugyldig JSON-LD, forkert antal H1, dublettitler, billeder uden alt,
//                og i produktion: billeder der stadig hentes fra kundens eget domæne (gammel WordPress).
import fs from 'node:fs';
import path from 'node:path';

const KUNDE = process.env.KUNDE || 'eksempel';
const out = path.join('dist', KUNDE);
if (!fs.existsSync(out)) { console.error(`Ingen bygning i ${out}. Kør først: KUNDE=${KUNDE} npm run build`); process.exit(1); }
const site = JSON.parse(fs.readFileSync(path.join('sites', KUNDE, 'site.json'), 'utf8'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const html = walk(out).filter(f => f.endsWith('.html'));
const isProd = !fs.readFileSync(path.join(out, 'robots.txt'), 'utf8').includes('Disallow: /\n');
const redirects = (site.redirects || []).map(r => r.from.replace(/\*$/, ''));
const errors = [], warnings = [];
const titles = new Map();
const own = new URL(site.domain).host.replace(/^www\./, '');

const exists = href => {
  const p = href.split('#')[0].split('?')[0];
  if (!p || p === '/') return true;
  if (p.startsWith('/api/')) return true;
  if (redirects.some(r => p.startsWith(r))) return true;
  const f = path.join(out, decodeURIComponent(p));
  return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html')));
};

for (const f of html) {
  const rel = '/' + path.relative(out, f).replace(/index\.html$/, '');
  const s = fs.readFileSync(f, 'utf8');
  const h1 = (s.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) errors.push(`${rel}: ${h1} H1 (skal være præcis 1)`);
  const title = s.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
  if (!title) errors.push(`${rel}: mangler <title>`);
  else if (titles.has(title)) errors.push(`${rel}: samme <title> som ${titles.get(title)}`);
  else titles.set(title, rel);
  const desc = s.match(/<meta name="description" content="([^"]*)"/)?.[1] || '';
  if (!rel.startsWith('/404') && (desc.length < 50 || desc.length > 170)) warnings.push(`${rel}: meta-beskrivelse er ${desc.length} tegn (bør være 50-160)`);
  if (!/<html lang="da"/.test(s)) errors.push(`${rel}: mangler lang="da"`);
  for (const m of s.matchAll(/<img\b[^>]*>/g)) if (!/\salt(\s*=|[\s>/])/.test(m[0])) errors.push(`${rel}: billede uden alt: ${m[0].slice(0, 90)}`);
  for (const m of s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); if (!j['@context']) errors.push(`${rel}: JSON-LD uden @context`); } catch (e) { errors.push(`${rel}: ugyldig JSON-LD (${e.message})`); }
  }
  for (const m of s.matchAll(/href="(\/[^"]*)"/g)) if (!exists(m[1])) errors.push(`${rel}: dødt link ${m[1]}`);
  for (const m of new Set([...s.matchAll(/href="#([^"]+)"/g)].map(x => x[1]))) if (!s.includes(`id="${m}"`)) errors.push(`${rel}: link til #${m}, som ikke findes på siden`);
  if (isProd) {
    for (const m of s.matchAll(/(?:src|srcset|content)="(https?:\/\/[^"\s]+)/g)) {
      const u = new URL(m[1]);
      if (u.host.replace(/^www\./, '') === own && u.pathname.includes('/wp-content/')) { errors.push(`${rel}: billede hentes fra den gamle WordPress (${u.pathname}). Kør npm run hent-billeder før DNS flyttes.`); break; }
    }
    if (/testbar/.test(s)) errors.push(`${rel}: testbanner vises i produktion`);
  }
}
if (isProd && !fs.existsSync(path.join(out, 'sitemap.xml'))) errors.push('sitemap.xml mangler');
if (!fs.existsSync(path.join(out, '_headers'))) errors.push('_headers mangler (CSP og sikkerhedsheadere)');

console.log(`QA for ${KUNDE} (${isProd ? 'produktion' : 'test'}): ${html.length} sider`);
for (const w of warnings) console.log('  advarsel: ' + w);
for (const e of errors) console.log('  FEJL:     ' + e);
console.log(errors.length ? `\n${errors.length} fejl. Ret dem før siden går live.` : '\nIngen fejl.');
process.exit(errors.length ? 1 : 0);
