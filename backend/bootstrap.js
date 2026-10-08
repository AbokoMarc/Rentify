import { db } from './db.js';
import { hashPassword } from './lib/auth.js';

export async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrateur Lokaya';

  if (!email || !password) {
    console.warn('⚠️  ADMIN_EMAIL / ADMIN_PASSWORD absents du .env — aucun compte admin créé automatiquement.');
    return;
  }

  const existing = await db.prepare('SELECT id, role FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    if (existing.role !== 'admin') {
      // SÉCURITÉ : si quelqu'un s'est inscrit avec l'email admin avant le premier démarrage, on ne lui donne pas
      // les droits avec SON mot de passe — on impose celui défini dans ADMIN_PASSWORD (variable d'environnement).
      await db.prepare(`UPDATE users SET role = 'admin', password_hash = ?, must_change_password = 0 WHERE id = ?`)
        .run(hashPassword(password), existing.id);
      console.warn(`⚠️  ${email} existait comme compte normal : promu admin et mot de passe remplacé par ADMIN_PASSWORD.`);
    }
    return;
  }

  await db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`)
    .run(name, email.toLowerCase(), hashPassword(password));
  console.log(`✅ Compte admin créé pour ${email}`);
}
