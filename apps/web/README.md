# @noyau/web

UI React du LifeOS Noyau : TanStack Router, Tailwind, Vite via la toolchain Vite+.

```bash
bun run dev:web    # ou vp -C apps/web dev
vp -C apps/web build
```

Le workspace racine utilise le vrai control plane. En développement, Vite proxifie `/api` et
`/health` vers `http://127.0.0.1:3001`.

## Sandbox

L'UI démarre sans configuration avec un projet, une mission et un acteur sandbox stables. Ces
valeurs non sensibles peuvent être remplacées :

| Variable                  | Défaut                                 |
| ------------------------- | -------------------------------------- |
| `VITE_NOYAU_API_BASE_URL` | origine courante, via le proxy Vite    |
| `VITE_NOYAU_PROJECT_ID`   | `10000000-0000-4000-8000-000000000001` |
| `VITE_NOYAU_MISSION_ID`   | `30000000-0000-4000-8000-000000000001` |
| `VITE_NOYAU_ACTOR_ID`     | `human:sandbox`                        |

Toute valeur est décodée au démarrage avec les schémas de `@noyau/protocol`.

## Configuration

Ce workspace ne porte que ce qui lui est propre : plugins Vite, alias `@`, et la tâche
`typecheck`. Le formatage, le lint et les tests sont configurés dans le
[`vite.config.ts`](../../vite.config.ts) racine.

Les règles de lint spécifiques à cette app vivent dans l'override `apps/web/**` de la config
racine. Ne pas créer de `.oxlintrc.json` ni de bloc `lint` local : `vp lint` les ignore.

Le React Compiler n'est pas activé.
