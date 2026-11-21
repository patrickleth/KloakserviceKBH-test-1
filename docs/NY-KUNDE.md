# Tjekliste: ny kunde eller migrering fra WordPress

Til Julie og Line. Sæt kryds i rækkefølge. Alt foregår i repoet og i Cloudflare; ingen adgangskoder eller nøgler i filer, ClickUp eller chat.

## 1. Opret kunden

- [ ] `npm run ny-kunde -- <mappenavn> --navn "Firma ApS" --domaene https://firma.dk --telefon "12 34 56 78"`
- [ ] Udfyld `sites/<mappe>/site.json`: adresse, CVR, kontaktperson, telefontider, områder (`areaServed`), farver (`tokens`), badges, ydelser i formularen (`form.services`), menu og footerlinks
- [ ] Farver: tjek at teksten på knapperne kan læses (kontrast mindst 4,5:1, fx på webaim.org/resources/contrastchecker)

## 2. Indhold

- [ ] Ved migrering: træk teksten ud side for side efter `docs/INDHOLDSFORMAT.md`. Ordret tekst, kun åbenlyse stavefejl rettes, og hver rettelse skrives i `notes`
- [ ] Én fil pr. side i `pages/`. Filnavnet bliver URL'en, så behold de gamle URL'er hvor muligt
- [ ] Hver side har `title` (højst ca. 60 tegn) og helst `description` (50 til 160 tegn)
- [ ] Bysider (`type: city`) får kun lov at være indekserbare med rigtig lokal dokumentation i `localProof`
- [ ] Anmeldelser i site.json er ordrette og fra en rigtig kilde
- [ ] Gamle URL'er der ikke findes mere: tilføj under `redirects` i site.json (brug evt. Væksters sitemap-redirects-skill)

## 3. Billeder

- [ ] Ved migrering: `KUNDE=<mappe> npm run hent-billeder` (henter alle billeder fra den gamle side og retter henvisningerne). Tilføj `-- --test` for først at se listen
- [ ] Fotos i `images/`, logo og favicon i `public/`
- [ ] Alle billeder har en alt-tekst, der beskriver billedet

## 4. Byg og tjek lokalt

- [ ] `KUNDE=<mappe> npm run dev` og klik hele siden igennem på mobil og computer
- [ ] `KUNDE=<mappe> npm run build` og læs `rapport/<mappe>.txt`
- [ ] `KUNDE=<mappe> npm run qa` giver "Ingen fejl"

## 5. Cloudflare

- [ ] Worker fra repoet (se docs/OPSAETNING-CLOUDFLARE.md). Sæt variabler og hemmeligheder fra README (start med `MODE=test`)
- [ ] Testformular sendt: leadmail og bekræftelse modtaget, leadet ligger i CRM
- [ ] Testside gennemgået af kontaktperson hos Vækster

## 6. Sporing og samtykke

- [ ] GTM-ID i site.json eller `GTM_ID` i byggekommandoen
- [ ] Cookiebot: `consent.provider: "cookiebot"` og `cookiebotId`, og domænet tilføjet i Cookiebot
- [ ] I GTM: Google Ads-konvertering og GA4 lytter på eventet `generate_lead`. Opkald på `tel_click`
- [ ] Meta-pixel via skabelon i GTM, ikke brugerdefineret HTML
- [ ] Tjek med Tag Assistant: intet fyrer før samtykke, alt fyrer efter, og Consent Mode-signalerne skifter korrekt
- [ ] Test i Chrome, Safari på iPhone og Firefox: banner, afvis, accepter, tilbagetrækning via cookieknappen
- [ ] `npm run cookie-scan -- <live-adresse>` giver "Ingen fejl". Nye tredjepartscookies tilføjes med `consent.cookies`
- [ ] Cookiepolitikken passer til siden (formular, GTM, Google Ads, Meta) og har cookieerklæringen nederst
- [ ] Cookiescanning slået til i GitHub Actions (kør den én gang manuelt under Actions)

## 7. Go-live

- [ ] `MODE=production` i byggekommandoen og ny bygning
- [ ] `npm run qa` igen mod produktionsbygningen (stopper hvis billeder stadig hentes fra den gamle side)
- [ ] Send en rigtig testhenvendelse. Tjek mail hos kunden, leadloggen og konverteringen i Google Ads
- [ ] Domæne tilføjet på Workeren, DNS flyttet til Cloudflare, HTTPS aktivt
- [ ] Sitemap indsendt i Search Console (`/sitemap.xml`)
- [ ] Den gamle WordPress lukkes ned eller låses, når DNS er flyttet
- [ ] Opdatér kundekortet i ClickUp med Worker og dato for go-live
