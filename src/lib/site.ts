import { getCollection, type CollectionEntry } from 'astro:content';
import { loadSite, KUNDE, MODE, IS_TEST, TEST_FORM } from './config.mjs';

export const site = loadSite();
export { KUNDE, MODE, IS_TEST, TEST_FORM };
export type Page = CollectionEntry<'pages'>;

let _pages: Page[] | null = null;
export async function allPages(): Promise<Page[]> {
  if (!_pages) _pages = await getCollection('pages');
  return _pages;
}

/** URL for en side-id. 'index' er forsiden. */
export { postPath } from './config.mjs';
export const href = (slug: string) => (slug === 'index' || slug === '' ? '/' : `/${slug.replace(/^\/|\/$/g, '')}/`);
export const abs = (slug: string) => site.domain + href(slug);

export async function bySlug(): Promise<Record<string, Page>> {
  return Object.fromEntries((await allPages()).map(p => [p.id, p]));
}

export function metaDescription(data: Page['data']): string {
  if (data.description) return data.description;
  const t = (data.intro || '').replace(/\s+/g, ' ').trim();
  return t.length > 155 ? t.slice(0, t.lastIndexOf(' ', 152)) + '…' : t;
}

/** Hvilken menugruppe hører en side til (bruges til brødkrumme og "relaterede"). */
export function groupOf(slug: string) {
  const m = site.menu.find((m: any) => m.children?.includes(slug));
  // Mega-menu med grupper: den gruppe, siden ligger i (fx "Tilstopninger"), ikke hele menupunktet.
  const g = m?.groups?.find((g: any) => g.children.includes(slug));
  return g ? { label: g.label || m.label, children: g.children } : m;
}

export function crumbs(page: Page) {
  const list: { name: string; slug: string | null }[] = [{ name: 'Forside', slug: 'index' }];
  // En menugruppe med en side af samme navn (fx "Legepladser") vises som mellemled.
  // En gruppe uden egen side (fx "Vi tilbyder") springes over.
  const g = groupOf(page.id);
  const groupPage = g?.children.find((c: string) => c === g.label.toLowerCase().replace(/\s+/g, '-'));
  if (groupPage && groupPage !== page.id) list.push({ name: g.label, slug: groupPage });
  if (page.id !== 'index') list.push({ name: page.data.navLabel, slug: page.id });
  return list as { name: string; slug: string }[];
}

export const telHref = `tel:${site.phone.e164}`;

/** Sidetyper med tilbudsformular på siden. */
export const FORM_TYPES = ['home', 'service', 'legeplads', 'about', 'contact', 'city', 'lp', 'quote'];
/** "Indhent tilbud" peger på formularen, hvis siden har en, ellers på tilbudssiden (eller kontakt). */
export async function quoteLink(hasForm: boolean) {
  if (hasForm) return '#tilbud';
  const pages = await bySlug();
  if (site.quoteSlug && site.quoteSlug in pages) return href(site.quoteSlug);
  return 'kontakt' in pages ? href('kontakt') : '/';
}
