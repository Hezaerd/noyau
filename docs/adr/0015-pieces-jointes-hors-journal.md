# Les octets d'une pièce jointe restent hors journal

> **Statut : accepté.**

Une image jointe à un Turn traverse `thread.turn.start` une fois (`TurnImageUpload` / `dataUrl`).
Le serveur écrit les octets dans `Environment/attachments/` avant la décision. Le fait
`thread.turn.started` et `transcript.user` ne portent que la meta (`TurnImageAttachment`). Le
reactor relit le fichier pour `session/prompt` (`ContentBlock::Image`). `subscribeThread` et
SQLite ne véhiculent jamais le blob.

Les alternatives écartées : BLOB dans l'événement, écriture dans le WorkspaceRoot pour réutiliser
`previewFile`, et `file://` via `uri` ACP.
