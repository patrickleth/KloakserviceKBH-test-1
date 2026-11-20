// Login til mini-CRM'et (/administrator-system/). Ingen afhængigheder ud over Node.
//
// Brugere:  ADMIN_USERS = "patrick:ple@vaekster.dk:scrypt$16384$<salt>$<hash>,kunde:kunde@firma.dk:scrypt$..."  (lav linjen med: npm run admin-bruger)
//           E-mailen bruges til "Glemt adgangskode". En ny kode gemmes i Netlify Blobs og går forud for koden i ADMIN_USERS.
// Session:  ADMIN_SECRET = mindst 32 tilfældige tegn. Bruges til at signere sessionscookien (HMAC-SHA256).
// Begge sættes KUN som miljøvariabler på Netlify, aldrig i repoet.
import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';

export const COOKIE = 'vk_admin';
export const SESSION_HOURS = 12;
const N = 16384, R = 8, P = 1, KEYLEN = 32;

export function hashPassword(password, salt = randomBytes(16).toString('base64url')) {
  if (String(password).length < 10) throw new Error('Adgangskoden skal være mindst 10 tegn');
  const hash = scryptSync(String(password).normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P }).toString('base64url');
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [alg, n, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) {
    // Brug samme tid som et rigtigt tjek, så man ikke kan se forskel på ukendt bruger og forkert kode.
    scryptSync('x', 'dummy-salt-value', KEYLEN, { N, r: R, p: P });
    return false;
  }
  const want = Buffer.from(hash, 'base64url');
  const got = scryptSync(String(password).normalize('NFKC'), salt, want.length, { N: Number(n) || N, r: R, p: P });
  return want.length === got.length && timingSafeEqual(want, got);
}

/** "navn:email:hash,navn2:hash" -> Map navn -> { hash, email }. Brugernavne er små bogstaver uden mellemrum. */
export function parseUsers(raw = '') {
  const m = new Map();
  for (const part of String(raw).split(/[,\n]/)) {
    const bits = part.trim().split(':');
    if (bits.length < 2 || !bits[0]) continue;
    const name = bits[0].trim().toLowerCase();
    const hash = bits[bits.length - 1].trim();
    const email = bits.length >= 3 ? bits[1].trim().toLowerCase() : '';
    m.set(name, { hash, email });
  }
  return m;
}

const b64 = s => Buffer.from(s).toString('base64url');
const sig = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url');

/** Kort fingeraftryk af adgangskoden. Står i sessionen, så en ny kode logger alle andre sessioner ud. */
export const passVersion = hash => createHash('sha256').update(String(hash)).digest('base64url').slice(0, 10);
export const sha256 = v => createHash('sha256').update(String(v)).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export function signSession(user, secret, now = Date.now(), pv = '') {
  const payload = b64(JSON.stringify({ u: user, pv, exp: now + SESSION_HOURS * 3600e3, n: randomBytes(8).toString('base64url') }));
  return `${payload}.${sig(payload, secret)}`;
}

export function readSession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [payload, mac] = String(token).split('.');
  if (!payload || !mac) return null;
  const want = Buffer.from(sig(payload, secret)), got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return s.exp > now ? s : null;
  } catch { return null; }
}

export function getCookie(req, name = COOKIE) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

export function sessionCookie(token, { clear = false } = {}) {
  // Path=/administrator-system: cookien sendes aldrig med til resten af hjemmesiden.
  return `${COOKIE}=${clear ? '' : token}; Path=/administrator-system; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_HOURS * 3600}`;
}

/** Anonym nøgle til lås ved for mange forsøg (IP gemmes ikke i klartekst). */
export const throttleKey = (kind, value, secret) => `sikkerhed/${kind}-${createHash('sha256').update(String(value) + secret).digest('hex').slice(0, 24)}`;
