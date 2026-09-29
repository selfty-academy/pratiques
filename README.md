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

## Ce que fait la page

- **Version du 29/09/2026 (retours d'Anaïs)** : plus de rôles (chaque pratique de 1h30 = 45 min coachée puis 45 min coach ; 45 min = une seule séance), durées **1h30 (défaut) ou 45 min**, plus de champ Thème, **lien visio obligatoire** à l'arrivée avec pas-à-pas Zoom / Meet, **outils affichés module par module** (dates d'ouverture dans `OUTILS`, l'équipe voit tout), vue **Semaine par défaut** (créneaux ouverts + binômes formés), **Stats = mes pratiques, mes heures, mon rang + classement de la promo** (les stats par outil ne sont visibles que par l'équipe), guide réécrit (vidéo de bienvenue = le GIF du post d'Anaïs, `assets/bienvenue.mp4`, onglet concerné qui « pulse » en bas), inscription / proposition / annulation **instantanées** (affichage immédiat, le pont confirme derrière), copie locale affichée dès l'ouverture, 3 essais sur la lecture quand Google renvoie sa page d'erreur.

- **Guide intégré** (29/09/2026) : 5 écrans au premier passage (après la fiche identité), rejouable avec le bouton « ? » de l'en-tête (`GUIDE`, `showGuide`, mémorisé dans `sp_guide`).
- **Flux agenda servi par le VPS** (29/09/2026 soir) : le lien donné aux élèves est `https://187-77-169-11.sslip.io/pratiques/agenda.ics?email=…&t=…` (service Node `vps/server.js`, voir `vps/README.md`). Il lit le flux du pont (`what=ics`, jeton vérifié par le pont, 3 essais, dernière bonne copie gardée) et y fusionne les 51 rendez-vous de l'école lus sur le flux public de selfty-agenda. Plus besoin du scope UrlFetchApp côté pont. La page lit aussi ce flux public elle-même pour « Prochains rendez-vous de l'école » (`ecoleDirect()`).
- **Connecter mon agenda** (29/09/2026) : dans Mes pratiques, carte « Ton agenda ». Chaque élève a un flux .ics signé (`what=ics&email=…&t=<HMAC>`, secret `ICS_SECRET` en propriété de script, URL renvoyée par `list` dans `moi.ics_url`) : ses pratiques (proposées ou réservées, alarme 30 min si binôme trouvé) + tous les rendez-vous de l'école recopiés depuis `selfty-academy.github.io/agenda/calls-selfty.ics` (cache 6 h, scope `script.external_request`). Boutons Google Agenda (`calendar.google.com/calendar/r?cid=webcal://…`), Apple (`webcal://`), copier le lien. `list` renvoie aussi `ecole` (8 prochains rendez-vous) affichés sous Mes pratiques. Durées : 30, 45, 1h, **1h30 (défaut)**.

- **Stats** (23/09/2026) : combien de pratiques tu as faites, combien d'heures, combien dans la promo, **quels outils ont été le plus pratiqués** (barres), ce que toi tu as pratiqué, et la liste des outils que personne n'a encore osé (un clic dessus ouvre le formulaire prérempli). Une pratique est comptée quand le créneau est complet et que l'heure est passée. Calcul côté pont (`stats()` dans `Code.js`), jamais côté page.
- **Ton lien de visio, collé une fois** (23/09/2026) : dans la fiche identité (le bouton avec ton prénom, en haut), un champ « Ton lien de visio ». Il est enregistré dans l'onglet `Eleves` du Sheet (endpoint `profil_set`) et dans le téléphone, puis prérempli à chaque nouveau créneau. C'est la réponse simple à « qu'elles puissent connecter leur Zoom » : pas d'OAuth Zoom, pas d'app Marketplace, la salle personnelle Zoom ou un Meet permanent suffit.
- **L'outil pratiqué** (23/09/2026) : menu déroulant dans le formulaire, groupé par module, repris du PDF officiel « Programme Selfty Academy » (constante `OUTILS` dans `index.html`, **à faire valider par Anaïs**). Colonne `Outil` en fin de l'onglet `Creneaux`. Sert au filtre « Tous les outils » et aux statistiques.
- **Créneaux** : liste des créneaux à venir (par jour) ou vue **Semaine** (7 colonnes, touche un jour pour voir ses créneaux), filtres « Je veux coacher » / « Je veux être coachée ». Bouton « Je m'inscris » : un seul binôme par créneau, le créneau passe en « Complet » avec les deux prénoms. Si le rôle est « au choix », celle qui s'inscrit choisit le sien.
- **Mes pratiques** : mes créneaux proposés (annuler) et mes inscriptions (me désinscrire), lien visio, « Ajouter à mon agenda » (Google Agenda ou fichier .ics généré par la page).
- **Proposer** : date, heure, durée 30/45/60, rôle (je coache / je suis coachée / au choix), thème, lien visio, petit mot.
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
