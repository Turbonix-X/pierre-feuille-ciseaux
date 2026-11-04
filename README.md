# Pierre Feuille Ciseaux

**A NOTER:** Ce site est fait à 100% par Intelligence Artifficielle (ou Super Intelligence pour les intimes).

Pierre, feuille, ciseaux en 3D : deux mains animées, des armes qui se battent vraiment, un bot à 20 niveaux et un tournoi jusqu'à 16 joueurs.

**Jouer en ligne : https://turbonix-x.github.io/pierre-feuille-ciseaux/**

Ça marche sur ordi, tablette et téléphone, et il n'y a rien à installer.

## Les modes

- 🎯 **Normal** : le jeu classique.
- 🙃 **Inversé** : c'est le perdant du combat qui marque le point.
- 🪞 **Miroir** : le chasseur marque s'il joue le même coup que le fugitif.
- 🙈 **Aveugle** : l'ordi annonce son coup à l'avance, et tu règles ses chances de mentir.
- ⚡ **Éclair** : 2 secondes pour choisir, sinon tu perds la manche.

**Toutes les règles, mode par mode : [REGLES.md](REGLES.md)**, et aussi sur la page `regles.html` du site.

## Ce qu'on peut faire

### Jouer

- **Contre l'ordi**, du niveau 1 (il joue au hasard) au niveau 20. Dès le niveau 10, il change de stratégie selon ce qui marche contre toi.
- **À deux** sur le même écran : chacun choisit en secret, un rideau cache l'écran, et on révèle en même temps.
- **En tournoi**, de 2 à 16 joueurs humains ou bots, avec un tableau animé.
- **Meilleur des 3, 5 ou 10**, ou **premier à X points**.
- Au clavier : `1`, `2`, `3` (touches à ton choix), `R` pour recommencer, `Espace` pour le bouton jaune.

### Les animations

- La main fait le geste, ou **sort le vrai objet** : la feuille se déroule, les ciseaux claquent.
- Les armes se battent : les ciseaux coupent la feuille, la pierre écrase les ciseaux, la feuille enveloppe la pierre, le feu brûle la feuille, l'eau éteint le feu et fait rouiller les ciseaux.
- Tu choisis la vitesse, de ×0,5 à instantané. Un clic sur la scène accélère le combat en cours.

### Personnaliser

Pour chaque joueur :

- la **couleur de peau** de la main ;
- la **pierre** : 7 nuances de noir et de gris, 6 motifs ;
- les **ciseaux** : la couleur des poignées, et rouillés ou non ;
- la **feuille** : ton texte et tes dessins, avec un petit pad.

### Les armes

- Ajoute le **feu** et l'**eau**.
- **Crée tes armes** : un nom, une image importée, et contre qui elles gagnent ou perdent.

### Le cerveau de l'ordi

Après chaque manche, tu vois ce que l'ordi pensait que tu allais jouer, ses probabilités et son raisonnement. Il décide avant que tu joues et ne voit jamais ton coup. L'historique garde tout, manche par manche.

### Le reste

- Mode clair et mode sombre.
- Sons et vibrations (sur téléphone), qu'on peut couper en haut de la page.
- Tout est sauvegardé automatiquement dans le navigateur.
- Le bouton 🔗 crée un lien avec tes réglages et permet de tout garder dans un fichier.

## Utiliser le site chez soi

Télécharger le dossier et ouvrir `index.html` dans un navigateur. Il faut une connexion à internet pour charger la 3D (Three.js) et la police. Sans 3D, le jeu reste jouable avec des emojis.

## Comment c'est fait

Du HTML, du CSS et du JavaScript, sans framework et sans image.

- La 3D utilise Three.js r128 : les mains sont articulées doigt par doigt, et toutes les textures sont dessinées en direct.
- Le bot garde plusieurs stratégies, les note sur tes dernières manches et suit celles qui ont raison.
- Les sons sont générés avec la Web Audio API, sans fichier audio.

| Fichier | Contenu |
|---|---|
| `index.html` | La page du jeu |
| `regles.html` | La page des règles |
| `REGLES.md` | Les règles, pour GitHub |
| `style.css` | Le style du site |
| `js/game.js` | Les règles : armes, modes, score |
| `js/ai.js` | Le bot et ses 20 niveaux |
| `js/textures.js` | Les textures : pierre, rouille, feuille, tapis |
| `js/stage3d.js` | La scène 3D : mains, armes, combats |
| `js/tournament.js` | Le tableau du tournoi |
| `js/app.js` | Les réglages, le déroulement, la personnalisation, la sauvegarde, le partage |
| `js/regles.js` | Les schémas de la page des règles |
| `js/sound.js` | Les sons et les vibrations |
| `logo.svg` | Le logo Turbonix |
| `turbonix.css` | Le style commun des sites Turbonix |
| `STYLE-TURBONIX.md` | Le guide de style Turbonix |

---

Turbonix Entertainment
