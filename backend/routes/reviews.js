import { db } from '../db.js';
import { json, parseBody } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';

const isStar = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

export async function handleReviews(req, res, urlPath) {
  if (urlPath === '/api/reviews' && req.method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const b = await parseBody(req);
    const booking_id = Number(b.booking_id);
    const loc = b.rating_location == null ? null : Number(b.rating_location);
    const comm = b.rating_comm == null ? null : Number(b.rating_comm);
    const val = b.rating_value == null ? null : Number(b.rating_value);
    let rating = Number(b.rating);
    // Note globale = moyenne des notes par catégorie quand elles sont fournies
    const parts = [loc, comm, val].filter(v => v != null);
    if (parts.length) {
      if (!parts.every(isStar)) return json(res, 400, { error: 'Chaque note doit être entre 1 et 5.' });
      rating = Math.round(parts.reduce((a, v) => a + v, 0) / parts.length);
    }
    if (!isStar(rating)) return json(res, 400, { error: 'La note doit être entre 1 et 5.' });
    const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1000) : '';

    // Anti faux avis : il faut une réservation À SOI, confirmée ou terminée, sur CE logement, et un seul avis par réservation.
    if (!booking_id) return json(res, 400, { error: 'Un avis doit être lié à une de tes réservations.' });
    const booking = await db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(booking_id, user.id);
    if (!booking) return json(res, 403, { error: 'Réservation introuvable.' });
    if (!['confirmee', 'terminee'].includes(booking.status)) return json(res, 403, { error: 'Tu pourras donner ton avis une fois la réservation confirmée.' });
    const room_id = booking.room_id;
    const already = await db.prepare('SELECT id FROM reviews WHERE booking_id = ?').get(booking_id);
    if (already) return json(res, 409, { error: 'Tu as déjà donné ton avis sur ce séjour.' });

    await db.prepare('INSERT INTO reviews (room_id, user_id, booking_id, rating, rating_location, rating_comm, rating_value, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(room_id, user.id, booking_id, rating, loc, comm, val, comment || null);

    const stats = await db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE room_id = ?').get(room_id);
    await db.prepare('UPDATE rooms SET rating = ?, reviews_count = ? WHERE id = ?').run(Math.round(stats.avg * 10) / 10, stats.count, room_id);

    return json(res, 201, { success: true });
  }
  return null;
}
