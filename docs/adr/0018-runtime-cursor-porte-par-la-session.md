# Runtime Cursor ACP porté par la Session

> **Statut : accepté.** Supersède le cycle de vie runtime de [ADR-0013](0013-session-projetee-et-cursor.md) ;
> conserve son modèle durable `Thread → Session? → Turn*` et son `resumeCursor`.

Noyau conserve un seul runtime Cursor ACP vivant par Session. Le runtime comprend le processus
`cursor-agent acp`, l'`AcpClient`, le handle de processus et le `Scope` qui les possède. Il est
créé paresseusement au premier Turn, réutilisé par les Turns suivants, et fermé seulement par
un `session.stop`, un crash ou une rupture de transport, l'arrêt du Server, ou le reaper
d'inactivité. Un Turn terminé ne ferme donc pas le runtime et ne provoque ni nouveau spawn ni
nouveau handshake.

Après la perte du runtime (redémarrage du Server compris), le prochain Turn recrée le runtime et
appelle `session/load` avec le `resumeCursor` et le `WorkspaceRoot` courant. Si le load échoue,
Noyau peut créer une nouvelle session ACP avec `session/new`. Dans les deux cas, Noyau ne rejoue
aucun prompt historique : seul le mandat du Turn courant est envoyé au contexte nouvellement
créé. La Session durable reste la même projection ; un runtime absent est un état volatil, pas
une nouvelle Session métier.

Le handle capturé au spawn et son `Scope` sont la seule appartenance autorisée du processus.
L'arrêt agit sur ce handle, sans registre global, scan par nom ni sweep d'orphelins. Le reaper
libère par défaut les runtimes sans Turn actif après 30 minutes d'inactivité, comme t3code ; ce
seuil et sa fréquence sont des paramètres opérationnels. Une Session redevient lazy-resumable
après ce nettoyage, et un Turn actif est toujours exclu du reaper.

La capacité MCP injectée dans `session/new` / `session/load` est portée par la Session runtime,
pas par un Turn isolé : elle reste utilisable entre les Turns, renouvelle sa vivacité lors des
Turns et est révoquée à l'arrêt, à la perte ou à l'expiration du runtime. Le contexte d'appel
peut toutefois référencer le Turn actif pour borner les mutations et l'audit.

## Conséquences

- Une discussion longue ne paie plus `spawn → initialize → authenticate → session/load` à chaque
  Turn ; la charge et les états transitoires visibles par l'UI diminuent.
- Les tests doivent garantir un seul spawn pour plusieurs Turns, puis un nouveau spawn avec
  `session/load` après restart, crash, stop et idle reaping, sans rejeu de prompts.
- Le runtime vivant consomme des ressources entre les Turns ; le reaper et `session.stop` bornent
  cette consommation.
- Les capacités MCP doivent suivre la durée de vie de la Session runtime ; les finalizers de
  Turn ne doivent pas révoquer un credential encore nécessaire au Turn suivant.

## Options écartées

- **Un subprocess par Turn** : coût de handshake et de restauration multiplié par les longs
  Threads, avec instabilité UI observée ; il contredit le runtime Session de t3code.
- **Rejouer les prompts pour reconstruire l'état** : le provider reste la source du contexte
  chargé par `session/load`, et le rejeu pourrait dupliquer les actions ou les effets MCP.
- **Un sweep de processus `cursor-agent`** : il pourrait tuer le processus d'une autre Session et
  masque la propriété ; le handle capturé et le `Scope` donnent une appartenance déterministe.
