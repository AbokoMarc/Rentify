const API_BASE = '/api';

const Auth = {
  getToken() { return localStorage.getItem('lokaya_token') || localStorage.getItem('rentify_token') || localStorage.getItem('roomia_token'); },
  setToken(t) { localStorage.setItem('lokaya_token', t); localStorage.removeItem('rentify_token'); localStorage.removeItem('roomia_token'); },
  clearToken() { localStorage.removeItem('lokaya_token'); localStorage.removeItem('rentify_token'); localStorage.removeItem('roomia_token'); },
  getUser() {
    const raw = localStorage.getItem('lokaya_user') || localStorage.getItem('rentify_user') || localStorage.getItem('roomia_user');
    return raw ? JSON.parse(raw) : null;
  },
  setUser(u) { localStorage.setItem('lokaya_user', JSON.stringify(u)); localStorage.removeItem('rentify_user'); localStorage.removeItem('roomia_user'); },
  clearUser() { localStorage.removeItem('lokaya_user'); localStorage.removeItem('rentify_user'); localStorage.removeItem('roomia_user'); },
  isLoggedIn() { return !!this.getToken(); },
  isAdmin() { return this.getUser()?.role === 'admin'; },
  logout() { this.clearToken(); this.clearUser(); window.location.href = '/index.html'; },
};

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && Auth.getToken()) headers['Authorization'] = `Bearer ${Auth.getToken()}`;

  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion.');
  }

  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }

  if (!res.ok) {
    if (res.status === 401 && auth) { Auth.logout(); }
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return data;
}

function requireAuthOrRedirect(redirectTo = '/login.html') {
  if (!Auth.isLoggedIn()) { window.location.href = redirectTo; return false; }
  return true;
}

function requireAdminOrRedirect() {
  if (!Auth.isLoggedIn() || !Auth.isAdmin()) { window.location.href = '/login.html'; return false; }
  return true;
}

// Export CSV générique — utilisé par les pages admin pour télécharger un historique (réservations, paiements...).
// columns : [{ label: 'Titre colonne', value: row => 'valeur' }]
function exportToCsv(filename, columns, rows) {
  const escapeCsv = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map(c => escapeCsv(c.label)).join(';');
  const lines = rows.map(row => columns.map(c => escapeCsv(c.value(row))).join(';'));
  const csv = '\uFEFF' + [header, ...lines].join('\n'); // \uFEFF = BOM, pour un affichage correct des accents dans Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
// montrer l'équivalent Euro à titre indicatif, tous les montants réels sont gérés en FCFA (XAF).
const XAF_PER_EUR = 655.957;

function money(amount, { compact = false, period = null } = {}) {
  const xaf = Math.round(amount).toLocaleString('fr-FR') + ' FCFA';
  const suffix = period ? (period === 'mois' ? ' /mois' : ' /nuit') : '';
  if (compact) return xaf + suffix;
  const eur = (amount / XAF_PER_EUR).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  return `${xaf}${suffix} <span class="price-eur-hint">(≈ ${eur} €)</span>`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso.replace(' ', 'T') + 'Z')) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

function qs(id) { return document.getElementById(id); }
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
