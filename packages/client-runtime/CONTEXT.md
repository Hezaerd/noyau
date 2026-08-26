# Client Runtime

Cache renderer des Projections distantes, Session RPC et superviseur de
connexion. L'État client n'appartient pas à ce package.

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
Une tentative de transport, sans retry. `RpcSessionFactory.connect` ouvre un
WebSocket, expose `ready` / `closed` / `dispose`, et laisse le superviseur
réessayer.
_À éviter_ : subscription, superviseur, Projection live

**ConnectionSupervisor**:
Propriétaire unique du transport et de la reconnexion. Dix ruptures sur la même
génération ne produisent qu'un remplacement. Une erreur métier ne remplace pas
la session.
_À éviter_ : replaceTransportSession, retry par subscription

**synchronized**:
Marqueur de flux : la Projection a rattrapé le head connu au début de la
souscription. Ce n'est pas « transport Connected ».
_À éviter_ : Connected, Reconnecting, transport sain

**génération**:
Identité monotone d'une Session RPC. Commence à 0, s'incrémente à chaque
tentative de session. Une génération plus ancienne ne peut pas écraser une plus
récente.
_À éviter_ : attempt, retry count, sequence
