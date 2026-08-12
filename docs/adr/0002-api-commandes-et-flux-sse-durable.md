# API orientée commandes et flux SSE durable

Le control plane expose une API Effect `HttpApi` sur Bun, avec un endpoint générique de commandes
plutôt que des mutations CRUD. Les clients lisent un snapshot cohérent puis reprennent un flux SSE
ordonné au moins une fois par une position transactionnelle propre au projet ; WebSocket, mémoire et
`bigserial` sont écartés comme sources du curseur afin que la reprise reste correcte après crash et
sous concurrence.
