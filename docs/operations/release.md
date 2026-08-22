# Releases desktop

Canaux : **latest** et **nightly**. Artefacts unsigned : DMG macOS arm64 et NSIS Windows x64.
Procédure opérateur. Pour le modèle, voir [ADR-0017](../adr/0017-releases-unsigned-latest-nightly.md).

## Ce que fait le workflow

Fichier : `.github/workflows/release.yml`.

1. `preflight` calcule la version, puis `bun run check` et `bun run test`.
2. Deux builders en parallèle packagent un installateur unsigned.
3. `release` crée une GitHub Release avec le DMG et l’NSIS versionnés
   (`Noyau-<version>-<os>-<arch>`). Le binaire dépaqueté `win-unpacked/` n’est pas publié.

Pas de cron, pas de publication npm, pas de manifests `electron-updater`.

## Latest

1. `main` vert.
2. Créer et pousser un tag `vX.Y.Z` :

```bash
git tag v0.1.0
git push origin v0.1.0
```

3. Vérifier le workflow Release, puis smoke-tester les deux installateurs.

Un dispatch `channel=latest` avec l’input `version` produit la même Release sur le SHA courant.
C’est une vraie publication, pas un dry-run.

`v1.2.3-rc.1` passe par latest mais reste une prerelease GitHub (`make_latest=false`).

## Nightly

GitHub → Actions → **Release** → **Run workflow** → channel `nightly` → **Run workflow**.

Pas de cron. Le tag `v*-nightly.*` est créé par le job `release`.

Nightly a un branding séparé : nom `Noyau (Nightly)`, icône dark, bundle id
`dev.noyau.desktop.nightly`. Marques : ember en Dev, dark en nightly, light en latest.
L’app expose `NOYAU_RELEASE_CHANNEL=nightly` (main, serveur enfant,
`window.noyauDesktop.releaseChannel`).

La version devient `<next-patch>-nightly.YYYYMMDD.<run_number>`. Le tag `v*-nightly.*` est créé
par `gh release create`. `main` n’est pas modifié.

## Installer une build unsigned

### macOS (Sequoia et plus)

Gatekeeper bloque le premier lancement. Le clic droit → Ouvrir ne suffit plus.

1. Ouvrir le DMG, glisser Noyau dans Applications, lancer une première fois.
2. Fermer le dialogue « impossible de l’ouvrir ».
3. Réglages système → Confidentialité et sécurité → **Ouvrir quand même**.
4. Confirmer avec le mot de passe.

### Windows

SmartScreen affiche « Windows a protégé votre ordinateur ».

1. **Informations complémentaires** → **Exécuter quand même**.
2. Continuer l’installateur NSIS.

Certaines politiques d’entreprise interdisent ce contournement.

## Packager en local

```bash
bun run dist:desktop:mac:dmg    # Apple Silicon
bun run dist:desktop:win:nsis   # machine Windows
```

Les sorties vont dans `apps/desktop/release/`. CI injecte `--arch` et `--build-version`.
