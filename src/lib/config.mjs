// Fælles indlæsning af kundens site.json. Bruges af astro.config, komponenter og byggeintegrationen.
import fs from 'node:fs';
import path from 'node:path';

if (process.env.WORKERS_CI && !process.env.KUNDE) {
  throw new Error('KUNDE er ikke sat i byggekommandoen på Cloudflare. Sæt KUNDE=<mappenavn under sites/>, ellers bygges demokunden.');
}
export const KUNDE = process.env.KUNDE || 'eksempel';
export const MODE = process.env.MODE === 'production' ? 'production' : 'test';
export const IS_TEST = MODE !== 'production';
// TEST_FORM=true: formularen sender rigtigt også på testversionen (fx så leads kan ses i CRM'et før lancering).
export const TEST_FORM = IS_TEST && process.env.TEST_FORM === 'true';
export const ROOT = process.cwd();
// Kundens manifest (vaekster.json i roden af kundens repo): hvilken kunde repoet tilhører og hvilken skabelonversion det kører.
// Bygges der med en anden KUNDE (undtagen demokunden, som testene bruger), end repoet tilhører, stopper bygningen, så en side aldrig udgives med en anden kundes indhold.
export const MANIFEST = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'vaekster.json'), 'utf8')); } catch { return null; } })();
if (MANIFEST?.kunde && process.env.KUNDE && process.env.KUNDE !== 'eksempel' && MANIFEST.kunde !== process.env.KUNDE) {
  throw new Error(`Repoet tilhører "${MANIFEST.kunde}", men der bygges med KUNDE=${process.env.KUNDE}. Ret byggekommandoen.`);
}
export const TEMPLATE_VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '0.0.0'; } })();

export const SITE_DIR = path.join(ROOT, 'sites', KUNDE);

export function loadSite() {
  const file = path.join(SITE_DIR, 'site.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Kunden "${KUNDE}" findes ikke. Forventede ${file}. Sæt KUNDE=<mappenavn under sites/>.`);
  }
  const site = JSON.parse(fs.readFileSync(file, 'utf8'));
  const required = ['name', 'domain', 'phone', 'email', 'address', 'cvr', 'tokens', 'brand', 'form', 'menu'];
  const missing = required.filter(k => site[k] === undefined);
  if (missing.length) throw new Error(`site.json for "${KUNDE}" mangler: ${missing.join(', ')}`);
  site.domain = site.domain.replace(/\/$/, '');
  site.footerLinks ??= [];
  site.badges ??= [];
  site.reviews ??= [];
  site.partners ??= [];
  site.redirects ??= [];
  site.tracking ??= {};
  // GTM-ID kan også sættes som miljøvariabel ved bygning (GTM_ID), fx forskelligt for test og produktion.
  if (process.env.GTM_ID) site.tracking.gtmId = process.env.GTM_ID;
  site.consent ??= { provider: 'intern' };
  site.csp ??= {};
  site.cityPolicy ??= 'warn';
  site.privacySlug ??= 'cookies';
  site.stats ??= [];
  site.form.variant ??= 'kort';
  site.form.submitLabel ??= 'Indhent tilbud';
  site.form.files ??= true;            // vedhæft billeder/PDF som standard
  site.form.thankYou ??= 'henvendelse'; // takkeside efter formularen; tom streng = vis tak i formularen
  site.gallery ??= [];
  site.logoRows ??= [];
  site.tracking.metaPixelId ??= '';
  site.tracking.consentMode ??= 'basic';
  if (process.env.META_PIXEL_ID) site.tracking.metaPixelId = process.env.META_PIXEL_ID;
  // Testversioner må ikke sende data til kundens rigtige GTM/Meta (forurener statistik og annoncer).
  // Sæt TEST_TRACKING=true for at teste sporingen på en testversion.
  if (IS_TEST && process.env.TEST_TRACKING !== 'true') { site.tracking.gtmId = ''; site.tracking.metaPixelId = ''; }
  site.form.title ??= 'Få et uforpligtende tilbud';
  site.responseNote ??= 'Vi svarer inden for 24 timer';
  // Blogindlæggenes adresse: 'blog' = /blog/<slug>/ (nye kunder), 'root' = /<slug>/ som i WordPress (behold eksisterende URL'er ved flytning).
  site.blog ??= {};
  site.blog.permalink ??= 'blog';
  // Blog/guides er kun for SEO-kunder: "blog": { "enabled": false } slår ruter, menupunkt og llms.txt-afsnit fra.
  site.blog.enabled ??= true;
  site.blog.label ??= 'Blog';
  // Menupunkter med grupper (mega-menu) får også en samlet children-liste, så sidefod, ydelseskort m.m. virker uændret.
  for (const m of site.menu || []) if (m.groups && !m.children) m.children = m.groups.flatMap(g => g.children);
  return site;
}

// Skrifttyper skabelonen kan bruge. Kun de valgte indlæses på kundens side.
export const FONTS = {
  archivo: { css: '@fontsource-variable/archivo/standard.css', family: '"Archivo Variable"' },
  bitter: { css: '@fontsource-variable/bitter/index.css', family: '"Bitter Variable"' },
  montserrat: { css: '@fontsource-variable/montserrat/index.css', family: '"Montserrat Variable"' },
  inter: { css: '@fontsource-variable/inter/index.css', family: '"Inter Variable"' },
  'inter-tight': { css: '@fontsource-variable/inter-tight/index.css', family: '"Inter Tight Variable"' }
};

// Skriver kundens design-tokens som CSS-variabler. Kører før bygning (fra astro.config).
/** Sort eller hvid tekst efter baggrundens lysstyrke (WCAG relativ luminans). */
export function onColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111111' : '#ffffff';
}

export function writeTokens(site) {
  const t = site.tokens;
  const head = FONTS[t.fontHeading || 'archivo'], body = FONTS[t.fontBody || 'archivo'];
  if (!head || !body) throw new Error(`Ukendt skrifttype i tokens. Vælg mellem: ${Object.keys(FONTS).join(', ')}`);
  const call = t.call || t.primary;
  const cta = t.cta || t.accent || t.primary;
  const formBg = t.formBg || t.primaryDark;
  if (call.toLowerCase() === cta.toLowerCase()) console.warn('[tokens] call og cta har samme farve. Telefonknap og tilbudsknap bør have hver sin farve.');
  const imports = [...new Set([head.css, body.css])].map(c => `@import '${c}';`).join('\n');
  const css = `/* Genereret fra sites/${KUNDE}/site.json. Ret ikke her. */
${imports}
:root {
  --primary: ${t.primary};
  --primary-dark: ${t.primaryDark};
  --primary-light: ${t.primaryLight};
  --tint: ${t.tint};
  --accent: ${t.accent};
  --star: ${t.star || '#00B67A'};
  /* Knaproller: telefon (akut) og tilbud (primær handling) har altid hver sin farve. */
  --call: ${call};
  --call-text: ${t.callText || onColor(call)};
  --cta: ${cta};
  --cta-text: ${t.ctaText || onColor(cta)};
  --form-bg: ${formBg};
  /* Overlinjer: aldrig call-farven (rød = akut). */
  --eyebrow: ${t.eyebrow || (t.primary.toLowerCase() === call.toLowerCase() ? (t.primaryDark || '#222') : t.primary)};
  --form-text: ${onColor(formBg)};
  --radius: ${t.radius || '6px'};
  --font-head: ${head.family}, Georgia, serif;
  --font-body: ${body.family}, system-ui, -apple-system, "Segoe UI", sans-serif;
  --head-transform: ${t.headingUppercase ? 'uppercase' : 'none'};
}
`;
  const out = path.join(ROOT, 'src/styles/_tokens.css');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== css) fs.writeFileSync(out, css);
}

/** Har kunden mindst ét udgivet blogindlæg? Tjekkes via filsystemet, så kunder uden blog ikke får en tom samling. */
export function postPath(id, site = loadSite()) {
  return site.blog?.permalink === 'root' ? `/${id}/` : `/blog/${id}/`;
}

/** Optimér fjernbilleder fra kundens domæne ved bygning (kræver netadgang, derfor kun på Cloudflare som standard). */
export const REMOTE_OPT = !!process.env.WORKERS_CI || !!process.env.CF_PAGES || process.env.OPTIMIZE_REMOTE === 'true';

export function hasBlog() {
  if (loadSite().blog?.enabled === false) return false;
  const dir = path.join(SITE_DIR, 'blog');
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some(f => f.endsWith('.md') && !/^draft:\s*true\s*$/m.test(fs.readFileSync(path.join(dir, f), 'utf8').split(/^---\s*$/m)[1] || ''));
}

/** Stopper en produktionsbygning, hvis demotekst fra skabelonen stadig står i kundens filer. */
export function assertNoDemo() {
  if (IS_TEST || KUNDE === 'eksempel') return;
  const hits = [];
  const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
  for (const f of [path.join(SITE_DIR, 'site.json'), ...walk(path.join(SITE_DIR, 'pages')), ...walk(path.join(SITE_DIR, 'blog'))].filter(f => /\.(md|json)$/.test(f))) {
    const s = fs.readFileSync(f, 'utf8');
    if (/\(demo\)|opdigte|eksempelbillede/i.test(s) || /UDFYLD|FIKTIV|eksempel\.vaekster\.dk/.test(s)) hits.push(path.relative(ROOT, f));
  }
  if (hits.length) throw new Error(`Produktionsbygning stoppet: demotekst eller UDFYLD står stadig i:\n  ${hits.join('\n  ')}`);
}
