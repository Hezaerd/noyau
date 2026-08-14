# Migration de base-nova vers coss ui

Date de l'étude : 14 août 2026.

## Conclusion

coss ui est un registre **copy/paste** pour le CLI shadcn, fondé sur Base UI et Tailwind CSS v4 ;
ce n'est pas un remplacement npm de `@shadcn/react`. Le socle technique de `apps/web` est déjà
compatible (React 19, Tailwind 4, Base UI), mais les composants coss ne sont pas une substitution
fichier pour fichier : plusieurs noms de fichiers, compositions et API changent. La migration doit
donc être faite composant par composant, avec typecheck après chaque lot, et non avec un écrasement
aveugle des 53 primitives.

Sources : [introduction coss](https://coss.com/ui/docs),
[démarrage](https://coss.com/ui/docs/get-started),
[guide de migration](https://coss.com/ui/docs/radix-shadcn-migration).

## Configuration exacte du registre

Conserver le schéma, `style: "base-nova"`, les alias, `rsc: false` et le chemin CSS actuels ; ajouter
seulement le registre :

```json
{
  "registries": {
    "@coss": "https://coss.com/ui/r/{name}.json"
  }
}
```

Cette URL est celle du
[`components.json` de référence T3 Code](https://github.com/pingdotgg/t3code/blob/main/apps/web/components.json).
Ses autres choix (`base-mira`, zinc, Lucide, alias `~/`) sont propres à T3 Code et ne sont pas des
prérequis coss. Le registre coss fournit cependant des imports Lucide dans certains composants ;
Lucide doit donc être une dépendance même si Noyau conserve Phosphor pour ses icônes applicatives.

## Commandes Bun

À lancer depuis `apps/web` après avoir ajouté le registre :

```bash
# Migration progressive recommandée
bunx --bun shadcn@latest add @coss/button
bunx --bun shadcn@latest add @coss/dialog

# Toutes les primitives, sans imposer le thème complet
bunx --bun shadcn@latest add @coss/ui

# Toutes les primitives et les couleurs neutres
bunx --bun shadcn@latest add @coss/ui @coss/colors-neutral

# Thème complet : primitives, couleurs, sidebar, fontes et styles de base
bunx --bun shadcn@latest add @coss/style

# Connaissance coss pour les agents ; optionnel, aucun effet runtime
bunx --bun skills add cosscom/coss
```

Ce sont les équivalents Bun des commandes officielles
[`shadcn add`](https://coss.com/ui/docs/get-started) et
[`skills add`](https://coss.com/ui/docs/skills). `init @coss/style` est destiné à un nouveau projet ;
pour ce projet existant, utiliser `add`. Ne pas ajouter `--overwrite` à un lot global avant d'avoir
isolé les composants locaux non fournis par coss.

## Dépendances

Le registre [`@coss/style`](https://coss.com/ui/r/style.json) déclare :

- runtime : `@base-ui/react`, `class-variance-authority`, `lucide-react` ;
- développement : `tw-animate-css` ;
- registres transitifs : utilitaire `cn`, toutes les primitives et les fontes.

L'agrégat [`@coss/ui`](https://coss.com/ui/r/ui.json) installe les dépendances de chaque primitive.
Sur l'ensemble actuel, les dépendances externes supplémentaires sont `@base-ui/react`,
`lucide-react` et `@daypicker/react`; le calendrier confirme explicitement ce dernier paquet et a
remplacé `react-day-picker`
([documentation Calendar](https://coss.com/ui/docs/components/calendar.md)).

Dans `apps/web/package.json`, Base UI, CVA, `clsx`, `tailwind-merge`, `tw-animate-css`, React 19 et
Tailwind 4 sont déjà présents. Les ajouts réellement nécessaires sont donc :

- `lucide-react` pour les icônes internes copiées depuis coss ;
- `@daypicker/react` seulement lors du remplacement du calendrier.

Le preset de fontes référence `@fontsource-variable/inter` pour Inter et `geist` pour Geist Mono
([font sans](https://coss.com/ui/r/font-sans.json),
[font mono](https://coss.com/ui/r/font-mono.json)). Son automatisation documentée parle de
`layout.tsx`/`next/font`; dans cette application Vite, mieux vaut conserver/configurer les variables
CSS `--font-sans`, `--font-heading` et `--font-mono` explicitement.

Ne pas supprimer immédiatement `@phosphor-icons/react`, `react-day-picker`, `input-otp`, `sonner` ou
les dépendances des composants locaux : ils restent nécessaires tant que leurs consommateurs n'ont
pas migré. Une fois le dernier composant base-nova remplacé, supprimer `@shadcn/react` et son import
CSS.

## Feuille de style

Pour le flux registre/copy-paste, il n'existe pas d'import CSS coss à substituer à
`shadcn/tailwind.css`. Le début de `src/index.css` doit à terme être :

```css
@import "tailwindcss";
@import "tw-animate-css";
```

Puis supprimer :

```css
@import "shadcn/tailwind.css";
```

Le CLI fusionne directement les variables et règles du
[`@coss/style`](https://coss.com/ui/r/style.json) dans la feuille globale. Le dépôt coss exporte
aussi `@coss/ui/globals.css` dans son
[package interne](https://github.com/cosscom/coss/blob/main/packages/ui/package.json), mais ce n'est
pas le mode d'installation documenté pour le registre et il ne faut pas ajouter cet import sans
installer/maintenir ce package.

Si la palette sombre Noyau est conservée, ne pas laisser le preset remplacer `:root` en thème clair.
Fusionner au minimum les tokens coss absents :
`--destructive-foreground`, `--info[-foreground]`, `--success[-foreground]`,
`--warning[-foreground]`, `--font-mono`, leurs entrées `@theme inline`, et les animations requises
par les composants copiés. La
[documentation Styling](https://coss.com/ui/docs/styling) demande aussi `position: relative` sur le
`body` et `isolation: isolate` sur la racine applicative pour que les portails Base UI passent
correctement au-dessus du contenu.

## Compatibilité des composants et API

Le code Noyau est déjà sur Base UI et utilise souvent `render`, donc la conversion générale
`asChild` → `render` est largement acquise. Les écarts restants sont néanmoins structurants :

| Actuel | coss | Conséquence |
| --- | --- | --- |
| `dropdown-menu.tsx` | `menu.tsx` | Les exports `DropdownMenu*` restent des alias, mais le chemin de fichier change ; préférer `Menu*`, `MenuPopup` et `onClick`. |
| `hover-card.tsx` | `preview-card.tsx` | Les anciens noms sont des alias, pas l'ancien chemin d'import. |
| `input-otp.tsx` | `otp-field.tsx` | Nouveau nom et suppression de la dépendance `input-otp`. |
| `button-group.tsx` | `group.tsx` | `ButtonGroup*` reste compatible, mais `Group*` est l'API préférée. |
| `DialogContent` / `SheetContent` | `DialogPopup` / `SheetPopup` | Alias conservés ; coss ajoute `DialogPanel`/`SheetPanel` pour le corps scrollable. |
| `SelectContent` | `SelectPopup` | Alias conservé, mais coss recommande de fournir `items` au root avant hydratation. |
| Command actuel | Command coss | Réécriture obligatoire : popup explicite, root `Command`, tableau `items`, render functions/`CommandCollection`; la composition `CommandItem onSelect` actuelle n'est pas l'API documentée. |
| `sonner.tsx` | `toast.tsx` | API différente : providers Base UI et `toastManager`, pas `Toaster`/`toast()` Sonner. |
| Slider scalaire shadcn | tableau Base UI | `value={[50]}` et callback `number[]`, y compris pour un seul thumb. |
| ToggleGroup shadcn | ToggleGroup Base UI | `type="multiple"` devient `multiple`; les valeurs restent des tableaux. |

Sources : [guide général et renommages](https://coss.com/ui/docs/radix-shadcn-migration),
[Menu et alias](https://coss.com/ui/docs/components/menu.md),
[Dialog](https://coss.com/ui/docs/components/dialog.md),
[Sheet](https://coss.com/ui/docs/components/sheet.md),
[Select](https://coss.com/ui/docs/components/select.md),
[Command](https://coss.com/ui/docs/components/command.md),
[Toast](https://coss.com/ui/docs/components/toast.md).

Enfin, le catalogue coss ne fournit pas plusieurs fichiers présents localement, notamment
`aspect-ratio`, `attachment`, `bubble`, `carousel`, `chart`, `direction`, `item`, `marker`,
`menubar`, `message*`, `native-select`, `navigation-menu`, `questionnaire`, `resizable` et
`sonner`. Il faut les conserver, les adapter à la nouvelle palette, ou les remplacer séparément.

## Effect Atom

Effect Atom ne fait **pas** partie de coss ui. Dans la terminologie coss, un « atom » est un futur
niveau de composant connecté à des API, au-dessus des primitives et particles ; la roadmap indique
encore « Introduce atoms »
([introduction](https://coss.com/ui/docs),
[roadmap](https://coss.com/ui/docs/roadmap)). Le
[`package.json` source de coss ui](https://github.com/cosscom/coss/blob/main/packages/ui/package.json)
ne dépend ni d'Effect ni d'Effect Atom.

`@effect/atom-react` apparaît dans le
[`package.json` de T3 Code](https://github.com/pingdotgg/t3code/blob/main/apps/web/package.json),
mais son `components.json` ne fait que configurer le registre : ces deux choix sont indépendants.
Cette migration ne doit donc ni ajouter Effect Atom, ni déplacer l'état React local vers Effect.
La dépendance `effect` déjà présente dans Noyau relève de ses frontières de control plane, pas de
coss ui.

## Ordre recommandé

1. Ajouter `@coss` dans `components.json`, sans copier la configuration T3 Code entière.
2. Migrer les primitives simples réellement consommées (`button`, `badge`, `avatar`, `input`,
   `label`, `separator`, `progress`, `textarea`) avec une commande par lot.
3. Migrer ensuite overlays et navigation (`dialog`, `sheet`, `tooltip`, `sidebar`, `menu`) et
   appliquer l'isolation de la racine.
4. Réécrire `select` et surtout `command` à leurs API coss.
5. Fusionner les tokens coss dans la palette sombre, retirer `shadcn/tailwind.css`, puis nettoyer
   uniquement les dépendances devenues sans consommateur.
