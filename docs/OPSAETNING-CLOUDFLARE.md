# Opsætning på Cloudflare

Siden serveres som statiske filer fra Cloudflare. Formularen og mini-CRM'et kører i en Worker (`cloudflare/worker.mjs`).
Leads, opsætning og brugere ligger i D1, vedhæftede filer i R2. Begge er oprettet med EU-jurisdiktion.

## Én gang for hele Vækster

1. D1-database `vaekster-crm` med **Specify jurisdiction: European Union**. Id'et skrives ind i `wrangler.jsonc`.
2. R2-bucket `vaekster-filer` med **Specify jurisdiction: European Union**.
3. Afsenderdomænet `indsendelse.dk` på Cloudflare med to Mailgun-domæner i EU-regionen:
   `leads.indsendelse.dk` (leadmails til kunden) og `svar.indsendelse.dk` (bekræftelser til den besøgende).
   DNS fra Mailgun (SPF, DKIM, MX) plus en DMARC-post på `_dmarc.indsendelse.dk`. Klik-sporing slås fra.

Alle kunder deler database og bucket. Hver række er mærket med kundens `SITE_ID`.

## For hver kunde

1. Workers & Pages → Create → Import a repository → vælg kundens repo på GitHub.
2. Build command: `KUNDE=<kunde> MODE=production npm run build` (testversion: `MODE=test TEST_FORM=true`).
   Deploy command: `npx wrangler deploy` (standard).
3. I `wrangler.jsonc`: `name`, `SITE_ID`, `BRAND_NAME`, `CONFIRM_PHONE`.
4. Settings → Variables and Secrets (type **Secret**):
   `ADMIN_USERS`, `ADMIN_SECRET`, `MAILGUN_API_KEY` (sending key til leads-domænet), `CONFIRM_MAILGUN_API_KEY` (sending key til svar-domænet), `LEAD_TO` (hvem modtager leadmails), evt. `LEAD_BCC`, `ALERT_EMAIL`.
5. Domæne: Settings → Domains & Routes → tilføj kundens domæne.

Hemmeligheder skrives kun i Cloudflare, aldrig i repoet, i ClickUp eller i en chat.

## Afprøv lokalt

`.dev.vars` med testværdier (ligger ikke i git), byg siden til `dist/current` og kør `npx wrangler dev --local`.
Database, filer og rate limit simuleres lokalt.
