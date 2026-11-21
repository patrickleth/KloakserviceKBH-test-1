// Cloudflare Worker: serverer den statiske side (dist/current) og håndterer formularen og mini-CRM'et.
//   /api/lead                    -> lead-core (gem i CRM, mail til kunden, bekræftelse til den besøgende)
//   /administrator-system/api/*  -> crm-core (login, leads, opsætning)
// Alt andet går direkte til de statiske filer. Logikken ligger i server/, lageret i cf-store.mjs (D1 og R2).
import { handleLead } from '../server/lead-core.mjs';
import { handleAdmin, crmStore } from '../server/crm-core.mjs';
import { cfStore } from './cf-store.mjs';

const tooMany = () => new Response(JSON.stringify({ ok: false, fejl: 'For mange forsøg. Prøv igen om lidt.' }), {
  status: 429, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '60' }
});

// Branding til mails (bygges som /mail-brand.json). Læses én gang pr. Worker-instans.
let brandCache = null;
const loadBrand = (env, url) => brandCache ||= env.ASSETS.fetch(new Request(new URL('/mail-brand.json', url)))
  .then(r => (r.ok ? r.json() : null)).catch(() => null)
  .then(b => { if (!b) brandCache = null; return b; });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const isLead = url.pathname === '/api/lead';
    const isAdmin = url.pathname.startsWith('/administrator-system/api/');
    if (!isLead && !isAdmin) return env.ASSETS.fetch(req);

    const ip = req.headers.get('cf-connecting-ip') || '';
    // Cloudflares rate limit: højst 10 indsendelser og 60 CRM-kald pr. minut pr. IP (se wrangler.jsonc).
    const limiter = isLead ? env.LEAD_LIMIT : env.ADMIN_LIMIT;
    if (limiter) {
      const { success } = await limiter.limit({ key: `${isLead ? 'lead' : 'admin'}:${ip}` });
      if (!success) return tooMany();
    }

    const store = cfStore(env.DB, env.FILES, env.SITE_ID);
    if (isLead) {
      const crm = env.CRM_ENABLED === 'false' ? null : crmStore(store);
      return handleLead(req, env, { waitUntil: ctx.waitUntil.bind(ctx), crm, brand: () => loadBrand(env, req.url) });
    }
    return handleAdmin(req, env, { store, ip });
  }
};
