# Væksters egen indholdsmotor (erstatning for Outrank)

Status: plan. Formatet og importen findes allerede; selve motoren er ikke bygget.

## Hvorfor
Outrank og lignende værktøjer publicerer via WordPress-plugins. På en statisk side er der intet plugin at koble på. Til gengæld er et blogindlæg her bare en Markdown-fil, så enhver producent, der kan skrive en fil i det rigtige format, kan publicere. Det gør os uafhængige af ét værktøj.

## Sådan kommer et indlæg ud på siden
1. En producent skriver `sites/<kunde>/blog/<slug>.md` med frontmatter (title, description, h1, date, keyword, image, related).
2. Filen committes til GitHub (direkte eller som pull request til godkendelse).
3. Netlify bygger siden. Bygningen validerer formatet, QA tjekker links og overskrifter, og indlægget kommer i `post-sitemap.xml`.

## Producenter (adaptere)
- **Claude (anbefalet start):** et planlagt job pr. kunde, der hver uge vælger næste søgeord fra kundens emneliste, skriver indlægget ud fra kundens egne sider og anmeldelser, linker til relevante ydelses- og bysider (`related`) og åbner en pull request.
- **Outrank eller andre:** hvis værktøjet kan sende en webhook eller eksportere, laver en Make-scenarie om til en fil i repoet via GitHubs API.
- **Medarbejder:** skriver filen direkte i GitHub eller lokalt.

## Kvalitetsregler (skal kodes ind i motoren)
- Ét hovedsøgeord pr. indlæg, og det må ikke kannibalisere en ydelsesside.
- Mindst 2 interne links til ydelses- eller bysider og et "Indhent tilbud".
- Ingen påstande om priser, erfaring eller garantier, som ikke står på kundens egne sider.
- Billeder: kundens egne billeder før stockfotos.
- Godkendelse: pull request, som kunden eller Vækster godkender, eller fast godkendelse pr. kunde.

## Næste skridt
1. Emneliste pr. kunde (fra Search Console og Semrush).
2. Claude-job der skriver ét indlæg og åbner en pull request.
3. Måling: klik og leads fra blogindlæg i leadloggen (feltet `side`).
