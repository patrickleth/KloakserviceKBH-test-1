// Væksters byggeintegration. Kører efter build og skriver de ekstra filer, siden skal bruge:
// robots.txt, sitemap.xml, _headers (med CSP-hashes), _redirects og en byggerapport UDEN FOR dist.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import { loadSite, KUNDE, IS_TEST, ROOT, SITE_DIR, REMOTE_OPT, TEMPLATE_VERSION, MANIFEST } from '../lib/config.mjs';

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

function frontmatter(file) {
  const m = fs.readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  return m ? yamlLoad(m[1]) || {} : {};
}

function lastmod(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (out) return out;
  } catch {}
  return new Date().toISOString().slice(0, 10);
}

const sha = s => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

export default function vaekster() {
  return {
    name: 'vaekster',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const site = loadSite();
        const out = fileURLToPath(dir);
        const htmlFiles = walk(out).filter(f => f.endsWith('.html'));
        const report = [];
        const warn = msg => { report.push('ADVARSEL: ' + msg); logger.warn(msg); };

        // 1. CSP-hashes for alle inline-scripts i den byggede HTML.
        const hashes = new Set();
        const pagesMeta = [];
        for (const f of htmlFiles) {
          const html = fs.readFileSync(f, 'utf8');
          for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
            if (/type="application\/ld\+json"/.test(m[1])) continue; // data, ikke kode
            if (m[2].trim()) hashes.add(sha(m[2]));
          }
          const rel = '/' + path.relative(out, f).replace(/\\/g, '/').replace(/index\.html$/, '');
          // I testversionen er alle sider noindex. Sitemappet bygges ud fra sidens egen indstilling, så det kan tjekkes før lancering.
          const noindex = IS_TEST ? /data-page-noindex="true"/.test(html) : /<meta name="robots" content="noindex/.test(html);
          const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
          const h1s = (html.match(/<h1[\s>]/g) || []).length;
          pagesMeta.push({ rel, noindex, title, h1s });
        }

        // 2. robots.txt
        fs.writeFileSync(path.join(out, 'robots.txt'), IS_TEST
          ? 'User-agent: *\nDisallow: /\n'
          : `User-agent: *\nDisallow: /api/\n\nSitemap: ${site.domain}/sitemap.xml\n`);

        // 3. sitemap.xml: kun indekserbare sider, ingen 404 og ingen landingssider.
        const blogDir = path.join(SITE_DIR, 'blog');
        const postIds = new Set(fs.existsSync(blogDir) ? fs.readdirSync(blogDir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)) : []);
        const postIdOf = rel => {
          const slug = rel.replace(/^\/|\/$/g, '');
          const id = site.blog?.permalink === 'root' ? slug : slug.startsWith('blog/') ? slug.slice(5) : '';
          return id && postIds.has(id) ? id : null;
        };
        const srcFor = rel => {
          const slug = rel.replace(/^\/|\/$/g, '') || 'index';
          const pid = postIdOf(rel);
          if (pid) return path.join(blogDir, pid + '.md');
          return path.join(SITE_DIR, 'pages', slug + '.md');
        };
        // Som Yoast: sitemap.xml er et indeks, der peger på page-sitemap.xml og post-sitemap.xml (blogindlæg).
        const indexable = pagesMeta
          .filter(p => !p.noindex && !p.rel.startsWith('/404') && !p.rel.startsWith('/lp/') && !p.rel.startsWith('/administrator-system'))
          .sort((a, b) => a.rel.localeCompare(b.rel));
        const toUrl = p => {
            const src = srcFor(p.rel);
            let mod = fs.existsSync(src) ? lastmod(src) : new Date().toISOString().slice(0, 10);
            if (fs.existsSync(src)) { const fm = frontmatter(src); if (fm.updated) mod = new Date(fm.updated).toISOString().slice(0, 10); }
            return { mod, xml: `  <url><loc>${site.domain}${p.rel}</loc><lastmod>${mod}</lastmod></url>` };
          };
        const isPost = p => Boolean(postIdOf(p.rel));
        const pageUrls = indexable.filter(p => !isPost(p)).map(toUrl);
        const postUrls = indexable.filter(isPost).map(toUrl);
        const urls = [...pageUrls, ...postUrls];
        const urlset = list => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${list.map(u => u.xml).join('\n')}\n</urlset>\n`;
        const newest = list => list.map(u => u.mod).sort().pop();
        // Skrives også i testversionen (dér peger <loc> på det rigtige domæne, og robots.txt blokerer stadig alt).
        {
          const maps = [['page-sitemap.xml', pageUrls], ['post-sitemap.xml', postUrls]].filter(([, l]) => l.length);
          for (const [name, list] of maps) fs.writeFileSync(path.join(out, name), urlset(list));
          fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map(([name, list]) => `  <sitemap><loc>${site.domain}/${name}</loc><lastmod>${newest(list)}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`);
        }

        // llms.txt: kort oversigt over virksomheden og de vigtigste sider til AI-assistenter (llmstxt.org-formatet).
        // Bygges automatisk fra de samme sider som sitemappet. Koster intet, men giver ikke målbart flere AI-citater i dag.
        {
          const md = s => String(s || '').replace(/\s+/g, ' ').trim();
          const entry = p => { const fm = fs.existsSync(srcFor(p.rel)) ? frontmatter(srcFor(p.rel)) : {}; return { ...p, fm, name: md(fm.navLabel || fm.h1 || p.title.split('|')[0]) }; };
          const all = indexable.map(entry);
          const line = e => `- [${e.name}](${site.domain}${e.rel})${e.fm.description ? `: ${md(e.fm.description)}` : ''}`;
          const by = types => all.filter(e => types.includes(e.fm.type));
          const posts = site.blog?.enabled === false ? [] : all.filter(e => isPost(e));
          const parts = [
            `# ${site.name}`,
            `> ${md(site.footerAbout || site.personCta?.text || '')}`,
            `## Kontakt\n- Telefon: ${site.phone.display}\n- E-mail: ${site.email}\n- Adresse: ${site.address.street}, ${site.address.postal} ${site.address.city}\n- CVR: ${site.cvr}${site.areaServed?.length ? `\n- Område: ${site.areaServed.join(', ')}` : ''}${site.phoneHours ? `\n- Åbningstider: ${md(site.phoneHours)}` : ''}`,
            ['Ydelser', by(['service', 'pricing'])],
            ['Områder', by(['city'])],
            [site.blog?.label || 'Guides', posts],
            ['Om virksomheden', by(['home', 'about', 'contact', 'job', 'quote'])],
            ['Valgfrit', [...by(['legal']), { name: 'Sitemap', rel: '/sitemap.xml', fm: {} }]]
          ].map(x => typeof x === 'string' ? x : x[1].length ? `## ${x[0]}\n${x[1].map(line).join('\n')}` : '').filter(Boolean);
          fs.writeFileSync(path.join(out, 'llms.txt'), parts.join('\n\n') + '\n');
        }

        // 4. _headers med CSP. Kun de domæner, kunden faktisk bruger.
        const usesGtm = !!site.tracking.gtmId;
        const usesPixel = !!site.tracking.metaPixelId;
        const usesCookiebot = site.consent.provider === 'cookiebot' && !!site.consent.cookiebotId;
        const remoteImgHosts = new Set();
        for (const f of htmlFiles) for (const m of fs.readFileSync(f, 'utf8').matchAll(/<img[^>]+src="(https?:\/\/[^/"]+)/g)) remoteImgHosts.add(m[1]);
        // gtmCustomHtml: true tillader GTM-tags af typen "Brugerdefineret HTML" (fx en Meta-pixel indsat som kode).
        // Det kræver 'unsafe-inline', og så kan hashes ikke bruges samtidig. Brug hellere GTM-skabeloner.
        const scriptSrc = site.csp.gtmCustomHtml ? ["'self'", "'unsafe-inline'"] : ["'self'", ...hashes];
        const connectSrc = ["'self'"];
        const imgSrc = ["'self'", 'data:', 'blob:', ...remoteImgHosts]; // blob: til forhåndsvisning af vedhæftede billeder
        const mediaSrc = ["'self'"];
        for (const f of htmlFiles) for (const m of fs.readFileSync(f, 'utf8').matchAll(/<(?:source|video)[^>]+src="(https?:\/\/[^/"]+)/g)) mediaSrc.push(m[1]);
        const frameSrc = [];
        const styleSrc = ["'self'"];
        const fontSrc = ["'self'"];
        if (usesGtm) {
          // Efter Googles CSP-vejledning for GTM, GA4 og Google Ads (konvertering og remarketing) samt Meta-pixel.
          const g = ['https://*.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.google.com', 'https://www.google.dk', 'https://www.googleadservices.com', 'https://googleads.g.doubleclick.net', 'https://*.g.doubleclick.net', 'https://ad.doubleclick.net', 'https://pagead2.googlesyndication.com'];
          scriptSrc.push('https://www.googletagmanager.com', 'https://*.googletagmanager.com', 'https://www.google.com', 'https://www.googleadservices.com', 'https://googleads.g.doubleclick.net', 'https://connect.facebook.net', 'https://tagmanager.google.com');
          connectSrc.push(...g, 'https://www.facebook.com', 'https://connect.facebook.net');
          imgSrc.push(...g, 'https://www.facebook.com', 'https://ssl.gstatic.com', 'https://www.gstatic.com');
          frameSrc.push('https://www.googletagmanager.com', 'https://td.doubleclick.net', 'https://www.facebook.com');
          // Tag Assistant / forhåndsvisning i GTM
          styleSrc.push('https://tagmanager.google.com', 'https://fonts.googleapis.com');
          fontSrc.push('https://fonts.gstatic.com', 'data:');
        }
        if (usesPixel) {
          scriptSrc.push('https://connect.facebook.net');
          connectSrc.push('https://www.facebook.com', 'https://connect.facebook.net');
          imgSrc.push('https://www.facebook.com');
          frameSrc.push('https://www.facebook.com');
        }
        if (usesCookiebot) {
          scriptSrc.push('https://consent.cookiebot.com', 'https://consentcdn.cookiebot.com');
          connectSrc.push('https://consent.cookiebot.com', 'https://consentcdn.cookiebot.com');
          frameSrc.push('https://consent.cookiebot.com', 'https://consentcdn.cookiebot.com');
          imgSrc.push('https://*.cookiebot.com');
          // Cookiebots banner bruger inline-styles.
          styleSrc.push("'unsafe-inline'");
        }
        scriptSrc.push(...(site.csp.extraScript || []));
        connectSrc.push(...(site.csp.extraConnect || []));
        imgSrc.push(...(site.csp.extraImg || []));
        const csp = [
          "default-src 'self'",
          `script-src ${[...new Set(scriptSrc)].join(' ')}`,
          `style-src ${[...new Set(styleSrc)].join(' ')}`,
          `img-src ${[...new Set(imgSrc)].join(' ')}`,
          `font-src ${[...new Set(fontSrc)].join(' ')}`,
          `media-src ${[...new Set(mediaSrc)].join(' ')}`,
          `connect-src ${[...new Set(connectSrc)].join(' ')}`,
          `frame-src ${frameSrc.length ? [...new Set(frameSrc)].join(' ') : "'none'"}`,
          "form-action 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          'upgrade-insecure-requests'
        ].join('; ');
        const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
${IS_TEST ? '  X-Robots-Tag: noindex, nofollow\n' : ''}
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/administrator-system/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
  Referrer-Policy: no-referrer
`;
        fs.writeFileSync(path.join(out, '_headers'), headers);

        // 5. _redirects
        const redirects = (site.redirects || []).map(r => `${r.from}  ${r.to}  ${r.status || 301}`);
        fs.writeFileSync(path.join(out, '_redirects'), redirects.join('\n') + (redirects.length ? '\n' : ''));

        // 6. Byggerapport (uden for dist, så interne noter aldrig bliver offentlige).
        const pagesDir = path.join(SITE_DIR, 'pages');
        const thinCities = [];
        for (const f of walk(pagesDir).filter(f => f.endsWith('.md'))) {
          const slug = path.relative(pagesDir, f).replace(/\.md$/, '');
          const fm = frontmatter(f);
          const notes = (Array.isArray(fm.notes) ? fm.notes : String(fm.notes || '').split(/\n/)).map(n => String(n).trim()).filter(Boolean);
          if (notes.length) report.push(`NOTER (${slug}):\n${notes.map(n => '  - ' + n).join('\n')}`);
          if (!fm.description) report.push(`INFO: ${slug}: ingen description i frontmatter, meta-beskrivelsen udledes af intro`);
          if (fm.type === 'city' && !(fm.localProof || []).length) thinCities.push(slug);
        }
        if (thinCities.length) warn(`${thinCities.length} bysider uden lokal dokumentation (localProof). Politik: ${site.cityPolicy}${site.cityPolicy === 'noindex' ? ', de er sat til noindex' : ''}. Se listen i rapporten.`);
        if (thinCities.length) report.push('BYSIDER UDEN LOKAL DOKUMENTATION:\n' + thinCities.map(s => '  - ' + s).join('\n'));
        // Indlejret indhold fra tredjeparter (YouTube, Google Maps, Vimeo, Facebook) sætter cookies, før der er givet samtykke.
        // Det må ikke ske: brug et billede med "klik for at vise" i stedet.
        for (const f of htmlFiles) {
          const html = fs.readFileSync(f, 'utf8');
          const m = html.match(/<iframe[^>]+src="https?:\/\/(?:www\.)?([^/"]+)/i);
          if (m) warn(`${path.relative(out, f)}: indlejret indhold fra ${m[1]} sætter cookies før samtykke. Brug "klik for at vise".`);
        }
        // Mails: tjek at leadmail og bekræftelse har det, de skal bruge. Alt hentes automatisk fra site.json,
        // så her fanges kun huller. Ingen manuel opsætning pr. kunde.
        try {
          const mbPath = path.join(out, 'mail-brand.json');
          const mb = JSON.parse(fs.readFileSync(mbPath, 'utf8'));
          // SVG-logo i public/: lav automatisk en PNG til mails (mailprogrammer viser ikke SVG).
          const svg = site.brand?.logo;
          if (!mb.logo && svg && svg.startsWith('/') && /\.svg$/i.test(svg) && fs.existsSync(path.join(out, svg))) {
            const sharp = (await import('sharp')).default;
            const buf = await sharp(path.join(out, svg), { density: 600 }).resize({ height: 96 }).png().toBuffer();
            const meta = await sharp(buf).metadata();
            fs.writeFileSync(path.join(out, 'mail-logo.png'), buf);
            mb.logo = { src: '/mail-logo.png', width: Math.round(meta.width / 2), height: 48 };
            fs.writeFileSync(mbPath, JSON.stringify(mb));
          }
          if (!mb.logo) (REMOTE_OPT || !/^https?:/.test(site.brand?.logo || '') ? warn : m => report.push('INFO: ' + m))('Mails: intet logo som PNG/JPG (SVG og WebP vises ikke i Outlook). Mailene viser firmanavnet som tekst i stedet.');
          if (!mb.phone) warn('Mails: intet telefonnummer. Bekræftelsen får ingen ringeknap eller akutboks.');
          if (!mb.responseNote) report.push('INFO: Mails: ingen responseNote i site.json. Bekræftelsen lover svar "hurtigst muligt".');
          if (!mb.address || !mb.cvr) report.push('INFO: Mails: adresse eller CVR mangler i bekræftelsens signatur.');
        } catch { warn('Mails: mail-brand.json blev ikke bygget. Mails sendes med navn og telefon fra miljøet.'); }
        const titles = new Map();
        for (const p of pagesMeta) {
          if (p.h1s !== 1) warn(`${p.rel}: ${p.h1s} H1-overskrifter (skal være 1)`);
          if (titles.has(p.title)) warn(`${p.rel}: samme <title> som ${titles.get(p.title)}`);
          else titles.set(p.title, p.rel);
          if (p.title.length > 65) report.push(`INFO: ${p.rel}: titel er ${p.title.length} tegn (Google viser ca. 60)`);
        }
        // version.json: hvilken skabelonversion og hvilket commit siden er bygget fra (vises i portalens oversigt).
        let commit = process.env.WORKERS_CI_COMMIT_SHA || '';
        if (!commit) { try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* ingen git */ } }
        fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ kunde: KUNDE, skabelon: TEMPLATE_VERSION, manifest: MANIFEST?.skabelon?.version || null, tilstand: IS_TEST ? 'test' : 'produktion', commit: commit.slice(0, 12), bygget: new Date().toISOString() }));
        if (MANIFEST?.skabelon?.version && MANIFEST.skabelon.version !== TEMPLATE_VERSION) warn(`vaekster.json siger skabelon ${MANIFEST.skabelon.version}, men koden er ${TEMPLATE_VERSION}. Kør opdateringsværktøjet igen.`);
        const rapportDir = path.join(ROOT, 'rapport');
        fs.mkdirSync(rapportDir, { recursive: true });
        const head = `Byggerapport for ${KUNDE} (${IS_TEST ? 'TEST' : 'PRODUKTION'}, skabelon ${TEMPLATE_VERSION}) ${new Date().toISOString()}\n${pagesMeta.length} sider, ${urls.length} i sitemap, ${hashes.size} inline-scripts hashet i CSP\n\n`;
        fs.writeFileSync(path.join(rapportDir, `${KUNDE}.txt`), head + report.join('\n') + '\n');
        logger.info(`Rapport skrevet til rapport/${KUNDE}.txt (${report.filter(r => r.startsWith('ADVARSEL')).length} advarsler)`);
      }
    }
  };
}
