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

## Vérification d'identité
- Code SMS : 6 chiffres, haché, valable 5 min, 3 essais, 3 SMS/heure/compte. Un numéro modifié doit être re-vérifié.
- CNI : JPG/PNG/PDF (contenu vérifié, pas seulement l'extension), 2 Mo max, stockée en base — jamais dans un dossier public.
  Seule la session admin vérifiée peut la voir ; chaque consultation est journalisée ; l'image est supprimée après approbation.

## Messagerie
Seuls les deux participants d'une conversation peuvent la lire ou y écrire (vérifié serveur à chaque requête) ; 1000 caractères max, 20 messages/min.

## Sessions
Visiteurs : 30 jours renouvelés à l'usage (plafond 180 jours). Admin : 8 h strictes. Un refus de permission (403) ne déconnecte jamais.
