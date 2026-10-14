// Vérification du téléphone (code SMS) et de l'identité (CNI).
//  - Le code SMS : 6 chiffres, haché en base, valable 5 min, 3 essais, 3 envois/heure.
//  - La CNI : stockée en base (jamais dans un dossier public), accessible UNIQUEMENT à l'admin (session admin vérifiée),
//    jamais renvoyée au propriétaire ni aux autres pages ; chaque consultation par un admin est journalisée.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { json, parseBody, notFound } from '../lib/http.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';
import { sendSms } from '../lib/sms.js';
import { hit, tooMany, clientIp } from '../lib/security.js';
import { notifyClient } from '../lib/notify.js';

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const MAX_DOC_BYTES = 2 * 1024 * 1024;

// On vérifie le CONTENU réel du fichier (octets de signature), pas seulement le type annoncé par le navigateur.
function sniffMime(buf) {
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.length > 5 && buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

export async function handleKyc(req, res, urlPath) {
  const isPhone = urlPath === '/api/auth/phone/send' || urlPath === '/api/auth/phone/verify';
  const isKyc = urlPath === '/api/kyc' || urlPath === '/api/kyc/me';
  const adminMatch = urlPath.match(/^\/api\/admin\/kyc(?:\/(\d+)(\/document)?)?$/);
  if (!isPhone && !isKyc && !adminMatch) return null;

  // ---------- Téléphone ----------
  if (isPhone) {
    const user = requireAuth(req, res); if (!user) return;
    if (urlPath.endsWith('/send') && req.method === 'POST') {
      const rl = hit(`sms:${user.id}`, 3, 60 * 60 * 1000); // 3 SMS / heure / compte (coût + anti-harcèlement)
      const rlIp = hit(`sms-ip:${clientIp(req)}`, 10, 60 * 60 * 1000);
      if (!rl.allowed || !rlIp.allowed) return tooMany(res, rl.retryAfterSec || 600);
      const { phone } = await parseBody(req);
      const clean = String(phone || '').replace(/[\s.-]/g, '');
      if (!/^\+\d{9,15}$/.test(clean)) return json(res, 400, { error: 'Numéro invalide. Format international attendu, ex : +237 6XX XXX XXX.' });
      const taken = await db.prepare('SELECT id FROM users WHERE phone = ? AND phone_verified = 1 AND id != ?').get(clean, user.id);
      if (taken) return json(res, 409, { error: 'Ce numéro est déjà vérifié sur un autre compte.' });
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await db.prepare(`INSERT INTO phone_verifications (user_id, phone, code_hash, expires_at, attempts) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(user_id) DO UPDATE SET phone = excluded.phone, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`)
        .run(user.id, clean, sha(`${user.id}:${code}`), Date.now() + 5 * 60 * 1000);
      try { await sendSms(clean, `Lokaya : votre code de vérification est ${code}. Valable 5 minutes. Ne le partagez avec personne.`); }
      catch (err) { console.error('Erreur SMS:', err.message); return json(res, 503, { error: "L'envoi de SMS n'est pas disponible pour le moment." }); }
      return json(res, 200, { success: true });
    }
    if (urlPath.endsWith('/verify') && req.method === 'POST') {
      const { code } = await parseBody(req);
      const row = await db.prepare('SELECT * FROM phone_verifications WHERE user_id = ?').get(user.id);
      if (!row || row.expires_at < Date.now()) return json(res, 400, { error: 'Code expiré. Demande un nouveau code.' });
      if (row.attempts >= 3) { await db.prepare('DELETE FROM phone_verifications WHERE user_id = ?').run(user.id); return json(res, 429, { error: 'Trop d\'essais. Demande un nouveau code.' }); }
      await db.prepare('UPDATE phone_verifications SET attempts = attempts + 1 WHERE user_id = ?').run(user.id);
      const given = Buffer.from(sha(`${user.id}:${String(code || '')}`)), expected = Buffer.from(row.code_hash);
      if (!crypto.timingSafeEqual(given, expected)) return json(res, 400, { error: `Code incorrect. Il te reste ${Math.max(0, 2 - row.attempts)} essai(s).` });
      await db.prepare('UPDATE users SET phone = ?, phone_verified = 1 WHERE id = ?').run(row.phone, user.id);
      await db.prepare('DELETE FROM phone_verifications WHERE user_id = ?').run(user.id);
      return json(res, 200, { success: true, phone: row.phone });
    }
    return null;
  }

  // ---------- CNI : côté utilisateur ----------
  if (isKyc) {
    const user = requireAuth(req, res); if (!user) return;
    if (urlPath === '/api/kyc/me' && req.method === 'GET') {
      const last = await db.prepare('SELECT status, reject_reason, created_at FROM kyc_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id);
      const u = await db.prepare('SELECT phone, phone_verified, kyc_verified FROM users WHERE id = ?').get(user.id);
      return json(res, 200, { kyc_verified: !!u.kyc_verified, phone_verified: !!u.phone_verified, phone: u.phone, request: last || null });
    }
    if (urlPath === '/api/kyc' && req.method === 'POST') {
      const rl = hit(`kyc:${user.id}`, 5, 24 * 60 * 60 * 1000);
      if (!rl.allowed) return tooMany(res, rl.retryAfterSec);
      const { document } = await parseBody(req);
      const m = typeof document === 'string' && document.match(/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return json(res, 400, { error: 'Document invalide.' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > MAX_DOC_BYTES) return json(res, 400, { error: 'Fichier trop lourd (2 Mo maximum).' });
      const mime = sniffMime(buf);
      if (!mime) return json(res, 400, { error: 'Format non accepté : JPG, PNG ou PDF uniquement.' });
      const pending = await db.prepare(`SELECT id FROM kyc_requests WHERE user_id = ? AND status = 'en_attente'`).get(user.id);
      if (pending) return json(res, 409, { error: 'Une vérification est déjà en cours d\'examen.' });
      await db.prepare('INSERT INTO kyc_requests (user_id, doc_mime, doc_data) VALUES (?, ?, ?)').run(user.id, mime, buf.toString('base64'));
      return json(res, 201, { success: true });
    }
    return null;
  }

  // ---------- CNI : côté admin (session admin vérifiée en base) ----------
  const admin = await requireAdmin(req, res); if (!admin) return;
  const id = adminMatch[1] ? Number(adminMatch[1]) : null;

  if (!id && req.method === 'GET') {
    const rows = await db.prepare(`SELECT k.id, k.status, k.created_at, u.name, u.email, u.phone, u.phone_verified FROM kyc_requests k JOIN users u ON u.id = k.user_id
      WHERE k.status = 'en_attente' ORDER BY k.id ASC LIMIT 100`).all(); // jamais le document ici
    return json(res, 200, { requests: rows });
  }
  if (id && adminMatch[2] && req.method === 'GET') {
    const k = await db.prepare('SELECT doc_mime, doc_data, user_id FROM kyc_requests WHERE id = ?').get(id);
    if (!k) return notFound(res);
    console.log(`[KYC] document #${id} (utilisateur ${k.user_id}) consulté par admin ${admin.id} depuis ${clientIp(req)}`);
    res.writeHead(200, { 'Content-Type': k.doc_mime, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'" });
    return res.end(Buffer.from(k.doc_data, 'base64'));
  }
  if (id && !adminMatch[2] && req.method === 'PUT') {
    const { decision, reason } = await parseBody(req);
    if (!['approuve', 'rejete'].includes(decision)) return json(res, 400, { error: 'Décision invalide.' });
    if (decision === 'rejete' && !String(reason || '').trim()) return json(res, 400, { error: 'Indique le motif du rejet.' });
    const k = await db.prepare('SELECT user_id, status FROM kyc_requests WHERE id = ?').get(id);
    if (!k) return notFound(res);
    if (k.status !== 'en_attente') return json(res, 409, { error: 'Demande déjà traitée.' });
    await db.prepare(`UPDATE kyc_requests SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`)
      .run(decision, decision === 'rejete' ? String(reason).slice(0, 300) : null, admin.id, id);
    await db.prepare('UPDATE users SET kyc_verified = ? WHERE id = ?').run(decision === 'approuve' ? 1 : 0, k.user_id);
    if (decision === 'approuve') await db.prepare('UPDATE kyc_requests SET doc_data = ? WHERE id = ?').run('', id); // minimisation : on supprime l'image une fois la vérification faite
    await notifyClient(k.user_id, 'kyc', decision === 'approuve' ? 'Identité vérifiée ✅' : 'Vérification refusée',
      decision === 'approuve' ? 'Ton badge « KYC vérifié » est actif.' : `Motif : ${String(reason).slice(0, 120)}`, {});
    return json(res, 200, { success: true });
  }
  return null;
}
