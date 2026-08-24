# Releases unsigned, canaux latest et nightly

> **Statut : accepté.** Complète [ADR-0011](0011-noyau-local-first-v0.1.md) pour la distribution
> desktop. L’auto-update Electron reste hors coupe tant que Noyau n’est pas signé.

Noyau publie des installateurs unsigned sur GitHub Releases, en deux canaux :

- **latest** : tag `vX.Y.Z` (ou dispatch manuel avec une version). Release GitHub normale, marquée
  latest seulement si la version est un `X.Y.Z` sans suffixe.
- **nightly** : `workflow_dispatch` uniquement. Version
  `X.Y.Z-nightly.YYYYMMDD.<run>` dérivée du dernier tag stable, sinon de
  `apps/desktop/package.json`. Toujours une prerelease, jamais latest.

Nightly a une marque distincte : nom `Noyau (Nightly)`, bundle id `dev.noyau.desktop.nightly`,
icône dark. Dev = ember, nightly = dark, latest = light. `NOYAU_RELEASE_CHANNEL`
(`development` | `latest` | `nightly`) est posé au lancement et exposé au renderer via
`window.noyauDesktop.releaseChannel`. `NOYAU_ENV` reste le runtime serveur
`development` | `production`.

Les artefacts v0.1 sont le DMG macOS Apple Silicon et l’installateur NSIS Windows x64. Linux, Intel
Mac et signature (Developer ID, Azure Trusted Signing) sont différés.

`electron-updater` exige une application macOS signée Developer ID. Sans certificat, Noyau ne promet
pas d’installation automatique : l’app peut vérifier un Canal de mise à jour (`latest` ou
`nightly`, défaut = canal packagé) et ouvrir l’installeur GitHub correspondant ; l’humain
installe à la main. Changer de piste n’altère pas la marque ni le bundle id. Le packager pose quand même une signature ad-hoc macOS
pour que Gatekeeper ne traite pas le bundle comme corrompu. Gatekeeper et SmartScreen afficheront un
avertissement ; le README de release le documente.

Le packager reste `electron-builder --publish never`. Chaque runner CI dépose un artefact ; un job
unique crée la GitHub Release. La signature, si elle arrive plus tard, se branche sur ce même flux
sans changer les canaux.
