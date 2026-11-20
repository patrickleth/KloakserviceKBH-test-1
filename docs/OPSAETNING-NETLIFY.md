# Opsætning: GitHub + Netlify for en kunde

Gøres én gang for repoet og én gang pr. kunde. Alle hemmeligheder sættes kun i Netlify, aldrig i repoet eller ClickUp.

## Én gang for repoet
1. Pak `vaekster-web-*.zip` ud. Åbn GitHub Desktop → File → Add local repository → vælg mappen → Publish repository (Private, under Vækster-organisationen).

## Pr. kunde (eksempel: KloakServiceKbh)
2. Netlify → Add new project → Import from Git → GitHub → vælg `vaekster-web`. Byggeindstillingerne læses fra `netlify.toml`; tryk ikke på noget der.
3. Under Environment variables (før første deploy) indsættes:
   - `KUNDE` = `kloakservicekbh`
   - `MODE` = `test` (skift til `production` ved lancering)
   - `TEST_FORM` = `true` (formularen sender til CRM'et på testversionen)
   - `ADMIN_USERS` og `ADMIN_SECRET` (fra `npm run admin-bruger -- <navn> <email>`)
   - `MAILGUN_API_KEY` (1Password) og `MAILGUN_DOMAIN` (bruges til "Glemt adgangskode"). `LEAD_TO` sættes først ved lancering, så kunden ikke får testmails.
4. Deploy. Åbn `https://<netlify-adresse>/administrator-system/` og log ind.
5. Send en testhenvendelse fra forsiden og se den i CRM'et.

## Ved lancering
6. `MODE` = `production`, `LEAD_TO` = kundens mail, `TEST_FORM` slettes, domænet tilføjes under Domain management, og DNS peges om. Se også tjeklisten i `docs/KUNDER.md`.

## Giv Claude adgang
7. Forbind GitHub i claude.ai (Indstillinger → Connectors) og giv adgang til `vaekster-web`. Så kan rettelser laves som preview-links i stedet for zip-filer.
