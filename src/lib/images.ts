// Billeder kan være lokale (sites/<kunde>/images/...) eller fjern-URL'er.
// Lokale billeder optimeres ved bygning til AVIF/WebP i flere størrelser.
// Fjern-URL'er (typisk den gamle WordPress-side under migrering) vises som de er.
import type { ImageMetadata } from 'astro';
import { getImage, inferRemoteSize } from 'astro:assets';
import { KUNDE, REMOTE_OPT, loadSite } from './config.mjs';

const OWN_HOST = new URL(loadSite().domain).hostname.replace(/^www\./, '');
/** Kan dette fjernbillede optimeres ved bygning? Kun billeder fra kundens eget domæne, og kun når REMOTE_OPT er slået til. */
export function remoteOptimizable(src: string) {
  if (!REMOTE_OPT || !/^https:\/\//.test(src)) return false;
  try { return new URL(src).hostname.replace(/^www\./, '') === OWN_HOST && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(src); } catch { return false; }
}

// '@kundebilleder' peger på sites/<KUNDE>/images (se astro.config.mjs). Nøglerne normaliseres til stien efter images/.
const raw = import.meta.glob<{ default: ImageMetadata }>('@kundebilleder/**/*.{jpg,jpeg,png,webp,avif}', { eager: true });
const all: Record<string, { default: ImageMetadata }> = Object.fromEntries(
  Object.entries(raw).map(([k, v]) => [k.replace(/^.*?\/images\//, '').replace(/^@kundebilleder\//, ''), v])
);

export function resolveImage(src: string | undefined): ImageMetadata | string | null {
  if (!src) return null;
  if (/^https?:\/\//.test(src)) return src;
  const key = src.replace(/^\/?(images\/)?/, '');
  const hit = all[key];
  if (!hit) throw new Error(`Billedet "${src}" findes ikke i sites/${KUNDE}/images/`);
  return hit.default;
}

/** Absolut URL til et billede (til JSON-LD og og:image). Lokale billeder får deres byggede filsti. */
export function publicUrl(src: string | undefined, domain: string): string | undefined {
  if (!src) return undefined;
  if (/^https?:\/\//.test(src)) return src;
  if (src.startsWith('/')) return domain + src;
  const img = resolveImage(src);
  return img && typeof img !== 'string' ? domain + img.src : undefined;
}

// Fjernbillede i ny størrelse med bevarede proportioner. Astros getImage med inferSize beholder ellers
// den originale bredde eller højde, når kun den ene angives, og så bliver billedet klemt.
// Derfor læses de originale mål først, og begge mål sendes med.
const sizeCache = new Map<string, Promise<{ width: number; height: number }>>();
export async function remoteResized(src: string, want: { width?: number; height?: number }, format = 'webp') {
  if (!sizeCache.has(src)) sizeCache.set(src, inferRemoteSize(src).then((m) => ({ width: m.width, height: m.height })));
  const o = await sizeCache.get(src)!;
  let width = want.width, height = want.height;
  if (width && !height) height = Math.round((o.height * width) / o.width);
  else if (height && !width) width = Math.round((o.width * height) / o.height);
  // Aldrig større end originalen.
  if (width! > o.width) { height = Math.round((height! * o.width) / width!); width = o.width; }
  const img = await getImage({ src, width, height, format: format as any });
  return { src: img.src, width: width!, height: height! };
}
