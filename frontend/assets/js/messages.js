if (!requireAuthOrRedirect('/login.html?next=/messages.html')) { /* redirection en cours */ }
mountLayout('messages');

let currentConv = null, lastId = 0, pollTimer = null, me = null;

const initials = (n) => escapeHtml((n || '?').trim().slice(0, 1).toUpperCase());
const hhmm = (iso) => { const d = new Date(String(iso).replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

async function loadList() {
  try {
    const { conversations } = await api('/conversations');
    qs('chat-list').innerHTML = conversations.length ? conversations.map(c => `
      <a href="/messages.html?c=${c.id}" class="chat-item ${currentConv === c.id ? 'active' : ''}" data-id="${c.id}">
        <div class="chat-avatar">${initials(c.other_name)}</div>
        <div class="ci-body">
          <div class="ci-top"><strong>${escapeHtml(c.other_name)}</strong>${c.unread ? `<span class="ci-unread">${c.unread}</span>` : ''}</div>
          <div class="ci-room">${escapeHtml(c.room_title)}</div>
          <div class="ci-last">${escapeHtml((c.last_body || 'Nouvelle conversation').slice(0, 60))}</div>
        </div>
      </a>`).join('')
      : `<div class="empty-state"><i>💬</i>Aucune conversation. Ouvre une annonce et clique sur « Contacter l'hôte ».</div>`;
  } catch (err) { qs('chat-list').innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; }
}

function bubble(m) {
  const mine = m.sender_id === me;
  return `<div class="bubble ${mine ? 'mine' : 'theirs'}">${escapeHtml(m.body)}<span class="bt">${hhmm(m.created_at)}</span></div>`;
}

async function loadMessages(reset) {
  if (!currentConv) return;
  try {
    const data = await api(`/conversations/${currentConv}/messages?after=${reset ? 0 : lastId}`);
    me = data.me;
    if (reset) {
      qs('chat-name').textContent = data.other_name;
      qs('chat-avatar').textContent = (data.other_name || '?').trim().slice(0, 1).toUpperCase();
      qs('chat-room').textContent = data.room?.title || '';
      qs('chat-msgs').innerHTML = '';
    }
    if (data.messages.length) {
      const box = qs('chat-msgs');
      const atBottom = reset || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      box.insertAdjacentHTML('beforeend', data.messages.map(bubble).join(''));
      lastId = data.messages[data.messages.length - 1].id;
      if (atBottom) box.scrollTop = box.scrollHeight;
      loadList();
    }
  } catch (err) { if (reset) showToast('Erreur', err.message, 'warn'); }
}

function openConversation(id) {
  currentConv = id; lastId = 0;
  qs('chat-empty').classList.add('hidden'); qs('chat-box').classList.remove('hidden');
  document.body.classList.add('chat-open'); // sur mobile : affiche le fil et masque la liste
  loadMessages(true);
  clearInterval(pollTimer); pollTimer = setInterval(() => loadMessages(false), 5000);
}

qs('chat-back').addEventListener('click', () => { document.body.classList.remove('chat-open'); history.replaceState(null, '', '/messages.html'); currentConv = null; clearInterval(pollTimer); loadList(); });
qs('chat-list').addEventListener('click', (e) => {
  const a = e.target.closest('.chat-item'); if (!a) return;
  e.preventDefault(); history.replaceState(null, '', `/messages.html?c=${a.dataset.id}`); openConversation(Number(a.dataset.id));
});
qs('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = qs('chat-input'), text = input.value.trim(); if (!text || !currentConv) return;
  input.value = '';
  try {
    const { message } = await api(`/conversations/${currentConv}/messages`, { method: 'POST', body: { body: text } });
    qs('chat-msgs').insertAdjacentHTML('beforeend', bubble(message)); lastId = Math.max(lastId, message.id);
    qs('chat-msgs').scrollTop = qs('chat-msgs').scrollHeight; loadList();
  } catch (err) { input.value = text; showToast('Message non envoyé', err.message, 'warn'); }
});
// Nouveau message reçu en direct (flux de notifications) : on rafraîchit tout de suite
window.addEventListener('lokaya:notification', (e) => { if (e.detail?.type === 'nouveau_message') { loadList(); loadMessages(false); } });

(async () => {
  await loadList();
  const c = Number(new URLSearchParams(location.search).get('c'));
  if (c) openConversation(c);
})();
