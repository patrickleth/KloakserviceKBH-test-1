// Indholdssamlinger for den valgte kunde (KUNDE). Felterne valideres ved hver bygning,
// så en fejl i en sidefil stopper bygningen med en tydelig besked i stedet for en ødelagt side.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import fs from 'node:fs';

const KUNDE = process.env.KUNDE || 'eksempel';

// focus: hvilken del af billedet der skal blive synlig, når det beskæres (cover): top, bottom, left, right, center.
const image = z.object({ src: z.string(), alt: z.string().default(''), focus: z.enum(['top', 'bottom', 'left', 'right', 'center']).optional() });

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: `./sites/${KUNDE}/pages` }),
  schema: z.object({
    type: z.enum(['home', 'service', 'legeplads', 'city', 'about', 'contact', 'quote', 'legal', 'job', 'lp', 'pricing']),
    navLabel: z.string(),
    title: z.string(),
    description: z.string().optional().default(''),
    h1: z.string(),
    intro: z.string().optional().default(''),
    formService: z.string().optional(),
    images: z.array(image).optional().default([]),
    // Layout: hero-billede (ellers images[0] eller brand.hero), USP'er i hero (ellers site.badges), formularens overskrift
    heroImage: image.optional(),
    eyebrow: z.string().optional(), // lille overlinje over H1 i hero, fx "Aut. kloakmester"
    // Prisside (type: pricing)
    prices: z.object({
      heading: z.string().default('Vejledende priser'),
      lead: z.string().optional(),
      notice: z.string().optional(),
      footnote: z.string().optional(),
      items: z.array(z.object({ name: z.string(), price: z.number().optional(), from: z.boolean().default(true), unit: z.string().optional(), text: z.string().optional(), slug: z.string().optional(), tag: z.string().optional() })).default([])
    }).optional(),
    urgent: z.object({ heading: z.string(), price: z.number(), unit: z.string().optional(), text: z.string().optional(), extra: z.string().optional(), times: z.array(z.object({ label: z.string(), value: z.string() })).default([]) }).optional(),
    billing: z.object({ heading: z.string().default('Sådan afregner vi'), items: z.array(z.object({ icon: z.string().optional(), title: z.string(), text: z.string() })) }).optional(),
    heroVideo: z.object({ src: z.string(), poster: z.string().optional(), type: z.string().optional() }).optional(),
    usps: z.array(z.string()).optional(),
    formTitle: z.string().optional(),
    menuText: z.string().optional(), // kort tekst under menupunktet i undermenuen
    custom: z.array(z.string()).optional(), // kundens egne sektioner fra sites/<kunde>/components/ (navne uden .astro)
    icon: z.string().optional(), // ikon i mega-menu og ydelseskort (navn fra LineIcon.astro). Uden: gættes ud fra adressen
    // Kort-blok: fx "Tre ting der har størst betydning for prisen"
    cards: z.object({ eyebrow: z.string().optional(), heading: z.string(), lead: z.string().optional(), items: z.array(z.object({ title: z.string(), text: z.string() })).min(2).max(6) }).optional(),
    // Ofte stillede spørgsmål (vises som harmonika og FAQPage-schema). Kan også skrives som ## Ofte stillede spørgsmål med ### pr. spørgsmål.
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    // Person-CTA (mørkt bånd med kontaktpersonen). Overskriver site.personCta for denne side.
    personCta: z.object({ heading: z.string().optional(), text: z.string().optional() }).optional(),
    notes: z.array(z.string()).optional().default([]),
    noindex: z.boolean().optional().default(false),
    updated: z.coerce.date().optional(),
    // Bysider
    city: z.string().optional(),
    localProof: z
      .array(z.object({ kind: z.enum(['case', 'anmeldelse', 'billede', 'servicetid']), title: z.string().optional(), text: z.string(), src: z.string().optional(), alt: z.string().optional() }))
      .optional()
      .default([]),
    // Forside
    process: z.object({ heading: z.string(), lead: z.string(), steps: z.array(z.object({ title: z.string(), text: z.string(), icon: z.string().optional() })), outro: z.string().optional() }).optional(),
    why: z.object({ heading: z.string(), body: z.array(z.string()) }).optional(),
    serviceCards: z.array(z.object({ slug: z.string(), title: z.string(), text: z.string() })).optional(),
    closing: z.object({ heading: z.string(), body: z.array(z.string()) }).optional(),
    // Landingssider til Google Ads
    variant: z.string().optional(),
    lpBullets: z.array(z.string()).optional()
  })
});

const blog = defineCollection({
  // Kunder uden blogmappe får en tom samling uden advarsler.
  loader: fs.existsSync(`./sites/${KUNDE}/blog`) ? glob({ pattern: '**/*.md', base: `./sites/${KUNDE}/blog` }) : async () => [],
  schema: z.object({
    title: z.string(),
    description: z.string(),
    h1: z.string().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    keyword: z.string().optional(),
    image: image.optional(),
    related: z.array(z.string()).optional().default([]),
    draft: z.boolean().optional().default(false)
  })
});

export const collections = { pages, blog };
