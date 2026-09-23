# Mettre la réservation des pratiques DANS SchoolMaker

Demande d'Anaïs (21/09) : le tableau de réservation des pratiques doit vivre **dans** l'école, pas sur une page externe.

## Le code à coller

Dans SchoolMaker : Programmes > le programme > **Ajouter une leçon** (ou modifier une leçon existante) > type **Embed** > champ **Embed code** :

```html
<div style="max-width:760px;margin:0 auto">
  <iframe src="https://selfty-academy.github.io/pratiques/?embed=1&code=selfty2026"
          title="Pratiques entre élèves"
          style="width:100%;height:1100px;border:0;border-radius:14px;background:transparent"
          loading="lazy"></iframe>
</div>
```

Titre de leçon conseillé : **Réserver une pratique**. Description conseillée (au-dessus du tableau) :

> Propose un créneau pour t'entraîner avec une autre élève, ou inscris-toi sur le créneau de quelqu'un. Vous recevez toutes les deux un mail de confirmation, puis un rappel la veille.

## Ce que fait le mode embed (ajouté le 23/09/2026)

Deux paramètres dans l'adresse :

- `code=selfty2026` : le code de l'école est accepté automatiquement. L'élève est déjà connectée à SchoolMaker, on ne lui redemande rien.
- `embed=1` : rendu compact, sans logo ni titre en double (la leçon les affiche déjà), fond transparent pour prendre celui de l'école.

L'élève entre juste son prénom et son e-mail la première fois (mémorisés dans son téléphone), puis elle voit les créneaux.

Option gardée pour plus tard : `&prenom=…&email=…` préremplit l'identité. SchoolMaker ne fournit pas encore ces variables dans un embed ; le jour où c'est le cas, l'élève n'aura plus rien à taper.

## Si l'embed est refusé ou coupé

- Hauteur coupée en bas : monter `height:1100px` à `1400px`.
- Certains éditeurs retirent le `<div>` : coller l'`<iframe>` seule.
- Si l'iframe est bloquée, mettre dans la description de la leçon un bouton vers la page :

```html
<a href="https://selfty-academy.github.io/pratiques/?code=selfty2026" target="_blank" rel="noopener" style="display:inline-block;background:#3A2A2A;color:#FFFDFB;text-decoration:none;padding:12px 22px;border-radius:999px;font-family:'Playfair Display',Georgia,serif;font-size:16px">Réserver une pratique</a>
```

## Test

Ouvrir la leçon comme une élève : le tableau s'affiche sans demander de code, « Proposer » crée un créneau, « Je m'inscris » envoie les deux mails de confirmation. Pour tester sans rien envoyer : `?embed=1&code=selfty2026&local=1&demo=1`.
