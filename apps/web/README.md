# @noyau/web

UI React du LifeOS Noyau : TanStack Router, Tailwind, Vite via la toolchain Vite+.

```bash
bun run dev:web    # ou vp -C apps/web dev
vp -C apps/web build
```

## Configuration

Ce workspace ne porte que ce qui lui est propre : plugins Vite, alias `@`, et la tâche
`typecheck`. Le formatage, le lint et les tests sont configurés dans le
[`vite.config.ts`](../../vite.config.ts) racine.

Les règles de lint spécifiques à cette app vivent dans l'override `apps/web/**` de la config
racine. Ne pas créer de `.oxlintrc.json` ni de bloc `lint` local : `vp lint` les ignore.

Le React Compiler n'est pas activé.
