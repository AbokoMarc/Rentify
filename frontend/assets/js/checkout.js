if (!requireAuthOrRedirect()) { /* redirection en cours */ }

const bookingId = new URLSearchParams(window.location.search).get('booking');
let currentBooking = null;
let mobileMoneyAvailable = true;
let selectedMethod = 'mobile_money';
let selectedOperator = null; // 'orange' | 'mtn' — sert à contrôler que le numéro saisi correspond bien à l'opérateur choisi

// Préfixes Mobile Money du Cameroun : MTN 650-654, 67x, 68x ; Orange 655-659, 69x (et 640 pour certains numéros).
function detectOperator(raw) {
  const n = String(raw).replace(/\D/g, '').replace(/^237/, '');
  if (!/^6\d{8}$/.test(n)) return null;
  if (/^(65[0-4]|67\d|68\d)/.test(n)) return 'mtn';
  if (/^(65[5-9]|69\d)/.test(n)) return 'orange';
  return null;
}
const OP_LABEL = { orange: 'Orange Money', mtn: 'MTN MoMo' };
let statusPoll = null;

async function loadMethodsAvailability() {
  try {
    const { mobile_money } = await api('/payments/methods', { auth: false });
    mobileMoneyAvailable = !!mobile_money;
  } catch { mobileMoneyAvailable = false; }
  qs('mm-unavailable').classList.toggle('hidden', mobileMoneyAvailable);
  qs('mm-fields').classList.toggle('hidden', !mobileMoneyAvailable);
  if (!mobileMoneyAvailable) selectPaymentMethod('crypto');
}

async function loadCryptoWallet() {
  try {
    const { wallet } = await api('/payments/crypto-wallet', { auth: false });
    qs('crypto-destination').innerHTML = wallet?.address
      ? `Adresse wallet : <strong style="word-break:break-all">${escapeHtml(wallet.address)}</strong>${wallet.network_note ? `<div style="margin-top:6px;color:var(--muted-text)">${escapeHtml(wallet.network_note)}</div>` : ''}`
      : `<span style="color:var(--muted-text)">Adresse wallet à configurer par l'administrateur.</span>`;
  } catch { /* silencieux */ }
}

function selectPaymentMethod(method) {
  selectedMethod = method;
  document.querySelectorAll('.pay-method').forEach(el => el.classList.toggle('selected', el.dataset.method === method));
  qs('pay-submit').textContent = method === 'mobile_money' ? 'Payer en Mobile Money' : 'Envoyer le paiement crypto';
}

document.querySelectorAll('.pay-method-head').forEach(head => {
  head.addEventListener('click', () => {
    const method = head.closest('.pay-method').dataset.method;
    if (method === 'mobile_money' && !mobileMoneyAvailable) return;
    selectPaymentMethod(method);
  });
});

async function loadSummary() {
  try {
    const { bookings } = await api('/bookings/mine');
    const booking = bookings.find(b => b.id === Number(bookingId));
    if (!booking) { qs('summary-card').innerHTML = `<div class="empty-state"><i>⚠️</i>Réservation introuvable.</div>`; return; }
    currentBooking = booking;
    renderSummary(booking);
  } catch (err) {
    qs('summary-card').innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderSummary(booking) {
  if (booking.status !== 'en_attente') {
    qs('summary-card').innerHTML = `<div style="text-align:center;padding:20px">
      <div style="font-size:36px">${booking.status === 'confirmee' ? '✅' : 'ℹ️'}</div>
      <h3 style="margin-top:10px">Réservation ${booking.status.replace('_', ' ')}</h3>
      <p style="color:var(--muted-text);font-size:14px;margin-top:6px">Code : ${booking.code}</p>
      <a href="${booking.status === 'confirmee' ? '/confirmation.html?booking=' + booking.id : '/dashboard.html'}" class="btn btn-dark btn-block" style="margin-top:16px">${booking.status === 'confirmee' ? 'Voir la confirmation' : 'Voir mes réservations'}</a>
    </div>`;
    qs('pay-submit').classList.add('hidden');
    return;
  }

  qs('summary-card').innerHTML = `
    <img src="${booking.room.images[0] || ''}" style="width:100%;height:150px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:14px">
    <h3 style="font-size:17px">${escapeHtml(booking.room.title)}</h3>
    <p style="color:var(--muted-text);font-size:13px;margin:4px 0 14px">${escapeHtml(booking.room.city)}</p>
    <div style="font-size:14px;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:14px">
      <div style="display:flex;justify-content:space-between"><span>Arrivée</span><strong>${formatDate(booking.check_in)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Départ</span><strong>${formatDate(booking.check_out)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Voyageurs</span><strong>${booking.adults} adultes</strong></div>
      <div style="display:flex;justify-content:space-between"><span>${booking.nights} nuit(s) × ${money(booking.price_per_night, { compact: true })}</span><strong>${money(booking.total_price, { compact: true })}</strong></div>
    </div>
    <div style="border-top:1px dashed var(--line);margin-top:14px;padding-top:14px;display:flex;justify-content:space-between;font-size:16px">
      <strong>Total</strong><strong>${money(booking.total_price)}</strong>
    </div>
    <div style="margin-top:10px"><span class="badge badge-attente">Code : ${booking.code}</span></div>
  `;
}

async function submitManualPayment(reference, provider) {
  const btn = qs('pay-submit');
  const errEl = qs('checkout-error');
  btn.disabled = true; const originalText = btn.textContent; btn.textContent = 'Envoi…';
  try {
    await api('/payments', { method: 'POST', body: { booking_id: currentBooking.id, provider, reference } });
    showToast('Paiement envoyé', 'Ton paiement est en cours de vérification. Tu recevras une notification dès confirmation.', 'success');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 1800);
  } catch (err) {
    errEl.textContent = err.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = originalText;
  }
}

function showMobileMoneyWaiting(reference, operator) {
  qs('summary-card').innerHTML = `<div style="text-align:center;padding:20px">
    <div class="spinner"></div>
    <h3 style="margin-top:10px" data-i18n="payment_pending">Vérifie ton téléphone et valide avec ton code secret Mobile Money…</h3>
    <p style="color:var(--muted-text);font-size:14px;margin-top:6px">${operator ? `Opérateur détecté : ${escapeHtml(operator)}. ` : ''}Ça ne prend que quelques secondes.</p>
  </div>`;
  qs('pay-submit').classList.add('hidden');
  if (typeof I18N !== 'undefined') I18N.apply(qs('summary-card'));

  let attempts = 0;
  statusPoll = setInterval(async () => {
    attempts++;
    try {
      const { status } = await api(`/payments/campay/status/${reference}`);
      if (status === 'valide') {
        clearInterval(statusPoll);
        showToast('Paiement confirmé 🎉', 'Ta réservation est validée.', 'success');
        setTimeout(() => { window.location.href = `/confirmation.html?booking=${bookingId}`; }, 1200);
      } else if (status === 'echoue') {
        clearInterval(statusPoll);
        showToast('Paiement échoué', 'Le paiement Mobile Money a échoué ou a été annulé.', 'warn');
        loadSummary(); qs('pay-submit').classList.remove('hidden');
      } else if (attempts > 40) { // ~2 minutes — au-delà, la notification en direct prendra le relais
        clearInterval(statusPoll);
      }
    } catch { /* on continue de réessayer */ }
  }, 3000);
}

qs('pay-submit').addEventListener('click', async () => {
  const errEl = qs('checkout-error');
  errEl.style.display = 'none';
  if (!currentBooking || currentBooking.status !== 'en_attente') return;

  if (selectedMethod === 'mobile_money') {
    const phone = qs('mm-phone').value.trim();
    if (!phone) { errEl.textContent = 'Merci de renseigner ton numéro Mobile Money.'; errEl.style.display = 'block'; return; }
    const detected = detectOperator(phone);
    if (!selectedOperator) { errEl.textContent = 'Choisis ton opérateur : Orange Money ou MTN MoMo.'; errEl.style.display = 'block'; return; }
    if (detected && detected !== selectedOperator) { errEl.textContent = `Ce numéro semble être un numéro ${OP_LABEL[detected]}. Choisis ${OP_LABEL[detected]} ou vérifie ton numéro.`; errEl.style.display = 'block'; return; }
    const btn = qs('pay-submit');
    btn.disabled = true; const originalText = btn.textContent; btn.textContent = 'Envoi de la demande…';
    try {
      const { reference, operator } = await api('/payments/campay/create', { method: 'POST', body: { booking_id: currentBooking.id, phone } });
      showMobileMoneyWaiting(reference, operator);
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = originalText;
    }
    return;
  }

  const hash = qs('crypto-hash').value.trim();
  if (!hash) { errEl.textContent = 'Merci de renseigner le hash de la transaction.'; errEl.style.display = 'block'; return; }
  return submitManualPayment(hash, qs('crypto-currency').value);
});

mountLayout();
loadSummary();
loadMethodsAvailability();
loadCryptoWallet();

// Choix de l'opérateur (gros boutons) + indication en direct selon le numéro saisi
document.querySelectorAll('.op-btn').forEach(btn => btn.addEventListener('click', () => {
  selectedOperator = btn.dataset.op;
  document.querySelectorAll('.op-btn').forEach(b => b.classList.toggle('active', b === btn));
  qs('mm-phone').focus();
}));
qs('mm-phone').addEventListener('input', () => {
  const d = detectOperator(qs('mm-phone').value), hint = qs('mm-op-hint');
  hint.classList.toggle('hidden', !d);
  if (d) {
    hint.textContent = `Numéro ${OP_LABEL[d]} détecté`;
    if (!selectedOperator) document.querySelector(`.op-btn[data-op="${d}"]`).click();
  }
});
