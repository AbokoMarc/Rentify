import crypto from 'node:crypto';
import { db } from '../db.js';
import { json, parseBody, parseRawBody, notFound } from '../lib/http.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';
import { notifyAdmins, notifyClient } from '../lib/notify.js';
import { collectCampayPayment, checkCampayStatus, isCampayConfigured } from '../lib/campay.js';

function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

function formatXaf(n) {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

// Marque un paiement comme validé + confirme la réservation + crédite les points fidélité + notifie tout le monde.
// Utilisé par le webhook CamPay et par la validation manuelle admin (wallet crypto) — une seule source de vérité.
async function markPaymentValidated(paymentId, providerLabel) {
  const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment || payment.status === 'valide') return; // déjà traité (webhook peut arriver plusieurs fois) — idempotent
  await db.prepare(`UPDATE payments SET status = 'valide', validated_at = datetime('now') WHERE id = ?`).run(paymentId);
  const booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(payment.booking_id);
  if (!booking) return;
  await db.prepare(`UPDATE bookings SET status = 'confirmee' WHERE id = ?`).run(booking.id);
  await db.prepare(`UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?`).run(Math.round(booking.total_price / 1000), booking.user_id);
  await notifyClient(booking.user_id, 'paiement_valide', 'Paiement confirmé', `Votre paiement (${providerLabel}) pour la réservation ${booking.code} est validé. Séjour confirmé !`, { booking_id: booking.id });
  await notifyAdmins('nouveau_paiement', 'Paiement validé', `${providerLabel} — réservation ${booking.code} — ${formatXaf(booking.total_price)}`, { booking_id: booking.id });
}

async function loadOwnedBooking(bookingId, userId, res) {
  const booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) { notFound(res); return null; }
  if (booking.user_id !== userId) { json(res, 403, { error: 'Non autorisé.' }); return null; }
  if (booking.status !== 'en_attente') { json(res, 409, { error: 'Cette réservation a déjà été traitée.' }); return null; }
  return booking;
}

export async function handlePayments(req, res, urlPath) {
  // ============ Méthodes actives (public) ============
  if (urlPath === '/api/payments/methods' && req.method === 'GET') {
    return json(res, 200, { mobile_money: isCampayConfigured() });
  }

  // ============ CRYPTO — wallet manuel (option discrète, en plus du Mobile Money) ============
  if (urlPath === '/api/payments/crypto-wallet' && req.method === 'GET') {
    const wallet = await db.prepare('SELECT address, network_note FROM crypto_wallet WHERE id = 1').get();
    return json(res, 200, { wallet: wallet || null });
  }

  if (urlPath === '/api/admin/crypto-wallet' && req.method === 'GET') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const wallet = await db.prepare('SELECT address, network_note FROM crypto_wallet WHERE id = 1').get();
    return json(res, 200, { wallet: wallet || null });
  }

  if (urlPath === '/api/admin/crypto-wallet' && req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { address, network_note } = await parseBody(req);
    if (!address) return json(res, 400, { error: 'Adresse wallet requise.' });
    await db.prepare(`
      INSERT INTO crypto_wallet (id, address, network_note, updated_at) VALUES (1, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET address = excluded.address, network_note = excluded.network_note, updated_at = datetime('now')
    `).run(address, network_note || null);
    return json(res, 200, { success: true });
  }

  // ============ CAMPAY (Mobile Money automatique — MTN MoMo + Orange Money) ============
  // Le client saisit son numéro, reçoit un push USSD sur son téléphone, valide avec son code secret.
  if (urlPath === '/api/payments/campay/create' && req.method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!isCampayConfigured()) return json(res, 503, { error: "Le paiement Mobile Money n'est pas encore configuré. Contacte l'admin via WhatsApp." });
    const { booking_id, phone } = await parseBody(req);
    if (!phone) return json(res, 400, { error: 'Numéro de téléphone Mobile Money requis.' });
    const booking = await loadOwnedBooking(booking_id, user.id, res);
    if (!booking) return;

    const externalReference = `RTF${booking.id}${crypto.randomBytes(3).toString('hex')}`;
    const info = await db.prepare(`INSERT INTO payments (booking_id, method, provider, amount, currency, status, reference, payer_phone) VALUES (?, 'mobile_money', 'campay', ?, 'XAF', 'en_attente', ?, ?)`)
      .run(booking.id, booking.total_price, externalReference, phone);

    try {
      const { reference, operator } = await collectCampayPayment({
        amount: booking.total_price, phone,
        description: `Lokaya — réservation ${booking.code}`,
        externalReference,
      });
      // On garde la référence CamPay (nécessaire pour le webhook / la vérification de statut).
      await db.prepare('UPDATE payments SET reference = ? WHERE id = ?').run(reference, info.lastInsertRowid);
      return json(res, 200, { reference, operator, payment_id: info.lastInsertRowid, message: 'Vérifie ton téléphone et valide avec ton code secret Mobile Money.' });
    } catch (err) {
      console.error('Erreur CamPay:', err);
      await db.prepare('UPDATE payments SET status = \'echoue\' WHERE id = ?').run(info.lastInsertRowid);
      return json(res, 502, { error: err.message || "Le paiement Mobile Money a échoué. Réessaie ou choisis une autre méthode." });
    }
  }

  // GET /api/payments/campay/status/:reference — le frontend interroge ce endpoint pendant l'attente
  // de la validation du client sur son téléphone (le webhook confirme aussi, en parallèle).
  const campayStatusMatch = urlPath.match(/^\/api\/payments\/campay\/status\/([\w-]+)$/);
  if (campayStatusMatch && req.method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    const payment = await db.prepare('SELECT * FROM payments WHERE reference = ?').get(campayStatusMatch[1]);
    if (!payment) return notFound(res);
    if (payment.status === 'valide' || payment.status === 'echoue') return json(res, 200, { status: payment.status });
    try {
      const data = await checkCampayStatus(campayStatusMatch[1]);
      if (data.status === 'SUCCESSFUL') await markPaymentValidated(payment.id, 'CamPay Mobile Money');
      else if (data.status === 'FAILED') await db.prepare(`UPDATE payments SET status = 'echoue' WHERE id = ?`).run(payment.id);
      return json(res, 200, { status: data.status === 'SUCCESSFUL' ? 'valide' : data.status === 'FAILED' ? 'echoue' : 'en_attente' });
    } catch {
      return json(res, 200, { status: 'en_attente' });
    }
  }

  // POST /api/payments/campay/webhook — notification poussée par CamPay dès que le client valide (ou refuse).
  // Par sécurité (pas de signature HMAC côté CamPay), on revérifie toujours le statut via l'API avant de valider.
  if (urlPath === '/api/payments/campay/webhook' && req.method === 'POST') {
    const rawBody = await parseRawBody(req);
    let event;
    try { event = JSON.parse(rawBody.toString()); } catch { res.writeHead(400); return res.end(); }
    const reference = event.reference || event.external_reference;
    if (reference) {
      try {
        const payment = await db.prepare('SELECT * FROM payments WHERE reference = ?').get(reference);
        if (payment) {
          const data = await checkCampayStatus(payment.reference);
          if (data.status === 'SUCCESSFUL') await markPaymentValidated(payment.id, 'CamPay Mobile Money');
          else if (data.status === 'FAILED') await db.prepare(`UPDATE payments SET status = 'echoue' WHERE id = ?`).run(payment.id);
        }
      } catch (err) { console.error('Erreur traitement webhook CamPay:', err); }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ received: true }));
  }

  // POST /api/payments — soumission manuelle crypto (wallet perso) : le client colle le hash, l'admin valide ensuite
  if (urlPath === '/api/payments' && req.method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const { booking_id, provider, reference } = await parseBody(req);
    if (!booking_id || !reference) return json(res, 400, { error: 'Réservation et hash de transaction requis.' });
    const booking = await loadOwnedBooking(booking_id, user.id, res);
    if (!booking) return;

    const info = await db.prepare(`INSERT INTO payments (booking_id, method, provider, amount, currency, status, reference) VALUES (?, 'crypto', ?, ?, 'XAF', 'en_attente', ?)`)
      .run(booking.id, provider || 'crypto', booking.total_price, reference);

    await notifyAdmins('nouveau_paiement', 'Paiement crypto à vérifier', `Réservation ${booking.code} — ${formatXaf(booking.total_price)} — hash : ${reference}`, { booking_id: booking.id, payment_id: info.lastInsertRowid });
    return json(res, 201, { success: true });
  }

  // ============ Admin : liste + validation/rejet des paiements ============
  if (urlPath === '/api/admin/payments' && req.method === 'GET') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const payments = await db.prepare(`
      SELECT payments.*, bookings.code as booking_code, users.name as client_name, users.email as client_email
      FROM payments
      JOIN bookings ON bookings.id = payments.booking_id
      JOIN users ON users.id = bookings.user_id
      ORDER BY payments.created_at DESC
    `).all();
    return json(res, 200, { payments });
  }

  const validateMatch = urlPath.match(/^\/api\/admin\/payments\/(\d+)\/validate$/);
  if (validateMatch && req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    await markPaymentValidated(validateMatch[1], 'Validation manuelle admin');
    return json(res, 200, { success: true });
  }

  const rejectMatch = urlPath.match(/^\/api\/admin\/payments\/(\d+)\/reject$/);
  if (rejectMatch && req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { admin_note } = await parseBody(req);
    const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').get(rejectMatch[1]);
    if (!payment) return notFound(res);
    await db.prepare(`UPDATE payments SET status = 'echoue', admin_note = ? WHERE id = ?`).run(admin_note || null, rejectMatch[1]);
    const booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(payment.booking_id);
    if (booking) await notifyClient(booking.user_id, 'paiement_rejete', 'Paiement refusé', `Ton paiement pour la réservation ${booking.code} n'a pas pu être confirmé. ${admin_note || ''}`, { booking_id: booking.id });
    return json(res, 200, { success: true });
  }

  return null;
}
