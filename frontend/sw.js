// Service worker Lokaya — uniquement pour les notifications Web Push (pas de cache offline).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = { title: 'Lokaya', body: 'Nouvelle notification.', data: {} };
  try { payload = event.data ? event.data.json() : payload; } catch { /* payload texte brut, on garde les valeurs par défaut */ }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Lokaya', {
      body: payload.body,
      icon: '/assets/img/favicon-192.png',
      badge: '/assets/img/favicon-96.png',
      data: payload.data || {},
      tag: payload.data?.booking_id ? `booking-${payload.data.booking_id}` : undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = '/dashboard.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(target));
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
  );
});
