# Règles de Pierre Feuille Ciseaux

Les mêmes règles sont sur la page [`regles.html`](regles.html) du site, avec des schémas.

| Mode | Qui marque le point ? | Avec qui ? |
|---|---|---|
| 🎯 Normal | Celui dont l'arme bat l'autre | Ordi, à deux, tournoi |
| 🙃 Inversé | Celui dont l'arme **perd** le combat | Ordi, à deux, tournoi |
| 🪞 Miroir | Le chasseur, s'il joue le même coup que le fugitif | Ordi, à deux, tournoi |
| 🙈 Aveugle | Comme en normal, mais l'ordi annonce son coup, et il peut mentir | Ordi, tournoi (contre les bots) |
| ⚡ Éclair | Comme en normal, avec 2 secondes pour choisir | Ordi, à deux, tournoi |

## 🎯 Normal

1. Les deux joueurs choisissent en même temps, sans voir le choix de l'autre.
2. La pierre casse les ciseaux, les ciseaux coupent la feuille, la feuille enveloppe la pierre.
3. Si vous jouez la même chose, la manche est nulle et ne rapporte aucun point.

## 🙃 Inversé

Les armes s'affrontent normalement, mais c'est le **perdant du combat qui marque le point**.

## 🪞 Miroir

1. À chaque manche, un joueur est le **chasseur** et l'autre le **fugitif**.
2. Si vous jouez la même arme, le chasseur marque un point.
3. Si vos armes sont différentes, le fugitif s'échappe et personne ne marque.
4. Les rôles s'échangent à chaque manche.

## 🙈 Aveugle

1. Au début de chaque manche, l'ordi annonce le coup qu'il va jouer.
2. Il dit la vérité ou il ment, selon les probabilités que tu as choisies (`25`, `25%`, `1/4` ou `1:3`).
3. Tu joues, puis les règles normales s'appliquent à son vrai coup.

À partir du niveau 6, ses mensonges sont des pièges : il annonce le coup qui te pousse à jouer ce qu'il sait battre. La probabilité réglée reste respectée.

## ⚡ Éclair

1. Le chrono de 2 secondes démarre quand tu cliques sur *Manche suivante* ou que tu appuies sur `Espace`.
2. Si tu n'as pas joué à temps, tu perds la manche.
3. À deux, chacun a ses 2 secondes. Si aucun des deux ne joue à temps, la manche est nulle.

## 🔥 Le feu, l'eau et tes armes

Le feu et l'eau s'activent dans la carte *Les armes*.

| Arme | Elle bat | Elle perd contre | Rien contre |
|---|---|---|---|
| 🪨 Pierre | Ciseaux, eau | Feuille | Feu |
| 📄 Feuille | Pierre, eau | Ciseaux, feu | — |
| ✂️ Ciseaux | Feuille | Pierre, eau | Feu |
| 🔥 Feu | Feuille | Eau | Ciseaux, pierre |
| 💧 Eau | Feu, ciseaux | Feuille, pierre | — |

Pour créer une arme : donne-lui un nom, importe une image, puis indique pour chaque autre arme si la tienne gagne, perd, ou si rien ne se passe. Le tableau *Qui bat qui ?* permet de tout changer d'un clic, sauf pierre, feuille et ciseaux entre eux.

## 🏆 Tournoi

1. De 2 à 16 joueurs, humains ou bots, chacun avec son niveau.
2. Élimination directe : un match perdu, et tu es éliminé.
3. S'il n'y a pas 4, 8 ou 16 joueurs, certains passent directement au tour suivant.
4. Les matchs entre bots se jouent tout seuls, sauf si tu demandes à les regarder.

## Pour tous les modes

- **Meilleur des 3, 5 ou 10 :** il faut 2, 3 ou 6 points pour gagner. Les manches nulles ne comptent pas. À 5-5, le point suivant décide.
- **Premier à X :** tu choisis le nombre de points, de 1 à 999.
- **À deux :** chacun son tour, pendant que l'autre regarde ailleurs. Un rideau cache l'écran entre les deux, et les coups sont révélés en même temps.

### Clavier

| Touche | Action |
|---|---|
| `1` `2` `3` | Pierre, feuille, ciseaux (les touches se changent dans les réglages) |
| `R` | Recommencer la partie |
| `Espace` | Appuyer sur le bouton jaune quand il attend. Pendant un combat, ça accélère |

### Les 20 niveaux de l'ordi

L'ordi décide **avant** que tu joues, et ne voit jamais ton coup. Il apprend seulement de tes manches passées.

| Niveau | Nom | Ce qu'il fait |
|---|---|---|
| 1 | Bébé | Joue complètement au hasard |
| 2 | Dé pipé | Joue au hasard, avec un coup préféré |
| 3 | Distrait | Joue au hasard, sans répéter 3 fois le même coup |
| 4 | Copieur | Copie souvent ton dernier coup |
| 5 | Réactif | Suppose que tu rejoues ton dernier coup |
| 6 | Psychologue | Connaît les réflexes humains |
| 7 | Comptable | Compte tes coups depuis le début |
| 8 | Observateur | Regarde tes 8 derniers coups |
| 9 | Détective | Apprend quel coup suit quel coup |
| 10 | Stratège | Choisit à chaque manche sa meilleure stratégie parmi 5 |
| 11 | Analyste | Étudie tes enchaînements de deux coups |
| 12 | Tacticien | Regarde comment tu réagis au résultat et à ses coups |
| 13 | Chasseur de suites | Retrouve les suites que tu as déjà jouées |
| 14 | Profileur | Choisit parmi 10 stratégies |
| 15 | Manipulateur | Pense aussi que tu essaies de le contrer |
| 16 | Mentaliste | Mélange toutes ses stratégies selon leurs résultats |
| 17 | Bluffeur | Se demande si tu as deviné ce qu'il pense |
| 18 | Oracle | Pense à ce que tu penses qu'il pense |
| 19 | Forteresse | Se réfugie dans le hasard quand tu le lis trop bien |
| 20 | Turbonix | Tout ça à la fois, sans aucune erreur volontaire |
