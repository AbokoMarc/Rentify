// Numéro WhatsApp de l'admin — un seul endroit à changer sur tout le site.
// ⚠️ PLACEHOLDER : remplace par le vrai numéro (format international, sans le +).
const WHATSAPP_ADMIN_NUMBER = '237600000000';

function whatsappUrl(prefill) {
  const text = encodeURIComponent(prefill || 'Bonjour, je vous contacte depuis Rentify.');
  return `https://wa.me/${WHATSAPP_ADMIN_NUMBER}?text=${text}`;
}

function renderWhatsappFloat() {
  return `
  <a href="${whatsappUrl()}" target="_blank" rel="noopener" class="whatsapp-float" id="whatsapp-float" data-i18n-aria="contact_whatsapp" data-i18n-title="contact_whatsapp" aria-label="WhatsApp">
    <svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.34.678 4.523 1.85 6.362L4 29l7.815-1.81A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3zm0 21.818c-1.94 0-3.75-.56-5.278-1.523l-.379-.234-4.637 1.073 1.093-4.51-.248-.393A9.77 9.77 0 0 1 5.19 15c0-5.965 4.85-10.818 10.814-10.818S26.818 9.035 26.818 15 21.968 24.818 16.004 24.818zm5.94-8.157c-.325-.163-1.923-.949-2.221-1.058-.298-.108-.515-.163-.732.163-.217.326-.84 1.058-1.03 1.276-.19.217-.38.244-.705.081-.325-.163-1.373-.505-2.615-1.607-.967-.86-1.62-1.923-1.81-2.248-.19-.326-.02-.502.143-.664.147-.146.325-.38.488-.57.163-.19.217-.326.325-.543.108-.217.054-.407-.027-.57-.081-.163-.732-1.76-1.003-2.41-.264-.634-.532-.548-.732-.558l-.624-.011c-.217 0-.57.081-.868.407-.298.326-1.138 1.112-1.138 2.71 0 1.6 1.166 3.144 1.328 3.361.163.217 2.293 3.5 5.556 4.91.777.335 1.383.535 1.856.685.78.248 1.49.213 2.052.13.626-.094 1.923-.786 2.194-1.545.271-.76.271-1.41.19-1.545-.081-.136-.298-.217-.624-.38z"/>
    </svg>
  </a>`;
}

function renderHeader(active = '') {
  const user = Auth.getUser();
  const loggedIn = Auth.isLoggedIn();
  const isSeller = loggedIn && user.role === 'vendeur';

  const navLink = (href, label, key) =>
    `<a href="${href}" style="${active === key ? 'color:var(--ink-text);font-weight:700' : ''}">${label}</a>`;

  const commonTools = `
    ${typeof renderLangSwitcher === 'function' ? renderLangSwitcher() : ''}
    <button class="icon-btn" id="theme-btn" aria-label="Thème">🌙</button>
    <button class="icon-btn" id="budget-calc-btn" aria-label="Calculateur budget" data-i18n-title="budget_calc" title="Calculateur de budget">💰</button>
  `;

  const sellerBadge = isSeller
    ? (user.vendeur_statut === 'approuve'
        ? `<a href="/vendeur.html" class="badge-pill badge-approved" style="text-decoration:none" data-i18n="nav_seller_space">Espace vendeur</a>`
        : `<span class="badge-pill badge-pending" data-i18n="status_pending">En attente de validation</span>`)
    : '';

  const rightSide = loggedIn ? `
    ${commonTools}
    <button class="icon-btn" id="notif-bell" aria-label="Notifications">🔔<span class="badge-dot hidden" id="notif-badge">0</span></button>
    <div class="notif-panel hidden" id="notif-panel">
      <div class="np-head"><strong>Notifications</strong></div>
      <div class="np-body"></div>
    </div>
    ${sellerBadge}
    <a href="${user.role === 'admin' ? '/admin/admin-dashboard.html' : '/dashboard.html'}" class="user-chip">
      <span class="avatar">${(user.name || '?').slice(0, 1).toUpperCase()}</span>
      <span style="font-size:14px;font-weight:600">${user.role === 'admin' ? 'Admin' : user.name.split(' ')[0]}</span>
    </a>
    <button class="btn btn-ghost btn-sm" id="logout-btn" data-i18n="logout">Déconnexion</button>
  ` : `
    ${commonTools}
    <a href="/login.html" class="btn btn-ghost btn-sm" data-i18n="login">Se connecter</a>
    <a href="/signup.html" class="btn btn-dark btn-sm" data-i18n="signup">S'inscrire</a>
  `;

  const drawerLinks = `
    <a href="/index.html" class="${active === 'home' ? 'active' : ''}" data-i18n="nav_home">Accueil</a>
    <a href="/search.html" class="${active === 'search' ? 'active' : ''}" data-i18n="nav_explore">Explorer</a>
    <a href="/immobilier.html" class="${active === 'immobilier' ? 'active' : ''}" data-i18n="nav_immobilier">Acheter / Louer un bien</a>
    ${loggedIn ? `<a href="/dashboard.html" class="${active === 'dashboard' ? 'active' : ''}" data-i18n="nav_bookings">Mes réservations</a>` : ''}
    ${loggedIn ? `<a href="/dashboard.html#favoris" data-i18n="nav_favorites">Favoris</a>` : ''}
    ${loggedIn && isSeller ? `<a href="/vendeur.html" class="${active === 'vendeur' ? 'active' : ''}" data-i18n="nav_seller_space">Espace vendeur</a>` : ''}
    ${loggedIn && !isSeller && user.role !== 'admin' ? `<a href="/vendeur.html" data-i18n="nav_become_seller">Devenir vendeur</a>` : ''}
    <a href="${whatsappUrl()}" target="_blank" rel="noopener" data-i18n="contact_whatsapp">Discuter avec l'admin sur WhatsApp</a>
    <hr>
    ${loggedIn
      ? `<a href="${user.role === 'admin' ? '/admin/admin-dashboard.html' : '/dashboard.html'}" data-i18n="${user.role === 'admin' ? 'admin_space' : 'my_profile'}">${user.role === 'admin' ? 'Espace admin' : 'Mon profil'}</a>
         <button class="drawer-link" id="drawer-logout-btn" data-i18n="logout">Déconnexion</button>`
      : `<a href="/login.html" data-i18n="login">Se connecter</a><a href="/signup.html" data-i18n="signup">S'inscrire</a>`}
  `;

  return `
  <header class="site-header">
    <div class="container">
      <a href="/index.html" class="brand"><img src="/assets/img/logo-icon.png" alt="Rentify" class="logo-mark">Rentify</a>
      <nav class="main-nav">
        ${navLink('/index.html', 'Accueil', 'home').replace('>Accueil<', ' data-i18n="nav_home">Accueil<')}
        ${navLink('/search.html', 'Explorer', 'search').replace('>Explorer<', ' data-i18n="nav_explore">Explorer<')}
        ${navLink('/immobilier.html', 'Acheter / Louer un bien', 'immobilier').replace('>Acheter', ' data-i18n="nav_immobilier">Acheter')}
        ${loggedIn ? navLink('/dashboard.html', 'Mes réservations', 'dashboard').replace('>Mes réservations<', ' data-i18n="nav_bookings">Mes réservations<') : ''}
        ${loggedIn ? `<a href="/dashboard.html#favoris" data-i18n="nav_favorites">Favoris</a>` : ''}
      </nav>
      <div class="header-actions" style="position:relative">
        ${rightSide}
        <button class="hamburger-btn" id="mobile-nav-btn" aria-label="Menu">☰</button>
      </div>
    </div>
    <div class="mobile-nav-drawer hidden" id="mobile-nav-drawer">
      <div class="drawer-panel">
        <button class="drawer-close" id="mobile-nav-close">✕</button>
        ${drawerLinks}
      </div>
    </div>
  </header>`;
}

function renderFooter() {
  return `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="brand" style="color:white;margin-bottom:12px">
            <img src="/assets/img/logo-icon.png" alt="Rentify" class="logo-mark">Rentify
          </div>
          <p style="font-size:14px;line-height:1.6;max-width:280px" data-i18n="footer_tagline">Réservez chambres, appartements et maisons partout au Cameroun. Paiement en Mobile Money. Achat et location de biens accompagnés par nos conseillers.</p>
        </div>
        <div>
          <h4 data-i18n="footer_explore_title">Rentify</h4>
          <ul>
            <li><a href="/search.html" data-i18n="footer_link_explore">Explorer les logements</a></li>
            <li><a href="/index.html#villes" data-i18n="footer_link_cities">Nos villes</a></li>
            <li><a href="#" data-i18n="footer_link_about">À propos</a></li>
          </ul>
        </div>
        <div>
          <h4 data-i18n="footer_support_title">Assistance</h4>
          <ul>
            <li><a href="#" data-i18n="footer_link_help">Centre d'aide</a></li>
            <li><a href="#" data-i18n="footer_link_cancel">Annulation</a></li>
            <li><a href="${whatsappUrl()}" target="_blank" rel="noopener" data-i18n="footer_link_contact">Contact WhatsApp</a></li>
          </ul>
        </div>
        <div>
          <h4 data-i18n="footer_host_title">Devenir vendeur</h4>
          <ul>
            <li><a href="/vendeur.html" data-i18n="footer_link_publish">Publier une annonce</a></li>
            <li><a href="/vendeur.html" data-i18n="footer_link_host_resources">Ressources vendeurs</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} Rentify</span>
        <span data-i18n="footer_rights">Réservation de logements en toute confiance, au Cameroun</span>
      </div>
    </div>
  </footer>`;
}

function renderAdminHeader(active = '') {
  const user = Auth.getUser();
  const link = (href, label, key) => `<a href="${href}" style="${active === key ? 'color:var(--ink-text);font-weight:700' : ''}">${label}</a>`;
  const drawerLink = (href, label, key) => `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  return `
  <header class="site-header">
    <div class="container">
      <a href="/admin/admin-dashboard.html" class="brand"><img src="/assets/img/logo-icon.png" alt="Rentify" class="logo-mark">Rentify <span style="font-size:12px;background:var(--gold);color:var(--ink-deep);padding:3px 8px;border-radius:6px;margin-left:6px;font-family:var(--font-body);font-weight:700">ADMIN</span></a>
      <nav class="main-nav">
        ${link('/admin/admin-dashboard.html', 'Tableau de bord', 'dash')}
        ${link('/admin/admin-rooms.html', 'Logements', 'rooms')}
        ${link('/admin/admin-sellers.html', 'Vendeurs', 'sellers')}
        ${link('/admin/admin-bookings.html', 'Réservations', 'bookings')}
        ${link('/admin/admin-payments.html', 'Paiements', 'payments')}
        ${link('/admin/admin-inquiries.html', 'Demandes immo', 'inquiries')}
        ${link('/admin/admin-users.html', 'Clients', 'users')}
        ${link('/admin/admin-settings.html', 'Paramètres', 'settings')}
      </nav>
      <div class="header-actions" style="position:relative">
        <button class="icon-btn" id="theme-btn" aria-label="Thème">🌙</button>
        <button class="icon-btn" id="notif-bell" aria-label="Notifications">🔔<span class="badge-dot hidden" id="notif-badge">0</span></button>
        <div class="notif-panel hidden" id="notif-panel"><div class="np-head"><strong>Notifications</strong></div><div class="np-body"></div></div>
        <a href="/index.html" class="btn btn-ghost btn-sm"><span class="btn-label-full">Voir le site</span><span class="btn-label-short" style="display:none">🔗</span></a>
        <a href="${user ? '/admin/admin-settings.html' : '#'}" class="user-chip"><span class="avatar">${(user?.name || 'A').slice(0, 1).toUpperCase()}</span></a>
        <button class="btn btn-ghost btn-sm" id="logout-btn">Déconnexion</button>
        <button class="hamburger-btn" id="mobile-nav-btn" aria-label="Menu">☰</button>
      </div>
    </div>
    <div class="mobile-nav-drawer hidden" id="mobile-nav-drawer">
      <div class="drawer-panel">
        <button class="drawer-close" id="mobile-nav-close">✕</button>
        ${drawerLink('/admin/admin-dashboard.html', 'Tableau de bord', 'dash')}
        ${drawerLink('/admin/admin-rooms.html', 'Logements', 'rooms')}
        ${drawerLink('/admin/admin-sellers.html', 'Vendeurs', 'sellers')}
        ${drawerLink('/admin/admin-bookings.html', 'Réservations', 'bookings')}
        ${drawerLink('/admin/admin-payments.html', 'Paiements', 'payments')}
        ${drawerLink('/admin/admin-inquiries.html', 'Demandes immo', 'inquiries')}
        ${drawerLink('/admin/admin-users.html', 'Clients', 'users')}
        ${drawerLink('/admin/admin-settings.html', 'Paramètres', 'settings')}
        <hr>
        <a href="/index.html">Voir le site public</a>
        <button class="drawer-link" id="drawer-logout-btn">Déconnexion</button>
      </div>
    </div>
  </header>`;
}

function bindMobileNav() {
  document.addEventListener('click', (e) => {
    if (e.target && (e.target.id === 'mobile-nav-btn')) qs('mobile-nav-drawer')?.classList.remove('hidden');
    if (e.target && (e.target.id === 'mobile-nav-close')) qs('mobile-nav-drawer')?.classList.add('hidden');
    if (e.target && e.target.id === 'mobile-nav-drawer') qs('mobile-nav-drawer')?.classList.add('hidden');
    if (e.target && e.target.id === 'drawer-logout-btn') Auth.logout();
  });
}

// Abonne le navigateur aux notifications système (Web Push), si l'utilisateur est connecté
// et que le navigateur le permet. Échoue silencieusement si non supporté / refusé — le site
// continue de fonctionner avec les notifications en direct dans la page (cloche).
async function bootstrapPushNotifications() {
  try {
    if (!Auth.isLoggedIn()) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const { key } = await api('/notifications/push/key');
    if (!key) return; // VAPID non configuré côté serveur — rien à faire
    const reg = await navigator.serviceWorker.register('/sw.js');
    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // déjà abonné sur ce navigateur
    if (Notification.permission === 'denied') return;
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await api('/notifications/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
  } catch { /* silencieux — Web Push est un bonus, pas un blocage */ }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function mountAdminLayout(active = '') {
  if (!requireAdminOrRedirect()) return;
  const headerMount = document.getElementById('app-header');
  if (headerMount) headerMount.outerHTML = renderAdminHeader(active);
  bindMobileNav();
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'logout-btn') Auth.logout();
    if (e.target && e.target.id === 'theme-btn') toggleTheme();
  });
  if (typeof mountAdminPaymentIconsBar === 'function') mountAdminPaymentIconsBar();
  bootstrapPushNotifications();
}

function mountLayout(active = '') {
  const headerMount = document.getElementById('app-header');
  const footerMount = document.getElementById('app-footer');
  if (headerMount) headerMount.outerHTML = renderHeader(active);
  if (footerMount) footerMount.outerHTML = renderFooter();
  if (!document.getElementById('whatsapp-float')) document.body.insertAdjacentHTML('beforeend', renderWhatsappFloat());
  bindMobileNav();

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'logout-btn') Auth.logout();
    if (e.target && e.target.id === 'theme-btn') toggleTheme();
    if (e.target && e.target.id === 'budget-calc-btn') openBudgetCalculator();
  });

  if (typeof I18N !== 'undefined') I18N.apply();
  bootstrapPushNotifications();
}
