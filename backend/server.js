import './env.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db } from './db.js';
import { handleAuth } from './routes/auth.js';
import { handleRooms } from './routes/rooms.js';
import { handleBookings } from './routes/bookings.js';
import { handlePayments } from './routes/payments.js';
import { handleReviews } from './routes/reviews.js';
import { handleFavorites } from './routes/favorites.js';
import { handleNotifications } from './routes/notifications.js';
import { handleAdminStats } from './routes/admin.js';
import { handleAdminUsers } from './routes/admin-users.js';
import { handleInquiries } from './routes/inquiries.js';
import { handleChat } from './routes/chat.js';
import { handleAdminAuth } from './routes/admin-auth.js';
import { verifyAdminToken } from './lib/auth.js';
import { setSecurityHeaders, parseCookies, ADMIN_COOKIE, clientIp, hit, tooMany } from './lib/security.js';
import { bootstrapAdmin } from './bootstrap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');

await bootstrapAdmin();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Pages admin : accessibles UNIQUEMENT avec une session admin valide (cookie HttpOnly vérifié côté serveur).
// Sans session : réponse 404 identique à une page inexistante (on ne révèle même pas que l'espace admin existe).
// Exception : la page de connexion admin elle-même.
const ADMIN_PUBLIC_PAGES = new Set(['/admin/login.html', '/admin/login']);

async function isAdminSession(req) {
  const token = parseCookies(req)[ADMIN_COOKIE];
  if (!token) return false;
  return !!(await verifyAdminToken(token));
}

async function serveStatic(req, res, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { res.writeHead(400); return res.end(); }
  if (decoded.includes('\0')) { res.writeHead(400); return res.end(); }

  let rel = decoded === '/' ? '/index.html' : decoded;

  // Fichiers cachés interdits (.env, .git...) — seul /.well-known/ (assetlinks.json) est autorisé.
  if (/(^|\/)\.(?!well-known(\/|$))/.test(rel)) { res.writeHead(404); return res.end('Fichier introuvable'); }

  const isAdminPath = rel === '/admin' || rel.startsWith('/admin/');
  if (isAdminPath) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    if (!ADMIN_PUBLIC_PAGES.has(rel) && !(await isAdminSession(req))) {
      res.writeHead(404); return res.end('Page introuvable');
    }
  }

  const filePath = path.resolve(FRONTEND_DIR, '.' + rel);
  const root = path.resolve(FRONTEND_DIR) + path.sep;
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end(); }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // fallback : pages sans extension -> tente .html, sinon 404
      if (!path.extname(filePath)) {
        return fs.readFile(filePath + '.html', (err2, data2) => {
          if (err2) { res.writeHead(404); return res.end('Page introuvable'); }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(data2);
        });
      }
      res.writeHead(404); return res.end('Fichier introuvable');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const urlPath = urlObj.pathname;

  setSecurityHeaders(res);

  // CORS : le front appelle l'API en même origine (via le proxy Vercel) — aucun accès cross-origin par défaut.
  // Pour autoriser un domaine précis, définir CORS_ORIGIN (ex : https://lokaya.cm). Jamais « * ».
  if (req.method === 'OPTIONS') {
    const allowed = process.env.CORS_ORIGIN;
    if (allowed && req.headers.origin === allowed) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin',
      });
    } else {
      res.writeHead(204);
    }
    return res.end();
  }

  if (!urlPath.startsWith('/api/')) {
    return serveStatic(req, res, urlPath);
  }

  // Limite globale anti-abus : 300 requêtes API / minute / IP.
  const rl = hit(`api:${clientIp(req)}`, 300, 60 * 1000);
  if (!rl.allowed) return tooMany(res, rl.retryAfterSec);

  if (urlPath === '/api/sitemap.xml' && req.method === 'GET') {
    const BASE = process.env.PUBLIC_SITE_URL || 'https://frontend-woad-gamma-91.vercel.app';
    const staticPages = ['/index.html', '/search.html', '/immobilier.html', '/vendeur.html', '/apropos.html', '/aide.html', '/annulation.html'];
    const rows = await db.prepare(`SELECT id, updated_at FROM rooms WHERE status = 'disponible' AND approval_status = 'approuve'`).all();
    const urls = [
      ...staticPages.map(p => `<url><loc>${BASE}${p}</loc><changefreq>daily</changefreq><priority>${p === '/index.html' ? '1.0' : '0.7'}</priority></url>`),
      ...rows.map(r => `<url><loc>${BASE}/room.html?id=${r.id}</loc><lastmod>${(r.updated_at || '').slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
    ];
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  }

  try {
    const handlers = [handleAdminAuth, handleAuth, handleRooms, handleBookings, handlePayments, handleReviews, handleFavorites, handleNotifications, handleAdminStats, handleAdminUsers, handleInquiries, handleChat];
    for (const handler of handlers) {
      const result = await handler(req, res, urlPath, urlObj);
      if (result !== null && result !== undefined) return; // déjà traité
      if (res.writableEnded || res.headersSent) return; // réponse déjà envoyée ou en cours (ex : flux SSE) — ne jamais tenter de ré-écrire des en-têtes
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route API introuvable.' }));
  } catch (err) {
    console.error('Erreur serveur:', err);
    if (!res.writableEnded && !res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Erreur interne du serveur.' }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`🏠 Lokaya backend démarré sur http://localhost:${PORT}`);
});

// Filet de sécurité : une erreur imprévue dans une requête ne doit jamais faire tomber le serveur entier pour tout le monde.
process.on('uncaughtException', (err) => {
  console.error('Exception non interceptée (serveur maintenu en vie) :', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Rejet de promesse non intercepté (serveur maintenu en vie) :', err);
});
