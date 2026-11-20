// Laver en brugerlinje til mini-CRM'et. Kør:  npm run admin-bruger -- <brugernavn> <email>
// E-mailen bruges til "Glemt adgangskode".
// Adgangskoden indtastes skjult. Resultatet sættes i miljøvariablen ADMIN_USERS på Netlify (flere brugere adskilles med komma).
// Gem aldrig linjen i repoet eller i ClickUp.
import { hashPassword } from '../netlify/lib/admin-auth.mjs';
import { randomBytes } from 'node:crypto';

const user = (process.argv[2] || '').toLowerCase();
const email = (process.argv[3] || '').toLowerCase();
if (!/^[a-z0-9._-]{2,40}$/.test(user) || (email && !/^[^\s:@,]+@[^\s:@,]+\.[a-z]{2,}$/.test(email))) { console.error('Brug: npm run admin-bruger -- <brugernavn> <email>  (brugernavn: a-z, 0-9, punktum, bindestreg)'); process.exit(1); }

async function ask(q) {
  process.stdout.write(q);
  const stdin = process.stdin;
  if (!stdin.isTTY) { let d = ''; for await (const c of stdin) d += c; return d.split('\n')[0]; }
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  return new Promise(res => {
    let s = '';
    stdin.on('data', function on(ch) {
      if (ch === '\r' || ch === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', on); process.stdout.write('\n'); res(s); }
      else if (ch === '\u0003') process.exit(1);
      else if (ch === '\u007f') s = s.slice(0, -1);
      else s += ch;
    });
  });
}

const pw = await ask(`Adgangskode til ${user} (mindst 10 tegn): `);
try {
  console.log(`\nADMIN_USERS-linje (tilføj til Netlify):\n${user}:${email ? email + ':' : ''}${hashPassword(pw)}`);
  console.log(`\nHar sitet ikke ADMIN_SECRET endnu, så brug fx denne:\n${randomBytes(32).toString('base64url')}`);
} catch (e) { console.error(e.message); process.exit(1); }
