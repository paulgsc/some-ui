# @some-ui/styles

Shared design system for the some-ui monorepo — a shadcn-flavored token set,
themes, and a **UnoCSS** preset.

The goal: make browser-extension CSS ergonomic to _author_ without shipping a
CSS engine to the _runtime_.

## The model

```
 dev time  ──────────────────────────────►  build time  ──►  runtime
 author `bg-primary`, `btn-primary`, …       UnoCSS CLI       plain static .css
 (IntelliSense, shortcuts, tokens)           compiles them    + tokens.css
                                             to atomic CSS     (no engine)
```

UnoCSS runs **at build time** and emits only the utilities you actually used.
Extensions ship that static stylesheet plus the design tokens — no Tailwind
runtime, no engine, no scanning in the browser.

## What's in here

| Export                                    | What it is                                              |
| ----------------------------------------- | ------------------------------------------------------- |
| `@some-ui/styles`                         | JS API — `presetSomeUi`, `defineSomeUiConfig`, `themes` |
| `@some-ui/styles/preset`                  | The UnoCSS preset                                       |
| `@some-ui/styles/config`                  | `defineSomeUiConfig()` factory                          |
| `@some-ui/styles/tokens.css`              | Framework-agnostic design tokens (`:root` + `.dark`)    |
| `@some-ui/styles/themes.css`              | Color themes (`.theme-blue`, …)                         |
| `@some-ui/styles/themes/*`                | App themes (`scheduler`, `code`, …)                     |
| `@some-ui/styles/tailwind.css`            | Tailwind v4 entry (existing surface / Storybook)        |
| `@some-ui/styles/styles-build`            | `StyleContext` type — the per-workspace declaration     |
| `@some-ui/styles/styles-build/compile`    | `compileStyles()` — the single-pass compiler core       |
| `@some-ui/styles/styles-build/dev-config` | `createStyleConfig()` — dev/build-server vite helper    |
| `some-styles-build` (bin)                 | Runs a workspace's `style.context.ts` in one pass       |

### Tokens

`tokens/base.css` is the single source of truth for the shadcn-style design
tokens (`--background`, `--primary`, `--radius`, …). `tailwind.css` imports it,
the UnoCSS preset maps it to utilities, and extensions can import it directly as
vanilla CSS. Change a token once, everything follows — no duplication.

### Preset

`presetSomeUi` composes `presetWind3` (Tailwind-compatible utilities) and wires
the tokens in:

- **Colors** — `bg-primary`, `text-muted-foreground`, `border-border`,
  `ring-ring`, `bg-card`, `text-sidebar-foreground`, `bg-chart-1`, …
- **Radius** — every `rounded-*` flows through `--radius`, so components are
  never accidentally sharp-cornered.
- **Shortcuts** — shadcn-flavored components: `btn-primary`, `btn-outline`,
  `card`, `card-header`, `input`, `badge-secondary`, `kbd`, …

## Using it in an extension (preview — wiring lands in a later milestone)

```ts
// extensions/<name>/uno.config.ts
import { defineSomeUiConfig } from "@some-ui/styles/config"

export default defineSomeUiConfig(
  { preflight: true }, // popups/options pages are self-contained
  { content: { filesystem: ["src/**/*.{ts,tsx,html}"] } }
)
```

```jsonc
// package.json
"scripts": {
  "build:css": "unocss --out-file dist/popup.css"
}
```

```css
/* runtime: plain CSS, no engine */
@import "@some-ui/styles/tokens.css";
@import "./popup.css"; /* generated */
```

```tsx
<button className="btn-primary">Save</button>
```

## Single-pass Tailwind builds (`styles-build/`)

The ui packages and their consumers (apps/www) share **one** Tailwind layer:
`tailwind.css` — the Tailwind import, shadcn tokens, themes, and plugins. The
`styles-build/` engine compiles that layer **exactly once** over the explicit
union of a dependency graph's source, producing one deterministic stylesheet.

This is the styles analogue of `extensions/common/ext-build/`: the abstract
engine lives in one canonical place, and each consuming workspace only declares
its **granular context** — no CSS-engine wiring scattered across the graph.

### Why one pass

Compiling the shared layer once _per package_ (each package's own `vite build`
running an independent Tailwind pass, then a consumer concatenating N
pre-compiled sheets and running an N+1th) makes the final CSS depend on
module-graph merge order. A cold `pnpm install` in Docker can resolve that order
differently than a warm local checkout, so styles that render in dev silently
drop or reorder in the static build. One pass over an explicit `@source` set —
with scan `base` pinned to an empty dir so nothing leaks in from cwd
auto-detection — makes the output a pure function of the declared graph.

### A workspace declares its context

```ts
// <workspace>/style.context.ts
import type { StyleContext } from "@some-ui/styles/styles-build"

const context: StyleContext = {
  default: {
    // Every source whose class candidates belong in this stylesheet. An
    // aggregating consumer (apps/www) lists its own src plus each in-graph
    // package's src, so the whole graph is scanned in one pass.
    content: ["src/**/*.{ts,tsx}"],
    outFile: "dist/styles.css",
  },
}

export default context
```

```jsonc
// <workspace>/package.json — the abstract engine, driven by the declaration
"scripts": { "build:css": "some-styles-build" }
```

```ts
// <workspace>/vite.config.ts — dev server scans the same set as the build
import { createStyleConfig } from "@some-ui/styles/styles-build/dev-config"

import context from "./style.context"

export default createStyleConfig(context)
```

A runnable example lives in `styles-build/examples/`; `styles-build/tests/`
exercises the compiler (single pass, determinism, tree-shaking) against it.

> Note: the consuming ui/apps workspaces are **not** migrated yet — this sets up
> the canonical engine only. Cutting each workspace over to `style.context.ts`
> (and dropping its per-package Tailwind pass) is the follow-up.

## Build the showcase

```bash
pnpm build:css   # compiles examples/showcase.html → dist/some-ui.css
```

Open `examples/showcase.html` to see the static output styling a plain page.

## The theme protocol

Theme reaches a component by **CSS inheritance from a DOM boundary**, and by
nothing else. There is no context, no hook, and no framework anywhere in this
path:

```
session preference           (the user picks; localStorage remembers)
        ↓
framework-specific adapter   (apps/www ThemeProvider, a pre-paint script,
        ↓                     a Next server component, a plain <script>)
DOM boundary                 (class + data-theme + color-scheme on <html>)
        ↓
semantic custom properties   (tokens/base.css, themes/*.css)
        ↓
components inherit           (bg-background, text-muted-foreground, …)
```

The consequence for a reusable component is one rule: **inherit your theme,
never choose one**. A component that mounts a palette class on its own markup
has replaced `--background` / `--foreground` for its whole subtree, so the
user's session theme still changes and that subtree does not follow. Both
halves of the rule are enforced by `theme-protocol/*` in `@some-ui/eslint-kit`,
which `uiRecommended` turns on for every `packages/ui/*` workspace.

### The four scopes

`src/theme/registry.ts` is the single source of truth. Every switcher, toolbar
and lint rule reads a derived view of it — nothing maintains a second list.

| Scope       | Applied to         | Who chooses it       | Replaces the semantic contract? |
| ----------- | ------------------ | -------------------- | ------------------------------- |
| `session`   | the document root  | the **user**         | yes — it _is_ the contract      |
| `feature`   | any nested element | the **host**, opt-in | yes, for its subtree            |
| `accent`    | `.theme-container` | the host             | no — `--primary` family only    |
| `component` | a component's root | the **component**    | no — own namespaced tokens only |

`session` and `feature` are the two a component must never author. `component`
is the shape the others should migrate toward: `.headline` owns `--base-bg`,
`--light-a`, `--text-main` and touches nothing shared, which is exactly why
`neon-sign` is free to apply it to itself.

### Opting into a feature appearance

A component whose product design genuinely calls for a branded surface takes
it as a prop and defaults to inheriting:

```tsx
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"

type Props = { appearance?: Appearance }

export const Leetype = ({ appearance = "inherit" }: Props) => (
  <div className={cn(appearanceClassName(appearance), "absolute inset-0")}>
    …
  </div>
)
```

`appearanceClassName("inherit")` is the empty string — the default case is
genuinely "open no boundary". The type only admits feature ids, so the helper
cannot be used to force a session theme even by accident.

### Feature tokens have ambient defaults

A feature palette's own tokens (`--cdrama-blossom`, `--glow-primary`, …) are
declared on `:root` in terms of the semantic roles, and overridden by the
feature class:

```css
:root {
  --cdrama-blossom: var(--primary);
}
.cdrama {
  --cdrama-blossom: oklch(75% 0.15 20deg);
}
```

Without the first rule, `var(--cdrama-blossom)` resolves to nothing outside
`.cdrama` — which is what forced five components to mount `.cdrama` on their
own root just to make three variables exist. Mounting a full palette to get
three variables is how a feature skin ends up overriding the user's theme, so
a new feature token needs its ambient default in the same commit.

### Registries for building switchers

```ts
import {
  ACCENT_THEMES, // --primary overlays
  COMPONENT_SKINS, // namespaced, component-applied
  FEATURE_APPEARANCES, // opt-in nested palettes
  SESSION_THEMES, // user-selectable palettes, with swatches
} from "@some-ui/styles/theme"
```

- **Accent themes** layer a `--primary` palette onto light/dark
  (`.theme-blue .theme-container`).
- **Session and feature themes** are standalone palettes applied to a boundary
  element (`.dark`, `.peachy-blossom`, `.scheduler`, `.code`, `.conveyor`).

The **`conveyor`** app theme (`themes/conveyor.css`) is the steel transport
palette for the `some-conveyor` extension: a steel substrate plus three
semantic accents — `signal` (scheduler tick / caution), `live` (in-window /
online), `alert` (failed / down) — exposed both as raw `--cv-*` tokens (for the
extension's cube/face/strip custom-property contract) and mapped onto the shadcn
contract so the shared utilities/shortcuts resolve under `.conveyor`.

## Typography

Font families resolve through single tokens — `--font-sans`, `--font-mono`, and
the additive `--font-display` — so `font-sans` / `font-mono` / `font-display`
are token-driven utilities. The global defaults reproduce the prior implicit
stacks (no visual change to existing surfaces); a theme overrides a token to opt
into brand families (e.g. `.conveyor` → Inter / IBM Plex Mono / Space Grotesk).

Delivery is **shadow-DOM-safe**: there is no runtime web-font `<link>` (the
conveyor injects into arbitrary host pages inside a closed shadow root). Until
the woff2 set is self-hosted, the fallback stacks apply; self-hosting is an
additive follow-up (drop in `@font-face` + assets and the stacks degrade
gracefully).
