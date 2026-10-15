// Double authentification TOTP (RFC 6238) — compatible Google Authenticator, Microsoft Authenticator, Authy…
// Aucun paquet externe : uniquement node:crypto.
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newSecret() {
  const buf = crypto.randomBytes(20); // 160 bits
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function b32decode(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v < 0) throw new Error('base32'); bits += v.toString(2).padStart(5, '0'); }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret, counter) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1000000).padStart(6, '0');
}

// Renvoie le pas de temps validé (pour interdire le rejeu d'un même code) ou null. Tolérance : ±1 pas (30 s).
export function verifyTotp(secret, code, lastStep = 0) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const now = Math.floor(Date.now() / 30000);
  for (const step of [now - 1, now, now + 1]) {
    if (step <= lastStep) continue; // déjà utilisé
    const expected = Buffer.from(hotp(secret, step));
    if (crypto.timingSafeEqual(expected, Buffer.from(String(code)))) return step;
  }
  return null;
}

export function otpauthUri(secret, account, issuer = 'Lokaya Admin') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// Le secret est chiffré en base (AES-256-GCM, clé dérivée de JWT_SECRET) : une fuite de la base seule ne donne pas les secrets.
// TOTP_ENCRYPTION_KEY (recommandé) : clé dédiée, pour que changer JWT_SECRET (déconnexion générale) ne casse jamais la 2FA.
const key = () => crypto.createHash('sha256').update('totp:' + (process.env.TOTP_ENCRYPTION_KEY || process.env.JWT_SECRET || '')).digest();
export function sealSecret(secret) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
export function openSecret(sealed) {
  const [iv, tag, enc] = sealed.split('.').map(p => Buffer.from(p, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})(.{5})/, '$1-$2'));
}
export const hashRecovery = (c) => crypto.createHash('sha256').update(String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
