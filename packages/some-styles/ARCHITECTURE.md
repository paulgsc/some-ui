# Architecture — `@some-ui/styles`

**Artifact:** Shared TypeScript/CSS library — design system for the some-ui monorepo.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

The shared design system. Provides a UnoCSS preset with shadcn-compatible tokens and themes, plus a JS config API for consuming packages. Runtime output is plain static CSS; the JS layer is dev-time only.

---

## Entry points

| Export | Path | Role |
|---|---|---|
| JS config API | `src/index.ts` | `defineSomeUiConfig`, `presetSomeUi`, theme data, component types |
| Token CSS | `src/tokens.css` | CSS custom properties for colors, radius, font-family |
| Theme CSS | `src/themes.css` | Light/dark theme overrides |
| Tailwind compat | `src/tailwind.css` | Tailwind-compatible utility classes via UnoCSS |

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **`presetSomeUi`** | UnoCSS preset that adds some-ui's color palette, font-family, radius scale, and shortcut utilities. |
| **`defineSomeUiConfig`** | Config factory for consuming packages — merges some-ui defaults with per-package overrides. |
| **shadcn tokens** | CSS custom property schema compatible with shadcn/ui (`--background`, `--foreground`, `--primary`, etc.). |
| **Theme switcher** | Light/dark theme switching via data attribute or class; exposes JS API for runtime toggles. |
| **`someUiTheme`** | The canonical theme object shared with Tailwind/UnoCSS config. |

---

## Module map

```
src/
  index.ts                    — re-exports all JS API
  config.ts                   — defineSomeUiConfig + SomeUiConfigOptions
  preset/                     — presetSomeUi, colors, fontFamily, radius, someUiTheme
  components/                 — component-level style exports
  data/                       — design token data (colors, scales)
  types/                      — TypeScript types for design tokens
  registry/                   — component registry for shadcn compatibility
```

---

## Critical invariants

| # | Invariant |
|---|---|
| ST1 | The JS API is dev-time only — no runtime JS is shipped to pages. |
| ST2 | All color tokens are CSS custom properties, not hardcoded values. |
| ST3 | The shadcn token names must not be renamed; downstream shadcn components depend on the exact custom property names. |

## ADRs

- [ADR 0001 — UnoCSS + shadcn token schema over Tailwind-only approach](./docs/adr/0001-unocss-shadcn-tokens.md)
