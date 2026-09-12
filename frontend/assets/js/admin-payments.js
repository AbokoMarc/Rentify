mountAdminLayout('payments');

const METHOD_LABELS = { crypto: 'Crypto', mobile_money: 'Mobile Money' };
let allPayments = [];

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['pending', 'all', 'wallet'].forEach(t => qs(`tab-${t}`).classList.toggle('hidden', t !== btn.dataset.tab));
  });
});

async function loadPending() {
  try {
    const { payments } = await api('/admin/payments');
    allPayments = payments;
    // Seuls les paiements crypto nécessitent une vérification manuelle ; le Mobile Money (CamPay)
    // se valide tout seul via webhook, il apparaît juste dans "Tous les paiements".
    const pending = payments.filter(p => p.status === 'en_attente' && p.method === 'crypto');
    qs('pending-tbody').innerHTML = pending.length ? pending.map(p => `
      <tr data-id="${p.id}">
        <td data-label="Réservation"><strong>${p.booking_code}</strong></td>
        <td data-label="Client">${escapeHtml(p.client_name)}<div style="font-size:12px;color:var(--muted-text)">${escapeHtml(p.client_email)}</div></td>
        <td data-label="Méthode">${METHOD_LABELS[p.method] || p.method}${p.provider ? ` (${p.provider})` : ''}</td>
        <td data-label="Montant">${money(p.amount, { compact: true })}</td>
        <td data-label="Référence" style="max-width:220px;word-break:break-all;font-size:12px">${escapeHtml(p.reference || '—')}</td>
        <td class="row-actions">
          <button class="btn btn-primary btn-sm" data-validate="${p.id}">Valider</button>
          <button class="btn btn-danger btn-sm" data-reject="${p.id}">Rejeter</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--muted-text)">Aucun paiement en attente. 🎉</td></tr>`;

    qs('all-tbody').innerHTML = payments.map(p => `
      <tr><td data-label="Réservation"><strong>${p.booking_code}</strong></td><td data-label="Client">${escapeHtml(p.client_name)}</td>
        <td data-label="Méthode">${METHOD_LABELS[p.method] || p.method}${p.provider ? ` (${p.provider})` : ''}</td><td data-label="Montant">${money(p.amount, { compact: true })}</td>
        <td data-label="Statut"><span class="badge badge-${p.status}">${p.status.replace('_', ' ')}</span></td>
        <td data-label="Date" style="font-size:12px">${formatDate(p.created_at)}</td></tr>`).join('');
  } catch (err) { showToast('Erreur', err.message, 'warn'); }
}

qs('pending-tbody').addEventListener('click', async (e) => {
  const validateId = e.target.dataset.validate;
  const rejectId = e.target.dataset.reject;
  if (validateId) {
    if (!confirm('Confirme que tu as bien vérifié cette transaction (explorateur blockchain) avant de valider. Continuer ?')) return;
    try { await api(`/admin/payments/${validateId}/validate`, { method: 'PUT', body: {} }); showToast('Validé', 'Paiement confirmé, client notifié.', 'success'); loadPending(); }
    catch (err) { showToast('Erreur', err.message, 'warn'); }
  }
  if (rejectId) {
    const note = prompt('Motif du rejet (visible par le client) :');
    if (note === null) return;
    try { await api(`/admin/payments/${rejectId}/reject`, { method: 'PUT', body: { admin_note: note } }); showToast('Rejeté', 'Le client a été notifié.', 'warn'); loadPending(); }
    catch (err) { showToast('Erreur', err.message, 'warn'); }
  }
});

async function loadWallet() {
  try {
    const { wallet } = await api('/admin/crypto-wallet');
    qs('wallet-address').value = wallet?.address || '';
    qs('wallet-note').value = wallet?.network_note || '';
  } catch (err) { showToast('Erreur', err.message, 'warn'); }
}

qs('wallet-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/admin/crypto-wallet', { method: 'PUT', body: { address: qs('wallet-address').value.trim(), network_note: qs('wallet-note').value.trim() } });
    showToast('Enregistré', 'Le wallet a été mis à jour.', 'success');
  } catch (err) { showToast('Erreur', err.message, 'warn'); }
});

loadPending();
loadWallet();

qs('export-payments-btn').innerHTML = `${ICONS.download} Exporter en CSV`;
qs('export-payments-btn').addEventListener('click', () => {
  if (!allPayments.length) { showToast('Rien à exporter', 'Aucun paiement chargé.', 'warn'); return; }
  exportToCsv(`lokaya-paiements-${new Date().toISOString().slice(0, 10)}.csv`, [
    { label: 'Réservation', value: p => p.booking_code },
    { label: 'Client', value: p => p.client_name },
    { label: 'Méthode', value: p => METHOD_LABELS[p.method] || p.method },
    { label: 'Fournisseur', value: p => p.provider || '' },
    { label: 'Montant (FCFA)', value: p => Math.round(p.amount) },
    { label: 'Statut', value: p => p.status },
    { label: 'Référence', value: p => p.reference || '' },
    { label: 'Date', value: p => p.created_at },
  ], allPayments);
});
