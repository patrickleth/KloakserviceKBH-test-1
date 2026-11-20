// Billeder kan være lokale (sites/<kunde>/images/...) eller fjern-URL'er.
// Lokale billeder optimeres ved bygning til AVIF/WebP i flere størrelser.
// Fjern-URL'er (typisk den gamle WordPress-side under migrering) vises som de er.
import type { ImageMetadata } from 'astro';
import { KUNDE } from './config.mjs';

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
