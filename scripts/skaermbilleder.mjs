#!/usr/bin/env node
// Tager skærmbilleder af en bygget kunde (computer og mobil) til gennemsyn. Fanger også JS- og CSP-fejl.
// Brug: KUNDE=<mappe> node scripts/skaermbilleder.mjs / /terrasse/ ...   (billeder i skaermbilleder/<kunde>/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const KUNDE = process.env.KUNDE || 'eksempel';
const root = path.resolve('dist', KUNDE);
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;
const out = path.join('skaermbilleder', KUNDE);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const [w, h, tag] of [[1440, 900, 'computer'], [390, 844, 'mobil']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => localStorage.setItem('vk_consent', 'deny')); // skjul cookiebanner på billederne
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errs.push(m.text()));
  for (const u of paths) {
    await p.goto(base + u, { waitUntil: 'networkidle' });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 300)); });
    const file = path.join(out, `${tag}${u.replace(/\//g, '_') || '_'}.png`);
    await p.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  if (errs.length) console.log(tag, 'FEJL:', [...new Set(errs)].join('\n'));
  await ctx.close();
}
await b.close(); server.close();
