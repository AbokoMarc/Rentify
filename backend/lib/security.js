// Outils de sécurité transverses : limitation de débit, IP client, cookies, en-têtes HTTP.
import crypto from 'node:crypto';

// ---------- IP du client ----------
// Render/Vercel ajoutent l'IP réelle à X-Forwarded-For. On prend la première valeur ; ce n'est qu'un
// complément — les verrouillages de connexion sont AUSSI indexés par email (impossible à contourner en changeant d'IP).
export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'inconnue';
}

// ---------- Limiteur de débit en mémoire (fenêtre glissante) ----------
const buckets = new Map(); // clé -> [timestamps]

export function hit(key, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  return { allowed: arr.length <= max, retryAfterSec: Math.ceil((windowMs - (now - arr[0])) / 1000), count: arr.length };
}

export function peek(key, windowMs) {
  const now = Date.now();
  return (buckets.get(key) || []).filter(t => now - t < windowMs).length;
}

export function reset(key) { buckets.delete(key); }

// Nettoyage périodique pour ne pas faire grossir la mémoire.
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) {
    const fresh = arr.filter(t => now - t < 60 * 60 * 1000);
    if (fresh.length) buckets.set(k, fresh); else buckets.delete(k);
  }
}, 10 * 60 * 1000).unref();

export function tooMany(res, retryAfterSec = 60) {
  res.writeHead(429, {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': String(retryAfterSec),
  });
  res.end(JSON.stringify({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' }));
}

// ---------- Cookies ----------
export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const ADMIN_COOKIE = 'lokaya_admin';

export function adminCookieHeader(token, maxAgeSec) {
  // HttpOnly : illisible par JavaScript (donc par une faille XSS). Secure : HTTPS uniquement.
  // SameSite=Strict : jamais envoyé depuis un autre site. Path=/admin : n'accompagne que les pages admin.
  return `${ADMIN_COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}
export function clearAdminCookieHeader() {
  return `${ADMIN_COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// ---------- En-têtes de sécurité ----------
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // CSP : le site utilise des scripts/styles inline (pages vanilla), donc 'unsafe-inline' reste nécessaire,
  // mais on bloque déjà les scripts externes inconnus, les iframes, les <base> et les formulaires vers l'extérieur.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '));
}

export function randomId() { return crypto.randomBytes(8).toString('hex'); }
