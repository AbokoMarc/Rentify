// Connexion administrateur SÉPARÉE du site public.
//  - POST /api/admin/login   : seul point d'entrée pour obtenir une session admin (refuse les comptes non-admin)
//  - POST /api/admin/logout  : efface le cookie de session admin
//  - GET  /api/admin/verify  : vérification faisant foi côté serveur (utilisée par les pages admin au chargement)
import { db } from '../db.js';
import { json, parseBody } from '../lib/http.js';
import { verifyPassword, DUMMY_HASH, signAdminToken, requireAdmin, ADMIN_SESSION_SEC } from '../lib/auth.js';
import { verifyTotp, newSecret, otpauthUri, sealSecret, openSecret, newRecoveryCodes, hashRecovery } from '../lib/totp.js';
import { clientIp, hit, peek, reset, tooMany, adminCookieHeader, clearAdminCookieHeader } from '../lib/security.js';

const WINDOW = 15 * 60 * 1000;

export async function handleAdminAuth(req, res, urlPath) {
  if (urlPath === '/api/admin/login' && req.method === 'POST') {
    const ip = clientIp(req);
    const { email, password, code } = await parseBody(req);
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

    // Double authentification : si activée, le mot de passe seul ne suffit JAMAIS.
    if (user.totp_enabled) {
      if (!code) return json(res, 200, { need_2fa: true });
      const failTwoFa = async (why) => {
        hit(`adminfail:email:${mail}`, 5, WINDOW); hit(`adminfail:ip:${ip}`, 10, WINDOW);
        await db.prepare('INSERT INTO admin_login_log (email, ip, success) VALUES (?, ?, 0)').run(mail, ip);
        console.warn(`[ADMIN] ${why} — ip=${ip} email=${mail}`);
        return json(res, 401, { error: 'Code incorrect.' });
      };
      let step = null;
      try { step = verifyTotp(openSecret(user.totp_secret), String(code), user.totp_last_step); }
      catch { console.error('[ADMIN] secret 2FA illisible (clé de chiffrement changée ?) — utilise un code de secours'); }
      if (step) await db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, user.id); // un code ne sert qu'une fois
      else {
        // code de secours à usage unique (si le téléphone est perdu)
        const rc = await db.prepare('SELECT id FROM admin_recovery_codes WHERE user_id = ? AND used = 0 AND code_hash = ?').get(user.id, hashRecovery(code));
        if (!rc) return failTwoFa('code 2FA incorrect');
        await db.prepare('UPDATE admin_recovery_codes SET used = 1 WHERE id = ?').run(rc.id);
        console.warn(`[ADMIN] code de secours utilisé — admin_id=${user.id}`);
      }
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

  // ---------- Gestion de la 2FA (session admin requise) ----------
  if (urlPath.startsWith('/api/admin/2fa/')) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const me = await db.prepare('SELECT id, email, password_hash, totp_secret, totp_enabled, totp_last_step FROM users WHERE id = ?').get(admin.id);

    if (urlPath === '/api/admin/2fa/status' && req.method === 'GET') {
      const left = await db.prepare('SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE user_id = ? AND used = 0').get(me.id);
      return json(res, 200, { enabled: !!me.totp_enabled, recovery_left: left.n });
    }
    if (urlPath === '/api/admin/2fa/setup' && req.method === 'POST') {
      if (me.totp_enabled) return json(res, 409, { error: 'La double authentification est déjà active.' });
      const secret = newSecret();
      await db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(sealSecret(secret), me.id);
      return json(res, 200, { secret, uri: otpauthUri(secret, me.email) });
    }
    if (urlPath === '/api/admin/2fa/enable' && req.method === 'POST') {
      const { code } = await parseBody(req);
      if (me.totp_enabled || !me.totp_secret) return json(res, 409, { error: 'Lance d\'abord la configuration.' });
      const step = verifyTotp(openSecret(me.totp_secret), code, 0);
      if (!step) return json(res, 400, { error: 'Code incorrect. Vérifie l\'heure de ton téléphone.' });
      const codes = newRecoveryCodes();
      await db.prepare('DELETE FROM admin_recovery_codes WHERE user_id = ?').run(me.id);
      for (const c of codes) await db.prepare('INSERT INTO admin_recovery_codes (user_id, code_hash) VALUES (?, ?)').run(me.id, hashRecovery(c));
      await db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?').run(step, me.id);
      console.log(`[ADMIN] 2FA activée — admin_id=${me.id}`);
      return json(res, 200, { success: true, recovery_codes: codes }); // affichés UNE seule fois
    }
    if (urlPath === '/api/admin/2fa/disable' && req.method === 'POST') {
      const { password, code } = await parseBody(req);
      if (!verifyPassword(String(password || ''), me.password_hash)) return json(res, 400, { error: 'Mot de passe incorrect.' });
      const step = me.totp_enabled ? verifyTotp(openSecret(me.totp_secret), code, me.totp_last_step) : 1;
      if (!step) return json(res, 400, { error: 'Code incorrect.' });
      await db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = ?').run(me.id);
      await db.prepare('DELETE FROM admin_recovery_codes WHERE user_id = ?').run(me.id);
      console.warn(`[ADMIN] 2FA désactivée — admin_id=${me.id}`);
      return json(res, 200, { success: true });
    }
  }

  return null;
}
