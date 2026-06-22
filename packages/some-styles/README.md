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

| Export                         | What it is                                              |
| ------------------------------ | ------------------------------------------------------- |
| `@some-ui/styles`              | JS API — `presetSomeUi`, `defineSomeUiConfig`, `themes` |
| `@some-ui/styles/preset`       | The UnoCSS preset                                       |
| `@some-ui/styles/config`       | `defineSomeUiConfig()` factory                          |
| `@some-ui/styles/tokens.css`   | Framework-agnostic design tokens (`:root` + `.dark`)    |
| `@some-ui/styles/themes.css`   | Color themes (`.theme-blue`, …)                         |
| `@some-ui/styles/themes/*`     | App themes (`scheduler`, `code`, …)                     |
| `@some-ui/styles/tailwind.css` | Tailwind v4 entry (existing surface / Storybook)        |

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

## Build the showcase

```bash
pnpm build:css   # compiles examples/showcase.html → dist/some-ui.css
```

Open `examples/showcase.html` to see the static output styling a plain page.

## Themes

`themes` (from the JS API) is the registry of available themes for building
switchers:

```ts
import { appThemes, colorThemes } from "@some-ui/styles"
```

- **Color themes** layer a `--primary` palette onto light/dark
  (`.theme-blue .theme-container`).
- **App themes** are standalone palettes applied to a root element
  (`.scheduler`, `.code`, `.conveyor`).

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
