// Cookiekatalog: hvilke cookies og browserlagring siden bruger, med formål, udbyder og levetid.
// Bruges af cookiepolitikken (tabellen), /cookies.json (til den månedlige scanning) og banneret (version).
// Udledes af site.json: GTM giver Google Analytics og Google Ads, metaPixelId giver Meta.
// Kunden kan tilføje egne med consent.cookies: [{ name, provider, category, purpose, expiry }].
import { createHash } from 'node:crypto';

const NECESSARY = [
  { name: 'vk_consent_v2', provider: 'Denne hjemmeside', category: 'necessary', type: 'Browserlagring', purpose: 'Husker dit valg i cookiebanneret og dit samtykke-id.', expiry: '12 måneder' },
  // Cloudflares sikkerhedscookies (botbeskyttelse og rate limiting). Strengt nødvendige, sættes af hosting og CDN.
  { name: '__cf_bm', provider: 'Cloudflare', category: 'necessary', type: 'Cookie', purpose: 'Skelner mennesker fra robotter og beskytter siden mod misbrug.', expiry: '30 minutter' },
  { name: '_cfuvid', provider: 'Cloudflare', category: 'necessary', type: 'Cookie', purpose: 'Bruges af Cloudflare til at begrænse misbrug (rate limiting).', expiry: 'Når browseren lukkes' }
];
const GOOGLE_ANALYTICS = [
  { name: '_ga', provider: 'Google', category: 'statistics', type: 'Cookie', purpose: 'Skelner mellem besøgende til statistik (Google Analytics).', expiry: '2 år' },
  { name: '_ga_*', pattern: '^_ga_', provider: 'Google', category: 'statistics', type: 'Cookie', purpose: 'Husker besøgets forløb til statistik (Google Analytics 4).', expiry: '2 år' }
];
const GOOGLE_ADS = [
  { name: '_gcl_au', provider: 'Google', category: 'marketing', type: 'Cookie', purpose: 'Måler, hvilke Google-annoncer der fører til henvendelser.', expiry: '90 dage' },
  { name: '_gcl_aw', provider: 'Google', category: 'marketing', type: 'Cookie', purpose: 'Gemmer klik-id fra en Google-annonce, så en henvendelse kan kobles til annoncen.', expiry: '90 dage' },
  { name: 'vk_gclid', provider: 'Denne hjemmeside', category: 'marketing', type: 'Browserlagring (session)', purpose: 'Husker klik-id fra en Google-annonce, til du sender formularen.', expiry: 'Når fanen lukkes' },
  { name: 'IDE', provider: 'Google (doubleclick.net)', category: 'marketing', type: 'Tredjepartscookie', purpose: 'Bruges af Google til at måle og målrette annoncer.', expiry: '13 måneder' },
  { name: 'test_cookie', provider: 'Google (doubleclick.net)', category: 'marketing', type: 'Tredjepartscookie', purpose: 'Tjekker om browseren tillader cookies.', expiry: '15 minutter' }
];
const META = [
  { name: '_fbp', provider: 'Meta', category: 'marketing', type: 'Cookie', purpose: 'Måler, hvilke Facebook- og Instagram-annoncer der fører til henvendelser.', expiry: '90 dage' },
  { name: '_fbc', provider: 'Meta', category: 'marketing', type: 'Cookie', purpose: 'Gemmer klik-id fra en Meta-annonce.', expiry: '90 dage' },
  { name: 'vk_fbclid', provider: 'Denne hjemmeside', category: 'marketing', type: 'Browserlagring (session)', purpose: 'Husker klik-id fra en Meta-annonce, til du sender formularen.', expiry: 'Når fanen lukkes' },
  { name: 'fr', provider: 'Meta (facebook.com)', category: 'marketing', type: 'Tredjepartscookie', purpose: 'Bruges af Meta til at måle og målrette annoncer.', expiry: '90 dage' }
];

// Hæves, når bannerets tekst ændres væsentligt. Så får alle besøgende banneret igen.
export const BANNER_REV = '2026-11-21';

export const CATEGORY_NAMES = { necessary: 'Nødvendige', preferences: 'Præferencer', statistics: 'Statistik', marketing: 'Marketing' };

/** Alle cookies og lagring siden bruger, ud fra opsætningen. */
export function declaredCookies(site, { gtmId = '', pixelId = '' } = {}) {
  const gtm = gtmId || site.tracking?.gtmId;
  const pixel = pixelId || site.tracking?.metaPixelId;
  const list = [...NECESSARY];
  if (gtm) list.push(...GOOGLE_ANALYTICS, ...GOOGLE_ADS);
  if (pixel || site.consent?.meta) list.push(...META);
  for (const c of site.consent?.cookies || []) list.push({ type: 'Cookie', ...c });
  // Samme navn kun én gang.
  return list.filter((c, i) => list.findIndex(x => x.name === c.name) === i);
}

/** Mønstre til at genkende cookies (bruges ved sletning og scanning). */
export const cookiePattern = c => c.pattern || '^' + c.name.replace(/[.*+?^${}()|[\]\\]/g, m => (m === '*' ? '.*' : '\\' + m)) + '$';

/** Bannerets version: ændres når cookielisten eller bannerets tekst ændres, og så spørges alle igen. */
export function consentVersion(cookies, bannerText) {
  const basis = JSON.stringify({ c: cookies.map(c => [c.name, c.category]), t: bannerText });
  return createHash('sha256').update(basis).digest('hex').slice(0, 10);
}
