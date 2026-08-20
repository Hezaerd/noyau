# ACP

Fil de fer Agent Client Protocol : schémas codegen depuis la spec officielle, JSON-RPC stdio
et `AcpClient`. Ce n'est pas un port multi-provider.

## Langage

**AcpClient**:
Client JSON-RPC d'un processus agent ACP (`cursor-agent acp`).
_À éviter_ : ProviderPort, adaptateur Cursor, harnais

**SessionNotification**:
Notification `session/update` décodée depuis la spec pinée.
_À éviter_ : delta transcript, ProviderSignal

**extension Cursor**:
Méthode hors spec (`cursor/ask_question`, …) enregistrée par l'adaptateur, pas par ce package.
_À éviter_ : méthode cœur ACP
