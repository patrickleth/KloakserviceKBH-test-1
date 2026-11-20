// Linjeikoner (24x24, streg) til mega-menu, ydelseskort, trin og tal. Tegnet til skabelonen, ingen ekstern ikonpakke.
// Navnene kan bruges i sidernes frontmatter (icon: tv) og i site.json.
export const LINE_ICONS: Record<string, string> = {
  pipe: 'M3 4h4M5 4v6a4 4 0 0 0 4 4h6a4 4 0 0 1 4 4v2M17 20h4',
  waves: 'M2 7c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2',
  drain: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 9h8M7 12h10M8 15h8',
  camera: 'M3 7h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM15 10.5 21 7v10l-6-3.5',
  truck: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M6.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  tank: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3v10c0 1.7-3.6 3-8 3s-8-1.3-8-3zM4 7c0 1.7 3.6 3 8 3s8-1.3 8-3M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  layers: 'M12 3 2 8l10 5 10-5zM2 12.5l10 5 10-5M2 17l10 5 10-5',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  droplet: 'M12 2.7S6 9.3 6 14a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z',
  filter: 'M3 4h18l-7 8v6l-4 2v-8z',
  home: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6',
  sprout: 'M12 21v-9M12 12C12 8 9 6 5 6c0 4 3 6 7 6zM12 10c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5z',
  flood: 'M4 13V6l8-3 8 3v7M9 13V9h6v4M2 17c2.5 0 2.5-1.5 5-1.5s2.5 1.5 5 1.5 2.5-1.5 5-1.5 2.5 1.5 5 1.5M2 21c2.5 0 2.5-1.5 5-1.5s2.5 1.5 5 1.5 2.5-1.5 5-1.5 2.5 1.5 5 1.5',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  signal: 'M2 9a14 14 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  sink: 'M3 12h18v1a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6zM12 12V6a2 2 0 0 1 4 0M9 19v2M15 19v2',
  toilet: 'M6 3h6v8H6zM4 11h14a7 7 0 0 1-7 7H9a5 5 0 0 1-5-5zM9 18l-1 3h8l-1-3',
  alert: 'M12 3 2 20h20zM12 9v5M12 17h.01',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  shield: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zM8.5 12l2.5 2.5 4.5-5',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  doc: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 22l5-3 5 3-1.5-8',
  chat: 'M4 4h16v12H8l-4 4z',
  hammer: 'M13 3l8 8-3 3-8-8zM12.5 9.5 3 19l2 2 9.5-9.5',
  arrow: 'M5 12h14M13 6l6 6-6 6'
};

// Gæt et ikon ud fra sidens adresse eller navn, når siden ikke selv har "icon".
const GUESS: [RegExp, string][] = [
  [/intelligent|faelde|fælde/, 'signal'], [/rotte/, 'ban'], [/tv|inspektion|kamera/, 'camera'],
  [/olietank/, 'tank'], [/slam|septik|toemning|tømning/, 'truck'], [/stroempe|strømpe|renover|relining/, 'layers'],
  [/spul|hoejtryk|højtryk/, 'waves'], [/rens|afloeb|afløb/, 'drain'], [/toilet/, 'toilet'], [/vask/, 'sink'],
  [/reparation/, 'wrench'], [/faldstamme/, 'pipe'], [/faskine|regnvand/, 'droplet'], [/fedt/, 'filter'],
  [/omfangsdr/, 'home'], [/rod/, 'sprout'], [/hoejvand|højvand/, 'flood'], [/akut|doegn|døgn/, 'alert'],
  [/pris/, 'tag'], [/kunde|glade/, 'users'], [/erfaring|år\b/, 'award'], [/trustpilot|anmeld|stjerne/, 'star'],
  [/tilbud|svar|timer/, 'clock'], [/garanti|autoriser|forsikr/, 'shield'], [/tag|tømrer/, 'hammer'], [/kloak/, 'pipe']
];
export function iconFor(...keys: (string | undefined)[]): string {
  const k = keys.filter(Boolean).join(' ').toLowerCase();
  for (const [re, name] of GUESS) if (re.test(k)) return name;
  return 'check';
}
