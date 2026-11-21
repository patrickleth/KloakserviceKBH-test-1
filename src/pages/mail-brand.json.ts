// Branding til mails (leadmail og bekræftelse). Bygges som en statisk fil, som formularfunktionen læser.
// Logoet laves som PNG, fordi Outlook og flere mailprogrammer ikke viser WebP eller SVG.
// Indeholder kun oplysninger, der allerede står offentligt på hjemmesiden.
import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { site } from '../lib/site';
import { resolveImage, remoteOptimizable, remoteResized } from '../lib/images';

const LOGO_H = 96; // vises 48 px højt, dobbelt opløsning til skarpe skærme

async function pngLogo(src?: string) {
  if (!src || /\.svg(\?|$)/i.test(src)) return null;
  try {
    if (src.startsWith('/')) return /\.(png|jpe?g|gif)$/i.test(src) ? { src, width: undefined, height: LOGO_H } : null;
    const r = resolveImage(src);
    if (!r) return null;
    if (typeof r === 'string') {
      if (!remoteOptimizable(r)) return /\.(png|jpe?g|gif)(\?|$)/i.test(r) ? { src: r, width: undefined, height: LOGO_H } : null;
      return await remoteResized(r, { height: LOGO_H }, 'png');
    }
    const width = Math.round((r.width * LOGO_H) / r.height);
    const img = await getImage({ src: r, width, height: LOGO_H, format: 'png' });
    return { src: img.src, width, height: LOGO_H };
  } catch (e) {
    console.warn('[mail-brand] logo kunne ikke laves som PNG', (e as Error).message);
    return null;
  }
}

export const GET: APIRoute = async () => {
  const t = site.tokens || {};
  const logo = await pngLogo(site.brand?.logo);
  const firstStat = (site.stats || [])[0];
  const body = {
    name: site.name,
    domain: site.domain,
    phone: site.phone || null,
    email: site.email || null,
    address: site.address || null,
    cvr: site.cvr || null,
    phoneHours: site.phoneHours || null,
    responseNote: site.responseNote || null,
    akut: site.mail?.akut || site.personCta?.text || site.megaAside?.text || null,
    steps: site.mail?.steps || null,
    rating: site.rating?.source || null,
    proof: firstStat ? `${firstStat.value} ${firstStat.label}` : null,
    logo: logo ? { src: logo.src, width: logo.width ? Math.round(logo.width / 2) : null, height: LOGO_H / 2 } : null,
    colors: {
      primary: t.primary || '#1a1a1a',
      dark: t.primaryDark || '#141414',
      call: t.call || t.primary || '#c62828',
      cta: t.cta || t.accent || t.primary || '#1a1a1a',
      ctaText: t.ctaText || '#ffffff',
      tint: t.tint || '#f5f5f5',
      star: t.star || '#00b67a'
    }
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
