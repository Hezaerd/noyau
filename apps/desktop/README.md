# Noyau Desktop

Shell Electron de Noyau. Le renderer React reste dans `apps/web` et communique exclusivement avec
Noyau Server par Effect RPC ; Electron ne possède aucun état métier.

## Développement

Depuis la racine :

```bash
bun run dev:desktop
```

Le shell sert le renderer sous l'origine privée `noyau://app/`. En développement, ce protocole
redirige vers Vite, fixé sur `http://127.0.0.1:5173/`. Le métier passe uniquement par Effect RPC
loopback. Une URL RPC distante est hors v0.1.

Sur macOS, le launcher copie `Electron.app` vers `.electron-runtime/Noyau (Dev).app` et patche
`CFBundleName` pour que le Dock et le menu affichent Noyau plutôt qu'Electron.

## Build et smoke test

```bash
bun run build
bun run --cwd apps/desktop smoke-test
```

Le build copie les assets de `apps/web/dist` dans `dist-electron/renderer` afin que l'application
ne dépende d'aucune distribution web.
