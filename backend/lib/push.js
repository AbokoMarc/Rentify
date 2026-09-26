// Web Push — notifications système réelles, envoyées même si l'onglet du navigateur est fermé.
// Nécessite le paquet "web-push" (déjà dans package.json → lance `npm install`) et une paire de clés
// VAPID (génère la tienne avec : npx web-push generate-vapid-keys), à coller dans .env.
//
// Sans ces clés, l'app continue de fonctionner normalement : les notifications restent visibles en
// direct DANS le site (cloche + toasts, via SSE) mais ne sortent pas au niveau système d'exploitation.

import webpush from 'web-push';
import { db } from '../db.js';

export function isPushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

if (isPushConfigured()) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL || 'admin@lokaya.cm'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function saveSubscription(userId, subscription) {
  await db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
}

export async function removeSubscription(endpoint) {
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

async function sendToSubscriptionRow(row, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(payload)
    );
  } catch (err) {
    // 410/404 = abonnement expiré/révoqué côté navigateur — on le supprime silencieusement.
    if (err.statusCode === 410 || err.statusCode === 404) await removeSubscription(row.endpoint);
    else console.error('Erreur envoi Web Push:', err.statusCode || err.message);
  }
}

export async function pushToUser(userId, { title, message, data }) {
  if (!isPushConfigured()) return;
  const rows = await db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  const payload = { title, body: message, data: data || {} };
  await Promise.all(rows.map(row => sendToSubscriptionRow(row, payload)));
}

export async function pushToAdmins({ title, message, data }) {
  if (!isPushConfigured()) return;
  const admins = await db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  const ids = admins.map(a => a.id);
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`).all(...ids);
  const payload = { title, body: message, data: data || {} };
  await Promise.all(rows.map(row => sendToSubscriptionRow(row, payload)));
}
