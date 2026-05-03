# some-filter

## Overview

`some-filter` provides a structurally isolated dark theme system for arbitrary web pages, with an optional legacy invert filter for edge cases. The architecture separates vendor DOM from extension UI to guarantee that theming and filtering never interfere with extension-rendered components.

---

## Architecture

### Layer Model

```
<html data-sw-dark?>
  <head>
    <style id="__sw_dark_theme">  ← injected dark theme CSS
  <body>
    <div id="__sw_page_layer">            ← vendor DOM (ONLY target for theme/filter)
      [original body children moved here on content script load]
    </div>
    <div id="__sw_overlay_root"           ← extension UI mount point
         data-my-ext>                     ← exclusion marker
      [your extension UI here]
    </div>
  </body>
```

### Invariants

| #   | Invariant                                                       |
| --- | --------------------------------------------------------------- |
| 1   | `__sw_overlay_root` is NEVER a descendant of `__sw_page_layer`  |
| 2   | Dark theme CSS selectors are scoped to `#__sw_page_layer`       |
| 3   | The legacy invert `filter` targets `#__sw_page_layer` only      |
| 4   | `[data-my-ext]` is redundant; isolation is structural           |
| 5   | `__sw_overlay_root` has `pointer-events: none`; children opt in |

---

## Theming Model

### Dark Theme (default)

- Triggered by luminance classification
- Uses CSS token overrides (`background-color`, `color`, etc.)
- Optional subtle `brightness()` pass
- No inversion or hue rotation

### Legacy Invert Filter (manual)

- Activated via popup or shortcut
- Applies:

```
filter: invert(1) hue-rotate(180deg) sepia(0.12) brightness(0.5) contrast(0.92)
```

- Overrides dark theme when active
- Intended for edge cases

### Why Not `html { filter }`

Filtering at the root:

- Forces full-document compositing
- Breaks escape hatches
- Affects extension UI

Current approach:

- Filter is scoped to `#__sw_page_layer`
- Extension UI is a sibling
- No shared compositing pipeline

---

## Extension Mount Contract

```ts
import { getOverlayRoot } from "@some-extension/filter/mount"

const root = getOverlayRoot()

const el = document.createElement("div")
el.setAttribute("data-my-ext", "")
el.style.pointerEvents = "auto"
root.appendChild(el)
```

Guarantees:

- No theme interference
- No filter interference
- Full visual isolation

---

## Luminance Classification

```
classifyPage() → { isLight, skip, avgLuminance }
```

Sampling:

- `body`
- First matches of: `main, article, #app, #root, #content, [role=main]`

Rules:

- `avgLuminance > 0.55` → apply dark theme
- No samples → skip

---

## File Structure

```
src/
  shared/
    layers.ts
    classify.ts
  content/
    content.ts
    dark-theme.ts
  background/
    background.ts
  mount.ts
  types/
  popup/
```

---

## Known Issues & Forward Path

### Framing

The system is functionally complete. Remaining issues are limited to CSS override precision and timing, not architectural flaws.

---

## Issue 1: Dark Elements Being Incorrectly Modified

### Symptoms

Already-dark UI elements become brighter or visually degraded.

### Causes

**Timing**

- Styles applied after initial patch
- SPA hydration delays

**Classification gaps**

- Luminance thresholds too narrow

### Fix Strategy

- Add MutationObserver support for `style` and `class`
- Add deferred second patch pass (~300–500ms)
- Expand `preserve` luminance band (~0.12–0.15)

---

## Issue 2: Syntax Highlighting Loss

### Symptoms

Code blocks lose token colors.

### Root Cause

Overly broad selector:

```
#__sw_page_layer :where(span) {
  color: var(--sw-text-1) !important;
}
```

Conflicts with syntax highlighters using `<span>`.

### Fix Strategy

Restrict scope:

```
#__sw_page_layer :where(span):not(pre span, code span) {
  color: var(--sw-text-1) !important;
}
```

Additional safeguards:

- Skip patching inside `pre`/`code`
- Respect inline `style.color`

---

## Special Case: CSS-Variable Highlighters (Shiki)

### Problem

Light-mode variables remain active in dark context.

### Strategy

- Detect `--shiki-light`
- Inject `--shiki-dark` equivalents
- Optionally enforce `color-scheme: dark`

---

## Summary

| Issue                     | Structural? | Fix                      |
| ------------------------- | ----------- | ------------------------ |
| Dark element timing       | No          | Observer + deferred pass |
| Dark element threshold    | No          | Adjust luminance band    |
| Syntax highlighting       | No          | Narrow selectors         |
| CSS-variable highlighting | No          | Variable substitution    |

---

## Definition of Complete

A stable system satisfies:

1. Timing-safe patching
2. Correct luminance preservation
3. Code blocks fully exempt
4. Inline styles respected

---

## Implementation Order

1. Fix `pre/code` selector exclusion
2. Expand luminance preserve band
3. Add MutationObserver filters
4. Add deferred patch pass
5. Handle CSS-variable highlighters

---

## Closing Notes

The architecture—layer isolation, scoped theming, and selective filtering—is stable. Remaining work is incremental refinement of selector precision and runtime observation.
