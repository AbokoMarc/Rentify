# Sécurité — Lokaya

## Accès administrateur (séparé du site public)
- Connexion : `/admin/login.html` — **aucun lien** vers cette page sur le site public. Elle appelle `POST /api/admin/login`.
- `POST /api/auth/login` (connexion publique) **refuse** les comptes admin.
- Les pages `/admin/*` ne sont servies qu'avec un cookie de session admin (HttpOnly, Secure, SameSite=Strict) vérifié par le serveur ; sinon réponse 404.
- Session admin : jeton à scope `admin`, valable 8 h. Le rôle est relu en base à chaque requête admin.
- Verrouillage : 5 échecs/15 min par email, 10/15 min par IP (admin) ; 8 et 30 pour la connexion publique.

## Règle d'or
Le navigateur n'est jamais une source de vérité : `Auth.isAdmin()` (localStorage) n'est qu'un indice d'affichage. Toute décision d'accès est prise par le serveur (`requireAdmin`).

## Variables d'environnement
`JWT_SECRET` (long, aléatoire), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (16+ caractères), `CORS_ORIGIN` (optionnel).
