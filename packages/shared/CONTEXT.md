# @noyau/shared

Helpers purs partagés par le renderer et Noyau Server. Pas d'IO, pas de Schema
de frontière, pas de dépendance Effect.

## Langage

**ComposerTrigger**:
Jeton incomplet au curseur du Composer (`@` chemin, `/` commande, `$` skill).
_À éviter_ : Action, Command, Palette

**Mention**:
Référence `@path` (ou lien markdown fichier) déjà délimitée dans le texte du
Composer. Le serveur l'encode en `resource_link` ACP.
_À éviter_ : attachment, Resource, ContentBlock
