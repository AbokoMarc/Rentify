import crypto from 'node:crypto';
import { db } from '../db.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('JWT_SECRET manquant dans .env — démarrage refusé pour des raisons de sécurité.');
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

export const USER_SESSION_SEC = 60 * 60 * 24 * 30; // session visiteur : 30 jours, renouvelée à l'usage (voir requireAuth)

export function signToken(payload, expiresInSec = USER_SESSION_SEC) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSec };
  const h = base64url(JSON.stringify(header));
  const b = base64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${h}.${b}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const a = Buffer.from(sig), b2 = Buffer.from(expected);
  if (a.length !== b2.length || !crypto.timingSafeEqual(a, b2)) return null;
  try {
    const header = JSON.parse(base64urlDecode(h));
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(base64urlDecode(b));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Faux hash utilisé quand l'email n'existe pas : le temps de réponse reste le même (pas de fuite sur l'existence du compte).
export const DUMMY_HASH = hashPassword('dummy-password-for-timing');

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

export function getAuthUser(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const payload = verifyToken(auth.slice(7));
  if (!payload) return null;
  // Un jeton « admin » sans le scope admin (ancien jeton, ou forgé) n'a AUCUN pouvoir admin : on le rétrograde.
  if (payload.role === 'admin' && payload.scope !== 'admin') return { ...payload, role: 'client' };
  return payload;
}

export function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Non authentifié.', code: 'AUTH' }));
    return null;
  }
  // Session glissante : tant que la personne utilise le site, son jeton est renouvelé (elle n'est plus déconnectée).
  // Plafond absolu de 180 jours depuis la connexion initiale ; jamais pour les sessions admin (8 h strictes).
  if (user.scope !== 'admin') {
    const now = Math.floor(Date.now() / 1000);
    const origin = user.t0 || user.iat || now;
    if (user.exp - now < USER_SESSION_SEC - 24 * 3600 && now - origin < 180 * 24 * 3600) {
      const { exp, iat, ...claims } = user;
      res.setHeader('X-Refresh-Token', signToken({ ...claims, t0: origin }));
    }
  }
  return user;
}

function deny(res, status, error, authFailure = false) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  // code « AUTH » = la session n'est plus valable (le front déconnecte). Un simple refus de permission (403) ne déconnecte PAS.
  res.end(JSON.stringify(authFailure || status === 401 ? { error, code: 'AUTH' } : { error }));
  return null;
}

// Vendeur validé par un admin (ou admin). Le rôle et le statut sont relus en BASE à chaque appel :
// un vendeur rejeté ou rétrogradé perd ses droits immédiatement, sans attendre l'expiration de son jeton.
// requireApproved = false : autorise aussi un vendeur « en attente » (lecture seule de ses propres données).
export async function requireApprovedSeller(req, res, requireApproved = true) {
  const user = requireAuth(req, res);
  if (!user) return null;
  const row = await db.prepare('SELECT id, role, vendeur_statut FROM users WHERE id = ?').get(user.id);
  if (!row) return deny(res, 401, 'Compte introuvable.');
  if (row.role === 'admin') return { ...user, role: 'admin' };
  if (row.role !== 'vendeur') return deny(res, 403, 'Réservé aux comptes vendeur.');
  if (requireApproved && row.vendeur_statut !== 'approuve') return deny(res, 403, "Ton compte vendeur n'est pas (ou plus) validé par l'admin.");
  return { ...user, role: 'vendeur' };
}

// Durée de vie d'une session admin : courte (8 h), contrairement aux 7 jours des comptes normaux.
export const ADMIN_SESSION_SEC = 60 * 60 * 8;

export function signAdminToken(user) {
  return signToken({ id: user.id, role: 'admin', name: user.name, scope: 'admin' }, ADMIN_SESSION_SEC);
}

// Vérification admin FAISANT FOI : jeton valide + scope admin (émis uniquement par /api/admin/login)
// + rôle « admin » relu en base. Un rôle écrit dans le localStorage ou dans un jeton ancien ne suffit jamais.
export async function verifyAdminToken(token) {
  const payload = verifyToken(token);
  if (!payload || payload.scope !== 'admin') return null;
  const row = await db.prepare('SELECT id, role, name FROM users WHERE id = ?').get(payload.id);
  if (!row || row.role !== 'admin') return null;
  return { ...payload, role: 'admin', name: row.name };
}

export async function requireAdmin(req, res) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return deny(res, 401, 'Non authentifié.');
  const admin = await verifyAdminToken(auth.slice(7));
  if (!admin) return deny(res, 403, 'Accès réservé aux administrateurs.', true);
  return admin;
}
