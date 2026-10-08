// Connexion administrateur SÉPARÉE du site public.
//  - POST /api/admin/login   : seul point d'entrée pour obtenir une session admin (refuse les comptes non-admin)
//  - POST /api/admin/logout  : efface le cookie de session admin
//  - GET  /api/admin/verify  : vérification faisant foi côté serveur (utilisée par les pages admin au chargement)
import { db } from '../db.js';
import { json, parseBody } from '../lib/http.js';
import { verifyPassword, DUMMY_HASH, signAdminToken, requireAdmin, ADMIN_SESSION_SEC } from '../lib/auth.js';
import { clientIp, hit, peek, reset, tooMany, adminCookieHeader, clearAdminCookieHeader } from '../lib/security.js';

const WINDOW = 15 * 60 * 1000;

export async function handleAdminAuth(req, res, urlPath) {
  if (urlPath === '/api/admin/login' && req.method === 'POST') {
    const ip = clientIp(req);
    const { email, password } = await parseBody(req);
    const mail = String(email || '').toLowerCase().trim().slice(0, 200);

    // Verrouillage : 5 échecs / 15 min par email (quelle que soit l'IP) et 10 échecs / 15 min par IP.
    if (peek(`adminfail:email:${mail}`, WINDOW) >= 5 || peek(`adminfail:ip:${ip}`, WINDOW) >= 10) {
      console.warn(`[ADMIN] verrouillage actif — ip=${ip} email=${mail}`);
      return tooMany(res, 900);
    }
    if (!mail || !password || typeof password !== 'string') return json(res, 400, { error: 'Email et mot de passe requis.' });

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(mail);
    const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok || user.role !== 'admin') {
      hit(`adminfail:email:${mail}`, 5, WINDOW);
      hit(`adminfail:ip:${ip}`, 10, WINDOW);
      await db.prepare('INSERT INTO admin_login_log (email, ip, success) VALUES (?, ?, 0)').run(mail, ip);
      console.warn(`[ADMIN] échec de connexion — ip=${ip} email=${mail}`);
      return json(res, 401, { error: 'Identifiants incorrects.' }); // même message dans tous les cas
    }

    reset(`adminfail:email:${mail}`);
    await db.prepare('INSERT INTO admin_login_log (email, ip, success) VALUES (?, ?, 1)').run(mail, ip);
    console.log(`[ADMIN] connexion réussie — ip=${ip} admin_id=${user.id}`);
    const token = signAdminToken(user);
    res.setHeader('Set-Cookie', adminCookieHeader(token, ADMIN_SESSION_SEC));
    return json(res, 200, {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: 'admin', must_change_password: !!user.must_change_password },
    });
  }

  if (urlPath === '/api/admin/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', clearAdminCookieHeader());
    return json(res, 200, { success: true });
  }

  if (urlPath === '/api/admin/verify' && req.method === 'GET') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return json(res, 200, { ok: true, user: { id: admin.id, name: admin.name, role: 'admin' } });
  }

  return null;
}
