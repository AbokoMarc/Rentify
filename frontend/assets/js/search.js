mountLayout('search');

const DEFAULT_IMG = 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=600';

// Villes principales avec leurs coordonnées, pour centrer la carte correctement sur chacune
// (les villes restent bien séparées : la carte se recentre et ne montre que les logements de la ville choisie).
const CITIES = [
  { name: 'Yaoundé', lat: 3.8480, lon: 11.5021, zoom: 12 },
  { name: 'Douala', lat: 4.0511, lon: 9.7679, zoom: 12 },
  { name: 'Kribi', lat: 2.9500, lon: 9.9080, zoom: 13 },
  { name: 'Buea', lat: 4.1560, lon: 9.2420, zoom: 13 },
  { name: 'Limbe', lat: 4.0230, lon: 9.2130, zoom: 13 },
  { name: 'Bafoussam', lat: 5.4780, lon: 10.4180, zoom: 13 },
  { name: 'Bamenda', lat: 5.9631, lon: 10.1591, zoom: 13 },
];
const CAMEROON_CENTER = { lat: 5.6, lon: 12.7, zoom: 6 };

let currentView = 'list';
let leafletMap = null;
let mapMarkers = [];
let lastRooms = [];

function roomCardHtml(room) {
  const img = room.images[0] || DEFAULT_IMG;
  const stars = '★'.repeat(Math.round(room.rating)) || '';
  const distanceLabel = room._distanceKm != null ? `<div class="room-meta">📍 à ${room._distanceKm.toFixed(1)} km</div>` : '';
  return `
  <a href="/room.html?id=${room.id}" class="room-card">
    <div class="room-img-wrap">
      <img src="${img}" alt="${escapeHtml(room.title)}">
      <span class="room-type-tag">${room.type}</span>
      <button class="fav-btn" data-room="${room.id}" aria-label="Ajouter aux favoris" onclick="event.preventDefault(); toggleFav(${room.id}, this)">♥</button>
    </div>
    <div class="room-body">
      <h3>${escapeHtml(room.title)}</h3>
      <div class="room-meta">${escapeHtml(room.city)}, ${escapeHtml(room.country)} · ${room.capacity_adults} adultes · ${room.bedrooms} ch.</div>
      ${distanceLabel}
      ${room.reviews_count > 0 ? `<div class="room-rating"><span class="stars">${stars}</span> ${room.rating} (${room.reviews_count})</div>` : `<div class="room-meta">Nouveau logement</div>`}
      <div class="room-price"><span class="amount">${money(room.price_per_night, { compact: true })}</span><span class="per-night">/ nuit</span></div>
    </div>
  </a>`;
}

async function toggleFav(roomId, btn) {
  if (!Auth.isLoggedIn()) { window.location.href = '/login.html'; return; }
  const isActive = btn.classList.contains('active');
  try {
    if (isActive) { await api(`/favorites/${roomId}`, { method: 'DELETE' }); btn.classList.remove('active'); }
    else { await api('/favorites', { method: 'POST', body: { room_id: roomId } }); btn.classList.add('active'); }
  } catch (err) { showToast('Erreur', err.message, 'warn'); }
}

function currentParams() {
  return new URLSearchParams(window.location.search);
}

function renderCityPills() {
  const current = currentParams().get('city') || '';
  const pillsHtml = [`<button class="city-pill ${!current ? 'active' : ''}" data-city="">Toutes les villes</button>`]
    .concat(CITIES.map(c => `<button class="city-pill ${current === c.name ? 'active' : ''}" data-city="${c.name}">${c.name}</button>`))
    .join('');
  qs('city-pills').innerHTML = pillsHtml;
}

function fillFiltersFromUrl() {
  const p = currentParams();
  if (p.get('city')) qs('f-city').value = p.get('city');
  if (p.get('min_price')) qs('f-min').value = p.get('min_price');
  if (p.get('max_price')) qs('f-max').value = p.get('max_price');
  if (p.get('adults')) qs('f-adults').value = p.get('adults');
  const type = p.get('type') || '';
  document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.toggle('active', btn.dataset.type === type));
  renderCityPills();
}

function ensureMap() {
  if (leafletMap) return leafletMap;
  leafletMap = L.map('map-view');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap);
  return leafletMap;
}

function renderMap(rooms) {
  const map = ensureMap();
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  const cityName = currentParams().get('city');
  const cityInfo = CITIES.find(c => c.name === cityName);
  const withCoords = rooms.filter(r => r.latitude != null && r.longitude != null);

  withCoords.forEach(room => {
    const marker = L.marker([room.latitude, room.longitude]).addTo(map);
    marker.bindPopup(`
      <div class="map-popup-title">${escapeHtml(room.title)}</div>
      <div class="map-popup-price">${money(room.price_per_night, { compact: true })} / nuit</div>
      <a class="map-popup-link" href="/room.html?id=${room.id}">Voir le logement →</a>
    `);
    mapMarkers.push(marker);
  });

  if (cityInfo) {
    map.setView([cityInfo.lat, cityInfo.lon], cityInfo.zoom);
  } else if (withCoords.length) {
    map.fitBounds(L.latLngBounds(withCoords.map(r => [r.latitude, r.longitude])), { padding: [40, 40], maxZoom: 13 });
  } else {
    map.setView([CAMEROON_CENTER.lat, CAMEROON_CENTER.lon], CAMEROON_CENTER.zoom);
  }
  setTimeout(() => map.invalidateSize(), 50); // le conteneur peut être caché (display:none) au premier rendu
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('#view-toggle button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  qs('results-grid').classList.toggle('hidden', view !== 'list');
  qs('map-view').classList.toggle('hidden', view !== 'map');
  if (view === 'map') renderMap(lastRooms);
}

qs('view-toggle').addEventListener('click', (e) => {
  const view = e.target.closest('button')?.dataset.view;
  if (view) setView(view);
});

qs('city-pills').addEventListener('click', (e) => {
  const city = e.target.closest('.city-pill')?.dataset.city;
  if (city === undefined) return;
  const p = currentParams();
  city ? p.set('city', city) : p.delete('city');
  qs('f-city').value = city || '';
  window.history.replaceState(null, '', `/search.html?${p.toString()}`);
  renderCityPills();
  runSearch();
});

async function runSearch() {
  const grid = qs('results-grid');
  grid.innerHTML = '<div class="skeleton" style="height:320px"></div><div class="skeleton" style="height:320px"></div><div class="skeleton" style="height:320px"></div>';
  const p = currentParams();
  try {
    const { rooms } = await api(`/rooms?${p.toString()}`, { auth: false });
    lastRooms = rooms;
    const city = p.get('city');
    qs('search-title').textContent = city ? `Logements à ${city}` : 'Tous les logements';
    qs('search-subtitle').textContent = `${rooms.length} logement${rooms.length > 1 ? 's' : ''} trouvé${rooms.length > 1 ? 's' : ''}`;

    if (!rooms.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i>🔍</i>Aucun logement ne correspond à votre recherche.<br>Essayez d'élargir vos critères.</div>`;
    } else {
      grid.innerHTML = rooms.map(roomCardHtml).join('');
      if (Auth.isLoggedIn()) {
        const { rooms: favs } = await api('/favorites').catch(() => ({ rooms: [] }));
        const favIds = new Set(favs.map(r => r.id));
        document.querySelectorAll('.fav-btn').forEach(btn => {
          if (favIds.has(Number(btn.dataset.room))) btn.classList.add('active');
        });
      }
    }
    if (currentView === 'map') renderMap(rooms);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Impossible de charger les résultats : ${escapeHtml(err.message)}</div>`;
  }
}

document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const p = currentParams();
    if (btn.dataset.type) p.set('type', btn.dataset.type); else p.delete('type');
    window.history.replaceState(null, '', `/search.html?${p.toString()}`);
    runSearch();
  });
});

qs('apply-filters').addEventListener('click', () => {
  const p = currentParams();
  const city = qs('f-city').value.trim();
  const country = qs('f-country').value;
  const min = qs('f-min').value;
  const max = qs('f-max').value;
  const adults = qs('f-adults').value;
  city ? p.set('city', city) : p.delete('city');
  country ? p.set('country', country) : p.delete('country');
  min ? p.set('min_price', min) : p.delete('min_price');
  max ? p.set('max_price', max) : p.delete('max_price');
  adults ? p.set('adults', adults) : p.delete('adults');
  window.history.replaceState(null, '', `/search.html?${p.toString()}`);
  renderCityPills();
  runSearch();
});

async function loadCountries() {
  try {
    const { countries } = await api('/rooms/countries', { auth: false });
    const sel = qs('f-country');
    const current = currentParams().get('country') || '';
    sel.innerHTML = '<option value="">Tous les pays</option>' + countries.map(c => `<option value="${escapeHtml(c.country)}">${escapeHtml(c.country)} (${c.count})</option>`).join('');
    if (current) sel.value = current;
  } catch { /* silencieux */ }
}

qs('near-me-btn').addEventListener('click', async () => {
  const statusEl = qs('near-me-status');
  statusEl.textContent = 'Localisation en cours…';
  try {
    const pos = await getUserLocation();
    statusEl.textContent = `📍 Logements triés par proximité de votre position.`;
    const { rooms } = await api(`/rooms?${currentParams().toString()}`, { auth: false });
    const withDistance = rooms
      .filter(r => r.latitude != null && r.longitude != null)
      .map(r => ({ ...r, _distanceKm: haversineKm(pos.lat, pos.lon, r.latitude, r.longitude) }))
      .sort((a, b) => a._distanceKm - b._distanceKm);
    if (!withDistance.length) { statusEl.textContent = 'Aucun logement géolocalisé trouvé.'; return; }
    lastRooms = withDistance;
    qs('results-grid').innerHTML = withDistance.map(roomCardHtml).join('');
    if (currentView === 'map') {
      renderMap(withDistance);
      L.marker([pos.lat, pos.lon], { title: 'Vous êtes ici' }).addTo(leafletMap).bindPopup('📍 Votre position').openPopup();
      leafletMap.setView([pos.lat, pos.lon], 13);
    }
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

// Par défaut : Yaoundé en priorité si aucune ville n'est déjà choisie dans l'URL.
if (!currentParams().get('city') && !currentParams().toString()) {
  const p = currentParams();
  p.set('city', 'Yaoundé');
  window.history.replaceState(null, '', `/search.html?${p.toString()}`);
}

fillFiltersFromUrl();
loadCountries();
runSearch();
