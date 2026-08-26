# Codex

Fil de fer `codex app-server` : schémas codegen depuis le protocole OpenAI piné, JSON-RPC
stdio et `CodexAppServerClient`. Ce n'est pas un port multi-provider.

## Langage

**CodexAppServerClient**:
Client JSON-RPC d'un processus `codex app-server`.
_À éviter_ : ProviderPort, adaptateur Codex, harnais, AcpClient

**app-server notification**:
Notification décodée depuis la spec pinée (`item/started`, `turn/completed`, …).
_À éviter_ : delta transcript, ProviderSignal, SessionNotification
