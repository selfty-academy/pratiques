# Le tableau des pratiques DANS SchoolMaker

Demande d'Anaïs (29/09/2026) : pas une leçon ni un sous-onglet, un vrai onglet « Les pratiques » dans le menu du haut, à gauche de Programmes, qui affiche directement l'agenda des créneaux. Et l'onglet Consultations retiré.

## Comment c'est fait

SchoolMaker › Paramètres › Général › **Code personnalisé** › *body* (statut activé). Le code est dans `schoolmaker-code-body.html` (source de vérité, à recoller tel quel si on le modifie). Il :

1. ajoute l'onglet **Les pratiques** dans le menu du haut (desktop) et dans la barre du bas (mobile), avant Programmes ;
2. sur `/products?pratiques=1`, remplace le contenu de la page par le tableau en plein écran (iframe vers le secours VPS `https://187-77-169-11.sslip.io/pratiques/?embed=1&code=selfty2026`) ;
3. masque tous les liens Consultations (menu, barre mobile, menu du profil) ;
4. **avant le 19/10/2026, n'affiche l'onglet qu'aux comptes admin** (détection : le lien « Accéder à l'interface d'administration » est présent). Les élèves ne voient rien avant l'ouverture.

Le code se relance à chaque navigation Turbo (`turbo:load`, `turbo:render`), avec des gardes anti-doublon.

## Double sécurité côté page

Même si une élève tombe sur l'adresse du tableau avant l'ouverture, `index.html` affiche « Les pratiques ouvrent le lundi 19 octobre » tant que `TODAY() < OUVERTURE`, sauf pour les e-mails de l'équipe (`ADMIN_EMAILS`) ou avec `?preview=anais`.

## Changer la date d'ouverture

Deux endroits : `OUVERTURE` dans `schoolmaker-code-body.html` (puis recoller dans SchoolMaker) et `OUVERTURE` dans `index.html` (puis rsync sur le VPS).

## Historique

- 29/09 matin : leçon Embed « Réserver une pratique » dans une section « PRATIQUES ENTRE ÉLÈVES » (non publiée). **Supprimée le 29/09 soir** au profit de l'onglet du menu.
