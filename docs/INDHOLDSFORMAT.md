# Indholdsformat: én Markdown-fil pr. side

Filen ligger i `sites/<kunde>/pages/<slug>.md`. Filnavnet er sidens URL: `terrasse.md` bliver `/terrasse/`.
Forsiden hedder `index.md`.

```markdown
---
type: service            # service | legeplads | city | about | contact | quote | legal | job | lp
navLabel: Terrasse       # navnet i menuen og i brødkrummen
title: "Terrasse i træ | Ny terrasse og renovering | Skelbo Tømrer"   # <title>, ordret fra den nuværende side
description: ""          # meta-beskrivelse. Tom = genereres fra intro
h1: En terrasse du har lyst til at bruge hver dag
intro: >-
  Første afsnit under H1, ordret.
formService: Ny terrasse # valgfri: ydelse der er forvalgt i formularen (skal findes i site.json form.services)
images:
  - src: https://skelbostoemrer.dk/wp-content/uploads/2025/07/terrasse.jpg
    alt: Ny træterrasse ved villa
notes:
  - "Rettet stavefejl: 'reperation' til 'reparation' i sektion 1"
---

## Første sektionsoverskrift

Afsnit 1 ordret.

Afsnit 2 ordret.

### Valgfri underoverskrift

- Listepunkt
- Listepunkt

## Næste sektion

Afsnit.
```

## Regler for udtræk fra en eksisterende side

1. Dansk tekst ORDRET. Ingen omskrivning og intet opdigtet indhold.
2. Kun sidens unikke indhold: H1, intro og indholdssektioner. Menu, knapper ("Indhent tilbud", telefon), badges ("Tilbud inden for 24 timer", "+500 Glade kunder..."), formularen ("Trin 1 af 3..."), anmeldelser, partnerlogoer ("Et udpluk af virksomheder..."), footer og copyright indsætter skabelonen selv.
3. Hver indholdssektion starter med `## Overskrift`. Tekst, der fortsætter en sektion uden egen overskrift, skrives bare videre under den forrige `##`. En overskrift inde i en sektion bliver `###`.
4. Afsnit: hvor teksten løber sammen efter punktum uden mellemrum ("hverdagen.Med"), starter et nyt afsnit. Adskil afsnit med en tom linje.
5. Lister skrives som `- punkt`, når indholdet tydeligt er en liste.
6. Ret KUN åbenlyse stavefejl i virksomhedens egen tekst og skriv hver rettelse i `notes`. Ret aldrig kundeanmeldelser. Fjern dubletter og afbrudte fragmenter, og skriv det i `notes`.
7. Observationer der bør afklares med kunden (modstridende tal, adresser, forældet tekst) skrives også i `notes`.
8. Billeder: kun URL'er du har set i sidens HTML under `/wp-content/uploads/`. Aldrig gættede URL'er. Udelad logo, partnerlogoer, anmeldelsesikoner og portrættet `sebastian-skelbo.jpg` (det er et fælles element).
9. YAML: sæt citationstegn om værdier med kolon, `#`, eller som starter med et specialtegn. Brug `>-` til lange tekster.
10. UTF-8 med æ, ø, å som rigtige tegn.

## Layoutfelter (valgfri)

Siderne bygges som Væksters bedst konverterende opsætning: hero med formular, anmeldelser, tekst og billede der skifter side, person-CTA, kort, FAQ og kontakt. Blokkene vises kun, når der er indhold til dem.

```yaml
heroImage: { src: terrasse-hero.jpg, alt: "..." }   # ellers første billede i images, ellers brand.hero
usps: ["Fast pris", "Gratis besigtigelse", "Svar inden for 24 timer"]   # pillerne i hero, ellers site.badges
formTitle: Få en fast pris på din nye terrasse      # overskrift på formularkortet
menuText: Nye terrasser i træ og komposit           # kort tekst under menupunktet i undermenuen
cards:                                              # 2 til 6 kort, fx prisfaktorer eller fordele
  eyebrow: Pris på terrasse
  heading: Tre ting der har størst betydning for prisen
  items:
    - { title: Størrelse, text: "..." }
faq:                                                # harmonika + FAQPage-schema til Google
  - { q: "Hvad koster en terrasse?", a: "..." }
personCta: { heading: "Ring og få en fast pris", text: "..." }   # overskriver site.personCta
```

FAQ kan også skrives i brødteksten: en sektion `## Ofte stillede spørgsmål` (eller `## FAQ`) med `### Spørgsmål` efterfulgt af svaret. Den tages ud af sektionerne og vises som harmonika nederst.

**Billeder i sektionerne:** `images` fordeles på sektionerne i rækkefølge, og billedet skifter side for hver sektion. Når første billede bruges i hero, starter sektionerne med det næste.

**Person-CTA** kommer efter de to første sektioner. Sektioner uden billede vises som ren tekst i fuld bredde.

## Felter i site.json til layoutet

- `rating`: `{ "score": 4.7, "count": 46, "source": "Trustpilot" }`. Vises med stjerner i hero og person-CTA. Kun tal, kunden kan dokumentere.
- `reviews[].title`: kort overskrift på anmeldelseskortet (valgfri).
- `personCta`: `{ "heading": "...", "text": "..." }`. Billedet er `brand.person`, navnet `contactPerson`.
- `stats`: `[{ "value": "15+", "label": "års erfaring" }]`. Nøgletal på forsiden.
- `stickyLabel`: teksten på den faste ring-knap, fx "Åbent alle hverdage 7-16".
- `responseNote`: mærket i kontaktsektionen, fx "Vi svarer inden for 24 timer".
- `form.variant`: `kort` (standard, ét trin) eller `trin` (tre trin med valg af ydelser). `form.title` og `form.submitLabel` styrer tekster.
- `brand.logoLight`: lyst logo til headeren over hero. Uden det gøres det almindelige logo hvidt automatisk.
- `tokens.call`, `tokens.cta`, `tokens.ctaText`, `tokens.formBg`: knapfarver. Telefon = call (rød/akut), "Indhent tilbud" = cta (sekundær farve), formularens baggrund = formBg (aldrig call). Se farvereglen i README.
- `reviews[].source`: `Trustpilot`, `Google` eller `Facebook` (styrer ikon og stjernefarve). `reviewsSource` er standarden for anmeldelser uden source.
- `logoRows[]`: `"hero": true` og/eller `"footer": true` viser rækkens logoer i hero/footer (autorisationer, certificeringer). `"section": false` holder rækken ude af logosektionen under anmeldelserne.
- `form.foundOptions`: valgmulighederne i "Hvor har du fundet os?". Sæt til `[]` for at skjule feltet. Svaret kommer med i mail, leadlog og CRM som `fundet`.
- `tokens.eyebrow`: farve på overlinjer. Uden den bruges primary, medmindre primary er telefonknappens farve; så bruges primaryDark.
- `partners[]`: logoer i det bevægende bånd under hero. `logoRows[].logos[]`: logo-rækker længere nede. `onDark: true` på et logo giver en mørk flise (til hvide/lyse logoer).
- `menu[]`: ud over `slug` og `children` kan et punkt have `href`, fx `{ "label": "Blog", "href": "/blog/" }`.
- `blog.permalink`: `"root"` (behold WordPress-adresser) eller `"blog"` (standard).
- `tokens.fontHeading` og `tokens.fontBody`: `archivo`, `bitter`, `montserrat`, `inter` eller `inter-tight`. `tokens.headingUppercase: true` giver overskrifter med store bogstaver. `tokens.star` er stjernefarven.

## Nyt i v0.3

- **Overlinje på sektioner:** `## Effektiv rensning af kloakken | Hvad er kloakspuling?` giver overlinjen "Effektiv rensning af kloakken" over overskriften.
- **Hero:** `eyebrow: "Aut. kloakmester"` (lille mærke over H1) og `heroVideo: { src: "/video.mp4" }` på siden eller `brand.heroVideo` i site.json for alle sider. Videoen afspilles lydløst i loop; billedet bruges som plakat og til dem, der har slået bevægelse fra.
- **site.json:** `gallery` (ekstra billeder til sektioner), `logoRows` (fx "Som nævnt i danske medier", certificeringer), `thankYou.faq` (spørgsmål på takkesiden), `thankYou.steps` (egne trin under "Hvad sker der nu?"), `form.files` (vedhæft filer, standard til), `form.thankYou` (takkeside, standard "henvendelse"), `tracking.metaPixelId`, `tracking.consentMode` ("basic" eller "advanced"), `reviews[].date`.
- **Bysider:** sæt `formService` til ydelsen (fx "Slamsugning"), så siden vises i områdeblokken på ydelsessiden og forsiden.

## Nyt i v0.5

**Mega-menu.** Det første menupunkt med undersider (normalt "Vi tilbyder") bliver en mega-menu i fuld bredde, der åbner ved hover. Ydelserne kan deles i grupper:

```json
{ "label": "Vi tilbyder", "mega": true, "groups": [
  { "label": "Ydelser", "children": ["kloakspuling", "tv-inspektion"] },
  { "label": "Tilstopninger", "children": ["stoppet-afloeb"] }
] }
```

Boksen til højre styres af `megaAside` i site.json (`heading`, `text`). Uden den står der "Haster det?" og kundens åbningstider.

**Pr. side (frontmatter):**

| Felt | Betydning |
| --- | --- |
| `menuText` | Kort sætning under ydelsen i mega-menuen (højst cirka 45 tegn). Uden: første sætning af `description` |
| `icon` | Ikon i mega-menu og ydelseskort, fx `camera`, `waves`, `truck`. Uden: gættes ud fra adressen. Navnene står i `src/lib/icons.ts` |
| `images[].focus` | Hvilken del af billedet der skal blive synlig ved beskæring: `top`, `bottom`, `left`, `right` eller `center` |
| `process.steps[].icon` | Ikon på hvert trin i "Sådan foregår det" |

**Layoutregler (gælder alle kunder):**

- Billeder ved siden af tekst får samme højde som teksten (beskåret). På mobil er de altid 5:4.
- Hver fjerde sektion med billede bliver et bånd i fuld bredde med teksten i et kort. To sektioner i træk har aldrig samme layout.
- Punktlister med 2 til 8 korte punkter vises som kort med ikon.
- Der står altid et rundt billede over formularen: portræt (`brand.person`), ellers logo, ellers favicon, ellers et ikon.
- Overlinjer bruges kun sammen med en overskrift. Bånd med logoer og anmeldelser har en rigtig overskrift.
- Sektioner og kort glider diskret ind. Det slås fra for besøgende, der har valgt "reducer bevægelse".

**Blog og guides kun for SEO-kunder.** `"blog": { "enabled": false }` i site.json slår blogruter, menupunktet og afsnittet i llms.txt fra. `"label"` ændrer navnet (fx "Guides").

**llms.txt** bygges automatisk med kontakt, ydelser, områder, blog og de øvrige sider.

## Mails (leadmail og bekræftelse)

Mailene bygges automatisk ud fra `site.json`. Der er intet at sætte op pr. kunde ud over det, siden alligevel skal have:
`name`, `phone`, `brand.logo`, `tokens` (farver), `address`, `cvr`, `phoneHours`, `responseNote` og `rating`/`stats`.

- Logoet laves automatisk til PNG (fjernbilleder ved bygning, SVG i `public/` via sharp), fordi Outlook ikke viser WebP eller SVG.
- Byggerapporten (`rapport/<kunde>.txt`) advarer, hvis noget mangler, fx intet telefonnummer eller intet logo.
- Valgfrit i `site.json`:

```json
"mail": {
  "steps": ["Vi gennemgår din henvendelse", "Vi ringer dig op", "Du får et fast tilbud"],
  "akut": "Tekst i akutboksen (standard: personCta.text)"
}
```

Bekræftelsen gentager aldrig den besøgendes tekst, og de eneste links er telefonnummeret og kundens hjemmeside.
