#!/usr/bin/env node
// Henter fjernbilleder (typisk fra den gamle WordPress-side) ned i kundens mappe og retter henvisningerne.
// SKAL køres før DNS flyttes, ellers forsvinder billederne sammen med den gamle side.
// Brug: KUNDE=<mappe> npm run hent-billeder        (tilføj --test for kun at se, hvad der ville ske)
import fs from 'node:fs';
import path from 'node:path';

const KUNDE = process.env.KUNDE;
const dry = process.argv.includes('--test') || process.argv.includes('--tør');
if (!KUNDE) { console.error('Sæt KUNDE=<mappenavn>'); process.exit(1); }
const dir = path.join('sites', KUNDE);
const files = [path.join(dir, 'site.json'), ...['pages', 'blog'].flatMap(d => {
  const p = path.join(dir, d);
  const walk = q => fs.existsSync(q) ? fs.readdirSync(q, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(q, e.name)) : e.name.endsWith('.md') ? [path.join(q, e.name)] : []) : [];
  return walk(p);
})];

const re = /https?:\/\/[^\s"'()<>]+?\.(?:jpe?g|png|webp|avif|gif|svg|ico)(?=[\s"'()<>]|$)/gi;
const urls = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) urls.add(m[0]);
if (!urls.size) { console.log('Ingen fjernbilleder fundet.'); process.exit(0); }

// Logoer, favicon og ikoner skal ligge i public/ (vises som de er). Fotos i images/ (optimeres ved bygning).
const site = JSON.parse(fs.readFileSync(path.join(dir, 'site.json'), 'utf8'));
const publicUrls = new Set([site.brand?.logo, site.brand?.favicon, ...(site.partners || []).map(p => p.logo)].filter(Boolean));
const used = new Set();
const map = new Map();
for (const url of urls) {
  const isPublic = publicUrls.has(url) || /\.(svg|ico|gif)$/i.test(url);
  let name = decodeURIComponent(new URL(url).pathname.split('/').pop()).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const base = name.replace(/(\.[a-z0-9]+)$/, ''), ext = name.slice(base.length);
  for (let i = 2; used.has((isPublic ? 'p/' : 'i/') + name); i++) name = `${base}-${i}${ext}`;
  used.add((isPublic ? 'p/' : 'i/') + name);
  map.set(url, { isPublic, name, ref: isPublic ? '/' + name : name, file: path.join(dir, isPublic ? 'public' : 'images', name) });
}

let fejl = 0;
for (const [url, t] of map) {
  if (dry) { console.log(`${url}\n  -> ${t.file}`); continue; }
  try {
    // WordPress-miniaturer (fx billede-300x300.jpg): prøv originalen først.
    const original = url.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1');
    let r;
    for (const u of original !== url ? [original, url] : [url]) {
      r = await fetch(u, { signal: AbortSignal.timeout(20000) }).catch(() => null);
      if (r?.ok && (r.headers.get('content-type') || '').startsWith('image/')) break;
    }
    if (!r) throw new Error('ingen forbindelse');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!(r.headers.get('content-type') || '').startsWith('image/')) throw new Error(`ikke et billede (${r.headers.get('content-type')})`);
    fs.mkdirSync(path.dirname(t.file), { recursive: true });
    fs.writeFileSync(t.file, Buffer.from(await r.arrayBuffer()));
    console.log(`hentet  ${t.file}`);
  } catch (e) { fejl++; map.delete(url); console.error(`FEJL    ${url}: ${e.message}`); }
}
if (dry) process.exit(0);
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [url, t] of map) s = s.split(url).join(t.ref);
  if (s !== before) { fs.writeFileSync(f, s); console.log(`rettet  ${f}`); }
}
console.log(`\n${map.size} billeder hentet${fejl ? `, ${fejl} fejlede (henvisningerne er ikke ændret)` : ''}.`);
process.exit(fejl ? 1 : 0);
