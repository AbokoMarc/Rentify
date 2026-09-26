// Liste de pays pour les sélecteurs du site (inscription, logements, filtres).
// Cameroun volontairement en tête (marché principal), puis reste de l'Afrique, puis reste du monde.
const COUNTRIES_AFRICA = [
  'Bénin', 'Burkina Faso', 'Congo', 'Côte d\'Ivoire', 'Gabon', 'Ghana', 'Guinée équatoriale',
  'Mali', 'Maroc', 'Nigeria', 'République centrafricaine', 'République démocratique du Congo',
  'Sénégal', 'Tchad', 'Togo', 'Tunisie',
];
const COUNTRIES_REST = [
  'Allemagne', 'Andorre', 'Argentine', 'Australie', 'Autriche', 'Belgique', 'Brésil',
  'Bulgarie', 'Cambodge', 'Canada', 'Chili', 'Chine', 'Chypre', 'Colombie', 'Corée du Sud',
  'Costa Rica', 'Croatie', 'Danemark', 'Égypte', 'Émirats arabes unis', 'Espagne', 'Estonie',
  'États-Unis', 'Finlande', 'France', 'Grèce', 'Hongrie', 'Inde', 'Indonésie', 'Irlande', 'Islande',
  'Israël', 'Italie', 'Japon', 'Jordanie', 'Lettonie', 'Liechtenstein', 'Lituanie',
  'Luxembourg', 'Malaisie', 'Malte', 'Mexique', 'Monaco', 'Monténégro', 'Norvège',
  'Nouvelle-Zélande', 'Pays-Bas', 'Pérou', 'Philippines', 'Pologne', 'Portugal',
  'République tchèque', 'Roumanie', 'Royaume-Uni', 'Russie', 'Singapour', 'Slovaquie',
  'Slovénie', 'Suède', 'Suisse', 'Tha\u00eflande', 'Turquie', 'Ukraine', 'Vietnam',
];

const COUNTRIES = ['Cameroun', ...COUNTRIES_AFRICA, ...COUNTRIES_REST];

function renderCountryOptions(selected = 'Cameroun') {
  return COUNTRIES.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
}

function populateCountrySelect(selectEl, selected = 'Cameroun') {
  if (!selectEl) return;
  selectEl.innerHTML = renderCountryOptions(selected);
}
