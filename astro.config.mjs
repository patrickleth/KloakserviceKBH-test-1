// Vækster webskabelon. Én kodebase, én mappe pr. kunde under sites/.
// Byg en kunde:  KUNDE=<kunde> npm run build      (MODE=production for live)
import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import { KUNDE, SITE_DIR, loadSite, writeTokens, assertNoDemo, REMOTE_OPT } from './src/lib/config.mjs';
import vaekster from './src/integrations/vaekster.mjs';

const site = loadSite();
writeTokens(site);
assertNoDemo();

const publicDir = path.join(SITE_DIR, 'public');
const imagesDir = path.join(SITE_DIR, 'images');
fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });

export default defineConfig({
  site: site.domain,
  output: 'static',
  trailingSlash: 'always',
  publicDir,
  // På Cloudflare bygges altid til dist/current, så wrangler.jsonc kan pege på én fast mappe.
  outDir: process.env.WORKERS_CI || process.env.CF_PAGES ? './dist/current' : `./dist/${KUNDE}`,
  build: {
    format: 'directory',
    // Ingen inline CSS, så Content-Security-Policy kan nøjes med style-src 'self'.
    inlineStylesheets: 'never',
    assets: 'assets'
  },
  image: {
    // Fjernbilleder fra kundens nuværende side (under migrering) hentes og optimeres til AVIF/WebP ved bygning på Cloudflare.
    // Lokalt (uden netadgang) vises de, som de er. Sæt OPTIMIZE_REMOTE=true for at tvinge det.
    remotePatterns: REMOTE_OPT ? [{ protocol: 'https', hostname: new URL(site.domain).hostname }, { protocol: 'https', hostname: 'www.' + new URL(site.domain).hostname.replace(/^www\./, '') }] : []
  },
  // Alias til den valgte kundes billedmappe, så kun den kundes billeder kommer med i bygningen.
  vite: { resolve: { alias: { '@kundebilleder': imagesDir } } },
  devToolbar: { enabled: false },
  integrations: [vaekster()]
});
