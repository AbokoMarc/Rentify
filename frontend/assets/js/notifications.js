const NOTIF_LABELS = {
  nouvelle_reservation: { icon: '🛎️', cls: '' },
  nouveau_paiement: { icon: '💳', cls: 'warn' },
  paiement_valide: { icon: '✅', cls: 'success' },
  paiement_rejete: { icon: '⚠️', cls: 'warn' },
  reservation_maj: { icon: '📅', cls: '' },
  reservation_annulee: { icon: '✖️', cls: 'warn' },
};

function ensureToastStack() {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(title, message, type = '') {
  const stack = ensureToastStack();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 6000);
}

function initNotificationBell() {
  const bellBtn = qs('notif-bell');
  if (!bellBtn) return;

  async function refreshBadgeAndList() {
    try {
      const { notifications } = await api('/notifications');
      const unread = notifications.filter(n => !n.read).length;
      const badge = qs('notif-badge');
      if (badge) badge.textContent = unread > 9 ? '9+' : unread;
      if (badge) badge.classList.toggle('hidden', unread === 0);
      renderNotifPanel(notifications);
    } catch { /* silencieux */ }
  }

  function renderNotifPanel(notifications) {
    const panel = qs('notif-panel');
    if (!panel) return;
    if (!notifications.length) {
      panel.querySelector('.np-body').innerHTML = `<div class="empty-state" style="padding:32px 16px"><i>🔔</i>Aucune notification pour l'instant.</div>`;
      return;
    }
    panel.querySelector('.np-body').innerHTML = notifications.map(n => {
      const meta = NOTIF_LABELS[n.type] || { icon: '🔔', cls: '' };
      return `<div class="notif-item ${n.read ? '' : 'unread'}">
        ${!n.read ? '<div class="notif-dot"></div>' : '<div style="width:8px"></div>'}
        <div>
          <strong style="font-size:13px">${meta.icon} ${escapeHtml(n.title)}</strong>
          <p class="notif-msg">${escapeHtml(n.message)}</p>
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>`;
    }).join('');
  }

  bellBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const panel = qs('notif-panel');
    const willOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if (willOpen) {
      await refreshBadgeAndList();
      await api('/notifications/read-all', { method: 'PUT' }).catch(() => {});
      setTimeout(refreshBadgeAndList, 400);
    }
  });

  document.addEventListener('click', (e) => {
    const panel = qs('notif-panel');
    if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== bellBtn) {
      panel.classList.add('hidden');
    }
  });

  refreshBadgeAndList();

  // Flux temps réel — authentifié par un ticket à usage unique (le jeton de session n'est jamais mis dans l'URL)
  async function connectStream() {
    if (!Auth.getToken()) return;
    try {
      const { ticket } = await api('/notifications/stream-ticket', { method: 'POST' });
      const es = new EventSource(`/api/notifications/stream?ticket=${encodeURIComponent(ticket)}`);
      es.addEventListener('notification', (e) => {
        const notif = JSON.parse(e.data);
        const meta = NOTIF_LABELS[notif.type] || { icon: '🔔', cls: '' };
        showToast(`${meta.icon} ${notif.title}`, notif.message, meta.cls);
        refreshBadgeAndList();
        window.dispatchEvent(new CustomEvent('lokaya:notification', { detail: notif }));
      });
      // Le ticket est consommé : en cas de coupure on referme et on en redemande un nouveau.
      es.onerror = () => { es.close(); setTimeout(connectStream, 5000); };
    } catch { setTimeout(connectStream, 15000); }
  }
  connectStream();
}

document.addEventListener('DOMContentLoaded', initNotificationBell);
