// Vækster webskabelon. Én kodebase, én mappe pr. kunde under sites/.
// Byg en kunde:  KUNDE=skelbo npm run build      (MODE=production for live)
import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import { KUNDE, SITE_DIR, loadSite, writeTokens, assertNoDemo } from './src/lib/config.mjs';
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
  // På Netlify (NETLIFY=true) bygges altid til dist/current, så netlify.toml kan pege på én fast mappe.
  outDir: process.env.NETLIFY ? './dist/current' : `./dist/${KUNDE}`,
  build: {
    format: 'directory',
    // Ingen inline CSS, så Content-Security-Policy kan nøjes med style-src 'self'.
    inlineStylesheets: 'never',
    assets: 'assets'
  },
  image: {
    // Fjernbilleder (fx fra den gamle WordPress-side under migrering) hentes ikke ved bygning.
    remotePatterns: []
  },
  // Alias til den valgte kundes billedmappe, så kun den kundes billeder kommer med i bygningen.
  vite: { resolve: { alias: { '@kundebilleder': imagesDir } } },
  devToolbar: { enabled: false },
  integrations: [vaekster()]
});
