#!/usr/bin/env node
// Importerer blogindlæg fra en WordPress-side (fx skrevet med Outrank) til Markdown i sites/<kunde>/blog/.
// Bruger WordPress' åbne REST API, så der kræves intet login. Kør fra en maskine med internet:
//   KUNDE=kloakservicekbh WP_URL=https://kloakservicekbh.dk npm run importer-wordpress
//   Tilføj -- --overskriv for at erstatte indlæg, der allerede er importeret.
// Indlæg flyttes fra /<slug>/ til /blog/<slug>/, og der oprettes 301-viderestillinger i site.json, så SEO-værdien følger med.
import fs from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';
import { dump as yamlDump } from 'js-yaml';

const KUNDE = process.env.KUNDE;
const WP = (process.env.WP_URL || '').replace(/\/$/, '');
const overwrite = process.argv.includes('--overskriv');
if (!KUNDE || !WP) { console.error('Brug: KUNDE=<mappe> WP_URL=https://kundens-domæne.dk npm run importer-wordpress'); process.exit(1); }
const dir = path.join('sites', KUNDE);
const blogDir = path.join(dir, 'blog');
fs.mkdirSync(blogDir, { recursive: true });

const decode = s => String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…').replace(/&ndash;/g, '–');
const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
td.remove(['script', 'style', 'noscript', 'iframe', 'form']);
// H1 i brødteksten bliver til ## (H1 er sidens titel i skabelonen).
td.addRule('h1', { filter: 'h1', replacement: c => `\n\n## ${c.trim()}\n\n` });
// Links til kundens egne sider gøres relative, så de virker på den nye side.
td.addRule('internalLinks', {
  filter: n => n.nodeName === 'A' && (n.getAttribute('href') || '').startsWith(WP),
  replacement: (c, n) => `[${c}](${n.getAttribute('href').slice(WP.length) || '/'})`
});

async function getAll(type) {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const url = `${WP}/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish&_fields=slug,date,modified,title,content,yoast_head_json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (r.status === 400) break; // forbi sidste side
    if (!r.ok) throw new Error(`${url} svarede ${r.status}`);
    const list = await r.json();
    out.push(...list);
    if (list.length < 100) break;
  }
  return out;
}

const posts = await getAll('posts');
let written = 0, skipped = 0;
const sitePath = path.join(dir, 'site.json');
const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
const redirects = [];
for (const p of posts) {
  const file = path.join(blogDir, `${p.slug}.md`);
  // Med blog.permalink = "root" beholder indlæggene deres WordPress-adresse, så der skal ingen viderestilling til.
  if (site.blog?.permalink !== 'root') redirects.push({ from: `/${p.slug}/`, to: `/blog/${p.slug}/`, status: 301 });
  if (fs.existsSync(file) && !overwrite) { skipped++; continue; }
  const y = Array.isArray(p.yoast_head_json) ? {} : (p.yoast_head_json || {});
  const h1 = decode(p.title?.rendered);
  const fm = {
    title: decode(y.title) || h1,
    description: decode(y.description) || '',
    h1,
    date: p.date?.slice(0, 10),
    updated: p.modified?.slice(0, 10),
    ...(y.og_image?.[0]?.url ? { image: { src: y.og_image[0].url, alt: h1 } } : {}),
    related: [],
    notes: [`Importeret fra ${WP}/${p.slug}/ den ${new Date().toISOString().slice(0, 10)}`]
  };
  const body = td.turndown(p.content?.rendered || '').replace(/\n{3,}/g, '\n\n').trim();
  fs.writeFileSync(file, `---\n${yamlDump(fm, { lineWidth: -1 })}---\n\n${body}\n`);
  written++;
}

// 301-viderestillinger fra de gamle adresser
site.redirects ||= [];
const have = new Set(site.redirects.map(r => r.from));
const added = redirects.filter(r => !have.has(r.from));
site.redirects.push(...added);
fs.writeFileSync(sitePath, JSON.stringify(site, null, 2) + '\n');
console.log(`${posts.length} indlæg fundet: ${written} skrevet, ${skipped} fandtes i forvejen. ${added.length} viderestillinger tilføjet i site.json.`);
console.log(`Næste skridt: KUNDE=${KUNDE} npm run build && KUNDE=${KUNDE} npm run qa`);
