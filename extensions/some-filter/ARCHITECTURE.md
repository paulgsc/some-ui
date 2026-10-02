# Architecture — `@some-extension/filter` (some-filter)

**Artifact:** Firefox/Chrome browser extension — dark-mode filter.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

Injects a structurally isolated dark theme into arbitrary web pages. Uses a luminance classifier to detect light pages and applies CSS token overrides scoped to a page-layer container, keeping extension UI in a sibling overlay root that is never filtered or themed.

---

## Entry points

| Surface | Entry | Output |
|---|---|---|
| Content script | `src/content/content.ts` | Injected into every page |
| Background | `src/background/background.ts` | Service worker / background page |

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **Layer model** | `#__sw_page_layer` holds all vendor DOM; `#__sw_overlay_root` holds extension UI. These are siblings, never nested — the structural invariant that makes all theming safe. |
| **Prepaint veil** | `src/lib/content/prepaint.ts` — injects a blocking dark background before first paint to eliminate flash-of-white during page load. |
| **Theme applier** | `src/lib/content/theme-apply.ts` — applies CSS token overrides and drives the MutationObserver for dynamic pages. |
| **Theme detector** | `src/lib/content/theme-detector.ts` — luminance classifier (`classifyPage()`) that samples `body`, `main`, `article`, `#app`, `#root`. Returns `{ isLight, skip, avgLuminance }`. |
| **Legacy filter** | `html { filter: invert(1) hue-rotate(180deg) … }` — manual fallback mode scoped to `#__sw_page_layer`. Activated via popup or shortcut. |
| **Tab state** | `src/lib/tab-state.ts` — three states: `auto` (classifier-driven), `legacy` (always-on invert), `off`. Persisted in `browser.storage.local`. |
| **Modify-colors** | `src/lib/content/modify-colors.ts` — per-element background override that handles `rgba`, HSL, and computed colour values. |

---

## Module map

```
src/
  background/
    background.ts             — service worker: responds to tab state changes + commands
  content/
    content.ts                — entry: sets up layer model, runs classifier, mounts applier
    filter.css                — legacy filter CSS rules
  lib/
    background/               — background utilities (tab queries, storage)
    content/
      prepaint.ts             — first-paint veil
      theme-apply.ts          — CSS token injection + MutationObserver
      theme-detector.ts       — luminance classifier
      color.ts                — colour manipulation helpers
      modify-colors.ts        — per-element colour overrides
      guard.ts                — isInputContext and other guards
      images.ts               — image handling (invert bypass)
    platform/                 — browser API shims
    tab-state.ts              — TabState type + storage helpers
  popup/                      — popup UI (TypeScript + HTML)
  types/                      — shared types
public/
  manifest.json               — extension manifest
  prepaint.css                — injected CSS for first-paint veil
```

---

## Critical invariants

| # | Invariant |
|---|---|
| F1 | `#__sw_overlay_root` is **never** a descendant of `#__sw_page_layer`. |
| F2 | Dark theme CSS selectors are scoped to `#__sw_page_layer` — never to `html` or `body`. |
| F3 | The legacy `filter` targets `#__sw_page_layer` only, not `html`. |
| F4 | `#__sw_overlay_root` has `pointer-events: none`; only its children opt in to pointer events. |
| F5 | Prepaint veil must execute synchronously before `DOMContentLoaded`. |

---

## ADRs

- [ADR 0001 — Dark-mode pipeline rework](./docs/adr/0001-dark-mode-pipeline-rework.md)

## See also

- [README](./README.md) — full architecture narrative and known issues
- [AMO notes](./amo-notes.md) — Firefox Add-on Marketplace compliance
- Epics: [CMN-KB #279](https://github.com/paulgsc/some-ui/issues/279) (filter half) · [FILTER-FLASH #371](https://github.com/paulgsc/some-ui/issues/371) (compositor canvas flash diagnosis)
