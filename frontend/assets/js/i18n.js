const TRANSLATIONS = {
  fr: {
    // Navigation
    nav_home: 'Accueil', nav_explore: 'Explorer', nav_bookings: 'Mes réservations', nav_favorites: 'Favoris',
    nav_immobilier: 'Acheter / Louer un bien', nav_become_seller: 'Devenir vendeur', nav_seller_space: 'Espace vendeur',
    login: 'Se connecter', signup: "S'inscrire", logout: 'Déconnexion', my_profile: 'Mon profil', admin_space: 'Espace admin',
    // Page d'accueil
    hero_title: 'Trouvez votre prochain chez-vous', hero_lead: "Chambres, appartements, maisons et terrains partout au Cameroun. Réservez et payez en toute confiance, en Mobile Money.",
    search_destination: 'Destination', search_where: 'Où allez-vous ?', search_checkin: 'Arrivée', search_checkout: 'Départ', search_btn: 'Rechercher', filter_btn: 'Filtrer',
    search_where_label: 'Où cherchez-vous ?', search_budget_label: 'Votre budget mensuel', search_type_label: 'Type de logement', search_submit_full: 'Trouver mon logement',
    trust_verified: '🛡️ Annonces vérifiées', trust_payment: '💳 Paiement Mobile Money', trust_local: '🇨🇲 100% pensé pour le Cameroun',
    explore_map_link: 'Explorer la carte →', advanced_filters_link: 'Filtres avancés',
    per_month: '/ mois',
    categories_title: 'Trouvez tous les logements qu\'il vous faut', cat_houses: 'Maisons', cat_apartments: 'Appartements', cat_rooms: 'Chambres privées',
    cities_title: 'Les villes les plus recherchées', featured_title: 'Logements en vedette', see_all: 'Tout voir',
    per_night: '/ nuit', reserve: 'Réserver', all_types: 'Tous types',
    cookie_msg: "Nous utilisons des cookies pour améliorer votre expérience et mesurer l'audience du site.",
    cookie_accept: 'Accepter', cookie_decline: 'Refuser',
    budget_calc: 'Calculateur budget', nearby: ICONS.pin + ' Près de moi',
    eyebrow_categories: 'Nos catégories', eyebrow_popular: 'Populaire', eyebrow_featured: 'Sélection',
    // Footer
    footer_tagline: "Réservez chambres, appartements et maisons partout au Cameroun. Paiement en Mobile Money. Achat et location de biens accompagnés par nos conseillers.",
    footer_explore_title: 'Lokaya', footer_link_explore: 'Explorer les logements', footer_link_cities: 'Nos villes', footer_link_about: 'À propos',
    footer_support_title: 'Assistance', footer_link_help: "Centre d'aide", footer_link_cancel: 'Annulation', footer_link_contact: 'Contact WhatsApp',
    footer_host_title: 'Devenir vendeur', footer_link_publish: 'Publier une annonce', footer_link_host_resources: 'Ressources vendeurs',
    footer_rights: 'Réservation de logements en toute confiance, au Cameroun',
    // Boutons communs / statuts
    save: 'Enregistrer', cancel: 'Annuler', close: 'Fermer', edit: 'Modifier', delete: 'Supprimer', send: 'Envoyer', confirm: 'Confirmer',
    loading: 'Chargement…', see_more: 'Voir plus', back: 'Retour', continue: 'Continuer', submit: 'Soumettre',
    contact_whatsapp: "Discuter avec l'admin sur WhatsApp",
    // Paiement
    pay_mobile_money: 'Payer en Mobile Money', pay_crypto: 'Payer en crypto (avancé)', payment_phone_label: 'Numéro Mobile Money (MTN ou Orange)', ph_city: 'Ville', ph_price_min: 'Prix min (FCFA)', ph_price_max: 'Prix max (FCFA)',
    payment_pending: 'Vérifie ton téléphone et valide avec ton code secret Mobile Money…', payment_success: 'Paiement confirmé, séjour validé !', payment_failed: 'Le paiement a échoué.',
    // Vendeur
    seller_pending_title: 'Compte vendeur en attente', seller_pending_msg: "Ton compte vendeur est en cours de validation par l'admin. Tu pourras publier des annonces dès qu'il l'aura validé.",
    seller_add_listing: 'Proposer une annonce', seller_my_listings: 'Mes annonces', status_pending: 'En attente de validation', status_approved: 'Publiée', status_rejected: 'Refusée',
  },
  en: {
    nav_home: 'Home', nav_explore: 'Explore', nav_bookings: 'My bookings', nav_favorites: 'Favorites',
    nav_immobilier: 'Buy / Rent a property', nav_become_seller: 'Become a seller', nav_seller_space: 'Seller space',
    login: 'Log in', signup: 'Sign up', logout: 'Log out', my_profile: 'My profile', admin_space: 'Admin space',
    hero_title: 'Find your next home', hero_lead: 'Rooms, apartments, houses and land all over Cameroon. Book and pay with confidence, with Mobile Money.',
    search_destination: 'Destination', search_where: 'Where are you going?', search_checkin: 'Check-in', search_checkout: 'Check-out', search_btn: 'Search', filter_btn: 'Filter',
    search_where_label: 'Where are you looking?', search_budget_label: 'Your monthly budget', search_type_label: 'Property type', search_submit_full: 'Find my home',
    trust_verified: '🛡️ Verified listings', trust_payment: '💳 Mobile Money payment', trust_local: '🇨🇲 100% built for Cameroon',
    explore_map_link: 'Explore the map →', advanced_filters_link: 'Advanced filters',
    per_month: '/ month',
    categories_title: 'Find all the stays you need', cat_houses: 'Houses', cat_apartments: 'Apartments', cat_rooms: 'Private rooms',
    cities_title: 'Most popular cities', featured_title: 'Featured stays', see_all: 'See all',
    per_night: '/ night', reserve: 'Book now', all_types: 'All types',
    cookie_msg: 'We use cookies to improve your experience and measure site traffic.',
    cookie_accept: 'Accept', cookie_decline: 'Decline',
    budget_calc: 'Budget calculator', nearby: ICONS.pin + ' Near me',
    eyebrow_categories: 'Categories', eyebrow_popular: 'Popular', eyebrow_featured: 'Selection',
    footer_tagline: 'Book rooms, apartments and houses all over Cameroon. Pay with Mobile Money. Buying and renting properties, guided by our advisors.',
    footer_explore_title: 'Lokaya', footer_link_explore: 'Explore stays', footer_link_cities: 'Our cities', footer_link_about: 'About',
    footer_support_title: 'Support', footer_link_help: 'Help center', footer_link_cancel: 'Cancellation', footer_link_contact: 'WhatsApp contact',
    footer_host_title: 'Become a seller', footer_link_publish: 'List a property', footer_link_host_resources: 'Seller resources',
    footer_rights: 'Booking homes with confidence, in Cameroon',
    save: 'Save', cancel: 'Cancel', close: 'Close', edit: 'Edit', delete: 'Delete', send: 'Send', confirm: 'Confirm',
    loading: 'Loading…', see_more: 'See more', back: 'Back', continue: 'Continue', submit: 'Submit',
    contact_whatsapp: 'Chat with the admin on WhatsApp',
    pay_mobile_money: 'Pay with Mobile Money', pay_crypto: 'Pay with crypto (advanced)', payment_phone_label: 'Mobile Money number (MTN or Orange)', ph_city: 'City', ph_price_min: 'Min price (FCFA)', ph_price_max: 'Max price (FCFA)',
    payment_pending: 'Check your phone and confirm with your Mobile Money PIN…', payment_success: 'Payment confirmed, stay booked!', payment_failed: 'The payment failed.',
    seller_pending_title: 'Seller account pending', seller_pending_msg: 'Your seller account is being reviewed by the admin. You will be able to list properties once approved.',
    seller_add_listing: 'List a property', seller_my_listings: 'My listings', status_pending: 'Pending review', status_approved: 'Published', status_rejected: 'Rejected',
  },
};

const I18N = {
  current() {
    const stored = localStorage.getItem('lokaya_lang') || localStorage.getItem('rentify_lang') || localStorage.getItem('roomia_lang');
    return stored === 'zh' ? 'fr' : (stored || 'fr'); // ancien réglage chinois -> repli propre sur le français
  },
  set(lang) { localStorage.setItem('lokaya_lang', lang); location.reload(); },
  t(key) { return (TRANSLATIONS[this.current()] && TRANSLATIONS[this.current()][key]) || TRANSLATIONS.fr[key] || key; },
  apply(root = document) {
    document.documentElement.lang = this.current();
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = this.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = this.t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = this.t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = this.t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', this.t(el.dataset.i18nAria)); });
  },
};

function renderLangSwitcher() {
  const langs = { fr: 'FR', en: 'EN' };
  const current = I18N.current();
  return `
  <div style="position:relative" id="lang-switcher">
    <button class="icon-btn" id="lang-btn" style="width:auto;padding:0 12px;gap:6px;border-radius:10px;font-size:13px;font-weight:700">${ICONS.globe}${langs[current]}</button>
    <div class="notif-panel hidden" id="lang-panel" style="width:140px;padding:6px">
      ${Object.entries(langs).map(([code, label]) => `<button class="tab-btn" style="width:100%;text-align:left;padding:10px 12px;display:flex;align-items:center;gap:8px;${code === current ? 'background:var(--sand-deep)' : ''}" data-lang="${code}">${ICONS.globe}${label}</button>`).join('')}
    </div>
  </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  I18N.apply();
  document.addEventListener('click', (e) => {
    if (e.target.id === 'lang-btn') { e.stopPropagation(); qs('lang-panel')?.classList.toggle('hidden'); }
    else if (e.target.dataset && e.target.dataset.lang) { I18N.set(e.target.dataset.lang); }
    else { qs('lang-panel')?.classList.add('hidden'); }
  });
});
