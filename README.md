# Vækster webskabelon (Astro)

Én kodebase til alle Væksters kundesider. Hver kunde er en mappe under `sites/` med en konfigurationsfil, Markdown-sider og billeder. Skabelonen bygger en statisk side med lead-modtager, sporing efter samtykke og sikkerhedsheadere.

Kunder: **Skelbo's Tømrer & Montage** (`sites/skelbo`, 25 sider) og **KloakServiceKbh** (`sites/kloakservicekbh`, 107 sider inkl. 78 bysider). Demokunden `sites/eksempel` er fiktiv og viser alle funktioner.

## Kom i gang

```bash
npm install
KUNDE=skelbo npm run dev          # http://localhost:4321
KUNDE=skelbo npm run build        # bygger til dist/skelbo
KUNDE=skelbo npm run qa           # tjekker links, H1, titler, JSON-LD, alt-tekster
npm test                          # lead-modtageren og browsertests
```

`MODE=production` gør siden indekserbar og formularen aktiv. Uden den bygges en testversion: noindex, testbanner og en formular der kun simulerer afsendelse.

## Mappestruktur

```
sites/<kunde>/
  site.json          navn, kontakt, farver, menu, ydelser, anmeldelser, sporing, viderestillinger
  pages/*.md         én fil pr. side (pages/lp/ til Google Ads-landingssider)
  blog/*.md          valgfri, bloggen bygges kun når der er indlæg
  images/            fotos, optimeres automatisk til AVIF/WebP i flere størrelser
  public/            logo, favicon og filer der skal ligge uændret i roden
src/                 fælles skabelon: komponenter, layout, stil, klientscript
server/              formular, mails og mini-CRM (platformsuafhængig logik)
cloudflare/          Worker, D1/R2-lager (wrangler.jsonc i roden)
scripts/             ny-kunde, hent-billeder, qa
tests/               lead.test.mjs (modtageren), e2e.mjs (browser)
docs/                INDHOLDSFORMAT.md, NY-KUNDE.md (tjekliste)
rapport/<kunde>.txt  byggerapport med noter og advarsler (genereres, offentliggøres aldrig)
```

## Layout

Opbygningen følger Væksters bedst konverterende sider (Sjællands Dødsbo, Mesa Byg):

1. Header oven på en fuldbredde hero. Den bliver hvid og fast, når man scroller.
2. Hero med mærke (fx "Aut. kloakmester"), stjerner, H1, intro, USP-piller, knapperne "Ring" og "Indhent tilbud" og et formularkort.
3. Bevægende logobånd med samarbejdspartnere, derefter anmeldelser som automatisk glidende bånd (ingen pause).
4. Tekst og billede, der skifter side for hver sektion, med knapper.
5. Person-CTA: mørkt bånd med kontaktpersonen ("Sebastian svarer selv"). Uden portræt vises et arbejdsbillede, så båndet aldrig står uden billede.
6. Kort (fx "Tre ting der har størst betydning for prisen"), lokal dokumentation på bysider og samarbejdspartnere.
7. FAQ som harmonika med FAQPage-schema.
8. Kontaktsektion med kontaktliste og formularen igen. Alle "Indhent tilbud"-knapper lander her.
9. Footer med kontakt, ydelser, områder (bysider findes automatisk) og virksomhed. Fast ring-knap nederst til højre (to lige store knapper, Ring og Indhent tilbud, på mobil). Lille cookieknap nederst til venstre.

### Farveregel for knapper (gælder alle kunder)

- **Telefonknappen har altid `call`-farven** (typisk kundens røde). Rød betyder akut, så den bruges kun til at ringe.
- **"Indhent tilbud" har `cta`-farven** (kundens sekundære farve, fx KloakServiceKbh's gule med sort tekst).
- **Formularens baggrund er `formBg`** (standard: kundens mørke farve), aldrig call-farven.
- Primære og sekundære knapper har altid hver sin farve, og knapper i samme gruppe er lige store (`.btn-pair`).
- Sættes i `tokens` i site.json: `call`, `cta`, `ctaText`, `formBg` (uden dem: call = primary, cta = accent, formBg = primaryDark; tekstfarven vælges automatisk efter kontrast). Bygningen advarer, hvis call og cta er ens.

Anmeldelseskortene viser platformens ikon til venstre og stjerner i platformens farve (Trustpilot grøn, Google gul/orange, Facebook blå) ud fra `source` på anmeldelsen. Ikonerne ligger i `src/assets/ikoner/`. Autorisationer og certificeringer kan vises i hero og footer (`logoRows[].hero`/`footer`), og "Som nævnt i"-rækken ligger lige under anmeldelserne. Overlinjer bruger `--eyebrow`, som aldrig er telefonknappens røde.

Indholdssektioner har som udgangspunkt overskrift, brødtekst, knapper ("Indhent tilbud" og "Ring") og billede, men det er en retningslinje, ikke en regel uden undtagelser. Billede og tekst skifter side, og fordelingen varierer mellem 50/50, 60/40 og 40/60. Billederne tages fra sidens `images`, derefter kundens `gallery` i site.json. Dertil kommer områdeblokken "Her kommer vi" med links til by-/ydelsessider (fx /slamsugning-frederiksberg/), logo-rækker (samarbejdspartnere, "Som nævnt i", certificeringer) og hero med video, hvis kunden har en (`brand.heroVideo`).

Formularen er som standard kort (ét trin: navn, e-mail, telefon, adresse, postnr., by, beskrivelse og "Hvor har du fundet os?") og har felt til at vedhæfte billeder og PDF. Alle felter og blokke er beskrevet i `docs/INDHOLDSFORMAT.md`. `node scripts/skaermbilleder.mjs` tager skærmbilleder af en bygget kunde til gennemsyn.

## Sidetyper

Feltet `type` i en sides frontmatter vælger skabelonen. Formatet er beskrevet i `docs/INDHOLDSFORMAT.md`.

| type | Bruges til | Særligt |
|---|---|---|
| `home` | Forsiden | Nøgletal, ydelseskort, "hvorfor os", proces som nummererede kort |
| `service`, `legeplads` | Ydelsessider | Formular i toppen med ydelsen forvalgt (`formService`) |
| `city` | Bysider | Kræver `localProof`. Uden: advarsel eller noindex (`cityPolicy` i site.json) |
| `about`, `contact` | Om os, kontakt | Som servicesider, uden forvalg |
| `quote` | Indhent tilbud | Ingen menu. Hero med formular, anmeldelser og person-CTA |
| `lp` | Google Ads | Ingen menu, altid noindex, ikke i sitemap, fast ring-knap på mobil. `variant` sendes med som leadtype |
| `legal`, `job` | Politikker, job | Ren tekstside |

## Takkesider

Alle kunder får automatisk `/henvendelse/` (efter formularen) og `/udfyldt-prisberegner/` (efter en prisberegner, fx Fillout). Siderne giver ro i maven: hvad sker der nu (3 trin), hvem kontakter dig og hvornår, "Haster det? Ring", anmeldelser, nøgletal, logoer og spørgsmål om forløbet (`thankYou.faq` i site.json). Begge er noindex og står ikke i sitemap.

Konverteringen sendes herfra: `generate_lead` til dataLayer (og Meta `Lead` med samme event-id), én gang pr. lead, også hvis siden genindlæses. Med marketing-samtykke sendes e-mail og telefon som `user_data` til Googles udvidede konverteringer. I GTM kan konverteringen derfor udløses på enten eventet `generate_lead` eller sidevisning af `/henvendelse/`.

Prisberegneren skal sende folk til `https://<domæne>/udfyldt-prisberegner/?id=<svar-id>&navn=<navn>`, så konverteringen kun tælles én gang og siden kan hilse med navn.

## Leads

Formularen sender til `/api/lead` (`cloudflare/worker.mjs`, logik i `server/lead-core.mjs`).

Hvert lead leveres op til tre steder på samme tid:

1. **Leadlog** via Make-webhook (Google Sheet og/eller Pipedrive) med side, UTM, gclid, fbclid, leadtype og et tomt kvalitetsfelt.
2. **Mail til kunden** via Mailgun EU med svar-til den besøgende.
3. **Mini-CRM** på `/administrator-system/` (se nedenfor), inkl. vedhæftede filer.

Fejler en af dem, går leadet stadig igennem, og der sendes alarm. Fejler alle, svarer modtageren 502, og formularen viser telefonnummeret. Konverteringen (`generate_lead`) sendes først, når modtageren har bekræftet leadet. Spam stoppes af et skjult felt, et tidstjek og Cloudflares rate limit (10 pr. minut pr. IP).

**Vedhæftede filer:** op til 6 billeder eller PDF. Billeder gøres mindre i browseren (højst 1600 px), og alt i alt højst 4,5 MB, fordi serveren tager højst ca. 6 MB pr. forespørgsel. Filerne sendes med mailen til kunden; leadloggen får filnavne. Store videoer kan ikke sendes; så beder formularen folk sende dem på mail.

### Miljøvariabler (sættes i Cloudflare, aldrig i repoet eller ClickUp)

| Variabel | Krævet | Indhold |
|---|---|---|
| `KUNDE` | ja | Mappenavn under `sites/` |
| `MODE` | ja | `production` når siden er live, ellers `test` |
| `BRAND_NAME` | ja | Firmanavn i mails |
| `MAKE_WEBHOOK_URL` | en af de to | Make-scenariet der skriver leadloggen |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` | en af de to | Mailgun (EU). Nøglen ligger i 1Password |
| `MAILGUN_REGION` | nej | `eu` (standard) eller `us` |
| `LEAD_TO` | ja med Mailgun | Kundens modtageradresse |
| `LEAD_BCC` | nej | Fx Væksters leadpostkasse |
| `LEAD_FROM` | nej | Afsender. Standard: `BRAND_NAME <hjemmeside@MAILGUN_DOMAIN>` |
| `ALERT_EMAIL` | anbefalet | Hvem får alarm, hvis en kanal fejler |
| `ALERT_WEBHOOK_URL` | anbefalet | Alarm når Mailgun selv er nede (fx Slack eller Make) |
| `CONFIRM_TO_LEAD` | nej | Bekræftelse til den besøgende er slået til som standard. `false` slår den fra for kunden |
| `CONFIRM_MAILGUN_DOMAIN` | nej | Eget afsenderdomæne til bekræftelser, fx `b.indsendelse.dk`. Uden: samme som `MAILGUN_DOMAIN` |
| `CONFIRM_MAILGUN_API_KEY` | nej | Hemmelighed. Mailgun sending key til bekræftelsesdomænet (sending keys gælder kun ét domæne). Uden: `MAILGUN_API_KEY` |
| `CONFIRM_FROM` | nej | Fx `KloakServiceKbh <bekraeftelse@b.indsendelse.dk>` |
| `CONFIRM_PHONE` | nej | Telefonnummer i bekræftelsen ("Haster det, så ring på ...") |
| `CONFIRM_PROMISE` | nej | Fx `inden for 24 timer` i bekræftelsen |

Bekræftelsen er ren tekst uden links og gentager ikke det, den besøgende skrev. Hver adresse får højst én pr. døgn, så formularen ikke kan misbruges til at sende spam.
| `ALLOWED_ORIGINS` | nej | Ekstra domæner der må sende til formularen (kommasepareret) |
| `GTM_ID` | nej | Overskriver `tracking.gtmId` fra site.json |
| `META_PIXEL_ID` | nej | Overskriver `tracking.metaPixelId` fra site.json |
| `TEST_TRACKING` | nej | `true` slår GTM og Meta til på en testversion. Ellers sendes der aldrig data til kundens rigtige konti fra en test |
| `ADMIN_USERS` | til CRM | Brugere til mini-CRM'et, lavet med `npm run admin-bruger -- <navn>`. Flere adskilles med komma |
| `ADMIN_SECRET` | til CRM | Mindst 32 tilfældige tegn (scriptet foreslår en). Signerer login-cookien |
| `CRM_ENABLED` | nej | `false` slår gemning i CRM'et fra |
| `TEST_FORM` | nej | `true` får formularen til at sende rigtigt på en testversion (leads lander i CRM'et; sæt ikke `LEAD_TO`, så kunden ikke får testmails) |

## Mini-CRM (/administrator-system/)

Alle kunder får et lille CRM på en skjult adresse: `https://<kundens-domæne>/administrator-system/`.

- **Design:** neutralt og ens for alle kunder (ikke kundens branding), mobil først og Apple-inspireret. Liste og board, smarte lister (Alle, Opfølgning, Tildelt mig, Arkiveret), stages med egne navne og farver, gemte visninger, filtre og sortering. Næste opfølgning er rød ved overskredet, orangegul i dag. Alt gemmes automatisk.
- **Alle formularhenvendelser lander her automatisk** med side, UTM/gclid/fbclid og vedhæftede filer. Manuelle leads (fx telefonopkald) oprettes med "+ Nyt lead".
- **Detaljevindue:** ring/mail-knapper, alle felter kan rettes, værdi i kr., ansvarlig, noter med navn og tid, historik over ændringer.
- **Overblik:** nye henvendelser, leads denne måned, værdi af åbne tilbud og vundet denne måned. Søgning på navn, telefon, adresse og opgave.
- **Sikkerhed:** adgangskoder gemt som scrypt-hash i `ADMIN_USERS`; login-cookie signeret (HMAC-SHA256), HttpOnly, Secure, SameSite=Strict og kun gyldig under `/administrator-system`, udløber efter 12 timer; 5 forkerte forsøg låser brugernavn og IP i 15 minutter; Cloudflares rate limit på 60 kald pr. minut; ændringer kræver eget domæne og en særlig header (CSRF-værn); filer vises med sandbox-CSP; siden er noindex, uden sporing og står ikke i sitemap eller robots.txt. Indsendt tekst vises altid som tekst, aldrig som HTML.
- **Lager:** Cloudflare D1 (leads) og R2 (filer), begge i EU. Hver kundes data er mærket med `SITE_ID`.
- **Glemt adgangskode:** brugeren får et engangslink på mail (gyldigt i 30 minutter, højst 3 pr. kvarter). Kræver e-mail i `ADMIN_USERS` og Mailgun (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`). Den nye kode gemmes i CRM-lageret, og alle andre sessioner logges ud.
- **Opsætning:** `npm run admin-bruger -- kunde kunde@firma.dk` → kopiér linjen til `ADMIN_USERS` og sæt `ADMIN_SECRET` som hemmeligheder i Cloudflare → deploy. Uden de to variabler viser siden "ikke sat op".
- Koden: `src/pages/administrator-system/`, `src/scripts/admin.ts`, `cloudflare/worker.mjs`, `server/crm-core.mjs`, `server/admin-auth.mjs`. Tests: `npm run test:crm`.

## Samtykke og sporing

- **Google Consent Mode v2** med alle signaler (ad_storage, ad_user_data, ad_personalization, analytics_storage, functionality_storage, personalization_storage) sat til "denied" som det første i `<head>`.
- **Cookiebot** (`consent.provider: "cookiebot"` + `cookiebotId`): den certificerede løsning, I bruger i dag. Cookiebot opdaterer Consent Mode, og GTM indlæses efter samtykke. Cookiebot virker kun på domæner, der er tilføjet i Cookiebot, så testversioner på `.workers.dev` bruger det interne banner.
- **Væksters eget banner** (`consent.provider: "intern"`, standard):
  - "Afvis alle" og "Accepter alle" står på første lag med samme udseende og størrelse (testet automatisk på computer og mobil). Intet er slået til på forhånd.
  - Teksten nævner formål og udbydere (Google, Meta), og at samtykket kan trækkes tilbage via cookieknappen.
  - **Samtykkelog:** hvert valg gemmes i D1 (`/api/consent`): samtykke-id, tidspunkt, bannerets version, valg pr. kategori, metode og side. Ingen IP eller browserdata. Opslag og CSV-eksport i CRM'et: `/administrator-system/api/samtykker?id=<id>&format=csv`.
  - **Fornyelse:** nyt samtykke efter 12 måneder, og når bannerets version skifter (ny cookie i erklæringen eller ny tekst, `BANNER_REV` i `src/lib/cookies.mjs`).
  - **Tilbagetrækning:** cookies for de fravalgte kategorier slettes på alle domæneniveauer, og siden genindlæses, så indlæste scripts stopper.
- **Cookieerklæring:** udledes af opsætningen (`src/lib/cookies.mjs`: GTM giver Google Analytics og Ads, `metaPixelId` giver Meta, egne med `consent.cookies`). Vises automatisk nederst på cookiepolitikken sammen med den besøgendes samtykke-id, og som `/cookies.json`.
- **Månedlig scanning:** `.github/workflows/cookie-scan.yml` kører `scripts/cookie-scan.mjs` den 1. i hver måned mod den live side (`consent.scanUrl` eller `domain`, eller repo-variablen `SCAN_URL`). Fejler den, sender GitHub en mail.
- **Byggerapporten** advarer om indlejret indhold (YouTube, Google Maps o.l.), der sætter cookies før samtykke.
- **GTM**: `tracking.gtmId`. Indlæses først efter samtykke til statistik eller marketing (`tracking.consentMode: "basic"`, standard). `"advanced"` indlæser GTM med det samme med alt afvist, så Google kan modellere konverteringer.
- **Meta Pixel**: `tracking.metaPixelId`. Indlæses kun efter marketing-samtykke, sender PageView og Lead (på takkesiden). Lad feltet være tomt, hvis pixlen ligger i GTM.
- gclid og fbclid gemmes og sendes kun med marketing-samtykke.
- Klik på telefon og mail: `tel_click` og `mailto_click`. Formularen: `form_start`, `form_step`, og `generate_lead` på takkesiden.

## Sitemap

`sitemap.xml` er et indeks (som Yoast), der peger på `page-sitemap.xml` (alle sider) og `post-sitemap.xml` (blogindlæg, når kunden har dem). Noindex-sider, landingssider, takkesider og CRM'et er udeladt. `robots.txt` peger på indekset. Sitemaps skrives også i testversionen (så de kan tjekkes før lancering); dér blokerer robots.txt stadig alt.

## Blogindlæg og egen "Outrank"

Blogindlæg er Markdown i `sites/<kunde>/blog/`. Eksisterende indlæg flyttes med `scripts/importer-wordpress.mjs` (WordPress' REST API, intet login):

```bash
KUNDE=kloakservicekbh WP_URL=https://kloakservicekbh.dk npm run importer-wordpress
```

Adressen styres af `blog.permalink` i site.json:

- `"root"`: indlæggene beholder WordPress-adressen `/<slug>/`. Brug det ved flytning af kunder med eksisterende indlæg (ingen viderestillinger, interne links virker). Bygningen stopper, hvis et indlæg og en side har samme slug.
- `"blog"` (standard): `/blog/<slug>/`. Importeren skriver så 301-viderestillinger fra `/<slug>/` i site.json.

Bloggen findes altid på `/blog/` og kan sættes i menuen med `{ "label": "Blog", "href": "/blog/" }`. Planen for vores egen indholdsmotor står i `docs/BLOGMOTOR.md`.

## Sikkerhed

- Statisk side uden database, login eller plugins. Der er intet at hacke på serveren ud over lead-funktionen.
- `_headers` genereres ved hver bygning med Content-Security-Policy, hvor inline-scripts er låst med SHA-256-hashes, og kun de domæner kunden bruger (GTM, Cookiebot, Meta) er tilladt. Derudover HSTS (uden includeSubDomains, så gamle http-subdomæner ikke rammes), nosniff, X-Frame-Options og Permissions-Policy. Med GTM tillades også Tag Assistant, så sporingen kan tjekkes.
- GTM-tags af typen "Brugerdefineret HTML" blokeres af CSP. Brug GTM-skabeloner (fx Metas officielle pixelskabelon). Kan det ikke undgås, sæt `csp.gtmCustomHtml: true` i site.json.
- Eksterne domæner til fx en kortwidget tilføjes i `csp.extraScript`, `csp.extraConnect` og `csp.extraImg`.
- **npm audit** viser 10 "high" fra picomatch (ReDoS, GHSA-fc5q-39xc-vjpf). Der findes ingen rettet version endnu. Det rammer kun byggeværktøjerne på udviklerens maskine og Cloudflares byggeserver, ikke den færdige side. `overrides` i package.json løfter picomatch til nyeste version. Tjek igen ved hver opdatering.

## Deploy

Ét repo og én Cloudflare Worker pr. kunde. Hele opsætningen står i `docs/OPSAETNING-CLOUDFLARE.md`:

1. Worker fra repoet med Workers Builds. Byggekommando `KUNDE=<mappe> MODE=test npm run build`, deploy `npx wrangler deploy`.
2. Sæt variabler og hemmeligheder (tabellen ovenfor). Start med `MODE=test`.
3. Gennemgå testsiden på `<worker>.workers.dev`, kør `npm run qa`, og send en testhenvendelse.
4. Skift til `MODE=production`, tilføj domænet på Workeren og flyt DNS til Cloudflare.

**Ændringer i skabelonen** rulles ud til hver kunde som et forslag (pull request) i kundens eget repo: bygning, tests og billeder før og efter, og først efter godkendelse går ændringen live. Hver side har sit versionsnummer.

## Exit-pakke

Kunden kan altid få sin side med: `dist/<kunde>` er en komplet statisk side, der kan hostes hvor som helst. Indholdet ligger som Markdown og billeder i `sites/<kunde>`. Leadloggen ligger i kundens eget Sheet/Pipedrive.

## Hvad mangler før kunderne kan gå live

KloakServiceKbh: se `docs/KUNDER.md`.

### Skelbo

Se også byggerapporten `rapport/skelbo.txt`, der lister alle noter fra overførslen.

- [ ] `npm run hent-billeder` med `KUNDE=skelbo` (henter WordPress-billederne lokalt, skal ske før DNS flyttes; QA stopper produktion indtil da)
- [ ] GTM-ID og Cookiebot-konto (eller beslutning om et andet CMP)
- [ ] Make-scenarie til leadlog og Mailgun-opsætning
- [ ] Afklaring med kunden: "4,7 stjerner / +46 anmeldelser" mod "+500 glade kunder", "base i Køge" mod adressen i Lille Skensved, prisen 1485 kr/år på serviceaftalen, lovkravene på legeplads-sikkerhed
- [ ] Cookiepolitikken nævner nyhedsbrev, login og køb, som siden ikke har. Skal skrives om
- [ ] Bysiderne Solrød og Greve mangler lokal dokumentation (cases, anmeldelser eller billeder fra byen)
- [ ] Meta-beskrivelser mangler på de fleste sider (WordPress havde dem heller ikke). Skabelonen udleder dem af introen indtil da
- [ ] Gamle blogindlæg skal flyttes til `sites/skelbo/blog/`, eller have viderestillinger
- [ ] Anmeldelsen fra Michael R. Ingvardsen står to gange (som på den nuværende side). Udskift den ene
- [ ] Indhold til de nye blokke: FAQ og kort findes ikke på den nuværende side. Bør skrives (fx af Claude ud fra kundens svar) og godkendes af kunden
- [ ] Et lyst logo (`brand.logoLight`) og et godt personbillede til formularkortet og person-CTA
- [ ] Filupload i formularen (billeder af opgaven, som hos Mesa Byg) er ikke bygget endnu
