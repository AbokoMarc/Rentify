import { db } from '../db.js';
import { json, parseBody } from '../lib/http.js';
import { getAuthUser, requireAuth } from '../lib/auth.js';
import { sseHandler } from '../lib/sse.js';
import { getVapidPublicKey, saveSubscription, removeSubscription } from '../lib/push.js';

export async function handleNotifications(req, res, urlPath, urlObj) {
  // GET /api/notifications/push/key — clé publique VAPID nécessaire côté navigateur pour s'abonner
  if (urlPath === '/api/notifications/push/key' && req.method === 'GET') {
    return json(res, 200, { key: getVapidPublicKey() });
  }

  // POST /api/notifications/push/subscribe — enregistre l'abonnement Web Push du navigateur courant
  if (urlPath === '/api/notifications/push/subscribe' && req.method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const { subscription } = await parseBody(req);
    if (!subscription?.endpoint) return json(res, 400, { error: 'Abonnement invalide.' });
    await saveSubscription(user.id, subscription);
    return json(res, 200, { success: true });
  }

  // POST /api/notifications/push/unsubscribe
  if (urlPath === '/api/notifications/push/unsubscribe' && req.method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const { endpoint } = await parseBody(req);
    if (endpoint) await removeSubscription(endpoint);
    return json(res, 200, { success: true });
  }
  // GET /api/notifications/stream?token=... — flux temps réel (EventSource ne permet pas les headers custom)
  if (urlPath === '/api/notifications/stream' && req.method === 'GET') {
    const token = urlObj.searchParams.get('token');
    const fakeReq = { headers: { authorization: `Bearer ${token}` } };
    const user = getAuthUser(fakeReq);
    if (!user) { res.writeHead(401); return res.end(); }
    return sseHandler(req, res, user);
  }

  if (urlPath === '/api/notifications' && req.method === 'GET') {
    const user = getAuthUser(req);
    if (!user) return json(res, 401, { error: 'Non authentifié.' });
    const rows = user.role === 'admin'
      ? await db.prepare('SELECT * FROM notifications WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 50').all()
      : await db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(user.id);
    return json(res, 200, { notifications: rows.map(n => ({ ...n, data: JSON.parse(n.data || '{}') })) });
  }

  const readMatch = urlPath.match(/^\/api\/notifications\/(\d+)\/read$/);
  if (readMatch && req.method === 'PUT') {
    const user = getAuthUser(req);
    if (!user) return json(res, 401, { error: 'Non authentifié.' });
    await db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(readMatch[1]);
    return json(res, 200, { success: true });
  }

  if (urlPath === '/api/notifications/read-all' && req.method === 'PUT') {
    const user = getAuthUser(req);
    if (!user) return json(res, 401, { error: 'Non authentifié.' });
    if (user.role === 'admin') await db.prepare('UPDATE notifications SET read = 1 WHERE user_id IS NULL').run();
    else await db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(user.id);
    return json(res, 200, { success: true });
  }

  return null;
}
