# @noyau/shared

Helpers purs partagés par le renderer, Noyau Server et Noyau Desktop. Pas d'IO, pas de Schema
de frontière, pas de dépendance Effect.

## Langage

**ComposerTrigger**:
Jeton incomplet au curseur du Composer (`@` chemin, `/` commande, `$` skill).
_À éviter_ : Action, Command, Palette

**Mention**:
Référence `@path` ou `@ticket:<id>` (ou lien markdown équivalent) déjà délimitée
dans le texte du Composer. Le serveur encode un fichier en `resource_link` ACP et
un Ticket en texte structuré (`ticketId`, titre, colonne).
_À éviter_ : attachment, Resource, ContentBlock

**Jeton de reprise**:
Prompt réduit à un mot de reprise (`reprends`, `resume`, `continuer`, …). Ce n'est
pas un mandat. Le Server et le Composer le remplacent par le dernier `transcript.user`.
_À éviter_ : nouveau prompt, historique provider

**ReleaseBrand**:
Identité pure et exhaustive d'un canal desktop : nom, bundle, icône, palette et application
Discord. Chaque surface consomme cette même définition après avoir décodé le canal à sa
frontière.
_À éviter_ : mapping local par app, fallback différent par surface, dériver depuis le thème
