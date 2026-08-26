# Sélecteur de modèle

Le sélecteur choisit une paire Provider + modèle pour un nouveau Thread, puis uniquement un modèle
du Provider immuable lorsque le Thread existe.

## Accès et navigation

- `⌘;` (`Mod+;`) ouvre le sélecteur et focalise sa recherche.
- Avant le premier Turn, les tabs sont `Favoris` puis chaque Provider connecté.
- Après création du Thread, seules `Favoris` et la tab de son Provider restent visibles.
- Sans recherche, la tab active filtre la liste.
- Avec une recherche, toutes les tabs autorisées sont recherchées : tous les Providers avant la
  création, uniquement le Provider du Thread après.
- Un Provider non connecté et ses modèles ne sont pas affichés.

## Identité et ordre

- Le nom du modèle reste celui fourni par le Provider ; aucun suffixe ne désambiguïse un doublon.
- Chaque ligne montre le logo et le nom du Provider.
- Favori et sélection utilisent l'identité exacte `{ provider, modelId }`.
- Les favoris précèdent les autres modèles à correspondance de recherche équivalente.
- `Auto` est un modèle Cursor ordinaire fourni par son catalogue, pas une sélection Noyau spéciale.

## Préférences

- Les favoris sont une Préférence renderer et survivent à la déconnexion d'un Provider.
- Le modèle par défaut est une Préférence durable du Project : `{ provider, modelSelection }`.
- Un nouveau Thread conserve ce défaut si son Provider est connecté, même si le modèle n'est plus
  dans le catalogue.
- Sinon, il utilise temporairement le premier Provider prêt et le premier modèle de son catalogue,
  sans réécrire le défaut persistant.
