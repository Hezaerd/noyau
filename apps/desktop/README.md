# Noyau Desktop

Shell Electron de Noyau. Le renderer React reste dans `apps/web` et communique exclusivement avec
Noyau Server par Effect RPC ; Electron ne possède aucun état métier.

## Développement

Depuis la racine :

```bash
bun run dev
# ou, explicitement :
bun run dev:desktop
```

Les deux commandes lancent la même stack complète (Vite, bundles Server/Desktop et Electron)
sur le canal `development`.

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

## Package et releases (unsigned)

CI publie latest/nightly sur GitHub Releases : DMG Apple Silicon et NSIS Windows x64. Pas de
signature, pas d’auto-update. L’app packagée vérifie son propre canal GitHub et peut
ouvrir l’installeur correspondant depuis About dans Réglages → Général. Nightly
s’appelle **Noyau (Nightly)** (icône dark, bundle id
séparé). Marques : ember en Dev, dark en nightly, light en latest. L’UI lit
`window.noyauDesktop.releaseChannel` / `NOYAU_RELEASE_CHANNEL`.
La matrice exhaustive (nom, bundle id, dossier d'icône, palette et identité Discord) vit dans
`packages/shared/src/release-brand.ts` ; aucune surface ne redéfinit ce mapping localement.
`NOYAU_RELEASE_CHANNEL` est l’unique entrée : le launcher injecte `development` en local et la CI
injecte `latest` ou `nightly` au packaging. Le packager embarque ensuite la valeur dans
`dist-electron/release-channel.json`, car l’environnement du runner CI n’existe plus au lancement
de l’application installée. Electron transmet cette valeur au serveur enfant et au preload.
Voir [`docs/operations/release.md`](../../docs/operations/release.md).

```bash
bun run dist:desktop:mac
bun run dist:desktop:mac:dmg
bun run dist:desktop:win
bun run dist:desktop:win:nsis

# Pour reproduire une nightly locale :
NOYAU_RELEASE_CHANNEL=nightly node apps/desktop/scripts/package-desktop.ts --mac --dmg
```

Sortie `dir` : `apps/desktop/release/mac-arm64/Noyau.app` (ou `mac/` selon l’arch) et
`win-unpacked/Noyau.exe`. Les installateurs partageables s’appellent
`Noyau-<version>-<os>-<arch>.dmg|.exe`. La Release GitHub ne publie que ces
installateurs versionnés, pas le `.exe` dépaqueté.

Le serveur enfant est hors ASAR (`Contents/Resources/server/main.mjs` /
`resources/server/main.mjs`) ; le renderer et le main restent dans `app.asar`.

Pas de Developer ID. Sur macOS, `afterPack` pose une signature ad-hoc pour que Gatekeeper
ne traite pas le bundle comme corrompu. Sequoia+ exige ensuite Réglages système →
Confidentialité et sécurité → **Ouvrir quand même**. Sur Windows, SmartScreen demande
**Informations complémentaires** → **Exécuter quand même**.

| Sujet           | macOS                          | Windows                                       |
| --------------- | ------------------------------ | --------------------------------------------- |
| Commande locale | `bun run dist:desktop:mac`     | `bun run dist:desktop:win` (machine Windows)  |
| Installateur    | `bun run dist:desktop:mac:dmg` | `bun run dist:desktop:win:nsis`               |
| Release CI      | DMG arm64                      | NSIS x64                                      |
| Icône           | `assets/prod/app-icon.icns`    | `assets/prod/app-icon.png` (`.ico` plus tard) |
| Signature       | ad-hoc (`codesign --sign -`)   | `signAndEditExecutable: false`                |

Pas de cross-compile : packager mac depuis un Mac, Windows depuis Windows. Le chrome de fenêtre
(title bar overlay) et `--no-sandbox` sont déjà gérés hors packager.

## Reprise manuelle avec Cursor

Le Server hydrate le `PATH` depuis le login shell au boot : un nightly lancé depuis le
Dock voit le même `cursor-agent` qu'un `bun run dev:desktop` lancé du terminal.

Si `cursor-agent` est dans le `PATH`, vérifier le parcours réel ainsi :

1. Confirmer l'installation avec `command -v cursor-agent`.
2. Lancer `bun run build`, puis `bun run dev:desktop`.
3. Relier un dossier existant et vérifier que son Tableau s'affiche.
4. Créer un Thread Cursor et envoyer un premier Turn.
5. Attendre du transcript, puis quitter Noyau pendant le Turn.
6. Relancer `bun run dev:desktop` avec le même profil.
7. Vérifier le même Tableau, le même Thread et le transcript conservé.
8. Envoyer un nouveau Turn : il reprend par `session/load`, sans renvoyer le premier prompt.
