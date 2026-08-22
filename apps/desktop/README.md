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

Sur macOS, le launcher copie `Electron.app` vers `.electron-runtime/Noyau (Dev).app`, patche
`CFBundleName` / `CFBundleIconFile` et pose le blobatar pour que le Dock affiche Noyau plutôt
qu'Electron. Relancer `bun run dev:desktop` reconstruit le bundle brandé.

## Build et smoke test

```bash
bun run build
bun run --cwd apps/desktop smoke-test
```

Le build copie les assets de `apps/web/dist` dans `dist-electron/renderer` afin que l'application
ne dépende d'aucune distribution web.

## Package local (unsigned)

Pas de CI, signature, notarization ni updater. Ça produit un `.app` macOS ouvrable en local.

```bash
bun run dist:desktop:mac
```

Sortie : `apps/desktop/release/mac-arm64/Noyau.app` (ou `mac/` / `mac-x64/` selon l'arch). Pour un
`.dmg` partageable sur la même machine :

```bash
bun run dist:desktop:mac:dmg
```

Le serveur enfant est hors ASAR (`Contents/Resources/server/main.mjs`) ; le renderer et le main
restent dans `app.asar`. L'app est unsigned : si Gatekeeper bloque un déplacement, clic droit →
Ouvrir, ou `xattr -cr` sur le `.app`.

### Windows plus tard

Même layout (`extraResources` → `resources/server/main.mjs`, `app.isPackaged`). Les diffs réels :

| Sujet                | macOS                       | Windows                                              |
| -------------------- | --------------------------- | ---------------------------------------------------- |
| Commande             | `bun run dist:desktop:mac`  | `bun run dist:desktop:win` (sur une machine Windows) |
| Sortie `dir`         | `Noyau.app`                 | `win-unpacked/Noyau.exe`                             |
| Artefact partageable | `--dmg`                     | `--nsis` (pas branché ici)                           |
| Icône                | `assets/prod/app-icon.icns` | `assets/prod/app-icon.png` (`.ico` plus tard)        |
| Signature            | `identity: null`            | `signAndEditExecutable: false`                       |

Pas de cross-compile : packager mac depuis un Mac, Windows depuis Windows. Le chrome de fenêtre
(title bar overlay) et `--no-sandbox` sont déjà gérés hors packager.

## Reprise manuelle avec Cursor

Si `cursor-agent` est dans le `PATH`, vérifier le parcours réel ainsi :

1. Confirmer l'installation avec `command -v cursor-agent`.
2. Lancer `bun run build`, puis `bun run dev:desktop`.
3. Relier un dossier existant et vérifier que son Tableau s'affiche.
4. Créer un Thread Cursor et envoyer un premier Turn.
5. Attendre du transcript, puis quitter Noyau pendant le Turn.
6. Relancer `bun run dev:desktop` avec le même profil.
7. Vérifier le même Tableau, le même Thread et le transcript conservé.
8. Envoyer un nouveau Turn : il reprend par `session/load`, sans renvoyer le premier prompt.
