// Mailskabeloner: leadmail til kunden og bekræftelse til den besøgende.
// Bygget til mailprogrammer: tabeller, inline styles, 600 px bred, PNG-logo og systemskrifter.
// Branding kommer fra /mail-brand.json (bygges sammen med siden). Mangler den, bruges navn og telefon fra miljøet.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Branding med fornuftige standardværdier, så mailen altid kan bygges. */
export function brandOf(brand, env = {}) {
  const b = brand && typeof brand === 'object' ? brand : {};
  const phoneDisplay = b.phone?.display || env.CONFIRM_PHONE || '';
  return {
    name: b.name || env.BRAND_NAME || (typeof brand === 'string' ? brand : 'hjemmesiden'),
    domain: b.domain || '',
    phone: phoneDisplay ? { display: phoneDisplay, e164: b.phone?.e164 || '+45' + phoneDisplay.replace(/\D/g, '') } : null,
    email: b.email || '',
    address: b.address || null,
    cvr: b.cvr || '',
    phoneHours: b.phoneHours || '',
    responseNote: b.responseNote || '',
    akut: b.akut || '',
    rating: b.rating || '',
    proof: b.proof || '',
    logo: b.logo || null,
    steps: Array.isArray(b.steps) ? b.steps : null,
    colors: { primary: '#1a1a1a', dark: '#141414', call: '#c62828', cta: '#1a1a1a', ctaText: '#ffffff', tint: '#f5f5f5', star: '#00b67a', ...(b.colors || {}) }
  };
}

const absUrl = (src, origin) => !src ? '' : /^https?:\/\//.test(src) ? src : (origin || '') + src;
const hostOf = d => String(d || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const addrLine = a => a ? [a.street, [a.postal, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';

function button(href, label, bg, color, { outline = false } = {}) {
  const border = outline ? `2px solid ${bg}` : `2px solid ${bg}`;
  const fill = outline ? '#ffffff' : bg;
  const text = outline ? bg : color;
  return `<a href="${esc(href)}" style="display:inline-block;background:${fill};color:${text};border:${border};border-radius:8px;padding:13px 22px;font:600 16px/1.2 ${FONT};text-decoration:none;mso-padding-alt:0">${esc(label)}</a>`;
}

function shell({ preheader, b, origin, body, footer }) {
  const logoSrc = absUrl(b.logo?.src, origin);
  const logo = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="${esc(b.name)}" height="${b.logo.height || 48}"${b.logo.width ? ` width="${b.logo.width}"` : ''} style="display:block;height:${b.logo.height || 48}px;width:auto;max-width:240px;border:0">`
    : `<span style="font:700 22px/1.2 ${FONT};color:${b.colors.dark}">${esc(b.name)}</span>`;
  return `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(b.name)}</title>
<style>@media (max-width:620px){.wrap{width:100%!important}.pad{padding-left:20px!important;padding-right:20px!important}.btn-table{width:100%!important}.btn-cell{display:block!important;width:100%!important;padding:0 0 10px 0!important}.btn-cell a{display:block!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background:#eef0f2;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border-top:5px solid ${b.colors.primary}">
<tr><td class="pad" style="padding:26px 36px 8px 36px">${logo}</td></tr>
${body}
</table>
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px"><tr><td class="pad" style="padding:18px 36px;font:12px/1.6 ${FONT};color:#6b7280;text-align:center">${footer}</td></tr></table>
</td></tr></table></body></html>`;
}

const row = (label, value) => value ? `<tr><td style="padding:7px 0;width:130px;vertical-align:top;font:13px/1.5 ${FONT};color:#6b7280">${esc(label)}</td><td style="padding:7px 0;vertical-align:top;font:15px/1.5 ${FONT};color:#111827">${value}</td></tr>` : '';

function sourceOf(lead) {
  if (lead.gclid) return 'Google Ads';
  if (lead.fbclid) return 'Facebook / Instagram';
  if (lead.utm) return String(lead.utm).slice(0, 80);
  return '';
}

function when(ts) {
  try {
    return new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  } catch { return ''; }
}

/** Leadmail til kunden: alt det vigtige øverst, og knapper til at ringe og svare med det samme. */
export function leadMail(lead, brand, { origin = '', crm = false, env = {} } = {}) {
  const b = brandOf(brand, env);
  const what = [...(lead.ydelser || []), lead.andet].filter(Boolean).join(', ') || 'Ny forespørgsel';
  const firstWhat = (lead.ydelser || [])[0] || lead.andet || 'Forespørgsel';
  const place = lead.by || lead.postnr || '';
  const address = [lead.adresse, [lead.postnr, lead.by].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const first = String(lead.navn || '').trim().split(/\s+/)[0] || 'kunden';
  const tel = String(lead.telefon || '').replace(/[^\d+]/g, '');
  const files = (lead.filer || []).map(f => f.navn).filter(Boolean);
  const source = sourceOf(lead);
  const page = String(lead.side || '').replace(/^https?:\/\/[^/]+/, '') || '/';
  const crmUrl = crm && origin && lead.id ? `${origin}/administrator-system/?lead=${encodeURIComponent(lead.id)}` : '';
  const received = when(lead.modtaget || Date.now());

  const subject = `Ny henvendelse: ${firstWhat}${place ? ' i ' + place : ''} (${lead.navn})`;
  const buttons = [
    tel && `<td class="btn-cell" style="padding:0 10px 0 0">${button(`tel:${tel}`, `Ring til ${first}`, b.colors.call, '#ffffff')}</td>`,
    lead.email && `<td class="btn-cell" style="padding:0">${button(`mailto:${lead.email}?subject=${encodeURIComponent('Din henvendelse til ' + b.name)}`, 'Svar på mail', b.colors.cta, b.colors.ctaText)}</td>`
  ].filter(Boolean).join('');

  const body = `
<tr><td class="pad" style="padding:18px 36px 0 36px">
  <div style="font:600 12px/1.4 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:#6b7280">Ny henvendelse fra hjemmesiden</div>
  <h1 style="margin:6px 0 4px 0;font:700 26px/1.25 ${FONT};color:#111827">${esc(what)}</h1>
  <div style="font:14px/1.5 ${FONT};color:#6b7280">${esc([place, received].filter(Boolean).join(' · '))}</div>
</td></tr>
<tr><td class="pad" style="padding:22px 36px 0 36px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${b.colors.tint};border-radius:10px"><tr><td style="padding:18px 20px">
    <div style="font:700 20px/1.3 ${FONT};color:#111827">${esc(lead.navn)}</div>
    ${tel ? `<div style="margin-top:6px;font:16px/1.5 ${FONT}"><a href="tel:${esc(tel)}" style="color:#111827;text-decoration:none">${esc(lead.telefon)}</a></div>` : ''}
    ${lead.email ? `<div style="font:16px/1.5 ${FONT}"><a href="mailto:${esc(lead.email)}" style="color:#111827;text-decoration:none">${esc(lead.email)}</a></div>` : ''}
    ${address ? `<div style="margin-top:6px;font:15px/1.5 ${FONT};color:#374151">${esc(address)}</div>` : ''}
  </td></tr></table>
</td></tr>
${buttons ? `<tr><td class="pad" style="padding:18px 36px 0 36px"><table role="presentation" class="btn-table" cellpadding="0" cellspacing="0"><tr>${buttons}</tr></table></td></tr>` : ''}
${lead.beskrivelse ? `<tr><td class="pad" style="padding:26px 36px 0 36px">
  <div style="font:600 13px/1.4 ${FONT};color:#6b7280;margin-bottom:8px">Beskrivelse</div>
  <div style="border-left:4px solid ${b.colors.primary};padding:4px 0 4px 16px;font:16px/1.6 ${FONT};color:#111827">${esc(lead.beskrivelse).replace(/\n/g, '<br>')}</div>
</td></tr>` : ''}
<tr><td class="pad" style="padding:24px 36px 0 36px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb">
    ${row('Opgave', esc(what))}
    ${row('Fandt os via', esc(lead.fundet))}
    ${row('Kilde', esc(source))}
    ${row('Vedhæftet', files.length ? esc(files.join(', ')) + `<br><span style="font-size:13px;color:#6b7280">${files.length === 1 ? 'Filen ligger' : 'Filerne ligger'} som vedhæftning i denne mail</span>` : '')}
    ${row('Sendt fra', esc(page))}
  </table>
</td></tr>
${crmUrl ? `<tr><td class="pad" style="padding:20px 36px 0 36px">${button(crmUrl, 'Åbn leadet i CRM', b.colors.dark, '#ffffff', { outline: true })}</td></tr>` : ''}
<tr><td class="pad" style="padding:26px 36px 30px 36px;font:14px/1.6 ${FONT};color:#6b7280">Svar direkte på denne mail, så går svaret til ${esc(first)}.</td></tr>`;

  const footer = `Lead-id ${esc(lead.id)} · Sendt fra formularen på ${esc(hostOf(b.domain) || b.name)}`;

  const text = [
    `NY HENVENDELSE: ${what}`, [place, received].filter(Boolean).join(' · ') || null, '',
    lead.navn, lead.telefon || null, lead.email || null, address || null, '',
    lead.beskrivelse ? `Beskrivelse:\n${lead.beskrivelse}\n` : null,
    lead.fundet ? `Fandt os via: ${lead.fundet}` : null,
    source ? `Kilde: ${source}` : null,
    files.length ? `Vedhæftet: ${files.join(', ')}` : null,
    `Sendt fra: ${page}`,
    crmUrl ? `\nÅbn i CRM: ${crmUrl}` : null,
    `\nSvar direkte på denne mail, så går svaret til ${first}.`,
    `\nLead-id ${lead.id}`
  ].filter(x => x != null && x !== false).join('\n');

  return { subject, text, html: shell({ preheader: [lead.navn, lead.telefon, firstWhat].filter(Boolean).join(' · '), b, origin, body, footer }) };
}

/** Navnet er det eneste fra formularen, der kommer med i bekræftelsen. Ligner det et link eller reklame, bruges det ikke. */
export function safeFirstName(navn) {
  const raw = String(navn || '').trim();
  return raw && raw.length <= 40 && !/(https?:|www\.|\.[a-z]{2,}(\/|\b)|@|[<>])/i.test(raw) ? raw.split(/\s+/)[0] : '';
}

const DEFAULT_STEPS = ['Vi gennemgår din henvendelse', 'Vi kontakter dig på telefon eller mail', 'Du får et klart og uforpligtende tilbud'];

/**
 * Bekræftelse til den besøgende. Sikkerhed: den besøgendes egen tekst gentages aldrig, og de eneste links
 * er faste links, vi selv styrer (telefonnummer og firmaets hjemmeside). Så kan formularen ikke bruges til spam.
 */
export function confirmMail(lead, brand, env = {}, { origin = '' } = {}) {
  const b = brandOf(brand, env);
  const name = safeFirstName(lead.navn);
  const promise = env.CONFIRM_PROMISE ? `Vi vender tilbage ${env.CONFIRM_PROMISE}.` : (b.responseNote ? b.responseNote.replace(/\.?$/, '.') : 'Vi vender tilbage hurtigst muligt.');
  const steps = Array.isArray(b.steps) && b.steps.length ? b.steps : DEFAULT_STEPS;
  const host = hostOf(b.domain);
  const subject = `Tak for din henvendelse til ${b.name}`;

  const stepRows = steps.map((s, i) => `<tr>
    <td style="width:34px;vertical-align:top;padding:0 0 12px 0"><div style="width:26px;height:26px;border-radius:13px;background:${b.colors.dark};color:#ffffff;font:700 13px/26px ${FONT};text-align:center">${i + 1}</div></td>
    <td style="vertical-align:top;padding:3px 0 12px 0;font:15px/1.5 ${FONT};color:#111827">${esc(s)}</td></tr>`).join('');

  const trust = [b.rating && `<span style="color:${b.colors.star}">&#9733;&#9733;&#9733;&#9733;&#9733;</span> ${esc(b.rating)}`, b.proof && esc(b.proof)].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const body = `
<tr><td class="pad" style="padding:22px 36px 0 36px">
  <h1 style="margin:0 0 10px 0;font:700 26px/1.25 ${FONT};color:#111827">Tak for din henvendelse${name ? ', ' + esc(name) : ''}</h1>
  <p style="margin:0;font:16px/1.6 ${FONT};color:#374151">Vi har modtaget din henvendelse. ${esc(promise)}</p>
</td></tr>
<tr><td class="pad" style="padding:24px 36px 4px 36px">
  <div style="font:600 13px/1.4 ${FONT};color:#6b7280;margin-bottom:12px">Sådan foregår det</div>
  <table role="presentation" cellpadding="0" cellspacing="0">${stepRows}</table>
</td></tr>
${b.phone ? `<tr><td class="pad" style="padding:8px 36px 0 36px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${b.colors.dark};border-radius:10px"><tr><td style="padding:22px 22px 24px 22px">
    <div style="font:700 18px/1.3 ${FONT};color:#ffffff">Haster det?</div>
    <div style="margin:6px 0 16px 0;font:15px/1.55 ${FONT};color:#d1d5db">${esc(b.akut || 'Ring til os, så hjælper vi dig med det samme.')}</div>
    ${button(`tel:${b.phone.e164}`, `Ring ${b.phone.display}`, b.colors.call, '#ffffff')}
    ${b.phoneHours ? `<div style="margin-top:14px;font:13px/1.5 ${FONT};color:#9ca3af">${esc(b.phoneHours)}</div>` : ''}
  </td></tr></table>
</td></tr>` : ''}
${trust ? `<tr><td class="pad" style="padding:20px 36px 0 36px;font:14px/1.5 ${FONT};color:#374151">${trust}</td></tr>` : ''}
<tr><td class="pad" style="padding:22px 36px 30px 36px;font:15px/1.6 ${FONT};color:#374151">Venlig hilsen<br><strong style="color:#111827">${esc(b.name)}</strong></td></tr>`;

  const footer = [
    [esc(b.name), esc(addrLine(b.address)), b.cvr && `CVR ${esc(b.cvr)}`].filter(Boolean).join(' · '),
    host ? `<a href="https://${esc(host)}" style="color:#6b7280">${esc(host)}</a>` : '',
    'Du får denne mail, fordi kontaktformularen på vores hjemmeside er udfyldt med din e-mailadresse. Var det ikke dig, kan du se bort fra den.'
  ].filter(Boolean).join('<br>');

  const text = [
    `Hej${name ? ' ' + name : ''}`, '',
    `Tak for din henvendelse til ${b.name}. Vi har modtaget den. ${promise}`, '',
    'Sådan foregår det:', ...steps.map((s, i) => `${i + 1}. ${s}`), '',
    b.phone ? `Haster det? Ring ${b.phone.display}.${b.phoneHours ? '\n' + b.phoneHours : ''}\n` : null,
    'Venlig hilsen', b.name, '',
    '--', [b.name, addrLine(b.address), b.cvr && `CVR ${b.cvr}`].filter(Boolean).join(' · '), host || null,
    'Du får denne mail, fordi kontaktformularen på vores hjemmeside er udfyldt med din e-mailadresse. Var det ikke dig, kan du se bort fra den.'
  ].filter(x => x != null && x !== false).join('\n');

  return { subject, text, html: shell({ preheader: `Vi har modtaget din henvendelse. ${promise}`, b, origin, body, footer }) };
}
