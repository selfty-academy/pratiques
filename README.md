# Pratiques Selfty

Agenda des séances de pratique entre élèves de la Selfty Academy (coaching entre pairs, en visio) : une élève propose un créneau, une autre s'y inscrit, les deux reçoivent un mail de confirmation puis un rappel la veille vers 18h.

- **Où les élèves le voient** : onglet **Les pratiques** du menu SchoolMaker (voir `INTEGRATION.md`, ouverture le 19/10/2026, avant = équipe seulement). Page brute : https://selfty-academy.github.io/pratiques/ (code de l'école `Selfty2026`). **Secours VPS** (à jour pendant la suspension GitHub, utilisé par l'iframe SchoolMaker) : https://187-77-169-11.sslip.io/pratiques/ (rsync de `index.html` vers `alex@187.77.169.11:/var/www/secours/pratiques/`).
- **Un seul fichier** : `index.html` (mobile d'abord, DA Selfty, logo encre hébergé sur `selfty-academy.github.io/console/contrat/logo.png`).
- **Pont Apps Script** : dossier `pont/` (clasp, **compte selfty.academy, profil `--user selfty`**). Données dans le Google Sheet « Pratiques Selfty » (onglets `Creneaux` + `Inscriptions`) créé par le pont dans le Drive de selfty.academy. Aucune donnée personnelle dans ce repo.
- **Mode test local** : `index.html?local=1` (les créneaux restent dans le navigateur, aucun mail), `?local=1&demo=1` ajoute 4 créneaux fictifs d'autres élèves.

## Mise en route (une fois, à faire dans un navigateur connecté à selfty.academy@gmail.com)

Ouvrir cette URL, accepter l'autorisation (Sheets, Drive, mail, déclencheurs), puis la rouvrir si la première ouverture n'affiche que l'écran d'autorisation :

```
https://script.google.com/macros/s/AKfycbzimUVCum9OFHShtALVl_Iz64lv9ahpX3FqSif9zHr0AEb2RctBTCoXw6FHYAWrbqzrwA/exec?key=<KEY>&what=setup
```

`<KEY>` = contenu de `pont/pont-key.txt` (local, jamais commité ; la même clé est dans `index.html`, elle évite seulement les appels accidentels).

Réponse attendue : `{"ok":true,"sheet_url":"…","triggers":["rappelVeille"],…}`. Le Sheet est créé, le déclencheur quotidien (rappel de la veille vers 18h, heure de Paris) est installé.

Si l'URL n'affiche pas l'écran d'autorisation : `cd pont && clasp open-script --user selfty`, exécuter la fonction `autoriser()` dans l'éditeur, accepter, puis rouvrir l'URL de setup.

## Architecture depuis le 29/09/2026 soir : le VPS devant le pont

La page ne parle plus à Google directement mais à `https://187-77-169-11.sslip.io/pratiques/api` (service Node `vps/server.js`, unité systemd `selfty-agenda`) :

- **Lecture** : copie locale du Sheet, réponse en ~0,1 s (le pont relu toutes les 60 s via `what=list_full` + clé `VPS_SECRET`, propriété de script posée le 29/09).
- **Écriture** (proposer, s'inscrire, se désinscrire, annuler, profil) : validée et appliquée sur la copie en ~0,1 s, puis poussée vers le pont par une **file d'attente persistante** (`queue.json`, réessais, 8 tentatives max). Le pont écrit dans le Sheet et envoie les mails quelques secondes plus tard. Les ids de créneau sont choisis côté page/VPS et gardés par le pont (`propose` accepte `id`, `book`/`unbook` sont idempotents).
- Le pont Google reste la source de vérité (Sheet) et le seul à envoyer des mails ; si le VPS tombe, la page se rabat sur le pont pour la lecture.
- Agenda perso : `/pratiques/agenda.ics` (voir plus bas), **pratiques perso uniquement** depuis le 30/09. Rendez-vous de l'école (Selfty Calls, pratiques école) : lus sur le flux public par le VPS (`ecole` dans `list`, tous les futurs) et affichés par la page dans le calendrier du mois.

## Ce que fait la page

- **Version du 30/09/2026 (vocaux d'Anaïs)** : Créneaux = **calendrier du mois** par défaut (grille 7 colonnes, `renderMonth`, `monthOffset`, touche un jour pour le détail), avec les rendez-vous de l'école en pastilles roses (`.wchip.st-ecole`, Selfty Calls + pratiques école, lus sur l'agenda public Selfty) ; bouton Liste pour l'ancienne liste par jour. **Proposer** ne montre que les outils du **module en cours** (`moduleEnCours()` = dernier module ouvert dans `OUTILS`) + « Un autre outil » (champ libre `#f-autre`). Module 1 = Miroiter l'autre, Donner et recevoir du feedback, Vision (noms d'Anaïs ; « Prendre conscience de ses biais » retiré car outil solo). Mes pratiques = **perso seulement** (plus de « Prochains rendez-vous de l'école » : ils sont déjà dans l'agenda Selfty synchronisé via le mail de bienvenue) ; le flux .ics ne contient plus que les pratiques perso. Stats : les deux blocs équipe sont titrés « 🔒 Vue équipe, invisible pour les élèves » (envoyés par le pont seulement aux `ADMIN_EMAILS`).
- **Stockage bloqué en iframe (30/09/2026)** : si le navigateur refuse `localStorage` dans l'iframe SchoolMaker (cookies tiers bloqués), la page utilise une copie en mémoire (`LS` en tête du script) au lieu de planter : tout marche, l'identité est juste redemandée à chaque visite. À savoir : les captures d'écran de l'extension Chrome montrent les iframes cross-origin vides quand l'onglet n'est pas au premier plan (même example.com), ce n'est pas un bug de la page.
- **Gamification SchoolMaker (30/09/2026, 01h30)** : SchoolMaker ne donne des points que pour les actions dans la Communauté (post 2, réaction 1, réponse 1, solution 3 ; réglages dans Communauté › Gamification, classement et niveaux **pas encore activés**), pas de points manuels ni d'API pour en pousser (API v1 = lecture du classement seulement). Solution : après une pratique faite, Mes pratiques affiche une carte « 🎉 Pratique faite avec X » avec « 💬 Raconter dans la Communauté » (`COMMU_NEW` = nouveau post dans l'espace « prendre une partique », id `fadf4701…`, **dépublié : à renommer 🤝 Pratiques et publier** dans Communauté › Espaces), même bouton sur les pratiques passées (21 jours) et une carte « 🏅 Tes points dans la Communauté » dans Stats. « Passer » ou clic = mémorisé dans `sp_raconte`. En embed le lien ouvre dans SchoolMaker lui-même (`target=_top`).

- **Version du 29/09/2026 (retours d'Anaïs)** : plus de rôles (chaque pratique de 1h30 = 45 min coachée puis 45 min coach ; 45 min = une seule séance), durées **1h30 (défaut) ou 45 min**, plus de champ Thème, **lien visio obligatoire** à l'arrivée avec pas-à-pas Zoom / Meet, **outils affichés module par module** (dates d'ouverture dans `OUTILS`, l'équipe voit tout), vue **Semaine par défaut** (créneaux ouverts + binômes formés), **Stats = mes pratiques, mes heures, mon rang + classement de la promo** (les stats par outil ne sont visibles que par l'équipe), guide réécrit (visuel de bienvenue = le GIF du post d'Anaïs, allégé en `assets/bienvenue.gif` 1,3 Mo ; la version vidéo mp4/webm a été abandonnée le 29/09 : Chrome calait dessus, un GIF passe partout ; onglet concerné qui « pulse » en bas), inscription / proposition / annulation **instantanées** (affichage immédiat, le pont confirme derrière), copie locale affichée dès l'ouverture, 3 essais sur la lecture quand Google renvoie sa page d'erreur.

- **Guide intégré** (29/09/2026) : 5 écrans au premier passage (après la fiche identité), rejouable avec le bouton « ? » de l'en-tête (`GUIDE`, `showGuide`, mémorisé dans `sp_guide`).
- **Flux agenda servi par le VPS** (29/09/2026 soir) : le lien donné aux élèves est `https://187-77-169-11.sslip.io/pratiques/agenda.ics?email=…&t=…` (service Node `vps/server.js`, voir `vps/README.md`). Il lit le flux du pont (`what=ics`, jeton vérifié par le pont, 3 essais, dernière bonne copie gardée). Depuis le 30/09 il ne fusionne plus les rendez-vous de l'école (déjà dans l'agenda Selfty des élèves) ; ils restent lus sur le flux public de selfty-agenda. Plus besoin du scope UrlFetchApp côté pont. La page lit aussi ce flux public elle-même pour « Prochains rendez-vous de l'école » (`ecoleDirect()`).
- **Connecter mon agenda** (29/09/2026) : dans Mes pratiques, carte « Ton agenda ». Chaque élève a un flux .ics signé (`what=ics&email=…&t=<HMAC>`, secret `ICS_SECRET` en propriété de script, URL renvoyée par `list` dans `moi.ics_url`) : ses pratiques (proposées ou réservées, alarme 30 min si binôme trouvé) + tous les rendez-vous de l'école recopiés depuis `selfty-academy.github.io/agenda/calls-selfty.ics` (cache 6 h, scope `script.external_request`). Boutons Google Agenda (`calendar.google.com/calendar/r?cid=webcal://…`), Apple (`webcal://`), copier le lien. `list` renvoie aussi `ecole` (8 prochains rendez-vous) affichés sous Mes pratiques. Durées : 30, 45, 1h, **1h30 (défaut)**.

- **Stats** (23/09/2026) : combien de pratiques tu as faites, combien d'heures, combien dans la promo, **quels outils ont été le plus pratiqués** (barres), ce que toi tu as pratiqué, et la liste des outils que personne n'a encore osé (un clic dessus ouvre le formulaire prérempli). Une pratique est comptée quand le créneau est complet et que l'heure est passée. Calcul côté pont (`stats()` dans `Code.js`), jamais côté page.
- **Ton lien de visio, collé une fois** (23/09/2026) : dans la fiche identité (le bouton avec ton prénom, en haut), un champ « Ton lien de visio ». Il est enregistré dans l'onglet `Eleves` du Sheet (endpoint `profil_set`) et dans le téléphone, puis prérempli à chaque nouveau créneau. C'est la réponse simple à « qu'elles puissent connecter leur Zoom » : pas d'OAuth Zoom, pas d'app Marketplace, la salle personnelle Zoom ou un Meet permanent suffit.
- **L'outil pratiqué** (23/09/2026) : menu déroulant dans le formulaire, groupé par module, repris du PDF officiel « Programme Selfty Academy » (constante `OUTILS` dans `index.html`, **à faire valider par Anaïs**). Colonne `Outil` en fin de l'onglet `Creneaux`. Sert au filtre « Tous les outils » et aux statistiques.
- **Créneaux** : calendrier du **mois** (depuis le 30/09, rendez-vous de l'école inclus) ou liste des créneaux à venir (par jour), filtre par outil. Bouton « Je m'inscris » : un seul binôme par créneau, le créneau passe en « Complet » avec les deux prénoms.
- **Mes pratiques** : mes créneaux proposés (annuler) et mes inscriptions (me désinscrire), lien visio, « Ajouter à mon agenda » (Google Agenda ou fichier .ics généré par la page).
- **Proposer** : date, heure, durée 1h30 / 45 min, outil du module en cours (ou « Un autre outil »), lien visio (obligatoire, mémorisé), petit mot.
- Identité légère : prénom + e-mail mémorisés dans le téléphone (localStorage), pas de mot de passe. Les e-mails ne sont jamais renvoyés par le pont aux autres élèves ; le lien visio n'est visible que par les deux concernées.

## Mails (MailApp, depuis selfty.academy)

- À l'inscription : un mail aux deux (date, heure, durée, qui coache, thème, lien visio, lien de la page ; « répondre » écrit à l'autre).
- Désinscription : mail à celle qui a proposé. Annulation : mail à l'inscrite.
- La veille vers 18h (`rappelVeille`) : rappel aux deux pour chaque créneau complet du lendemain ; si un créneau du lendemain n'a pas de binôme, mail à celle qui l'a proposé.

## Endpoints du pont

`doGet ?key=…&what=setup|list|remind` ; `doPost {key, what, …}` : `list {email}` (renvoie aussi `moi.visio` et `stats`), `propose {prenom,email,date,heure,duree,role,outil,theme,visio,note}`, `book {id,prenom,email,role?}`, `unbook {id,email}`, `cancel {id,email}`, `profil_set {email,prenom,visio}`, `remind {}`, `mail_test {to}`.

Test en ligne de commande (jamais `-X POST` : la redirection 302 casse) :
```
curl -s -L -d '{"key":"<KEY>","akey":"<ADMIN_KEY>","what":"mail_test","to":"toi@exemple.fr"}' "https://script.google.com/macros/s/AKfycbzimUVCum9OFHShtALVl_Iz64lv9ahpX3FqSif9zHr0AEb2RctBTCoXw6FHYAWrbqzrwA/exec"
```
`<ADMIN_KEY>` = propriété de script `ADMIN_KEY` à poser une fois dans l'éditeur Apps Script (Paramètres du projet > Propriétés du script) : la clé `KEY` est publique (dans la page), elle ne suffit plus pour `mail_test`.
```
```

## Modifier le pont

```
cd pont
clasp push -f --user selfty
clasp redeploy AKfycbzimUVCum9OFHShtALVl_Iz64lv9ahpX3FqSif9zHr0AEb2RctBTCoXw6FHYAWrbqzrwA --user selfty -d "desc"
```
Jamais `clasp deploy` (nouvelle URL). Si les scopes changent : rouvrir l'URL de setup (ou `autoriser()` dans l'éditeur). Piège : `clasp create-script` écrase `appsscript.json` (le bloc `webapp` saute), le réécrire avant de pousser.

## Modifier la page

Éditer `index.html`, `git push` sur `main` : GitHub Pages se met à jour en 1 à 2 minutes.
