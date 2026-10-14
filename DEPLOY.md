# Déploiement — Lokaya (Render + Vercel)

## 1. Avant de pousser
1. Dans Render > ton service > Environment, vérifie / ajoute :
   - JWT_SECRET : NOUVELLE valeur (openssl rand -hex 32). Déconnecte tout le monde une fois : c'est voulu.
   - ADMIN_EMAIL, ADMIN_PASSWORD : mot de passe long (16+ caractères), unique.
   - PUBLIC_SITE_URL : l'adresse publique du site (ex. https://ton-site.vercel.app), sans « / » final.
   - (optionnel) RESEND_API_KEY + EMAIL_FROM : emails de réinitialisation du mot de passe.
   - (optionnel) SMS_PROVIDER=twilio, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM : codes SMS.
   - (optionnel) CAMPAY_* : paiement Mobile Money. Teste en CAMPAY_MODE=demo avant « live ».
2. Ne mets PAS CORS_ORIGIN sauf si un AUTRE site doit appeler ton API.

## 2. Déployer
1. Pousse le projet (backend, frontend, vercel.json, render.yaml, Dockerfile) sur ton dépôt Git.
2. Render redéploie le backend ; Vercel redéploie le frontend. Attends les deux « Live ».
3. Les nouvelles tables (messages, vérifications, CNI, journal admin) se créent seules au démarrage.

## 3. Vérifications après déploiement
1. /admin/login.html : connexion admin avec ADMIN_EMAIL / ADMIN_PASSWORD.
2. Déconnecté, ouvre /admin/admin-dashboard.html : doit afficher « Page introuvable » (404).
3. Sur le site public, connexion avec le compte admin : doit être refusée (normal).
4. Crée un compte client, réserve, ouvre la fiche : carte, calendrier, « Contacter l'hôte ».
5. Mot de passe oublié : l'email arrive (si Resend configuré) et le lien fonctionne une seule fois.
6. Tableau de bord client : le code SMS arrive (si Twilio configuré).

## 4. Si l'admin est inaccessible
Vérifie que vercel.json contient la règle /admin/:path* vers ton URL Render, puis redéploie Vercel.
