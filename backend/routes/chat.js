// Messagerie client <-> hôte (vendeur propriétaire de l'annonce).
// Règle de sécurité centrale : seuls les deux participants d'une conversation peuvent la lire ou y écrire —
// vérifié côté serveur à CHAQUE requête, jamais déduit du navigateur.
import { db } from '../db.js';
import { json, parseBody, notFound } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { notifyClient } from '../lib/notify.js';
import { hit, tooMany } from '../lib/security.js';

const MAX_LEN = 1000;

async function loadForParticipant(convId, userId) {
  const c = await db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!c || (c.guest_id !== userId && c.host_id !== userId)) return null; // 404 identique : on ne révèle pas l'existence
  return c;
}

export async function handleChat(req, res, urlPath) {
  if (!urlPath.startsWith('/api/conversations')) return null;
  const user = requireAuth(req, res);
  if (!user) return;

  // POST /api/conversations { room_id } — ouvre (ou retrouve) la conversation avec l'hôte de l'annonce
  if (urlPath === '/api/conversations' && req.method === 'POST') {
    const { room_id } = await parseBody(req);
    const room = await db.prepare(`SELECT id, owner_id, approval_status FROM rooms WHERE id = ?`).get(Number(room_id));
    if (!room || room.approval_status !== 'approuve') return notFound(res);
    if (!room.owner_id) return json(res, 409, { error: "Cette annonce est gérée par l'équipe Lokaya : contacte-nous sur WhatsApp." });
    if (room.owner_id === user.id) return json(res, 400, { error: 'Tu ne peux pas écrire à ta propre annonce.' });
    let conv = await db.prepare('SELECT id FROM conversations WHERE room_id = ? AND guest_id = ?').get(room.id, user.id);
    if (!conv) {
      const info = await db.prepare('INSERT INTO conversations (room_id, guest_id, host_id) VALUES (?, ?, ?)').run(room.id, user.id, room.owner_id);
      conv = { id: info.lastInsertRowid };
    }
    return json(res, 200, { id: conv.id });
  }

  // GET /api/conversations — mes conversations (comme voyageur ou comme hôte)
  if (urlPath === '/api/conversations' && req.method === 'GET') {
    const rows = await db.prepare(`
      SELECT c.id, c.room_id, c.last_message_at, rooms.title AS room_title, rooms.images AS room_images,
        CASE WHEN c.guest_id = ? THEN hu.name ELSE gu.name END AS other_name,
        CASE WHEN c.guest_id = ? THEN 'guest' ELSE 'host' END AS my_role,
        (SELECT body FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
      FROM conversations c
      JOIN rooms ON rooms.id = c.room_id
      JOIN users gu ON gu.id = c.guest_id
      JOIN users hu ON hu.id = c.host_id
      WHERE c.guest_id = ? OR c.host_id = ?
      ORDER BY c.last_message_at DESC LIMIT 100
    `).all(user.id, user.id, user.id, user.id, user.id);
    return json(res, 200, {
      conversations: rows.map(r => ({ ...r, room_image: (() => { try { return JSON.parse(r.room_images || '[]')[0] || null; } catch { return null; } })(), room_images: undefined })),
    });
  }

  const msgMatch = urlPath.match(/^\/api\/conversations\/(\d+)\/messages$/);
  if (msgMatch) {
    const conv = await loadForParticipant(Number(msgMatch[1]), user.id);
    if (!conv) return notFound(res);

    if (req.method === 'GET') {
      const after = Number(new URL(req.url, 'http://x').searchParams.get('after') || 0);
      await db.prepare('UPDATE chat_messages SET read_at = datetime(\'now\') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL').run(conv.id, user.id);
      const messages = await db.prepare('SELECT id, sender_id, body, created_at FROM chat_messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC LIMIT 200').all(conv.id, after);
      const room = await db.prepare('SELECT id, title FROM rooms WHERE id = ?').get(conv.room_id);
      const other = await db.prepare('SELECT name FROM users WHERE id = ?').get(conv.guest_id === user.id ? conv.host_id : conv.guest_id);
      return json(res, 200, { me: user.id, room, other_name: other?.name || '', messages });
    }

    if (req.method === 'POST') {
      const rl = hit(`chat:${user.id}`, 20, 60 * 1000); // 20 messages / minute / utilisateur
      if (!rl.allowed) return tooMany(res, rl.retryAfterSec);
      const { body } = await parseBody(req);
      const text = typeof body === 'string' ? body.trim() : '';
      if (!text) return json(res, 400, { error: 'Message vide.' });
      if (text.length > MAX_LEN) return json(res, 400, { error: `Message trop long (${MAX_LEN} caractères maximum).` });
      const info = await db.prepare('INSERT INTO chat_messages (conversation_id, sender_id, body) VALUES (?, ?, ?)').run(conv.id, user.id, text);
      await db.prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`).run(conv.id);
      const recipient = conv.guest_id === user.id ? conv.host_id : conv.guest_id;
      const me = await db.prepare('SELECT name FROM users WHERE id = ?').get(user.id);
      // Le contenu du message n'est PAS recopié dans la notification (reste privé).
      await notifyClient(recipient, 'nouveau_message', 'Nouveau message', `${me?.name || 'Quelqu\'un'} vous a écrit.`, { conversation_id: conv.id });
      return json(res, 201, { message: { id: info.lastInsertRowid, sender_id: user.id, body: text, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) } });
    }
  }

  return null;
}
