import { db } from '../db.js';
import { json, parseBody } from '../lib/http.js';
import { hashPassword, verifyPassword, signToken, requireAuth } from '../lib/auth.js';
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
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

export async function handleAuth(req, res, urlPath) {
  if (urlPath === '/api/auth/register' && req.method === 'POST') {
    const b = await parseBody(req);
    const { name, email, password, phone, country, address, city, postal_code, date_of_birth,
      nationality, id_document_type, id_document_number, default_travel_purpose, preferred_language, want_seller } = b;
    if (!name || !email || !password) return json(res, 400, { error: 'Nom, email et mot de passe requis.' });
    if (password.length < 6) return json(res, 400, { error: 'Le mot de passe doit contenir au moins 6 caractères.' });
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
    if (new_password.length < 6) return json(res, 400, { error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id);
    if (!verifyPassword(current_password, user.password_hash)) return json(res, 401, { error: 'Mot de passe actuel incorrect.' });
    await db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`).run(hashPassword(new_password), authUser.id);
    return json(res, 200, { success: true });
  }

  // Un client oublie son mot de passe. Si l'email est configuré : on génère et envoie directement un
  // mot de passe temporaire, sans attendre l'admin. Sinon : on notifie l'admin, qui peut le faire depuis
  // Espace admin > Clients > Réinitialiser. Pas de fuite d'info : réponse identique que l'email existe ou non.
  if (urlPath === '/api/auth/forgot-password' && req.method === 'POST') {
    const { email } = await parseBody(req);
    if (email) {
      const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (user) {
        if (isEmailConfigured()) {
          const { sendTempPasswordEmail } = await import('../lib/email.js');
          const tempPassword = crypto.randomBytes(6).toString('base64url'); // ex : 8 caractères lisibles
          await db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?`).run(hashPassword(tempPassword), user.id);
          await sendTempPasswordEmail(user, tempPassword).catch(err => console.error('Erreur envoi email mot de passe:', err));
        } else {
          const { notifyAdmins } = await import('../lib/notify.js');
          await notifyAdmins('mot_de_passe_oublie', 'Demande de mot de passe oublié', `${user.name} (${user.email}) a demandé la réinitialisation de son mot de passe.`, { user_id: user.id });
        }
      }
    }
    return json(res, 200, {
      message: isEmailConfigured()
        ? "Si un compte existe avec cet email, un nouveau mot de passe temporaire vient de t'être envoyé par email."
        : "Si un compte existe avec cet email, l'administrateur a été prévenu et te contactera avec un nouveau mot de passe.",
    });
  }

  if (urlPath === '/api/auth/login' && req.method === 'POST') {
    const { email, password } = await parseBody(req);
    if (!email || !password) return json(res, 400, { error: 'Email et mot de passe requis.' });
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user || !verifyPassword(password, user.password_hash)) {
      return json(res, 401, { error: 'Email ou mot de passe incorrect.' });
    }
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
    await db.prepare('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), avatar = COALESCE(?, avatar) WHERE id = ?')
      .run(name || null, phone || null, avatar || null, authUser.id);
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id);
    return json(res, 200, { user: publicUser(user) });
  }

  return null; // route non gérée ici
}
