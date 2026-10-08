import { db } from '../db.js';
import { json, parseBody } from '../lib/http.js';
import { hashPassword, verifyPassword, signToken, requireAuth, DUMMY_HASH } from '../lib/auth.js';
import { clientIp, hit, peek, reset, tooMany } from '../lib/security.js';
import { isEmailConfigured, sendVerificationEmail } from '../lib/email.js';
import crypto from 'node:crypto';

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, avatar: u.avatar,
    country: u.country, loyalty_points: u.loyalty_points, must_change_password: !!u.must_change_password,
    preferred_language: u.preferred_language, default_travel_purpose: u.default_travel_purpose,
    vendeur_statut: u.vendeur_statut, email_verified: !!u.email_verified,
  };
}

function originOf(req) {
  // PUBLIC_SITE_URL évite l'attaque par en-tête Host falsifié (lien de réinitialisation pointant vers un site pirate).
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

export async function handleAuth(req, res, urlPath) {
  if (urlPath === '/api/auth/register' && req.method === 'POST') {
    const rlReg = hit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000); // 10 inscriptions / heure / IP
    if (!rlReg.allowed) return tooMany(res, rlReg.retryAfterSec);
    const b = await parseBody(req);
    const { name, email, password, phone, country, address, city, postal_code, date_of_birth,
      nationality, id_document_type, id_document_number, default_travel_purpose, preferred_language, want_seller } = b;
    if (!name || !email || !password) return json(res, 400, { error: 'Nom, email et mot de passe requis.' });
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') return json(res, 400, { error: 'Données invalides.' });
    if (name.length > 100 || email.length > 200 || password.length > 200) return json(res, 400, { error: 'Données trop longues.' });
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return json(res, 400, { error: 'Adresse email invalide.' });
    if (/[<>]/.test(name)) return json(res, 400, { error: 'Le nom contient des caractères non autorisés.' });
    if (password.length < 8) return json(res, 400, { error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return json(res, 409, { error: 'Un compte existe déjà avec cet email.' });
    const role = want_seller ? 'vendeur' : 'client';
    const vendeurStatut = want_seller ? 'en_attente' : null;
    const verifyToken = crypto.randomBytes(24).toString('hex');
    const info = await db.prepare(`
      INSERT INTO users (name, email, phone, country, address, city, postal_code, date_of_birth, nationality,
        id_document_type, id_document_number, default_travel_purpose, preferred_language, password_hash, role, vendeur_statut, email_verify_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(), email.toLowerCase().trim(), phone || null, country || null, address || null, city || null,
      postal_code || null, date_of_birth || null, nationality || null, id_document_type || null,
      id_document_number || null, default_travel_purpose || 'loisirs', preferred_language || 'fr',
      hashPassword(password), role, vendeurStatut, verifyToken
    );
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    if (want_seller) {
      const { notifyAdmins } = await import('../lib/notify.js');
      await notifyAdmins('nouveau_vendeur', 'Nouveau vendeur à valider', `${user.name} souhaite publier des annonces sur Lokaya.`, { user_id: user.id });
    }
    if (isEmailConfigured()) {
      sendVerificationEmail(user, verifyToken, originOf(req)).catch(err => console.error('Erreur envoi email de vérification:', err));
    }
    const token = signToken({ id: user.id, role: user.role, name: user.name });
    return json(res, 201, { token, user: publicUser(user) });
  }

  // GET /api/auth/verify-email?token=... — confirme l'adresse email depuis le lien reçu
  if (urlPath === '/api/auth/verify-email' && req.method === 'GET') {
    const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');
    if (!token) return json(res, 400, { error: 'Lien invalide.' });
    const user = await db.prepare('SELECT * FROM users WHERE email_verify_token = ?').get(token);
    if (!user) return json(res, 400, { error: 'Lien invalide ou déjà utilisé.' });
    await db.prepare(`UPDATE users SET email_verified = 1, email_verify_token = NULL WHERE id = ?`).run(user.id);
    return json(res, 200, { success: true });
  }

  // POST /api/auth/resend-verification — renvoie l'email de confirmation (utilisateur connecté)
  if (urlPath === '/api/auth/resend-verification' && req.method === 'POST') {
    const authUser = requireAuth(req, res);
    if (!authUser) return;
    if (!isEmailConfigured()) return json(res, 503, { error: "La vérification d'email n'est pas encore configurée." });
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id);
    if (user.email_verified) return json(res, 200, { message: 'Ton email est déjà confirmé.' });
    const verifyToken = crypto.randomBytes(24).toString('hex');
    await db.prepare(`UPDATE users SET email_verify_token = ? WHERE id = ?`).run(verifyToken, user.id);
    await sendVerificationEmail(user, verifyToken, originOf(req));
    return json(res, 200, { message: 'Email de confirmation renvoyé.' });
  }

  // Un client déjà inscrit demande à devenir vendeur (peut ensuite proposer des annonces, soumises à validation admin).
  if (urlPath === '/api/auth/become-seller' && req.method === 'POST') {
    const authUser = requireAuth(req, res);
    if (!authUser) return;
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id);
    if (user.role === 'admin') return json(res, 400, { error: 'Un compte admin ne peut pas devenir vendeur.' });
    if (user.role === 'vendeur' && user.vendeur_statut === 'en_attente') return json(res, 409, { error: 'Ta demande est déjà en attente de validation.' });
    await db.prepare(`UPDATE users SET role = 'vendeur', vendeur_statut = 'en_attente' WHERE id = ?`).run(authUser.id);
    const { notifyAdmins } = await import('../lib/notify.js');
    await notifyAdmins('nouveau_vendeur', 'Nouveau vendeur à valider', `${user.name} souhaite publier des annonces sur Lokaya.`, { user_id: user.id });
    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id);
    return json(res, 200, { user: publicUser(updated) });
  }

  // Changement de mot de passe par le titulaire du compte (client ou admin) — nécessite l'ancien mot de passe.
  if (urlPath === '/api/auth/change-password' && req.method === 'PUT') {
    const authUser = requireAuth(req, res);
    if (!authUser) return;
    const { current_password, new_password } = await parseBody(req);
    if (!current_password || !new_password) return json(res, 400, { error: 'Mot de passe actuel et nouveau requis.' });
    if (typeof new_password !== 'string' || new_password.length < 8 || new_password.length > 200) return json(res, 400, { error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id);
    if (!verifyPassword(current_password, user.password_hash)) return json(res, 401, { error: 'Mot de passe actuel incorrect.' });
    await db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`).run(hashPassword(new_password), authUser.id);
    return json(res, 200, { success: true });
  }

  // Un client oublie son mot de passe. Si l'email est configuré : on génère et envoie directement un
  // mot de passe temporaire, sans attendre l'admin. Sinon : on notifie l'admin, qui peut le faire depuis
  // Espace admin > Clients > Réinitialiser. Pas de fuite d'info : réponse identique que l'email existe ou non.
  if (urlPath === '/api/auth/forgot-password' && req.method === 'POST') {
    const rlFp = hit(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000); // 5 demandes / heure / IP
    if (!rlFp.allowed) return tooMany(res, rlFp.retryAfterSec);
    const { email } = await parseBody(req);
    if (email && typeof email === 'string') {
      const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
      const rlMail = hit(`forgot-mail:${email.toLowerCase().trim()}`, 3, 60 * 60 * 1000); // 3 / heure / compte : évite de spammer ou verrouiller une victime
      // Les comptes ADMIN sont exclus : leur mot de passe ne se réinitialise jamais depuis le site public.
      if (user && user.role !== 'admin' && rlMail.allowed) {
        if (isEmailConfigured()) {
          // Lien à usage unique (30 min). Le mot de passe actuel n'est PAS touché tant que le lien n'est pas utilisé :
          // personne ne peut verrouiller le compte d'un autre en saisissant son email.
          const { sendPasswordResetEmail } = await import('../lib/email.js');
          const raw = crypto.randomBytes(32).toString('hex');
          const hash = crypto.createHash('sha256').update(raw).digest('hex');
          await db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').run(user.id);
          await db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(user.id, hash, Date.now() + 30 * 60 * 1000);
          await sendPasswordResetEmail(user, `${originOf(req)}/reset-password.html?token=${raw}`).catch(err => console.error('Erreur envoi email reset:', err));
        } else {
          const { notifyAdmins } = await import('../lib/notify.js');
          await notifyAdmins('mot_de_passe_oublie', 'Demande de mot de passe oublié', `${user.name} (${user.email}) a demandé la réinitialisation de son mot de passe.`, { user_id: user.id });
        }
      }
    }
    return json(res, 200, {
      message: isEmailConfigured()
        ? "Si un compte existe avec cet email, un lien de réinitialisation valable 30 minutes vient de t'être envoyé."
        : "Si un compte existe avec cet email, l'administrateur a été prévenu et te contactera avec un nouveau mot de passe.",
    });
  }

  // POST /api/auth/reset-password — { token, new_password } : consomme le lien reçu par email
  if (urlPath === '/api/auth/reset-password' && req.method === 'POST') {
    const rl = hit(`reset:${clientIp(req)}`, 10, 60 * 60 * 1000);
    if (!rl.allowed) return tooMany(res, rl.retryAfterSec);
    const { token, new_password } = await parseBody(req);
    if (typeof token !== 'string' || typeof new_password !== 'string' || new_password.length < 8 || new_password.length > 200) {
      return json(res, 400, { error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hash);
    if (!row || row.used || row.expires_at < Date.now()) return json(res, 400, { error: 'Lien invalide ou expiré. Refais une demande.' });
    const target = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(row.user_id);
    if (!target || target.role === 'admin') return json(res, 400, { error: 'Lien invalide ou expiré. Refais une demande.' });
    await db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(new_password), row.user_id);
    await db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').run(row.user_id);
    return json(res, 200, { success: true });
  }

  if (urlPath === '/api/auth/login' && req.method === 'POST') {
    const { email, password } = await parseBody(req);
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') return json(res, 400, { error: 'Email et mot de passe requis.' });
    const mail = email.toLowerCase().trim().slice(0, 200);
    const ip = clientIp(req);
    const W = 15 * 60 * 1000;
    // Verrouillage anti brute-force : 8 échecs / 15 min par email, 30 / 15 min par IP.
    if (peek(`loginfail:email:${mail}`, W) >= 8 || peek(`loginfail:ip:${ip}`, W) >= 30) return tooMany(res, 900);
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(mail);
    const passwordOk = verifyPassword(password, user ? user.password_hash : DUMMY_HASH); // même durée que l'email existe ou non
    // Les comptes admin NE PEUVENT PAS se connecter ici : ils passent par la page de connexion admin séparée.
    if (!user || !passwordOk || user.role === 'admin') {
      hit(`loginfail:email:${mail}`, 8, W);
      hit(`loginfail:ip:${ip}`, 30, W);
      return json(res, 401, { error: 'Email ou mot de passe incorrect.' });
    }
    reset(`loginfail:email:${mail}`);
    const token = signToken({ id: user.id, role: user.role, name: user.name });
    return json(res, 200, { token, user: publicUser(user) });
  }

  if (urlPath === '/api/auth/me' && req.method === 'GET') {
    const authUser = requireAuth(req, res);
    if (!authUser) return;
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id);
    if (!user) return json(res, 404, { error: 'Utilisateur introuvable.' });
    return json(res, 200, { user: publicUser(user) });
  }

  if (urlPath === '/api/auth/me' && req.method === 'PUT') {
    const authUser = requireAuth(req, res);
    if (!authUser) return;
    const { name, phone, avatar } = await parseBody(req);
    if (name && (typeof name !== 'string' || name.length > 100 || /[<>]/.test(name))) return json(res, 400, { error: 'Nom invalide.' });
    if (avatar && (typeof avatar !== 'string' || avatar.length > 400000 || !/^(data:image\/(png|jpe?g|webp|gif);base64,|https:\/\/)/i.test(avatar))) {
      return json(res, 400, { error: 'Photo de profil invalide.' });
    }
    await db.prepare('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), avatar = COALESCE(?, avatar) WHERE id = ?')
      .run(name || null, phone || null, avatar || null, authUser.id);
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id);
    return json(res, 200, { user: publicUser(user) });
  }

  return null; // route non gérée ici
}
