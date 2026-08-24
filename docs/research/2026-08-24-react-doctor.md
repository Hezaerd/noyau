# React Doctor — audit d’une app React (Noyau)

Date : 2026-08-24.  
Package npm vérifié : `react-doctor@0.9.12`.

> **Statut : note factuelle.** Sources primaires uniquement (README GitHub/npm package, docs `react.doctor`, CLI `--help` live). Pas de blogs tiers.

## Verdict

React Doctor est un scanner CLI déterministe (Million / millionco) : score 0–100 + diagnostics React (lint curaté, complexité / JSX dupliqué, supply-chain Socket.dev). Pour Noyau, cibler **`apps/web` (`@noyau/web`)** ; `apps/desktop` est surtout Electron/main — scanner seulement s’il y a du JSX renderer à auditer.

## 1. Install / run

Pas d’install obligatoire. Lancer depuis la racine du projet (ou un sous-dossier) :

```bash
# npm / npx (doc officielle)
npx react-doctor@latest

# Bun (équivalent ; vérifié localement)
bunx react-doctor@latest
# ou
bunx --bun react-doctor@latest
```

Sources : [README package](https://raw.githubusercontent.com/millionco/react-doctor/main/packages/react-doctor/README.md), [quickstart](https://www.react.doctor/docs/overview/quickstart.md), [CLI reference](https://www.react.doctor/docs/reference/cli-reference.md).

Autres commandes utiles :

| Commande | Rôle |
| -------- | ---- |
| `npx react-doctor@latest install` | Skill agent (Cursor, Claude Code, …) + hooks optionnels |
| `npx react-doctor@latest ci install` | Workflow PR (GitHub Actions ; scaffold GitLab gate-only) |
| `npx react-doctor@latest scan http://localhost:…` | Trace perf Chrome DevTools (runtime, pas scan statique) |
| `npx react-doctor@latest rules list` | Lister les règles effectives |
| `npx react-doctor@latest why path:line` | Expliquer un diagnostic / une suppression |

Telemetry : opt-out avec `--no-telemetry` (alias `--no-score` côté CLI live) — [README](https://raw.githubusercontent.com/millionco/react-doctor/main/packages/react-doctor/README.md).

Config optionnelle : `doctor.config.ts|js|json` ou clé `"reactDoctor"` dans `package.json` — [config files](https://www.react.doctor/docs/configuration/config-files.md).

## 2. Options CLI utiles en monorepo (`apps/web` + `apps/desktop`)

Signature : `react-doctor [directory] [options]` — directory omis = cwd ([CLI](https://www.react.doctor/docs/reference/cli-reference.md) ; confirmé `bunx react-doctor@latest --help`).

### Sélection de projet

| Flag | Usage Noyau |
| ---- | ----------- |
| `[directory]` | `./apps/web` — scan centré sur ce tree |
| `--project <name>` | Noms workspace **ou** chemins relatifs, CSV. Ex. `@noyau/web` ou `apps/web`. `"*"` = tous les workspaces découverts |
| `-y` / `--yes` | Skip prompts ; scanne tous les projets workspace détectés (CI / agents) |

Chaque `--project` a son score ; config `doctor.config.*` du module se merge sur la racine ([CLI — Multi-project](https://www.react.doctor/docs/reference/cli-reference.md)).

### Scope git (PRs / boucle courte)

| `--scope` | Comportement |
| --------- | ------------ |
| `full` (défaut) | Tout le projet |
| `files` | Fichiers changés vs base ; tous les findings dedans |
| `changed` | Seulement findings **introduits** vs base |
| `lines` | Findings dont le span touche une ligne changée |

- `--base <ref>` : base git (auto-détectée sinon). Ancien `--diff` = alias déprécié de `--scope changed`.
- `--include-untracked` : avec scope partiel, inclure untracked (respect `.gitignore`).
- `--staged` : index git (pre-commit) ; honore `--project`.

Maintainability (JSX dupliqué) compare toujours au corpus complet, puis filtre aux fichiers/lignes sélectionnés ([CLI](https://www.react.doctor/docs/reference/cli-reference.md), [maintainability](https://www.react.doctor/docs/overview/react-maintainability.md)).

### Output / CI / perf scan

| Flag | Rôle |
| ---- | ---- |
| `--verbose` | Détail fichier + lignes (sinon top rules) |
| `--json` / `--json-out` / `--json-compact` | Rapport machine |
| `--score` | Score numérique seul |
| `--category <name>` | Filtre affichage (répétable) — **ne change pas** les fichiers scannés |
| `--blocking error\|warning\|none` | Exit code CI (défaut CLI : `error`) |
| `--no-lint` | Skip diagnostics lint |
| `--no-supply-chain` | Skip Socket.dev |
| `--dead-code` / `--no-dead-code` | Toggle analyse dead-code (CLI `0.9.12` ; docs config : `deadCode` déprécié, sémantique liée au check JSX dupliqué — préférer les règles graph explicites) |
| `--no-parallel` | Un worker lint |
| `--max-duration <seconds>` | Budget temps, résultats partiels |
| `--no-respect-inline-disables` | Audit des suppressions inline |
| `--warnings` / `--no-warnings` | Afficher / cacher les warnings |

Catégories de sévérité configurables (buckets) : **Security, Bugs, Performance, Accessibility, Maintainability** ([config](https://www.react.doctor/docs/configuration/config-files.md)).

### Web vs desktop

- **`apps/web`** : cible principale (React renderer Vite).
- **`apps/desktop`** : package `@noyau/desktop` surtout process Electron ; ne pas le scanner par défaut avec `-y` sauf JSX UI à auditer. Pour les deux : `--project @noyau/web,@noyau/desktop` ou `apps/web,apps/desktop`.

## 3. Ce qu’il détecte

Scan par défaut : règles lint curatées + analyse maintainability React (complexité, JSX répété) + checks supply-chain dépendances ([overview](https://www.react.doctor/docs/overview/what-is-react-doctor.md), [homepage docs](https://www.react.doctor/)).

Index officiel : **~802 règles actives** groupées par catégorie — [prompts/rules](https://www.react.doctor/prompts/rules.md). Tags `design` désactivés par défaut.

### Maintainability (défaut)

- `react-doctor/no-high-complexity-react-function` — complexité cyclomatique / cognitive > 15 sur composants & hooks.
- `react-doctor/duplicate-jsx-subtree` — sous-arbres JSX répétés (candidats composition).

Optionnel (full scan seulement, à activer dans `doctor.config`) : `unused-file`, `unused-export`, `unused-type`, `unused-dependency`, `unused-dev-dependency`, `circular-dependency` — [maintainability](https://www.react.doctor/docs/overview/react-maintainability.md).

### Performance / re-renders (extraits actionnables)

Règles `rerender-*` et props instables ([rules index](https://www.react.doctor/prompts/rules.md)) :

| Règle | Anti-pattern |
| ----- | ------------ |
| `jsx-no-new-{object,array,function}-as-prop` | `{}` / `[]` / `() =>` inline → refs instables |
| `jsx-no-constructed-context-values` / `context-provider-value-from-unmemoized-local-literal` | value Context recréée chaque render |
| `no-inline-prop-on-memo-component` | props inline qui cassent `memo` |
| `no-unstable-nested-components` | composant défini dans un rendu |
| `prefer-stable-empty-fallback` | `\|\| []` / `?? {}` alloués à chaque fois |
| `rerender-lazy-state-init` / `rerender-lazy-ref-init` | init coûteuse rejouée |
| `rerender-state-only-in-handlers` | `useState` alors que `useRef` suffit |
| `rerender-transitions-scroll` | state haute fréquence (scroll) sans throttle |
| `redux-useselector-returns-new-collection` / `zustand-no-fresh-selector-result` | sélecteur qui alloue → re-render systématique |
| `no-usememo-simple-expression` | `useMemo` inutile (bruit) |

Aussi : keys d’index (`no-array-index-key` / `no-array-index-as-key`), waterfalls fetch/loaders, layout thrashing CSS, etc.

### State & effects / Bugs / Correctness

Exemples ([rules](https://www.react.doctor/prompts/rules.md)) :

- `no-derived-state` / `no-derived-state-effect` — état dérivé via effect
- `exhaustive-deps`, `rules-of-hooks`
- React Compiler / hooks-js : `set-state-in-effect`, `set-state-in-render`, `static-components` (composant recréé → reset state / re-renders excessifs)
- cleanups listeners / observers / rAF manquants

### Autres familles

- **Accessibility** — ARIA, labels, focus, contrast, reduced-motion, …
- **Security** — XSS (`no-danger`, SVG actifs, …), supply-chain Socket
- **Architecture** — taille composants, defaultProps/propTypes React 19, …
- **Design** (opt-in) — patterns UI « AI-ish »
- Frameworks : Next.js, TanStack, RN, Preact, R3F/Three, …

Lister le set effectif localement :

```bash
bunx react-doctor@latest rules list --category Performance
bunx react-doctor@latest rules explain react-doctor/jsx-no-new-object-as-prop
```

## 4. Commandes recommandées pour `apps/web`

Racine worktree : `/Users/hezaerd/.noyau/nightly/worktree/noyau/c57bf704`.

### Audit full (baseline)

```bash
cd /Users/hezaerd/.noyau/nightly/worktree/noyau/c57bf704

# Option A — directory (exemple CLI officiel : react-doctor ./apps/web)
bunx react-doctor@latest ./apps/web --verbose --no-telemetry

# Option B — workspace name / path via --project (scores monorepo)
bunx react-doctor@latest --project @noyau/web --verbose --no-telemetry
# équivalent chemin :
bunx react-doctor@latest --project apps/web --verbose --no-telemetry
```

### Focus performance / re-renders

```bash
bunx react-doctor@latest ./apps/web --verbose --category Performance --no-telemetry
```

### Diff vs trunk (seulement nouveaux issues)

```bash
bunx react-doctor@latest ./apps/web --verbose --scope changed --base main --no-telemetry
```

### JSON pour triage / agent

```bash
bunx react-doctor@latest ./apps/web --json --json-out /tmp/noyau-web-react-doctor.json --no-telemetry
```

### CI-friendly (pas de prompts)

```bash
bunx react-doctor@latest --project apps/web -y --blocking error --no-telemetry
```

### Runtime (app déjà up)

```bash
bunx react-doctor@latest scan http://localhost:<port-web>
```

(trace locale, non uploadée — [README](https://raw.githubusercontent.com/millionco/react-doctor/main/packages/react-doctor/README.md))

### Éviter desktop par accident

Ne pas lancer `bunx react-doctor@latest -y` à la racine sans `--project` si tu veux uniquement le renderer : `-y` scanne **tous** les workspaces détectés.

## Sources

| Source | URL |
| ------ | --- |
| Repo | https://github.com/millionco/react-doctor |
| README package | https://raw.githubusercontent.com/millionco/react-doctor/main/packages/react-doctor/README.md |
| Docs hub | https://www.react.doctor/ |
| What is | https://www.react.doctor/docs/overview/what-is-react-doctor.md |
| Quickstart | https://www.react.doctor/docs/overview/quickstart.md |
| Maintainability | https://www.react.doctor/docs/overview/react-maintainability.md |
| CLI reference | https://www.react.doctor/docs/reference/cli-reference.md |
| Config | https://www.react.doctor/docs/configuration/config-files.md |
| Rule index | https://www.react.doctor/prompts/rules.md |
| CLI live | `bunx react-doctor@latest --help` (`0.9.12`) |
| npm | https://www.npmjs.com/package/react-doctor |
