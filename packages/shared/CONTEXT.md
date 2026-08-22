# @noyau/shared

Helpers purs partagés par le renderer, Noyau Server et Noyau Desktop. Pas d'IO, pas de Schema
de frontière, pas de dépendance Effect.

## Langage

**ComposerTrigger**:
Jeton incomplet au curseur du Composer (`@` chemin, `/` commande, `$` skill).
_À éviter_ : Action, Command, Palette

**Mention**:
Référence `@path` (ou lien markdown fichier) déjà délimitée dans le texte du
Composer. Le serveur l'encode en `resource_link` ACP.
_À éviter_ : attachment, Resource, ContentBlock

**ReleaseBrand**:
Identité pure et exhaustive d'un canal desktop : nom, bundle, icône, palette et application
Discord. Chaque surface consomme cette même définition après avoir décodé le canal à sa
frontière.
_À éviter_ : mapping local par app, fallback différent par surface, dériver depuis le thème
