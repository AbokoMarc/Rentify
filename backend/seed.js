import './env.js';
import { db } from './db.js';

const rooms = [
  {
    title: 'Chambre lumineuse à Bonapriso', type: 'chambre', city: 'Douala', country: 'Cameroun',
    address: 'Bonapriso, Douala', latitude: 4.0284, longitude: 9.7280,
    description: "Chambre chaleureuse dans une résidence sécurisée de Bonapriso, à deux pas des restaurants et supermarchés. Wifi fibre, literie confortable, salle de bain partagée impeccable, groupe électrogène en cas de délestage.",
    price_per_night: 12000, capacity_adults: 2, capacity_children: 1, bedrooms: 1, beds: 1, bathrooms: 1,
    amenities: ['Wifi', 'Climatisation', 'Groupe électrogène', 'Eau chaude', 'Petit-déjeuner'],
    images: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32?q=80&w=1200', 'https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=1200'],
    featured: 1,
  },
  {
    title: 'Appartement moderne à Bastos', type: 'appartement', city: 'Yaoundé', country: 'Cameroun',
    address: 'Bastos, Yaoundé', latitude: 3.8930, longitude: 11.5170,
    description: "Bel appartement 2 chambres entièrement meublé et équipé, au cœur du quartier diplomatique de Bastos. Idéal pour un séjour affaires ou en famille, résidence gardée 24h/24.",
    price_per_night: 28000, capacity_adults: 4, capacity_children: 2, bedrooms: 2, beds: 2, bathrooms: 2,
    amenities: ['Wifi', 'Cuisine équipée', 'Gardiennage', 'Groupe électrogène', 'Parking'],
    images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=1200', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?q=80&w=1200'],
    featured: 1,
  },
  {
    title: 'Maison familiale avec jardin à Kribi', type: 'maison', city: 'Kribi', country: 'Cameroun',
    address: 'Plage de Kribi', latitude: 2.9500, longitude: 9.9080,
    description: "Maison spacieuse avec jardin privé, 3 chambres, à quelques minutes à pied de la plage. Idéale pour un séjour en famille ou entre amis, quartier calme.",
    price_per_night: 40000, capacity_adults: 6, capacity_children: 3, bedrooms: 3, beds: 4, bathrooms: 2,
    amenities: ['Wifi', 'Jardin', 'Parking', 'Cuisine équipée', 'Groupe électrogène', 'Terrasse'],
    images: ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?q=80&w=1200', 'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?q=80&w=1200'],
    featured: 1,
  },
  {
    title: 'Studio cosy proche de l\'aéroport', type: 'appartement', city: 'Douala', country: 'Cameroun',
    address: 'Akwa, Douala', latitude: 4.0470, longitude: 9.6980,
    description: "Studio pratique et bien situé dans le quartier des affaires d'Akwa, à proximité du port et de l'aéroport. Parfait pour un séjour court en solo ou en couple.",
    price_per_night: 15000, capacity_adults: 2, capacity_children: 0, bedrooms: 1, beds: 1, bathrooms: 1,
    amenities: ['Wifi', 'Climatisation', 'Télévision', 'Eau chaude'],
    images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=1200'],
    featured: 0,
  },
  {
    title: 'Chambre privée avec vue sur le Mont Cameroun', type: 'chambre', city: 'Buea', country: 'Cameroun',
    address: 'Molyko, Buea', latitude: 4.1560, longitude: 9.2420,
    description: "Chambre paisible avec vue sur le Mont Cameroun, idéale pour les amoureux de nature et de randonnée. Climat frais toute l'année.",
    price_per_night: 10000, capacity_adults: 2, capacity_children: 1, bedrooms: 1, beds: 1, bathrooms: 1,
    amenities: ['Wifi', 'Vue montagne', 'Petit-déjeuner', 'Parking'],
    images: ['https://images.unsplash.com/photo-1590073242678-70ee3fc28f8e?q=80&w=1200'],
    featured: 0,
  },
  {
    title: 'Villa avec piscine à Limbe', type: 'maison', city: 'Limbe', country: 'Cameroun',
    address: 'Bord de mer, Limbe', latitude: 4.0230, longitude: 9.2130,
    description: "Villa de standing avec vue mer et piscine privée. Le lieu parfait pour un séjour balnéaire sur la côte atlantique camerounaise.",
    price_per_night: 95000, capacity_adults: 8, capacity_children: 4, bedrooms: 4, beds: 5, bathrooms: 3,
    amenities: ['Wifi', 'Piscine privée', 'Vue mer', 'Cuisine équipée', 'Climatisation', 'Parking', 'Groupe électrogène'],
    images: ['https://images.unsplash.com/photo-1613977257363-707ba9348227?q=80&w=1200', 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200'],
    featured: 1,
  },
  {
    title: 'Studio étudiant proche campus', type: 'appartement', city: 'Bafoussam', country: 'Cameroun',
    address: 'Banengo, Bafoussam', latitude: 5.4780, longitude: 10.4180,
    description: "Petit appartement fonctionnel idéal pour un séjour d'études ou professionnel, à 5 minutes à pied de l'université.",
    price_per_night: 9000, capacity_adults: 1, capacity_children: 0, bedrooms: 1, beds: 1, bathrooms: 1,
    amenities: ['Wifi', 'Bureau', 'Cuisine équipée'],
    images: ['https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=1200'],
    featured: 0,
  },
];

const existing = (await db.prepare('SELECT COUNT(*) c FROM rooms').get()).c;
if (existing > 0) {
  console.log(`ℹ️  ${existing} logement(s) déjà en base — seed ignoré (supprime data/lokaya.db pour reseed).`);
} else {
  const insert = db.prepare(`
    INSERT INTO rooms (title, type, description, city, country, address, latitude, longitude, price_per_night,
      capacity_adults, capacity_children, bedrooms, beds, bathrooms, amenities, images, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rooms) {
    await insert.run(r.title, r.type, r.description, r.city, r.country, r.address, r.latitude, r.longitude, r.price_per_night,
      r.capacity_adults, r.capacity_children, r.bedrooms, r.beds, r.bathrooms,
      JSON.stringify(r.amenities), JSON.stringify(r.images), r.featured);
  }
  console.log(`✅ ${rooms.length} logements de démo insérés.`);
}

const promoExisting = (await db.prepare('SELECT COUNT(*) c FROM promo_codes').get()).c;
if (promoExisting === 0) {
  await db.prepare('INSERT INTO promo_codes (code, percent_off, active) VALUES (?, ?, 1)').run('BIENVENUE10', 10);
  console.log('✅ Code promo BIENVENUE10 (-10%) créé.');
}
