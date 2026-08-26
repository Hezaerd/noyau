# Client Runtime

Cache renderer des Projections distantes et capacités de plateforme injectées par
`apps/web`. Ce n'est pas l'État client, ni encore la Session RPC.

## Langage

**Projection distante**:
Vue en mémoire d'un état dont Noyau Server est l'autorité. Ce package en possède le
cache, le curseur et la phase de synchronisation.
_À éviter_ : cache autoritatif, store Zustand, snapshot local

**État client**:
État possédé par l'interface (brouillons, pins, préférences). Il n'appartient pas à
ce package.
_À éviter_ : Projection distante, atom métier, snapshot Server

**Session RPC**:
Une tentative de transport, sans retry. Phase 2 ; absente de ce squelette.
_À éviter_ : subscription, superviseur, Projection live

**synchronized**:
Marqueur de flux : la Projection a rattrapé le head connu au début de la
souscription. Ce n'est pas « transport Connected ».
_À éviter_ : Connected, Reconnecting, transport sain

**génération**:
Identité monotone d'une Session RPC. Phase 2 ; une génération plus ancienne ne
peut pas écraser une plus récente.
_À éviter_ : attempt, retry count, sequence
