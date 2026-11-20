// Deler sidens Markdown op i sektioner ved hver "## Overskrift", så skabelonen kan
// lægge overskrift og brødtekst i hver sin kolonne og indsætte CTA'er mellem sektionerne.
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

export type Section = { heading: string; eyebrow: string; html: string };

/** "## Overlinje | Overskrift" deles i overlinje og overskrift. */
function parseHeading(h: string) {
  const i = h.indexOf(' | ');
  return i > 0 ? { eyebrow: h.slice(0, i).trim(), heading: h.slice(i + 3).trim() } : { eyebrow: '', heading: h.trim() };
}

export function splitSections(body: string | undefined): Section[] {
  if (!body?.trim()) return [];
  const out: Section[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  const pre: string[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) out.push({ ...parseHeading(current.heading), html: render(current.lines.join('\n')) });
      current = { heading: m[1], lines: [] };
    } else if (current) current.lines.push(line);
    else pre.push(line);
  }
  if (current) out.push({ ...parseHeading(current.heading), html: render(current.lines.join('\n')) });
  // Tekst før første ## bliver en sektion uden overskrift.
  if (pre.join('').trim()) out.unshift({ heading: '', eyebrow: '', html: render(pre.join('\n')) });
  return out;
}

export function render(md: string): string {
  // ## i brødtekst er allerede brugt til sektioner; # er H1 og må ikke forekomme i brødtekst.
  return (marked.parse(md.replace(/^#\s/gm, '### '), { async: false }) as string)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

/** Er overskriften en FAQ-sektion? ("Ofte stillede spørgsmål", "FAQ", "Har du flere spørgsmål?") */
export const isFaqHeading = (h: string) => /^(ofte stillede spørgsmål|faq|har du (flere )?spørgsmål)/i.test(parseHeading(h).heading);

/**
 * FAQ fra brødteksten: sektionen "## Ofte stillede spørgsmål" med "### Spørgsmål" efterfulgt af svaret.
 * Returnerer overskrift og spørgsmål, eller null hvis siden ikke har en FAQ-sektion.
 */
export function faqFromBody(body: string | undefined): { heading: string; items: { q: string; a: string }[] } | null {
  if (!body) return null;
  const lines = body.split('\n');
  const start = lines.findIndex(l => /^##\s/.test(l) && isFaqHeading(l.replace(/^##\s+/, '')));
  if (start < 0) return null;
  const heading = parseHeading(lines[start].replace(/^##\s+/, '')).heading;
  const items: { q: string; a: string }[] = [];
  let cur: { q: string; a: string[] } | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const m = line.match(/^###\s+(.+?)\s*$/);
    if (m) { if (cur) items.push({ q: cur.q, a: cur.a.join('\n').trim() }); cur = { q: m[1], a: [] }; }
    else if (cur) cur.a.push(line);
  }
  if (cur) items.push({ q: cur.q, a: cur.a.join('\n').trim() });
  return items.length ? { heading, items: items.filter(i => i.a) } : null;
}
