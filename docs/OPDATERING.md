# Skabelon og kunder: ét repo pr. kunde

Hver kunde har sit eget repo på GitHub og sin egen Worker i Cloudflare. Intet ændrer sig hos en kunde, uden at Vækster har godkendt det.

## Hvem ejer hvad

| Filer | Ejer | Ændres af en skabelonopdatering? |
| --- | --- | --- |
| `sites/<kunde>/` (indhold, billeder, `site.json`, egne sektioner i `components/`) | Kunden | Aldrig |
| `wrangler.jsonc` (Worker, domæne, variabler) | Kunden | Aldrig |
| `vaekster.json` (hvilken kunde og hvilken skabelonversion) | Kunden | Kun versionsnummeret |
| Alt andet (`src/`, `server/`, `cloudflare/`, `scripts/`, `tests/`, `docs/`, `package.json` …) og `sites/eksempel/` | Skabelonen | Ja |

Reglerne står i kode i `scripts/lib/ejerskab.mjs`. Andre kunders mapper kommer aldrig med i et kunderepo.

## Rul en ny version ud

1. Lav ændringen i skabelonens repo (`vaekster-skabelon`), skriv den i `CHANGELOG.md`, hæv `version` i `package.json`, og kør `npm test`.
2. Commit og push skabelonen.
3. For hver kunde: `npm run opdater-kunde -- patrickleth/<kundens-repo>`
   - laver grenen `skabelon/v<version>` i kundens repo
   - udskifter skabelonens filer og lader kundens filer være
   - kører unit-tests og bygger kundens side
   - opretter en pull request med ændringslog, testresultat og advarsler
4. Cloudflare bygger et preview af grenen. Se det igennem, og flet forslaget. Først da går ændringen live.

`--tørt` viser forslaget uden at pushe noget.

## Fejlrettelser og nye designs

- Fejlrettelser, sikkerhed og hastighed rulles ud til alle.
- Et nyt design af en sektion tilføjes som en ny variant. Eksisterende kunder beholder deres, indtil de skiftes aktivt i `site.json`.
- Noget helt unikt til én kunde bygges i `sites/<kunde>/components/` og bruges med `custom: ["Navn"]` i sidens frontmatter.

## Sikkerhedsnet

- Bygningen stopper, hvis repoet tilhører en anden kunde end den, der bygges (`vaekster.json`).
- Hver side viser sin version i `/version.json` (skabelon, kunde, commit, tidspunkt), og byggerapporten advarer, hvis versionen ikke passer.
- Fejler en bygning i Cloudflare, udgives intet, og siden kører videre på den sidste version, der virkede.
