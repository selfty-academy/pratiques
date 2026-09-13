# Pratiques Selfty

Agenda des séances de pratique entre élèves de la Selfty Academy (coaching entre pairs, en visio) : une élève propose un créneau, une autre s'y inscrit, les deux reçoivent un mail de confirmation puis un rappel la veille vers 18h.

- **Page en ligne** : https://selfty-academy.github.io/pratiques/ (code de l'école `Selfty2026`, demandé une fois par téléphone).
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

- **Créneaux** : liste des créneaux à venir (par jour) ou vue **Semaine** (7 colonnes, touche un jour pour voir ses créneaux), filtres « Je veux coacher » / « Je veux être coachée ». Bouton « Je m'inscris » : un seul binôme par créneau, le créneau passe en « Complet » avec les deux prénoms. Si le rôle est « au choix », celle qui s'inscrit choisit le sien.
- **Mes pratiques** : mes créneaux proposés (annuler) et mes inscriptions (me désinscrire), lien visio, « Ajouter à mon agenda » (Google Agenda ou fichier .ics généré par la page).
- **Proposer** : date, heure, durée 30/45/60, rôle (je coache / je suis coachée / au choix), thème, lien visio, petit mot.
- Identité légère : prénom + e-mail mémorisés dans le téléphone (localStorage), pas de mot de passe. Les e-mails ne sont jamais renvoyés par le pont aux autres élèves ; le lien visio n'est visible que par les deux concernées.

## Mails (MailApp, depuis selfty.academy)

- À l'inscription : un mail aux deux (date, heure, durée, qui coache, thème, lien visio, lien de la page ; « répondre » écrit à l'autre).
- Désinscription : mail à celle qui a proposé. Annulation : mail à l'inscrite.
- La veille vers 18h (`rappelVeille`) : rappel aux deux pour chaque créneau complet du lendemain ; si un créneau du lendemain n'a pas de binôme, mail à celle qui l'a proposé.

## Endpoints du pont

`doGet ?key=…&what=setup|list|remind` ; `doPost {key, what, …}` : `list {email}`, `propose {prenom,email,date,heure,duree,role,theme,visio,note}`, `book {id,prenom,email,role?}`, `unbook {id,email}`, `cancel {id,email}`, `remind {}`, `mail_test {to}`.

Test en ligne de commande (jamais `-X POST` : la redirection 302 casse) :
```
curl -s -L -d '{"key":"<KEY>","what":"mail_test","to":"toi@exemple.fr"}' "https://script.google.com/macros/s/AKfycbzimUVCum9OFHShtALVl_Iz64lv9ahpX3FqSif9zHr0AEb2RctBTCoXw6FHYAWrbqzrwA/exec"
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
