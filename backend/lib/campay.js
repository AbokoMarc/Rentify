// Intégration CamPay — paiement automatique Mobile Money (MTN MoMo + Orange Money) au Cameroun.
// ⚠️ Écrit avec le plus grand soin mais PAS testé en conditions réelles (pas d'accès réseau dans
// l'environnement de développement). Teste d'abord sur le compte DEMO CamPay avant de passer en live.
// Doc officielle : https://documenter.getpostman.com/view/2391374/T1LV8PVA
//
// Comment activer :
// 1. Crée un compte sur https://www.campay.net (ou https://demo.campay.net pour tester, max 100 FCFA)
// 2. Crée une "application", récupère soit un jeton permanent (App Keys), soit le username/password de l'app
// 3. Renseigne dans .env : CAMPAY_MODE=demo|live, CAMPAY_PERMANENT_TOKEN=... (le plus simple)
//    ou CAMPAY_USERNAME + CAMPAY_PASSWORD
// 4. Dans ton tableau de bord CamPay, mets l'URL de webhook sur : https://tondomaine.cm/api/payments/campay/webhook

const BASE = () => (process.env.CAMPAY_MODE === 'live' ? 'https://www.campay.net/api' : 'https://demo.campay.net/api');

export function isCampayConfigured() {
  return !!(process.env.CAMPAY_PERMANENT_TOKEN || (process.env.CAMPAY_USERNAME && process.env.CAMPAY_PASSWORD));
}

// Récupère un jeton d'accès : direct si jeton permanent fourni, sinon login username/password (jeton temporaire, ~1h).
async function getToken() {
  if (process.env.CAMPAY_PERMANENT_TOKEN) return process.env.CAMPAY_PERMANENT_TOKEN;
  const res = await fetch(`${BASE()}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.CAMPAY_USERNAME, password: process.env.CAMPAY_PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error(data.detail || "Impossible de s'authentifier auprès de CamPay.");
  return data.token;
}

// Normalise un numéro camerounais vers le format attendu par CamPay : 237XXXXXXXXX (sans +, sans espace).
export function normalizeCmPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('237')) return digits;
  if (digits.length === 9) return `237${digits}`;
  return digits;
}

// Déclenche un push USSD sur le téléphone du client (il valide avec son code secret MoMo/OM).
// Retourne { reference } — le statut final arrive ensuite via webhook (ou en interrogeant checkStatus).
export async function collectCampayPayment({ amount, phone, description, externalReference }) {
  if (!isCampayConfigured()) throw new Error('CAMPAY_NOT_CONFIGURED');
  const token = await getToken();
  const res = await fetch(`${BASE()}/collect/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({
      amount: String(Math.round(amount)), // FCFA, entier — pas de décimales
      currency: 'XAF',
      from: normalizeCmPhone(phone),
      description: description || 'Paiement Lokaya',
      external_reference: externalReference,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.reference) {
    const code = data?.code;
    const messages = {
      ER101: 'Numéro invalide — utilise le format 237XXXXXXXXX.',
      ER102: 'Cet opérateur mobile money n\'est pas supporté (seuls MTN et Orange sont acceptés).',
      ER201: 'Montant invalide.',
    };
    throw new Error(messages[code] || data.detail || data.message || "Le paiement CamPay n'a pas pu être initié.");
  }
  return { reference: data.reference, ussd_code: data.ussd_code || null, operator: data.operator || null };
}

// Interroge le statut réel d'une transaction (utile en repli si le webhook n'arrive pas).
// Statuts possibles : PENDING | SUCCESSFUL | FAILED
export async function checkCampayStatus(reference) {
  const token = await getToken();
  const res = await fetch(`${BASE()}/transaction/${reference}/`, {
    headers: { Authorization: `Token ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Impossible de vérifier la transaction CamPay.');
  return data; // { status, reference, external_reference, amount, ... }
}
