// Logoet i den rigtige størrelse og med de rigtige mål. Kundens logo er ofte meget stort (fx 1920 px bredt),
// men vises kun 40 til 60 px højt. Her laves en lille WebP (dobbelt opløsning til skarpe skærme),
// og width/height følger logoets egne proportioner, så billedet aldrig vises forvrænget.
import { getImage } from 'astro:assets';
import { resolveImage, remoteOptimizable } from './images';

export async function logoImg(src: string | undefined, displayHeight = 52, maxWidth = Infinity) {
  if (!src) return null;
  // Logoer i public/ (fx /logo.svg) og SVG-filer bruges, som de er. De er allerede små og skarpe.
  if (src.startsWith('/') || /\.svg(\?|$)/i.test(src)) return { src, width: undefined, height: displayHeight };
  let r;
  try { r = resolveImage(src); } catch { return { src, width: undefined, height: displayHeight }; }
  if (!r) return null;
  try {
    if (typeof r !== 'string' || remoteOptimizable(r)) {
      const img = await getImage(typeof r === 'string'
        ? { src: r, inferSize: true, height: displayHeight * 2, format: 'webp' }
        : { src: r, height: displayHeight * 2, format: 'webp' });
      const w = Number(img.attributes.width), h = Number(img.attributes.height);
      // Passer logoet ind i højst displayHeight x maxWidth uden at ændre proportionerne.
      const k = Math.min(displayHeight / h, maxWidth / w);
      return { src: img.src, width: Math.round(w * k), height: Math.round(h * k) };
    }
  } catch (e) {
    console.warn('[logo] kunne ikke optimere logoet', (e as Error).message);
  }
  // Fjernlogo uden adgang ved bygning: vis originalen. Mål sættes ikke fast, så proportionerne bevares.
  return { src: typeof r === 'string' ? r : r.src, width: undefined, height: displayHeight };
}
