# @noyau/web

Renderer React de Noyau Desktop : TanStack Router, Tailwind, Vite via la toolchain Vite+.

```bash
bun run dev:desktop
vp -C apps/web build
```

Ce workspace produit les assets embarqués par `apps/desktop` ; il n'est pas distribué comme
application web. En développement, Vite écoute uniquement sur `127.0.0.1:5173` et Noyau Desktop le
sert sous l'origine `noyau://app/`.

## Control plane

L'UI soumet des `TicketCommandRequest` sur Effect RPC WebSocket. Elle ne transporte aucune identité
sandbox : l'adaptateur de développement du serveur possède l'acteur courant.

| Variable                | Défaut                                 |
| ----------------------- | -------------------------------------- |
| `VITE_NOYAU_RPC_URL`    | `ws://127.0.0.1:3001/rpc`              |
| `VITE_NOYAU_PROJECT_ID` | `10000000-0000-4000-8000-000000000001` |

Les valeurs sont décodées au démarrage avec les schémas de `@noyau/protocol`.

## Configuration

Ce workspace ne porte que ce qui lui est propre : plugins Vite, alias `@`, et la tâche
`typecheck`. Le formatage, le lint et les tests sont configurés dans le
[`vite.config.ts`](../../vite.config.ts) racine.

Les règles de lint spécifiques à cette app vivent dans l'override `apps/web/**` de la config
racine. Ne pas créer de `.oxlintrc.json` ni de bloc `lint` local : `vp lint` les ignore.

Le React Compiler n'est pas activé.
