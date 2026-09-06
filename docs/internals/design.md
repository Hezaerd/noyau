# Noyau design system

> For maintainers. This is the visual and interaction contract for every Noyau client surface.

Noyau is a focused workbench for long-running agent work. The interface is calm, compact, and
spatially clear. Translucent material gives the shell depth while content remains quiet and easy to
scan. The violet palette identifies Noyau without tinting every surface.

This page is normative. New UI follows these rules. When the product needs a new pattern, extend the
shared primitive and this page in the same change instead of creating a local exception.

## Invariants

1. Content wins over atmosphere. Glass establishes hierarchy; it never lowers legibility.
2. One region has one obvious emphasis. Primary color, elevation, and motion do not compete.
3. The same action has the same component, label, state treatment, and keyboard behavior everywhere.
4. Light, dark, narrow, wide, mouse, keyboard, touch, web, and desktop are states of one system.
5. Decoration is static. Noyau does not continuously repaint gradients, noise, glow, or blur.
6. Every way in has a way out and a visible current state.

## Visual character

Noyau feels precise, quiet, and slightly luminous. It uses:

- a cool neutral foundation with violet as the identity and action color;
- a single low-contrast ambient field behind the application;
- frosted shell surfaces with hairline borders and restrained highlights;
- solid or nearly solid reading surfaces for long text, code, forms, and external content;
- compact controls, generous page gutters, and clear typographic rhythm;
- short, purposeful transitions with no ornamental looping animation.

Avoid neon glows, rainbow gradients, heavy drop shadows, blur on every card, oversized headings,
pill-shaped controls by default, and translucent text.

## Material hierarchy

Materials communicate containment and elevation. Choose the lowest tier that separates the region.

| Tier | Recipe | Use | Do not use |
|---|---|---|---|
| 0 | `app-backdrop` | The one ambient field behind the application | Cards, sections, or overlays |
| 1 | `surface-canvas` | The main page plane | Floating elements or nested cards |
| 2 | `surface-chrome` | Persistent navigation and title bars | Repeated content containers |
| 3 | `surface-panel` | Board columns and the workspace panel | Every settings row or transcript item |
| 4 | `surface-overlay` | Dialogs, sheets, menus, selects, and autocomplete | Inline content |
| Reading | Semantic solid color | Code, dense text, form controls, and browser guests | Decorative shell chrome |

The canvas is translucent but does not blur. Chrome, panels, and overlays blur what is directly
behind them. This keeps nested filters from flattening the image or increasing GPU cost.

### Glass rules

- Put the ambient field on the application root exactly once.
- Do not place a backdrop-filter inside an ancestor that already has a backdrop-filter.
- A glass surface needs a visible border or inner highlight. Transparency alone is not an edge.
- Persistent chrome uses the sidebar color family. Panels use `card`. Floating surfaces use
  `popover`.
- Floating surfaces are more opaque and more elevated than persistent surfaces.
- Keep the content plane visually dominant. The backdrop may be perceptible, never distracting.
- Blur is progressive: panel < chrome < overlay. Opacity is progressive in the opposite direction
  where text density requires it.
- Unsupported backdrop-filter environments receive the corresponding opaque semantic color.
- Never lower text opacity to make a surface feel more transparent.

## Color

Color tokens are semantic roles, not a palette to sample ad hoc.[1]

| Role | Meaning |
|---|---|
| `background` / `foreground` | Page plane and primary content |
| `card` / `card-foreground` | Contained content |
| `popover` / `popover-foreground` | Floating content |
| `primary` / `primary-foreground` | The single primary action or current identity |
| `secondary` | Lower-emphasis filled controls |
| `muted` / `muted-foreground` | Supporting regions and metadata |
| `accent` / `accent-foreground` | Hover, active, and selection feedback |
| `border`, `input`, `ring` | Separation, field boundaries, and keyboard focus |
| `info`, `success`, `warning`, `destructive` | Status with fixed meaning |
| `sidebar-*` | Persistent navigation chrome only |
| `code` / `code-foreground` | Code reading surfaces |

Rules:

- Use semantic tokens in product UI. Do not use raw neutral colors or theme-specific branches in a
  feature component.
- A raw color is allowed only when the color is user-authored data, such as a board column marker.
- Status color reinforces an icon and label. Color is never the only carrier of state.
- Use `primary` sparingly. One region normally has at most one filled primary action.
- Use `destructive` only for irreversible or materially harmful actions.
- Muted text remains readable. Do not compound a muted token with low opacity for body copy.
- Light and dark themes preserve role and hierarchy; they do not need to be numeric inversions.

## Typography

Inter is the interface and heading family. The platform monospace stack is for code, paths, hashes,
commands, and machine identifiers.[2]

| Role | Size / line height | Weight | Use |
|---|---|---|---|
| Display | 36 / 40 | 600 | Empty-state or first-run hero only |
| Page title | 24 / 30 | 600 | One per major page |
| Overlay title | 20 / 24 | 600 | Dialog or sheet title |
| Section title | 18 / 24 | 600 | Major page section |
| Control / body | 14 / 20 | 400–500 | Default interface text |
| Supporting | 13 / 19 | 400 | Descriptions and secondary prose |
| Label | 12 / 16 | 500–600 | Compact labels, badges, and table headers |
| Micro | 11 / 14 | 500 | Counts and terse metadata only |

Use negative tracking only on titles: approximately `-0.04em` for page titles, `-0.025em` for
sections, and `-0.005em` for labels. Body text uses normal tracking. Sentence case is the default.
Do not use all caps except for a conventional short file or provider marker.

Long-form transcript text uses a comfortable line height and a bounded reading measure. Dense
board and settings UI may be compact, but never below 11 px.

## Spacing and density

The base unit is 4 px. Use this sequence for intentional spacing:

`4, 8, 12, 16, 24, 32, 48, 64`

Prefer `12` inside compact controls, `16` inside ordinary containers, `24` inside overlays, and
`32–48` between page sections. A one-off value is acceptable for platform chrome or optical
alignment, not ordinary layout.

Control heights are:

| Size | Fine pointer | Coarse pointer | Use |
|---|---:|---:|---|
| `xs` | 24 | 44 target | Inline and title-bar actions |
| `sm` | 28 | 44 target | Dense toolbars |
| `default` | 32 | 44 target | Standard controls |
| `lg` | 36 | 44 target | Prominent forms |
| `xl` | 40 | 44 target | Rare primary actions |

The visible control may stay compact on touch hardware, but its interactive target is at least
44 by 44 px. Existing Button variants implement this through a coarse-pointer pseudo-element.[3]

## Shape and borders

The base radius is 10 px. Derived radii keep nested shapes concentric.[2]

| Token | Result | Use |
|---|---:|---|
| `radius-sm` | 6 px | Menu items and small chips |
| `radius-md` | 8 px | Compact controls and tooltips |
| `radius-lg` | 10 px | Buttons, fields, and ordinary cards |
| `radius-xl` | 14 px | Composer and prominent panels |
| `radius-2xl` | 18 px | Dialogs, sheets, and board columns |

Use fully rounded shapes for avatars, status dots, counts, and short badges. Do not turn ordinary
buttons, navigation rows, fields, or cards into pills.

Borders are one physical pixel and use semantic `border` or `input`. Glass borders use
`--material-border`. A selected container uses a primary border plus a subtle ring; it does not need
a second filled background.

## Elevation

Elevation is categorical:

- flat: separators and solid reading regions;
- panel: `--elevation-panel` for contained surfaces above the canvas;
- overlay: `--elevation-overlay` for content that floats above interaction context.

Do not invent component-local shadow values. Inner highlights communicate material; outer shadows
communicate elevation. Dark mode uses less highlight and a deeper, broader shadow.

## Layout

The application shell has three horizontal regions: sidebar, primary content, and optional workspace
panel.[4] The title bar stays aligned with the primary content and reserves native desktop controls.

- Sidebar width is stable. Collapse changes navigation availability, not the page grid.
- The primary content owns remaining width and must allow `min-width: 0`.
- The workspace panel is resizable and never changes the meaning of the primary page.[5]
- Page headers remain compact. Page-specific tools live below the desktop title bar unless they are
  true global actions.
- Long content scrolls inside its region. The application window does not become the scroll owner.
- Use a centered reading measure for prose and settings. Use available width for boards, diffs, and
  browser content.

At narrow widths the sidebar becomes a sheet, multi-column rows stack, and secondary labels may
collapse. Actions remain reachable; hiding a label requires an accessible name and usually a
tooltip.

## Interaction states

Every interactive primitive defines the applicable states:

1. Rest
2. Hover
3. Pressed or open
4. Keyboard focus
5. Selected or current
6. Disabled
7. Loading
8. Invalid, warning, or destructive

Hover is a preview, pressed is immediate feedback, selected persists, and focus is independent of
all three. Never use hover styling as the only selected state.

Focus uses the semantic ring with a visible two-pixel indicator or a three-pixel field halo. Do not
remove focus treatment unless a parent composite provides the replacement. Disabled controls keep
their label visible, lose elevation, and do not respond to pointer input. Loading controls preserve
their dimensions and accessible name.

## Motion

Motion explains cause and continuity. It does not decorate idle UI.

| Token | Duration | Use |
|---|---:|---|
| `--motion-fast` | 120 ms | Color, opacity, and small control feedback |
| `--motion-standard` | 200 ms | Sidebar, sheet, panel, and layout transitions |
| `--motion-slow` | 320 ms | Rare success or recovery cues |

Use `--ease-standard` for movement already on screen and `--ease-enter` for new floating content.
Animate only `transform`, `opacity`, or a necessary layout dimension. A transition must be
interruptible. Reduced-motion mode collapses animations to effectively immediate state changes.[2]

No ambient gradient, glass highlight, spinner, or mascot motion may repaint continuously. A spinner
is allowed only while progress is genuinely indeterminate.

## Components

Shared primitives in `apps/web/src/components/ui` own geometry, material, states, and accessibility.
Feature components compose them and supply meaning.[6]

### Buttons and actions

- Filled primary: the main forward action in a region.
- Secondary: an available action with lower emphasis.
- Outline: a neutral action needing a visible boundary.
- Ghost: toolbar, navigation, and repeated row actions.
- Link: navigation in prose, not a substitute for every low-emphasis button.
- Destructive: the confirming action after consequences are clear.

Use icon-only buttons only for established symbols. Give each an accessible name and a tooltip when
the label is not visible. Lucide icons are 16 px on fine pointers and 18 px on coarse pointers, use
the library's default stroke, and sit at 80% opacity until the action is emphasized.

### Inputs

Labels are visible for settings and forms. Placeholder text is an example or hint, never the only
label. Validation appears beside the field and connects through accessible description. Preserve the
user's input after recoverable failure.

Fields are solid reading islands. They may use a lightly translucent fill in dark mode, but they do
not blur independently.

### Navigation

Current location uses persistent accent fill, foreground text, and medium weight. Hover uses the same
hue at lower commitment. Counts and status stay secondary. Project and Thread names truncate in the
row and reveal the full value through available detail UI.

### Overlays

Menus, selects, autocomplete, popovers, dialogs, and inset sheets share `surface-overlay`. Menus are
compact and action-first. Dialogs are for consequential decisions or focused input. Sheets retain
page context. Backdrops dim and lightly blur the application without erasing it.[7]

An overlay has one obvious dismiss path, Escape support, contained focus, and restored focus on
close. A destructive confirmation names the object and consequence.

### Content and data

Transcript messages are not individually elevated unless interaction requires a boundary. Code uses
the `code` surface, monospace type, and copy action. Tables align comparable values and preserve a
horizontal escape path on narrow screens. Empty states explain what is absent and offer one useful
next action.

Board columns use `surface-panel`; ticket cards are quieter children. Drag state reduces the source
without making it disappear, and the destination changes both border and fill.[8]

### Feedback

Use inline validation for a field, a banner for a degraded region, a page state when no usable data
exists, and a toast for brief action results. Success, warning, and failure each pair status color
with an icon and plain-language message. Skeletons match final geometry. Do not show a spinner and a
skeleton for the same wait.

## Accessibility requirements

- Body and control text meet at least 4.5:1 contrast against the composited surface in both themes.
- Large text and meaningful non-text UI meet at least 3:1.
- Glass is tested against the lightest and darkest parts of the ambient field, not only its average.
- Keyboard order follows visual order. All actions are reachable without a pointer.
- Focus remains visible over every material tier.
- Touch targets are at least 44 by 44 px.
- Information is not encoded by color, position, motion, or translucency alone.
- Zoom and text expansion do not hide actions or require two-dimensional page scrolling.
- Reduced motion removes non-essential movement without removing state feedback.
- Icons without visible text have accessible names; decorative icons are hidden from assistive
  technology.

## Product language

Use direct, calm English. Name Noyau concepts consistently: Project, Thread, Board, Ticket, agent,
provider, environment, and turn. Button labels begin with a verb. Confirmations describe the object
and effect. Errors say what happened and what the user can do next. Avoid enthusiasm, blame,
implementation details, and generic labels such as “OK” when a precise action fits.

## Building and extending the system

Use this order when adding UI:

1. Start with the information hierarchy and keyboard flow.
2. Reuse a shared primitive.
3. Select a semantic color role and material tier.
4. Apply the spacing, type, and radius scales.
5. Define every applicable interaction and reverse state.
6. Check narrow and wide layouts, both themes, reduced motion, and coarse pointers.
7. If a reusable need is missing, extend the primitive and document the rule here.

Do not add a feature-local `glass`, button, field, menu, dialog, tooltip, badge, or status recipe.
Do not copy a long utility string from another feature. Promote the shared behavior instead.

## Review gate

A user-visible change is ready only when all applicable answers are yes:

- Does the hierarchy remain clear without color?
- Is the material tier appropriate, with no nested backdrop filters?
- Are semantic tokens used instead of raw theme colors?
- Does typography come from the documented scale?
- Does spacing use the base sequence?
- Are hover, pressed, focus, selected, disabled, loading, error, and reverse states covered?
- Are labels, icons, shortcuts, and accessible names consistent at every entry point?
- Does it work in light and dark themes, at narrow and wide widths, and with reduced motion?
- Does it remain readable with long names, empty data, loading data, and failure data?
- Does the same behavior exist in web and desktop, or is the platform difference deliberate?
- Was the smallest relevant automated check run?
- For a requested visual pass, was the integrated client inspected once after the change?

## Where it lives

Color roles live in the Noyau color token sheet.[1] Global typography, radius, motion, material,
elevation, and fallback recipes live in the application stylesheet.[2] Shared UI primitives consume
those roles.[6] Shell composition selects materials for the sidebar, title bar, primary canvas, and
workspace panel.[4][5]

[1]: ../../apps/web/src/styles/coss-color-tokens.css
[2]: ../../apps/web/src/index.css
[3]: ../../apps/web/src/components/ui/button.tsx
[4]: ../../apps/web/src/components/RootLayout.tsx
[5]: ../../apps/web/src/components/workspace-panel/WorkspacePanel.tsx
[6]: ../../apps/web/src/components/ui/
[7]: ../../apps/web/src/components/ui/dialog.tsx
[8]: ../../apps/web/src/pages/BoardPage.tsx
