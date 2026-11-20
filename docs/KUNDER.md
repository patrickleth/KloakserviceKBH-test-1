# Status pr. kunde

Alle noter fra overførslen står i `notes` i hver sides frontmatter og samles i `rapport/<kunde>.txt` ved hver bygning.

## KloakServiceKbh (sites/kloakservicekbh)

107 sider overført ordret: forside, 23 ydelser/tilstopninger, priser, FAQ, job, kontakt, cookies og 78 bysider (kloakservice, slamsugning, tv-inspektion og kloakspuling + by). Brand fra den nuværende side: sort, rød (#AC1414) og gul (#EAE542), skriften Inter Tight, og deres B-roll-video i hero. GTM-PM5VGLH7 og Cookiebot-ID er sat i site.json; testversionen bruger det interne banner og sender ikke data til GTM.

Før go-live:
- [ ] `npm run hent-billeder` (billeder og video hentes stadig fra WordPress)
- [ ] `KUNDE=kloakservicekbh WP_URL=https://kloakservicekbh.dk npm run importer-wordpress` for de resterende 186 af 196 blogindlæg (de 10 nyeste er importeret). `blog.permalink` er `"root"`, så indlæggene beholder deres nuværende adresser, og der skal ingen viderestillinger til. De 27 døde links, QA melder nu, peger på indlæg, der kommer med i importen
- [ ] Mini-CRM: `npm run admin-bruger -- kloakservicekbh`, sæt `ADMIN_USERS` og `ADMIN_SECRET` i Netlify
- [ ] `consent.provider: "cookiebot"` når domænet peger på Netlify
- [ ] Ny cookiepolitik (den nuværende er generisk og nævner nyhedsbrev, login og køb)
- [ ] Afklar med kunden:
  - erfaring: 25, 35 og "over 20" år på forskellige sider
  - svartid: "tilbud inden for 1 time" i titler mod "2 timer" i formularen
  - adresse: Kildeager 3, Solrød Strand mod Refshalevej 163A på cookiesiden
  - priser i FAQ mod prislisten
  - påstanden om lovkrav om årlig tømning af olietank
- [ ] Ret fejl, der også står på den gamle side: "Lorem ipsum" som overlinje på flere bysider (er fjernet her), forkerte bynavne (Birkerød nævner Glostrup, Karlslunde og Mørkhøj nævner Amager, Brønshøj nævner Vanløse), tredjepersonstekst på enkelte bysider
- [ ] Bysiderne er omskrevet ud fra få skabeloner og har ingen lokal dokumentation. Google kan se dem som doorway-sider. Tilføj rigtige lokale cases (`localProof`) på de vigtigste byer, og overvej at samle eller nedprioritere resten
- [ ] Rating: siden viser "Fremragende på Trustpilot" med 5 stjerner. Indsæt den rigtige TrustScore og antal anmeldelser i `rating`
- [ ] Billede af kontaktperson og navn (`brand.person`, `contactPerson`) giver formularkort og takkeside et ansigt

## Skelbo's Tømrer & Montage (sites/skelbo)

Se tjeklisten i README under "Hvad mangler før Skelbo kan gå live".
