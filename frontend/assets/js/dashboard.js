if (!requireAuthOrRedirect()) { /* redirection en cours */ }
mountLayout('dashboard');

const STATUS_LABELS = { en_attente: 'En attente de paiement', confirmee: 'Confirmée', annulee: 'Annulée', terminee: 'Terminée' };

function bookingRowHtml(b) {
  const img = b.room?.images?.[0] || '';
  return `
  <div style="background:white;border-radius:var(--radius-md);box-shadow:var(--shadow-card);padding:18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
    <img src="${img}" style="width:90px;height:90px;object-fit:cover;border-radius:var(--radius-sm);flex-shrink:0">
    <div style="flex:1;min-width:200px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <strong>${escapeHtml(b.room?.title || 'Logement supprimé')}</strong>
        <span class="badge badge-${b.status}">${STATUS_LABELS[b.status]}</span>
      </div>
      <p style="color:var(--muted-text);font-size:13px;margin:6px 0">${formatDate(b.check_in)} → ${formatDate(b.check_out)} · ${b.nights} nuit(s) · ${b.adults} adultes</p>
      <p style="font-size:13px">Code : <strong>${b.code}</strong> · ${money(b.total_price)}</p>
      ${b.payment ? `<p style="font-size:12px;color:var(--muted-text)">Paiement : ${b.payment.method.replace('_', ' ')} — <span class="badge badge-${b.payment.status}">${b.payment.status}</span></p>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${b.status === 'en_attente' && !b.payment ? `<a href="/checkout.html?booking=${b.id}" class="btn btn-primary btn-sm">Payer</a>` : ''}
      ${['confirmee', 'terminee'].includes(b.status) ? `<a href="/recu.html?booking=${b.id}" class="btn btn-outline-ink btn-sm">📄 Voir le reçu</a>` : ''}
      ${['en_attente', 'confirmee'].includes(b.status) ? `<button class="btn btn-ghost btn-sm" onclick="cancelBooking(${b.id})">Annuler</button>` : ''}
      ${b.status === 'terminee' ? `<button class="btn btn-outline-ink btn-sm" onclick="openReview(${b.room?.id}, ${b.id})">Laisser un avis</button>` : ''}
    </div>
  </div>`;
}

async function loadBookings() {
  try {
    const { bookings } = await api('/bookings/mine');
    qs('bookings-list').innerHTML = bookings.length
      ? bookings.map(bookingRowHtml).join('')
      : `<div class="empty-state"><i>🧳</i>Vous n'avez pas encore de réservation. <a href="/search.html" style="color:var(--ink);font-weight:600">Explorer les logements</a></div>`;
  } catch (err) {
    qs('bookings-list').innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function cancelBooking(id) {
  if (!confirm('Annuler cette réservation ?')) return;
  try { await api(`/bookings/${id}/cancel`, { method: 'PUT' }); showToast('Réservation annulée', '', 'warn'); loadBookings(); }
  catch (err) { showToast('Erreur', err.message, 'warn'); }
}

function openReview(roomId, bookingId) {
  const rating = prompt('Note sur 5 (1 à 5) :', '5');
  if (!rating) return;
  const comment = prompt('Votre commentaire :', '');
  api('/reviews', { method: 'POST', body: { room_id: roomId, booking_id: bookingId, rating: Number(rating), comment } })
    .then(() => showToast('Merci !', 'Votre avis a été publié.', 'success'))
    .catch(err => showToast('Erreur', err.message, 'warn'));
}

async function loadFavoris() {
  try {
    const { rooms } = await api('/favorites');
    const DEFAULT_IMG = 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=600';
    qs('favoris-grid').innerHTML = rooms.length
      ? rooms.map(room => `
        <a href="/room.html?id=${room.id}" class="room-card">
          <div class="room-img-wrap"><img src="${room.images[0] || DEFAULT_IMG}" alt="${escapeHtml(room.title)}" loading="lazy"><span class="verified-badge">✓ Vérifié</span><span class="room-type-tag">${room.type}</span></div>
          <div class="room-body"><h3>${escapeHtml(room.title)}</h3><div class="room-meta">${escapeHtml(room.city)}</div>
          <div class="room-price"><span class="amount">${money(room.price_per_night, { compact: true, period: room.pricing_period })}</span></div></div>
        </a>`).join('')
      : `<div class="empty-state" style="grid-column:1/-1"><i>♥</i>Aucun favori pour l'instant.</div>`;
  } catch (err) {
    qs('favoris-grid').innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function loadProfile() {
  const user = Auth.getUser();
  qs('p-name').value = user.name || '';
  qs('p-phone').value = user.phone || '';
}

qs('p-save').addEventListener('click', async () => {
  try {
    const { user } = await api('/auth/me', { method: 'PUT', body: { name: qs('p-name').value, phone: qs('p-phone').value } });
    Auth.setUser(user);
    showToast('Profil mis à jour', '', 'success');
  } catch (err) { showToast('Erreur', err.message, 'warn'); }
});

qs('p-change-pass').addEventListener('click', async () => {
  const errEl = qs('p-pass-error');
  errEl.style.display = 'none';
  try {
    await api('/auth/change-password', { method: 'PUT', body: { current_password: qs('p-current').value, new_password: qs('p-new').value } });
    qs('p-current').value = ''; qs('p-new').value = '';
    showToast('Mot de passe modifié', '', 'success');
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['bookings', 'demandes', 'favoris', 'profil'].forEach(t => qs(`tab-${t}`).classList.toggle('hidden', t !== btn.dataset.tab));
    if (btn.dataset.tab === 'favoris') loadFavoris();
    if (btn.dataset.tab === 'demandes') loadDemandes();
  });
});

const INQUIRY_STATUS_LABELS = { nouveau: '🆕 Nouvelle', en_discussion: '💬 En discussion', traite: '✅ Traitée', abandonne: 'Abandonnée' };

async function loadDemandes() {
  try {
    const { inquiries } = await api('/inquiries/mine');
    qs('demandes-list').innerHTML = inquiries.length ? inquiries.map(i => `
      <div style="background:white;border-radius:var(--radius-md);box-shadow:var(--shadow-card);padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <strong>${i.kind === 'achat' ? "Demande d'achat" : 'Demande de location'}</strong>
          <span style="font-size:12px;font-weight:700">${INQUIRY_STATUS_LABELS[i.status] || i.status}</span>
        </div>
        <div style="font-size:12px;color:var(--muted-text);margin-top:4px">Envoyée le ${formatDate(i.created_at)}</div>
        <div id="thread-${i.id}" style="margin-top:12px"></div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <input type="text" id="reply-input-${i.id}" placeholder="Écrire une réponse au conseiller..." style="flex:1;border:1.5px solid var(--line);border-radius:var(--radius-sm);padding:8px 12px;font-size:13px">
          <button class="btn btn-primary btn-sm" data-send-reply="${i.id}">Envoyer</button>
        </div>
      </div>`).join('') : `<div class="empty-state"><i>📋</i>Aucune demande immobilière pour l'instant.<br><a href="/immobilier.html" style="color:var(--ink);font-weight:600">Faire une demande</a></div>`;

    inquiries.forEach(i => loadThread(i.id));
  } catch (err) {
    qs('demandes-list').innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function loadThread(inquiryId) {
  const el = qs(`thread-${inquiryId}`);
  if (!el) return;
  try {
    const { messages } = await api(`/inquiries/${inquiryId}/messages`);
    el.innerHTML = messages.length ? messages.map(m => `
      <div style="padding:10px 12px;border-radius:var(--radius-sm);font-size:13px;margin-bottom:6px;background:${m.sender_role === 'admin' ? 'var(--sand-deep)' : '#EEF3EC'}">
        <strong>${m.sender_role === 'admin' ? '💬 ' + escapeHtml(m.sender_name) : 'Toi'}</strong> · <span style="color:var(--muted-text);font-size:11px">${formatDate(m.created_at)}</span>
        <div style="margin-top:2px">${escapeHtml(m.message)}</div>
      </div>`).join('') : `<div style="font-size:13px;color:var(--muted-text)">En attente de réponse d'un conseiller...</div>`;
  } catch { /* silencieux */ }
}

document.addEventListener('click', async (e) => {
  const inquiryId = e.target.dataset.sendReply;
  if (!inquiryId) return;
  const input = qs(`reply-input-${inquiryId}`);
  const message = input.value.trim();
  if (!message) return;
  e.target.disabled = true;
  try {
    await api(`/inquiries/${inquiryId}/messages`, { method: 'POST', body: { message } });
    input.value = '';
    loadThread(inquiryId);
  } catch (err) { showToast('Erreur', err.message, 'warn'); }
  e.target.disabled = false;
});

if (window.location.hash === '#favoris') qs('favoris-tab-btn').click();

loadBookings();
loadProfile();

const currentUser = Auth.getUser();
if (currentUser && !currentUser.email_verified) qs('verify-banner').classList.remove('hidden');
qs('resend-verify-btn').addEventListener('click', async () => {
  try {
    const { message } = await api('/auth/resend-verification', { method: 'POST' });
    showToast('Envoyé', message, 'success');
  } catch (err) { showToast('Impossible pour le moment', err.message, 'warn'); }
});
