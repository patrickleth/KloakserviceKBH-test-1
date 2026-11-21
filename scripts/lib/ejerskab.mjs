// Hvem ejer hvilke filer. Grundlaget for "ét repo pr. kunde".
//
// Kundens filer (rører en skabelonopdatering ALDRIG):
//   sites/<kunde>/     indhold, billeder, site.json og kundens egne sektioner (components/)
//   wrangler.jsonc     kundens Worker, domæne og variabler i Cloudflare
//   vaekster.json      manifest: hvilken kunde repoet tilhører og hvilken skabelonversion det kører
//
// Skabelonens filer: alt andet (src/, server/, cloudflare/, scripts/, tests/, docs/, package.json osv.)
// plus sites/eksempel/, som testene bruger. Andre kunders mapper kommer aldrig med i et kunderepo.

export const KUNDE_ROD = ['wrangler.jsonc', 'vaekster.json'];

/** Er filen kundens (i et kunderepo for `kunde`)? */
export const erKundensFil = (p, kunde) => KUNDE_ROD.includes(p) || p.startsWith(`sites/${kunde}/`);

/** Hører filen til skabelonen (set fra skabelonens repo)? */
export const erSkabelonFil = p =>
  !KUNDE_ROD.includes(p) && !p.startsWith('kunder-arkiv/') && (!p.startsWith('sites/') || p.startsWith('sites/eksempel/'));

/** Git-stier til `git archive`, der giver præcis skabelonens filer. */
export const SKABELON_PATHSPEC = ['.', ':(exclude)sites', ':(exclude)kunder-arkiv', ':(exclude)wrangler.jsonc', ':(exclude)vaekster.json'];
export const EKSEMPEL_PATHSPEC = ['sites/eksempel'];
