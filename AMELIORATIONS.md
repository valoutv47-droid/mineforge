# Améliorations de la version `claude/`

Tout est dans le dossier `claude/`. Lancer :

```bash
cd claude
npm install
npm run dev      # puis ouvrir l'adresse affichée
```

Option de débogage : ajouter `?lite` à l'URL (ex. `http://localhost:5173/?lite`) désactive ombres et post-traitement pour les GPU faibles.

## Corrections de bugs
- **Requins/poissons qui volent** : les mobs aquatiques n'avaient aucune collision avec l'eau. Ils restent maintenant dans l'eau, ne poursuivent le joueur que s'il est dans l'eau, coulent à leur mort, et le recul ne les expulse plus.
- **Lave invisible** : la lave n'était jamais dessinée (on la traversait sans la voir). Elle est visible, lumineuse et dangereuse.
- **Constructions perdues** : les chunks modifiés sont gardés en mémoire quand on s'éloigne.
- **Saignement de textures** entre blocs (lignes pointillées sombres) corrigé.
- **Occlusion ambiante** (AO) mal calculée sur les angles : corrigée.
- **Commande `/time`** : « noon » donnait le coucher de soleil.
- **Armes** : tous les coups faisaient 1 dégât ; l'objet tenu compte maintenant.
- **Icônes d'objets** : presque aucun objet (lingots, nourriture, armures...) n'avait d'icône. Tous ont maintenant une icône pixel-art (inventaire, barre rapide, main, objets au sol).
- **Spawn** : plus de départ en haut d'un arbre ou dans l'eau.

## Monde et biomes
- Climat continu avec frontières irrégulières ; la hauteur du terrain et la couleur de l'herbe/feuilles se fondent d'un biome à l'autre.
- Nouveaux biomes : **plaines enneigées** (glace, neige), **badlands** (strates de terracotta, mesas), **forêt de bouleaux**. Désert avec dunes, taïga avec podzol, montagnes avec gravier et neige.
- Plages de gravier dans les biomes froids, fonds marins variés (sable, gravier, argile), eau gelée.
- ~25 nouveaux blocs et plus de 90 textures de blocs redessinées.

## Lumière
- Moteur de lumière voxel (ciel + blocs), éclairage doux par sommet : grottes réellement sombres, torches, lave, glowstone, feu et portails qui éclairent.

## Caméra et mouvement
- Balancement de la vue en marchant, élargissement du champ de vision en sprint, secousse quand on est touché, amorti à l'atterrissage.
- **F5** (ou `/camera`) : vue 3e personne arrière / avant, avec collision de la caméra et modèle du joueur.

## Nether
- Portail en obsidienne (jusqu'à 21×21) allumé au **briquet** (lingot de fer + silex ; le silex vient du gravier). Liaison 1:8 avec l'Overworld.
- Portails en ruine dans l'Overworld avec un coffre contenant un briquet (menu pause → téléportation → *Nether Portal*).
- Dimension : plafond/sol de bedrock, océan de lave, netherrack, soul sand, magma, glowstone, minerai de quartz, forteresses de briques avec coffre.
- Mobs : piglin zombifié, ghast (boules de feu), blaze (rafales, dans les forteresses).

## L'End
- Sanctuaire sous terre avec cadres de portail (menu pause → *End Portal*) et un coffre d'**yeux d'Ender** ; poser les 12 yeux ouvre le portail.
- Île d'End Stone, **10 piliers d'obsidienne** (certains en cage de verre) avec cristaux, fontaine centrale, petites îles flottantes, endermen.
- **Ender Dragon** (200 PV) avec barre de boss : vol en cercle, piqués, boules de feu, atterrissage avec souffle. Chaque cristal restant le soigne ; un cristal détruit explose et blesse le dragon.
- À sa mort : XP, portail de sortie et œuf de dragon.

## Commandes
`/dimension overworld|nether|end`, `/summon <mob>` (ender_dragon, ghast, blaze, zombie_piglin, enderman, shark...), `/camera`, `/heal`, `/time set day|noon|sunset|night|midnight`, `/spawn` (ramène à l'Overworld). Le menu pause permet aussi de se téléporter aux structures.

## Limites connues
Le code a été vérifié par compilation TypeScript, par des tests de logique dans un navigateur sans écran (génération, portails, voyage entre dimensions, combat du dragon, requins) et par des rendus des 3 dimensions. Il n'a pas pu être testé en jeu complet avec une vraie carte graphique : la jouabilité, les performances et l'équilibrage sont à valider.
