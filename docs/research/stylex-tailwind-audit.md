# Should Noyau replace Tailwind CSS with Meta StyleX?

Research cut-off: **2026-08-13**. Unless a publication date is stated, external links were
accessed on that date. This is a research audit, not a migration design or implementation.

## Executive summary

**Decision: do not migrate Noyau from Tailwind CSS v4 to StyleX now.** Keep Tailwind, prune
unused shadcn-generated primitives, and use plain CSS or CSS Modules only for CSS-shaped escape
hatches such as third-party DOM trees. **Confidence: high (0.88).**

The decisive reason is not that StyleX is poor. StyleX is an actively maintained, production-used
compiler with strong static extraction, typed style contracts, atomic deduplication, and
deterministic composition. The problem is fit:

- Noyau currently has only three user-facing pages and five hand-written page/shell components.
  Its apparent UI size mostly comes from 61 checked-in shadcn primitives, 49 of which are not
  currently reachable from the app.
- Tailwind already generates static CSS and has no client-side style-generation runtime. Replacing
  it cannot reproduce the main benefit reported by Linear, because Linear is removing
  **styled-components**, a runtime CSS-in-JS system, not Tailwind.
- Noyau already has a first-party Tailwind v4 Vite plugin and a Tailwind-native shadcn source
  registry. A StyleX migration would rewrite component APIs, variants, complex selectors, tokens,
  build configuration, lint integration, and the future shadcn update path.
- StyleX `0.19.0` is healthy but pre-1.0. Its official Vite integration is recent, and relevant
  integration defects remain open. Noyau would be adding build risk to solve no measured styling
  problem.
- The best StyleX benefits become material when a shared component system crosses package/app
  boundaries, independently composed styles cause recurring defects, or measured runtime
  CSS-in-JS work exists. None is true here.

StyleX remains worth a small, isolated spike if Noyau wants to validate its Vite+/TypeScript 7
toolchain early. Such a spike should compare one leaf component in StyleX, Tailwind, and CSS
Modules; it should not begin an incremental production migration.

## Direct correction of unsupported premises

1. **Linear is not “migrating away from Tailwind.”** Kenneth Skovhus's first-person account is
   titled and repeatedly describes [“Moving Linear from styled-components to
   StyleX”](https://www.skovhus.dev/blog/moving-linear-from-styled-components-to-stylex)
   (2026-06-23). His public profile identifies him as
   [“Engineering at Linear.app”](https://github.com/skovhus). No first-party Linear engineering
   post found in this audit contradicts that account. It is therefore valid practitioner evidence
   about a **styled-components → StyleX** migration, not evidence for **Tailwind → StyleX**.
2. Linear's reported “roughly 30% faster renders when navigating between pages” is a self-reported
   result in that article. The article supplies no public fixture, trace set, hardware, sample
   count, confidence interval, or raw data. It should not be transferred to Noyau, whose current
   Tailwind setup performs no runtime rule generation or injection.
3. The supplied PkgPulse guide is not reliable enough for key claims. Its own
   [methodology](https://www.pkgpulse.com/guides/stylex-vs-tailwind-2026) says it compares StyleX
   `0.7.x` even though the article is dated 2026; it gives “typical” bundle and setup-time numbers
   without a fixture or commands; it calls StyleX both a `~15 KB` runtime and “no runtime”; its
   StyleX example uses the deprecated outer pseudo-selector shape instead of the current
   [property-nested syntax](https://stylexjs.com/docs/learn/styling-ui/defining-styles/); and its
   Vite migration command names a community plugin rather than today's official
   [`@stylexjs/unplugin`](https://stylexjs.com/docs/api/configuration/unplugin/). Its qualitative
   conclusion (“Tailwind for most teams; StyleX for CSS-at-scale composition”) is plausible, but
   the page does not substantiate its quantitative claims.

## Evidence labels and method

This report separates:

- **Verified fact** — directly supported by local source or a linked primary source.
- **Inference** — a consequence drawn from those facts; it is not claimed by the source.
- **Recommendation** — a decision for Noyau, including explicit trade-offs.

Local counts were taken from the checkout at the research cut-off with `rg --files`, `rg -o`, and
`wc -l`. They count physical source lines and syntactic occurrences, not rendered DOM nodes or
runtime coverage. “Reachable” below means the direct import closure from the current app shell and
three pages, not a production coverage trace.

## Local Noyau audit

### Product and build context

**Verified fact.** Noyau targets a React web PWA for desktop and mobile, with TanStack Router and a
Vite+-managed toolchain; Bun is the package manager and initial runtime. The current web app is a
client-rendered SPA and does not yet configure a manifest, service worker, PWA plugin, hydration,
or SSR. See the local [architecture](../ARCHITECTURE.md), [context
map](../../CONTEXT-MAP.md), [web context](../../apps/web/CONTEXT.md), [web
entry](../../apps/web/src/main.tsx), and [web Vite
configuration](../../apps/web/vite.config.ts).

| Local fact | Evidence at 2026-08-13 |
| --- | --- |
| Package/runtime | Bun `1.3.14` |
| Toolchain | Vite+ `0.2.9`, whose catalog aliases Vite to `@voidzero-dev/vite-plus-core@0.2.9` |
| UI runtime | React/React DOM `19.2.8`; TanStack Router `1.170.25` |
| Styling compiler | Tailwind CSS and `@tailwindcss/vite` `4.3.3` |
| Styling helpers | `tailwind-merge` `3.6.0`, `clsx` `2.1.1`, CVA `0.7.1` |
| Component source | shadcn `4.16.2`, `@shadcn/react` `0.3.0`, Base UI/Radix-based primitives |
| Styling entry | one 131-line `src/index.css` with Tailwind, shadcn, animation imports, base CSS, and tokens |
| Routes/pages | four route files: root plus Inbox, Tasks, and Channel; three page components |
| PWA/SSR today | target is documented, but no implementation/configuration is present |

Versions come from the local [root package manifest](../../package.json), [web package
manifest](../../apps/web/package.json), and [lockfile](../../bun.lock).

### UI scale and styling surface

| Surface | Files | Physical lines | Styling indicators |
| --- | ---: | ---: | ---: |
| All web `ts`/`tsx` source | 77 | 8,598 | 64 files contain `className`, `cva`, or `cn` |
| All TSX | 71 | 8,283 | 618 `className=` occurrences |
| Checked-in `components/ui` | 61 | 6,948 | 18 `cva(` and 326 `cn(` occurrences in this directory |
| Current page + shell components | 5 | 1,278 | 226 `className=` occurrences |
| Currently reachable UI primitive closure | 12 | 1,179 | 58 `className=`, 3 `cva(` occurrences |
| Current active migration core (previous two rows) | 17 | 2,457 | about 284 `className=` occurrences |

The five page/shell components are [Inbox](../../apps/web/src/pages/InboxPage.tsx),
[Tasks](../../apps/web/src/pages/TasksPage.tsx),
[Channel](../../apps/web/src/pages/ChannelPage.tsx),
[RootLayout](../../apps/web/src/components/RootLayout.tsx), and
[AppSidebar](../../apps/web/src/components/AppSidebar.tsx). The reachable primitive closure is
`avatar`, `badge`, `button`, `input`, `label`, `progress`, `separator`, `sheet`, `sidebar`,
`skeleton`, `textarea`, and `tooltip`.

**Inference.** There are two legitimate migration estimates:

- A tightly pruned current-product migration touches roughly 17 TSX files / 2.5 KLOC plus CSS,
  config, tests, and dependency metadata.
- A migration that preserves the whole checked-in shadcn registry touches 64 styled files and
  almost all 6.9 KLOC under `components/ui`.

The second number is the safer estimate if the team expects all checked-in primitives to remain
supported. The first is more rational if unused source is deleted before any styling decision.

### How styling currently works

**Verified fact.**

- Tailwind is integrated through the official `@tailwindcss/vite` plugin inside Vite+'s
  `lazyPlugins`, after the TanStack Router and React plugins.
- Global tokens are ordinary CSS custom properties. Tailwind's `@theme inline` maps semantic
  utilities such as `bg-background` to those properties. The app currently defines one dark
  palette in `:root`.
- `cn()` combines `clsx` with `tailwind-merge`, so conditional classes and same-group utility
  conflicts are normalized at runtime.
- CVA defines component variants, notably Button, Badge, Sidebar, and other generated primitives.
- The generated primitives rely heavily on Tailwind's responsive, pseudo, arbitrary, data/ARIA,
  group/peer, descendant, and container variants. The
  [Button](../../apps/web/src/components/ui/button.tsx) and
  [Sidebar](../../apps/web/src/components/ui/sidebar.tsx) are representative.
- Some components use dynamic inline CSS variables. The Sidebar writes dimensions through the
  React `style` prop. The currently unused
  [Chart](../../apps/web/src/components/ui/chart.tsx) emits selectors and theme variables for
  third-party Recharts DOM using a `<style>` element.
- There are no CSS Modules and no StyleX dependencies.

**Inference.** Noyau is not suffering from runtime CSS generation. Its styling runtime consists of
ordinary React class selection plus `clsx`/`tailwind-merge`/CVA calls; the stylesheet itself is
compiled ahead of time. StyleX could remove some merge calls when local styles compile away, but
that is a different and much smaller optimization than removing styled-components rule
serialization and insertion.

## Current status of StyleX

### Stability and maintenance

**Verified fact.**

- npm reports [`@stylexjs/stylex` `0.19.0`](https://www.npmjs.com/package/@stylexjs/stylex) and
  [`@stylexjs/unplugin` `0.19.0`](https://www.npmjs.com/package/@stylexjs/unplugin), published in
  June 2026. The [0.19 announcement](https://stylexjs.com/blog/v0.19.0) adds the compiled-away
  `@stylexjs/atoms` API and ESLint 10 compatibility.
- The repository was active immediately before this audit: commits on 2026-08-12 fixed grid line
  numeric values and signals. This is visible in the official
  [commit history](https://github.com/facebook/stylex/commits/main/).
- The project is still pre-1.0. The open
  [StyleX v1.0 roadmap](https://github.com/facebook/stylex/issues/1356), updated 2026-07-01, still
  lists CSS bundling improvements, dev tools, migration codemods, and documentation work.
- Meta says StyleX is its default styling system across several production products and explains
  its compiler architecture in
  [“StyleX: A Styling Library for CSS at Scale”](https://engineering.fb.com/2025/11/11/web/stylex-a-styling-library-for-css-at-scale/)
  (2025-11-11). This establishes serious production use, but Meta's scale and prior `cx` system are
  not a performance proxy for Noyau.

**Inference.** “Pre-1.0” does not mean experimental or unusable here. It does mean Noyau should
expect API/configuration movement, especially around the exact areas its stack would exercise:
Vite CSS aggregation, theming module resolution, lint/tool integration, and migration tooling.

### Vite, Vite+, and Bun

**Verified fact.**

- StyleX now has an official
  [Vite + React guide](https://stylexjs.com/docs/learn/installation/vite/vite-react) using
  `@stylexjs/unplugin`. It requires the StyleX plugin before the React plugin for Fast Refresh and
  an imported CSS entrypoint for aggregated output.
- The unplugin compiles modules, aggregates rules, and appends them to an emitted CSS asset. It
  exposes development virtual modules for CSS/HMR and supports Vite/Rollup, Webpack/Rspack,
  esbuild, and Bun. Its [Bun instructions](https://stylexjs.com/docs/api/configuration/unplugin/)
  use the esbuild adapter for `Bun.build()` and a Bun entrypoint for the dev server.
- [Vite+ describes itself as a superset/drop-in upgrade to
  Vite](https://voidzero.dev/posts/announcing-vite-plus) and accepts ordinary Vite plugins. No
  StyleX documentation or example specifically names Vite+.
- For Noyau, Bun is currently the package manager and server runtime; the web production build is
  Vite+. The Bun StyleX adapter is therefore not on the critical path.

**Inference.** A local-app StyleX spike should be technically feasible in Noyau's
`lazyPlugins` list, but compatibility with the exact Vite+ `0.2.9`/Rolldown build must be measured,
not assumed from ordinary Vite. If Noyau later bundles the browser app directly with Bun, that is a
separate integration decision.

### Known integration limitations relevant to Noyau

These are not a claim that every StyleX/Vite app is broken. They are open upstream evidence that
the integration is less mature than Noyau's current first-party Tailwind Vite path:

- [#1378](https://github.com/facebook/stylex/issues/1378) (open): unplugin output is appended rather
  than passed through Vite's normal CSS pipeline; the report observed missing minification, and the
  maintainer pointed to `lightningcssOptions`.
- [#1497](https://github.com/facebook/stylex/issues/1497) (open): a Vite development race can crash
  CSS generation when imported `defineConsts` values are used as computed keys. This directly
  intersects reusable breakpoint/container-query constants.
- [#1399](https://github.com/facebook/stylex/issues/1399) (open): Vitest does not compile StyleX
  themes from an external package in the reported setup.
- [#1563](https://github.com/facebook/stylex/issues/1563) (open): the documented
  `externalPackages` option was missing from unplugin TypeScript types in the reported release.
- [#1195](https://github.com/facebook/stylex/issues/1195) (open): `data-style-src` can point to
  intermediate rather than original locations when multiple transforms are involved, including a
  reported Vite/Rollup setup.

Noyau has no external web design-system package today, so the external-package bugs would not block
a local leaf spike. They matter to the exact future package-boundary scenario in which StyleX would
otherwise become more attractive.

## Capability comparison

### Static extraction, runtime, atomic CSS, and conflict resolution

**Verified fact.**

- StyleX restricts `stylex.create` input to statically analyzable literals/expressions and compiled
  dynamic-style functions. The compiler extracts one-declaration atomic rules, deduplicates
  identical declarations, and can compile away local `create` and `props` calls. Styles passed
  across module boundaries retain a
  [small runtime merge](https://stylexjs.com/docs/learn/thinking-in-stylex/).
- `stylex.props` resolves property conflicts deterministically. Depending on configured resolution,
  it handles application order and shorthand/longhand priorities rather than relying on class
  attribute order. See the official
  [compiler explanation](https://engineering.fb.com/2025/11/11/web/stylex-a-styling-library-for-css-at-scale/).
- Tailwind v4 also generates only detected utilities into static CSS and has no client runtime.
  Noyau additionally uses `tailwind-merge` to remove conflicting utility groups. Tailwind's source
  detector reads text, so dynamic fragments such as `` `bg-${color}-600` `` are not supported;
  complete class strings must be present. See Tailwind's official
  [source-detection rules](https://tailwindcss.com/docs/detecting-classes-in-source-files).
- Plain CSS and CSS Modules are static CSS with no style runtime. Vite supports
  [CSS Modules natively](https://vite.dev/guide/features.html#css-modules).

**Inference.** StyleX has the strongest built-in composition contract, especially for style props
crossing component/package boundaries. Tailwind plus `tailwind-merge` is adequate for Noyau's
current local primitives but is not equivalent: class strings are not TypeScript-constrained and
arbitrary CSS relationships can still escape merge semantics.

### TypeScript ergonomics

**Verified fact.**

- StyleX ships generated TypeScript types. `StyleXStyles` and `StyleXStylesWithout` can constrain a
  component's accepted properties and values. Style definitions use CSS property names, so invalid
  properties/values can be caught by types and lint rules. The official limitations note that
  TypeScript cannot reject every unknown extra key in all generic style-prop cases; see
  [static types](https://stylexjs.com/docs/learn/static-types).
- StyleX's compiler still imposes static-analysis rules beyond TypeScript: no arbitrary function
  calls, imported values other than sanctioned `.stylex.*` vars/consts, or object spreads inside
  raw style objects.
- Tailwind class strings are ordinary strings. Editor tooling can complete them, but TypeScript
  does not validate their semantic content. CVA does type Noyau's `variant` and `size` props.
- Noyau uses strict TypeScript 7 with `erasableSyntaxOnly`, though it also enables `skipLibCheck`.
  No primary StyleX source found here promises explicit TypeScript 7 conformance.

**Inference.** StyleX would improve the type contract for component overrides, but it would not
automatically make every style expression type-safe. A spike must prove `stylex.create`,
`StyleXStyles`, dynamic functions, declaration inference, and `.stylex.ts` module resolution under
Noyau's exact TS7/tsgo path.

### Theming and design tokens

**Verified fact.**

- Noyau's current semantic CSS variables are already runtime-readable, cascade naturally, and are
  mapped into Tailwind v4 utilities through `@theme inline`.
- StyleX provides typed
  [`defineVars`](https://stylexjs.com/docs/learn/theming/defining-variables/) groups and
  [`createTheme`](https://stylexjs.com/docs/learn/theming/creating-themes/) subtree overrides.
  Theme APIs are stable, but the required `unstable_moduleResolution` configuration shape may
  change. Theme/constant files obey naming, direct named-import, and export restrictions.
- Tailwind v4 exposes theme values as native CSS variables and supports CSS-first
  [`@theme` configuration](https://tailwindcss.com/docs/theme).

**Inference.** Re-encoding Noyau's 34 semantic color/radius/font/sidebar variables as StyleX vars
would add compiler/module-resolution coupling without unlocking a current requirement. A StyleX
spike should initially consume the existing stable CSS custom-property names. Typed StyleX themes
should be evaluated only when Noyau needs multiple scoped themes or a separately published token
package.

### Conditional, dynamic, responsive, and relational styles

**Verified fact.**

- StyleX supports JavaScript conditionals, variant lookups, nested pseudo states, media queries,
  `@supports`, and `@container`. Truly runtime values use a restricted arrow function; the compiler
  emits a static rule backed by an inline CSS variable. StyleX explicitly says to
  [use dynamic styles sparingly](https://stylexjs.com/docs/learn/styling-ui/defining-styles/).
- Shared media/container strings can use
  [`defineConsts`](https://stylexjs.com/docs/api/javascript/defineConsts), but `defineConsts` is
  involved in the open Vite dev race above.
- [`stylex.when.*`](https://stylexjs.com/docs/api/javascript/when) supports marked
  ancestor/descendant/sibling observation. Look-ahead variants rely on `:has()`, and arbitrary
  global/descendant selectors remain intentionally outside StyleX's component-styling model.
- Tailwind v4 supports complete conditional class maps, arbitrary values and variants, data/ARIA
  selectors, pseudo states, responsive breakpoints, and
  [container queries](https://tailwindcss.com/docs/responsive-design). Runtime values use inline
  styles or CSS variables.
- Plain CSS/CSS Modules preserve the full CSS selector language with the least ceremony.

**Inference.** Most Noyau page styles translate mechanically. Its generated Sidebar and other
group/data/descendant-heavy primitives require real redesign: markers, explicit state props,
conditional local styles, or retained CSS. The unused Chart's third-party Recharts selectors are a
clear CSS Module/global-CSS escape hatch, matching the migration strategy reported by the Linear
engineer.

### Code splitting, caching, SSR, and PWA

**Verified fact.**

- StyleX deliberately optimizes for
  [one small CSS file loaded up front](https://stylexjs.com/docs/learn/thinking-in-stylex/), not
  per-component/per-route StyleX CSS. A request for per-`create` CSS files was
  [declined as contrary to its model](https://github.com/facebook/stylex/issues/679).
- Vite normally performs
  [CSS code splitting](https://vite.dev/config/build-options#build-csscodesplit) for CSS imported
  by async chunks. Noyau currently imports one global Tailwind stylesheet from the main entry, so
  it does not presently exploit route-local CSS splitting.
- StyleX has [`stylex.attrs`](https://stylexjs.com/docs/api/javascript/attrs) for serialized SSR and
  non-React attributes, plus official Vite RSC/SSR examples. The unplugin emits aggregated CSS for
  each output.
- In production with runtime injection disabled, StyleX output is a standard static CSS asset. A
  PWA can cache it like any other versioned build asset. Noyau has not yet implemented its service
  worker or precache policy.

**Inference.** CSR, SSR, and eventual PWA use are not blockers. The single StyleX sheet is neutral
at today's scale, but it trades Vite's potential route-level CSS granularity for long-lived atomic
reuse. A spike must verify that a style-only edit changes the emitted asset hash before relying on
PWA/CDN caching, given the unplugin's historical CSS-append issue.

### Debugging, source maps, linting, and tests

**Verified fact.**

- StyleX production class names are opaque. Compiler `debug` mode adds readable identifiers and
  `data-style-src`; `test` mode emits source-identifying classes without functional styles for
  stable snapshots. See the
  [Babel plugin options](https://stylexjs.com/docs/api/configuration/babel-plugin/).
- StyleX lists an experimental VS Code extension and a Chrome DevTools extension in its
  [ecosystem](https://stylexjs.com/docs/ecosystem). The open source-mapping issue above limits
  confidence in source navigation through multi-transform Vite pipelines.
- The official [`@stylexjs/eslint-plugin`
  rules](https://stylexjs.com/docs/api/configuration/eslint-plugin) validate static styles,
  shorthands, extensions, unused styles, relational selectors, and conflicting `className`/`style`
  props.
- Noyau uses Oxlint through Vite+, not ESLint. Vite+ supports JavaScript lint plugins, but Oxlint
  labels that compatibility layer
  [alpha](https://oxc.rs/docs/guide/usage/linter/js-plugins.html), and StyleX is not on Oxlint's
  published conformance-tested plugin list.
- Current web tests are Node-mode command/config tests; there are no component rendering, browser,
  screenshot, or style tests.

**Inference.** Tailwind is easier to inspect today because utility names remain visible in DOM.
StyleX can provide better source metadata, but Noyau must prove the StyleX ESLint plugin works
inside the root Vite+ `lint.jsPlugins` configuration. Running a separate ESLint pipeline would
violate the repository's single-toolchain convention and is not an acceptable adoption plan.

### CSP

**Verified fact.**

- StyleX production extraction can run with `runtimeInjection: false`, avoiding runtime `<style>`
  insertion. Static styles then work with a restrictive `style-src` that permits the emitted CSS
  asset.
- StyleX dynamic style functions write CSS custom-property values through the element's inline
  `style` prop. A CSP that blocks style attributes therefore also blocks those values unless the
  policy permits them. Tailwind's recommended solution for database/API-driven arbitrary values
  likewise uses inline styles or inline CSS variables; see
  [Tailwind's utility-class guidance](https://tailwindcss.com/docs/styling-with-utility-classes).
- Noyau already uses React inline style objects in Sidebar and an inline `<style>` in the unused
  Chart primitive.

**Inference.** Static StyleX is CSP-friendly, but StyleX does not remove Noyau's existing CSP work.
Adoption should not enable runtime injection in production, and the spike should test the intended
`style-src`/`style-src-attr` policy rather than claiming CSP compatibility from static extraction
alone.

### Package and monorepo boundaries

**Verified fact.**

- StyleX's typed vars and style props are designed to compose across modules/packages.
- Consuming uncompiled StyleX from dependencies requires the compiler to transform those packages.
  The official unplugin documents `externalPackages`, optimize-dependency handling, and a
  treeshake-compensation import. The open Vite/Vitest/type issues above show that this path still
  has rough edges.
- Tailwind v4 can scan an external UI package using
  [`@source`](https://tailwindcss.com/docs/detecting-classes-in-source-files); CSS Modules can ship
  compiled CSS but do not provide StyleX-like typed override contracts by default.
- Noyau intentionally creates a package only for a real, tested boundary. It currently has no
  shared web UI or token package.

**Inference.** StyleX's strongest architectural advantage has no current target in this monorepo.
Creating a design-system package merely to justify StyleX would invert Noyau's package-boundary
rule. Revisit StyleX when an actual second consumer appears.

## Migration surface and ergonomics

### Expected work if Noyau migrated

1. **Build and toolchain**
   - add `@stylexjs/stylex` and `@stylexjs/unplugin` (and likely the StyleX lint plugin);
   - place `stylex.vite()` before React inside `lazyPlugins`;
   - configure CSS layers while Tailwind and StyleX coexist;
   - prove HMR virtual CSS, Vite+ builds, hashes, minification, browser targets, and test mode;
   - integrate StyleX lint rules through Vite+/Oxlint without a parallel config.
2. **Tokens and globals**
   - retain reset/global element rules in `index.css`;
   - either consume current custom properties from StyleX or create constrained `.stylex.ts`
     vars/consts and configure module resolution;
   - decide which system owns cascade layers during coexistence.
3. **Component contracts**
   - replace `className?: string` override APIs with typed StyleX style props where deterministic
     composition is required;
   - replace 18 CVA definitions with typed variant lookups/conditionals;
   - convert `cn()` call sites and dynamic template class maps;
   - avoid StyleX and non-StyleX classes on the same element. StyleX maintainers explicitly
     [discourage mixed class systems](https://github.com/facebook/stylex/issues/155) because doing
     so breaks StyleX's ordering guarantees.
4. **Complex selectors**
   - remodel Sidebar group/data relationships with explicit state and markers;
   - retain CSS Modules/global CSS for third-party DOM selectors such as Recharts;
   - test hover, focus-visible, disabled, mobile, collapsed, data/ARIA, and portal states.
5. **Ecosystem**
   - stop expecting shadcn CLI output to be immediately usable. shadcn's official manual install
     states that its [components are styled with
     Tailwind](https://ui.shadcn.com/docs/installation/manual);
   - manually port every newly pulled or refreshed shadcn primitive.
6. **Verification**
   - add component/browser coverage; current Node tests cannot detect visual or CSS-state
     regressions;
   - preserve keyboard, focus, portal, responsive, and accessibility behavior independently of
     visual parity.

**Recommendation.** Delete unused shadcn source before discussing a migration. It reduces Tailwind
scan/noise today and turns the StyleX estimate from a registry rewrite into an honest product
surface.

### Incremental coexistence

**Verified fact.** The unplugin supports placing StyleX layers relative to reset/base/utility
layers. Linear's practitioner account says their two systems coexist incrementally and CSS Modules
remain an escape hatch.

**Inference.** Coexistence is possible at a subtree/component boundary, not safely as arbitrary
Tailwind and StyleX classes on the same host element. Noyau would need explicit ownership:
Tailwind-owned components accept `className`; StyleX-owned components accept a typed StyleX style
prop; bridge components do not merge both onto one element.

## Decision matrix for Noyau now

Scores are 1 (poor) to 5 (strong). Weights reflect Noyau's current stage, not a universal ranking.

| Criterion | Weight | Tailwind v4 now | CSS Modules/plain CSS | StyleX 0.19 |
| --- | ---: | ---: | ---: | ---: |
| Current-product fit and migration cost | 25% | 5 | 3 | 2 |
| Deterministic composition | 15% | 4 | 3 | 5 |
| Compile-time type safety | 10% | 2 | 3 | 5 |
| shadcn/component ecosystem | 15% | 5 | 3 | 1 |
| Vite+/build maturity and simplicity | 10% | 5 | 5 | 2 |
| Dynamic/complex CSS escape hatches | 10% | 4 | 5 | 3 |
| Future package/design-system scaling | 10% | 3 | 3 | 5 |
| Debugging and current team visibility | 5% | 4 | 5 | 2 |
| **Weighted score / 5** | **100%** | **4.20** | **3.50** | **3.00** |

Interpretation:

- **Tailwind wins now** because it is already installed, first-party integrated, understood by the
  generated components, and sufficient for three pages.
- **CSS Modules are the best supplement**, not the primary rewrite target: native Vite support and
  full selector expressiveness make them suitable for third-party DOM and unusual global cases.
- **StyleX wins the scaling/type/composition columns**, but Noyau is not yet paying the problems
  those strengths solve.

## Risks

| Risk | Likelihood now | Impact | Mitigation |
| --- | --- | --- | --- |
| Migration regressions in responsive/data/portal states | High | High | Prune scope; browser/visual state matrix; migrate leaves first |
| Vite+ HMR/CSS pipeline mismatch | Medium | High | Isolated spike; style-only hash and repeated-HMR tests |
| Loss of shadcn update velocity | High | Medium-high | Stay on Tailwind, or explicitly fund permanent manual ports |
| StyleX pre-1.0/config churn | Medium | Medium | Pin exact versions; revisit after 1.0 and roadmap closure |
| Lint rules unavailable in Vite+/Oxlint | Medium | Medium-high | Prove JS-plugin compatibility; do not add parallel ESLint config |
| Mixed Tailwind/StyleX cascade bugs | Medium-high during migration | High | Component-boundary ownership; no mixed class systems per element |
| CSS payload/runtime “win” fails to materialize | High | Medium | Establish baseline; require measured improvement, not vendor claims |
| Dynamic StyleX variables violate intended CSP | Medium | High if CSP is strict | `runtimeInjection: false`; minimize dynamic styles; CSP browser test |
| Single StyleX CSS asset weakens future route granularity | Low now | Medium later | Measure actual CSS; revisit if route payloads become material |
| External package/Vitest compilation fails later | Medium | High for a design system | Gate package extraction on upstream fixes and a consumer test fixture |

## Recommendation, confidence, and revisit triggers

### Recommendation

**Keep Tailwind CSS v4.3.3. Do not start a StyleX migration.**

Near-term styling work should instead:

1. remove unused shadcn primitives and their unused dependencies;
2. keep semantic tokens as CSS custom properties;
3. continue CVA for finite variants and `cn()`/`tailwind-merge` for override normalization;
4. introduce CSS Modules only where Tailwind strings become poor representations of selectors or
   where third-party DOM must be styled;
5. add browser-level coverage before changing the styling architecture.

This is an explicit “not now,” not a rejection of StyleX.

### Confidence

**0.88 (high).** The local migration surface, current absence of runtime CSS generation, official
shadcn/Tailwind coupling, and open StyleX Vite integration issues are directly evidenced. The main
uncertainty is future Noyau scale: a shared multi-app design system could legitimately reverse the
decision.

### Revisit when at least one product trigger and the ecosystem trigger hold

Product triggers:

- a real shared UI/token package has at least two independent app consumers;
- recurring composition/specificity defects are measured (for example, three or more confirmed
  style-override defects in a quarter);
- component APIs need enforceable typed style-property contracts across teams/packages;
- measured style-related CPU, stylesheet transfer, or invalidation exceeds an agreed performance
  budget;
- shadcn-generated source is no longer a strategic input;
- the active, reachable UI surface grows enough that utility-string review/refactoring is a
  demonstrated bottleneck, not just aesthetically disliked.

Ecosystem trigger:

- StyleX reaches 1.0 or documents the intended stability contract; and
- the relevant Vite CSS-pipeline/HMR/source-map issues are fixed or Noyau's spike proves they do not
  affect its pinned Vite+ toolchain; and
- StyleX lint rules pass under Noyau's Vite+/Oxlint configuration.

## Low-risk spike plan

Run this only if adoption remains interesting. Keep it isolated and disposable; do not convert the
Sidebar or global tokens first.

### Scope

1. Baseline the current build for one leaf primitive and one page slice: emitted JS/CSS bytes
   (raw and gzip), style-only rebuild behavior, `vp check`, tests, and browser states.
2. Implement the same small component three ways on an experiment branch:
   - existing Tailwind/CVA;
   - StyleX local `create` plus a typed style prop;
   - CSS Module plus typed React variants.
3. Keep existing CSS custom properties; do not enable StyleX `defineVars` in the first pass.
4. Use `runtimeInjection: false` in production. Integrate StyleX before React, within
   `lazyPlugins`, and try the StyleX lint plugin through Vite+ `lint.jsPlugins`.
5. Exercise one conditional variant, one responsive rule, hover, focus-visible, disabled state,
   one dynamic value, and one consumer override. Do not mix Tailwind and StyleX on the same element.

### Measurable acceptance criteria

- `bun run check`, `bun run test`, and `bun run build` all pass with no extra standalone lint,
  format, or test config.
- Twenty consecutive style-only HMR edits apply without a dev-server restart, stale rule, duplicate
  rule, or unresolved-constant error.
- A production style-only change changes the CSS asset hash and is visible after a simulated
  cache-first reload.
- Extracted StyleX CSS is minified and passes through the intended browser-target transform; no
  production runtime style injection is present.
- The TS7 compiler accepts local styles, typed override props, dynamic functions, and any exported
  types without suppressions beyond the repo's existing `skipLibCheck`.
- StyleX's core lint rules execute through Vite+/Oxlint. If they cannot, the spike fails rather than
  adding ESLint.
- Browser screenshots at narrow and desktop widths match the baseline for default, hover,
  focus-visible, disabled, and variant states; keyboard and accessibility checks remain green.
- Under the intended CSP, static styles work. The dynamic-value case is either allowed by policy or
  explicitly rejected and replaced with a static/conditional design.
- Route CSS+JS gzip size does not regress by more than 5% for the spike slice. Any performance-win
  claim requires repeated browser traces with a documented fixture, hardware, sample count, and
  variance; bundle size alone is not a runtime result.
- The spike records touched files and the number of handwritten style declarations. It must show a
  clear maintainability or correctness advantage over both Tailwind and CSS Modules, not merely
  syntax preference.

Failure of any toolchain, caching, lint, or CSP criterion is a stop signal. Visual syntax preference
is not sufficient to proceed.

## Benchmark assessment

No reproducible Tailwind-vs-StyleX benchmark applicable to Noyau was found.

- Meta's reported 80% CSS reduction compares Facebook's new atomic system with its own old
  large-scale CSS/cx architecture. The
  [2020 Facebook rebuild account](https://engineering.fb.com/2020/05/08/web/facebook-redesign/)
  gives useful mechanism and scale context but is not a Tailwind baseline.
- Tailwind's official v4 post reports median results on Tailwind's own Catalyst project:
  378 ms → 100 ms full build, 44 ms → 5 ms incremental with new CSS, and 35 ms → 192 µs when no new
  CSS is needed. The post identifies the project and medians but does not make this a StyleX
  comparison; see [Tailwind CSS v4.0](https://tailwindcss.com/blog/tailwindcss-v4).
- Linear's ~30% navigation-render result compares an incremental styled-components migration with
  StyleX and does not disclose enough protocol to reproduce or transfer the number.
- PkgPulse's “typical bundle,” `<100 ms`, `15 KB runtime`, and setup-time ranges lack a common
  fixture and reproducible commands, and parts contradict each other or current APIs.
- StyleX's repository has internal compiler and bundle-size benchmarks, but those guard StyleX
  changes against StyleX baselines; they do not establish end-user superiority over Tailwind.

**Recommendation.** If performance becomes a reason to migrate, measure Noyau itself. Compare
production artifacts and browser traces with identical DOM, React state, routes, browser,
hardware, cache state, and sample protocol. Do not compare vendor benchmark tables with different
fixtures.

## Source quality and limitations

| Source | Class | Used for | Limitation |
| --- | --- | --- | --- |
| [StyleX official docs](https://stylexjs.com/docs/learn/) | Primary | APIs, constraints, Vite, types, themes, runtime model | Project-authored; describes intended behavior |
| [StyleX npm metadata](https://www.npmjs.com/package/@stylexjs/stylex) | Primary registry metadata | Current published version/date/dependencies | Downloads are not product adoption; not used for the decision |
| [StyleX GitHub](https://github.com/facebook/stylex) | Primary | Activity, issues, v1 roadmap, implementation limitations | Individual issues are reports, not universal incidence |
| [Meta Engineering StyleX deep dive](https://engineering.fb.com/2025/11/11/web/stylex-a-styling-library-for-css-at-scale/) | Primary vendor engineering | Architecture and Meta migration context | Meta-scale results are not Noyau benchmarks |
| [Tailwind v4 official post](https://tailwindcss.com/blog/tailwindcss-v4) and [docs](https://tailwindcss.com/docs/) | Primary | v4 engine, Vite plugin, tokens, source detection, queries | Vendor benchmark uses its own project |
| [shadcn manual install](https://ui.shadcn.com/docs/installation/manual) | Primary | Tailwind dependency and generated-source workflow | Does not evaluate StyleX |
| [Vite CSS docs](https://vite.dev/guide/features.html#css) | Primary | CSS Modules and code splitting | Ordinary Vite behavior still needs verification in pinned Vite+ |
| [Vite+ docs](https://viteplus.dev/config/) | Primary | Vite compatibility, unified config, Oxlint | Young toolchain; no StyleX-specific example |
| [Kenneth Skovhus's Linear migration account](https://www.skovhus.dev/blog/moving-linear-from-styled-components-to-stylex) | First-person practitioner; secondary to Linear corporate docs | What Linear migrated from, process, self-reported result | Personal domain; no raw benchmark protocol/data |
| [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) | Primary company source | Cross-check of public Linear theming context | Does not document the StyleX migration |
| [PkgPulse comparison](https://www.pkgpulse.com/guides/stylex-vs-tailwind-2026) | Secondary, low confidence | Supplied-premise audit only | Stale methodology, unsupported numbers, contradictory/runtime and obsolete API claims |

## Final decision record

| Field | Decision |
| --- | --- |
| Adopt StyleX now? | **No** |
| Keep | Tailwind CSS v4 + `@tailwindcss/vite`, CSS custom-property tokens, CVA, `cn()` |
| Add selectively | Plain CSS/CSS Modules for third-party DOM or selector-heavy exceptions |
| Immediate cleanup | Remove unused shadcn primitives/dependencies before revisiting styling architecture |
| Main reason | Migration/build/ecosystem cost exceeds unmeasured benefit at Noyau's current scale |
| Confidence | **0.88 / high** |
| Revisit | Real shared UI package or measured style problems, plus mature/proven StyleX Vite+ path |
| If curious | Run the bounded spike above; do not begin an incremental migration |
