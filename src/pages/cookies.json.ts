// Maskinlæsbar cookieerklæring. Bruges af den månedlige scanning (scripts/cookie-scan.mjs) til at finde ukendte cookies.
import type { APIRoute } from 'astro';
import { site } from '../lib/site';
import { declaredCookies, cookiePattern } from '../lib/cookies.mjs';

export const GET: APIRoute = () => {
  const cookies = declaredCookies(site).map(c => ({ ...c, pattern: cookiePattern(c) }));
  return new Response(JSON.stringify({ site: site.name, cookies }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
