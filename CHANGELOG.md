# Ændringslog

Skabelonens versioner. Hver kunde kører en bestemt version (står i kundens `vaekster.json` og på siden i `/version.json`).
Nye versioner rulles ud til en kunde ad gangen som et forslag med `npm run opdater-kunde -- <ejer/repo>`.

Regel: fejlrettelser, sikkerhed, hastighed og forbedringer, der ikke ændrer udseendet, går til alle. Et nyt design af en
sektion tilføjes som en ny variant ved siden af den gamle, så eksisterende kunder beholder deres udseende, indtil de skiftes aktivt.

## 0.7.0 (21. nov 2026)
- Ét repo pr. kunde: kundens filer (`sites/<kunde>/`, `wrangler.jsonc`, `vaekster.json`) og skabelonens filer er adskilt. Opdateringer sker som pull request med tests og Cloudflare-preview (`scripts/opdater-kunde.mjs`).
- Versionsnummer pr. side: `/version.json` og `<meta name="generator">`. Bygningen stopper, hvis repoet tilhører en anden kunde end den, der bygges.
- Kundens egne sektioner i `sites/<kunde>/components/` (frontmatter `custom: ["Navn"]`).
- Cookieløsning: "Afvis alle" og "Accepter alle" ens, samtykkelog i D1, fornyelse efter 12 måneder og ved ny version, sletning af cookies ved tilbagetrækning, cookieerklæring på cookiepolitikken og som `/cookies.json`, månedlig scanning i GitHub Actions.
- Netlify fjernet. Formular, mails og CRM ligger i `server/`, Cloudflare-delen i `cloudflare/`.

## 0.6.0 (21. nov 2026)
- Nye mails: leadmail med knapper til at ringe og svare og direkte link til CRM, bekræftelse med kundens branding. Logo som PNG, også fra SVG.
- Bekræftelser fra eget afsenderdomæne med egen Mailgun-nøgle. Døgnspærren frigives, hvis afsendelsen fejler.
- Logoer og fjernbilleder skaleres med bevarede proportioner. PageSpeed 100 på mobil.

## 0.5.0 (20. nov 2026)
- Mega-menu med ikoner og billeder, ens billedhøjder med fokuspunkt, flere sektionstyper, animationer, rundt billede over formularen, llms.txt.
- Cloudflare Worker med D1 og R2 i EU.
