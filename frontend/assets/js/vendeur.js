mountLayout('vendeur');

let myListings = [];
let imageUploaderWidget = null;

function showSellerState() {
  const user = Auth.getUser();
  ['seller-guest', 'seller-become', 'seller-pending', 'seller-dashboard'].forEach(id => qs(id).classList.add('hidden'));

  if (!Auth.isLoggedIn()) { qs('seller-guest').classList.remove('hidden'); return; }
  if (user.role === 'admin') { qs('seller-become').classList.add('hidden'); document.body.innerHTML = '<p style="padding:40px;text-align:center">Cette page est réservée aux vendeurs.</p>'; return; }
  if (user.role !== 'vendeur') { qs('seller-become').classList.remove('hidden'); return; }
  if (user.vendeur_statut === 'en_attente') { qs('seller-pending').classList.remove('hidden'); return; }
  if (user.vendeur_statut === 'rejete') {
    qs('seller-become').classList.remove('hidden');
    qs('become-seller-error').textContent = "Ta précédente demande n'a pas été retenue. Tu peux réessayer.";
    qs('become-seller-error').style.display = 'block';
    return;
  }
  qs('seller-dashboard').classList.remove('hidden');
  loadListings();
}

qs('become-seller-btn')?.addEventListener('click', async () => {
  const btn = qs('become-seller-btn');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    const { user } = await api('/auth/become-seller', { method: 'POST' });
    Auth.setUser(user);
    showSellerState();
  } catch (err) {
    qs('become-seller-error').textContent = err.message;
    qs('become-seller-error').style.display = 'block';
  } finally { btn.disabled = false; btn.textContent = 'Devenir vendeur'; }
});

function approvalBadge(status) {
  if (status === 'en_attente') return `<span class="badge-pill badge-pending" data-i18n="status_pending">En attente de validation</span>`;
  if (status === 'rejete') return `<span class="badge-pill badge-rejected" data-i18n="status_rejected">Refusée</span>`;
  return `<span class="badge-pill badge-approved" data-i18n="status_approved">Publiée</span>`;
}

function listingCard(r) {
  const img = r.images[0] || 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=300';
  return `
  <div style="display:flex;gap:14px;background:white;border-radius:var(--radius-md);box-shadow:var(--shadow-card);padding:14px;align-items:center" data-id="${r.id}">
    <img src="${img}" style="width:72px;height:72px;border-radius:8px;object-fit:cover;flex-shrink:0">
    <div style="flex:1;min-width:0">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <strong>${escapeHtml(r.title)}</strong>${approvalBadge(r.approval_status)}
      </div>
      <div style="font-size:13px;color:var(--muted-text);margin-top:4px">${escapeHtml(r.city)} · ${money(r.price_per_night, { compact: true, period: r.pricing_period })}${r.furnished === 1 ? ' · Meublé' : r.furnished === 0 ? ' · Non meublé' : ''}</div>
      ${r.rejection_reason ? `<div style="font-size:12px;color:var(--clay);margin-top:4px">Motif du refus : ${escapeHtml(r.rejection_reason)}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;flex-shrink:0">
      <button class="btn btn-ghost btn-sm" data-edit="${r.id}">Modifier</button>
      <button class="btn btn-danger btn-sm" data-delete="${r.id}">Supprimer</button>
    </div>
  </div>`;
}

async function loadListings() {
  try {
    const { rooms } = await api('/rooms/mine');
    myListings = rooms;
    qs('vt-total').textContent = rooms.length;
    qs('vt-pending').textContent = rooms.filter(r => r.approval_status === 'en_attente').length;
    qs('vt-live').textContent = rooms.filter(r => r.approval_status === 'approuve').length;
    qs('listings-grid').innerHTML = rooms.length
      ? rooms.map(listingCard).join('')
      : `<p style="color:var(--muted-text);text-align:center;padding:30px">Aucune annonce pour l'instant. Clique sur "Proposer une annonce" pour commencer.</p>`;
    if (typeof I18N !== 'undefined') I18N.apply(qs('listings-grid'));
  } catch (err) {
    qs('listings-grid').innerHTML = `<p style="color:var(--clay);text-align:center;padding:20px">${escapeHtml(err.message)}</p>`;
  }
}

function openListingModal(room = null) {
  qs('listing-form').reset();
  qs('listing-modal-title').textContent = room ? "Modifier l'annonce" : 'Proposer une annonce';
  qs('lm-id').value = room?.id || '';
  qs('lm-title').value = room?.title || '';
  qs('lm-type').value = room?.type || 'chambre';
  qs('lm-city').value = room?.city || '';
  qs('lm-address').value = room?.address || '';
  qs('lm-lat').value = room?.latitude ?? '';
  qs('lm-lng').value = room?.longitude ?? '';
  qs('lm-desc').value = room?.description || '';
  qs('lm-price').value = room?.price_per_night ?? '';
  qs('lm-pricing-period').value = room?.pricing_period || 'nuit';
  qs('lm-furnished').value = room?.furnished === 1 ? '1' : room?.furnished === 0 ? '0' : '';
  qs('lm-adults').value = room?.capacity_adults ?? 2;
  qs('lm-bedrooms').value = room?.bedrooms ?? 1;
  qs('lm-bathrooms').value = room?.bathrooms ?? 1;
  qs('lm-amenities').value = (room?.amenities || []).join(', ');
  qs('lm-terms').value = room?.rental_terms || '';
  imageUploaderWidget = mountImageUploader('lm-image-uploader', room?.images || [], () => {});
  qs('listing-form-error').style.display = 'none';
  qs('listing-modal-overlay').classList.remove('hidden');
}
function closeListingModal() { qs('listing-modal-overlay').classList.add('hidden'); }

qs('new-listing-btn')?.addEventListener('click', () => openListingModal());
qs('listing-modal-close').addEventListener('click', closeListingModal);
qs('listing-modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'listing-modal-overlay') closeListingModal(); });

qs('listings-grid').addEventListener('click', async (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.delete;
  if (editId) openListingModal(myListings.find(r => r.id === Number(editId)));
  if (delId) {
    if (!confirm('Retirer définitivement cette annonce ?')) return;
    try { await api(`/rooms/mine/${delId}`, { method: 'DELETE' }); showToast('Retirée', 'Ton annonce a été supprimée.', 'success'); loadListings(); }
    catch (err) { showToast('Impossible de supprimer', err.message, 'warn'); }
  }
});

qs('listing-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = qs('lm-id').value;
  const errEl = qs('listing-form-error');
  errEl.style.display = 'none';
  const body = {
    title: qs('lm-title').value.trim(),
    type: qs('lm-type').value,
    city: qs('lm-city').value.trim(),
    address: qs('lm-address').value.trim(),
    latitude: qs('lm-lat').value ? Number(qs('lm-lat').value) : null,
    longitude: qs('lm-lng').value ? Number(qs('lm-lng').value) : null,
    description: qs('lm-desc').value.trim(),
    price_per_night: Number(qs('lm-price').value),
    pricing_period: qs('lm-pricing-period').value,
    furnished: qs('lm-furnished').value === '' ? null : Number(qs('lm-furnished').value),
    capacity_adults: Number(qs('lm-adults').value),
    bedrooms: Number(qs('lm-bedrooms').value),
    bathrooms: Number(qs('lm-bathrooms').value),
    amenities: qs('lm-amenities').value.split(',').map(s => s.trim()).filter(Boolean),
    rental_terms: qs('lm-terms').value.trim() || null,
    images: imageUploaderWidget ? imageUploaderWidget.getImages() : [],
  };
  const btn = qs('listing-form-submit');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    if (id) await api(`/rooms/mine/${id}`, { method: 'PUT', body });
    else await api('/rooms/mine', { method: 'POST', body });
    showToast('Envoyée', 'Ton annonce a été soumise, elle sera vérifiée avant publication.', 'success');
    closeListingModal(); loadListings();
  } catch (err) {
    errEl.textContent = err.message; errEl.style.display = 'block';
  } finally { btn.disabled = false; btn.textContent = 'Soumettre à validation'; }
});

showSellerState();


// ---- Publication en 4 étapes (le formulaire et son envoi restent identiques) ----
let lmStep = 1;
function showLmStep(n) {
  lmStep = Math.min(4, Math.max(1, n));
  document.querySelectorAll('#listing-form .lm-step').forEach(el => el.classList.toggle('hidden', Number(el.dataset.step) !== lmStep));
  qs('lm-step-label').textContent = `Étape ${lmStep}/4`;
  document.querySelectorAll('.stepper-bar i').forEach((bar, i) => bar.classList.toggle('on', i < lmStep));
  qs('lm-prev').classList.toggle('hidden', lmStep === 1);
  qs('lm-next').classList.toggle('hidden', lmStep === 4);
  qs('listing-form-submit').classList.toggle('hidden', lmStep !== 4);
}
qs('lm-next').addEventListener('click', () => {
  // Valide uniquement les champs de l'étape courante avant de passer à la suivante
  const fields = document.querySelectorAll(`#listing-form .lm-step[data-step="${lmStep}"] input, #listing-form .lm-step[data-step="${lmStep}"] select, #listing-form .lm-step[data-step="${lmStep}"] textarea`);
  for (const f of fields) if (!f.reportValidity()) return;
  showLmStep(lmStep + 1);
});
qs('lm-prev').addEventListener('click', () => showLmStep(lmStep - 1));
// Chaque ouverture du formulaire repart de l'étape 1
new MutationObserver(() => { if (!qs('listing-modal-overlay').classList.contains('hidden')) showLmStep(1); })
  .observe(qs('listing-modal-overlay'), { attributes: true, attributeFilter: ['class'] });
showLmStep(1);
// Entrée dans un champ = « Suivant » (et non envoi prématuré du formulaire)
qs('listing-form').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && lmStep < 4) { e.preventDefault(); qs('lm-next').click(); }
});


// ---------- Calendrier vendeur : séjours sur mes annonces ----------
const sCal = { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), bookings: [], sel: null };
const S_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const sIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const staysOn = (day) => sCal.bookings.filter(b => day >= b.check_in.slice(0, 10) && day < b.check_out.slice(0, 10));

function renderSellerCal() {
  const y = sCal.month.getFullYear(), m = sCal.month.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7, daysIn = new Date(y, m + 1, 0).getDate(), today = sIso(new Date());
  let cells = '<span></span>'.repeat(offset);
  for (let d = 1; d <= daysIn; d++) {
    const iso = sIso(new Date(y, m, d)), stays = staysOn(iso);
    const cls = ['cal-day', stays.length ? 'has-stay' : '', iso === today ? 'today' : '', iso === sCal.sel ? 'sel' : ''].join(' ');
    cells += `<button type="button" class="${cls}" data-date="${iso}">${d}</button>`;
  }
  qs('seller-cal').innerHTML = `
    <div class="cal-head"><button type="button" id="sc-prev" aria-label="Mois précédent">←</button><strong>Calendrier — ${S_MONTHS[m]} ${y}</strong><button type="button" id="sc-next" aria-label="Mois suivant">→</button></div>
    <div class="cal-grid cal-dow">${['LUN','MAR','MER','JEU','VEN','SAM','DIM'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-legend"><span><i class="lg sel"></i>Séjour sur l'une de mes annonces</span></div>`;
  renderSellerDay();
}
function renderSellerDay() {
  const box = qs('seller-day');
  if (!sCal.sel) { box.innerHTML = ''; return; }
  const stays = staysOn(sCal.sel);
  box.innerHTML = stays.length ? stays.map(b => `
    <div class="mod-row" style="margin-top:8px"><div class="mi"><strong>${escapeHtml(b.room_title)}</strong>
      <small>${escapeHtml(b.guest_name)} · ${escapeHtml(b.check_in.slice(0, 10))} → ${escapeHtml(b.check_out.slice(0, 10))} · ${escapeHtml(b.code || '')}</small></div>
      <span class="badge ${b.status === 'confirmee' ? 'badge-confirmee' : 'badge-attente'}">${b.status === 'confirmee' ? 'Confirmée' : b.status === 'terminee' ? 'Terminée' : 'En attente'}</span></div>`).join('')
    : '<p style="color:var(--muted-text);font-size:13px;margin-top:8px">Aucun séjour ce jour-là.</p>';
}
qs('seller-cal').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'sc-prev') sCal.month = new Date(sCal.month.getFullYear(), sCal.month.getMonth() - 1, 1);
  else if (t.id === 'sc-next') sCal.month = new Date(sCal.month.getFullYear(), sCal.month.getMonth() + 1, 1);
  else if (t.dataset.date) sCal.sel = t.dataset.date;
  renderSellerCal();
});
async function loadSellerStats() {
  try {
    const { bookings, avg_rating } = await api('/rooms/mine/bookings');
    sCal.bookings = bookings;
    const ym = sIso(new Date()).slice(0, 7);
    const thisMonth = bookings.filter(b => b.check_in.slice(0, 7) === ym && b.status !== 'en_attente');
    qs('vt-res').textContent = thisMonth.length;
    qs('vt-rev').textContent = thisMonth.reduce((a, b) => a + (b.total_price || 0), 0).toLocaleString('fr-FR') + ' FCFA';
    qs('vt-rate').textContent = avg_rating ? `${avg_rating} ★` : '–';
  } catch { qs('vt-res').textContent = '0'; qs('vt-rev').textContent = '0 FCFA'; qs('vt-rate').textContent = '–'; }
  renderSellerCal();
}
loadSellerStats();
