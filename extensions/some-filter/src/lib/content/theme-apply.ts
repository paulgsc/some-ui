/**
 * Theme applier — the static half of theming a page (S5, #690, split this
 * module in two). Owns exactly:
 *   - dark theme: the static CSS layer (buildDarkThemeCSS), a page-wide
 *     binary switch (data-sw-dark + the token stylesheet), realized by
 *     `src/adapter/actuator.ts`'s `activate-theme`/`restore-native` actions.
 *   - legacy filter: a single global root `filter: invert(...)` rule.
 *     Untouched by S5 — no transport concept maps onto it yet.
 *
 * The per-element JS luminance patcher (classifyElement, colorTokens,
 * patchAll, the MutationObserver) that used to live here has moved: its
 * classification math is `adapter/theme-adapter.ts`'s `decide` (S3, pure,
 * no DOM), its DOM writes are `adapter/actuator.ts` (S5, the *only* module
 * that writes `data-sw-patched` now), and its sensing is
 * `adapter/pipeline.ts` (S5, the Sensor + Estimator + Scheduler wiring).
 * This module never writes `data-sw-patched` or the dynamic-color
 * stylesheet — only the attribute and stylesheet the static layer owns.
 *
 * Public surface:
 *   - applyTheme(mode, config?, swatch?) — apply the dark theme or the legacy filter.
 *   - restoreVendor()                    — remove all theming, returning to native styles.
 * injectDarkTheme/removeDarkTheme are retained for the actuator and unit tests.
 */

import {
  DEFAULT_SWATCH_ID,
  SWATCHES,
  type Swatch,
} from "@filter/adapter/swatches"
import type { FilterConfig } from "@filter/types/config"

import { commitVisualState } from "./prepaint"

export const DARK_THEME_ATTR = "data-sw-dark"
export const LEGACY_THEME_ATTR = "data-sw-legacy"

// ── Tokens ────────────────────────────────────────────────────────────────────
// Values come from the active swatch (default: SWATCHES.default, byte-for-byte
// today's palette) rather than a hardcoded literal — see src/adapter/swatches.ts.

function swatchTokens(swatch: Swatch): string {
  return `
  --sw-bg-0: ${swatch.bg0};
  --sw-bg-1: ${swatch.bg1};
  --sw-bg-2: ${swatch.bg2};
  --sw-bg-3: ${swatch.bg3};
  --sw-surface: ${swatch.surface};
  --sw-border: ${swatch.border};

  --sw-text-0: ${swatch.text0};
  --sw-text-1: ${swatch.text1};
  --sw-text-2: ${swatch.text2};

  --sw-link: ${swatch.link};
  --sw-link-visited: ${swatch.linkVisited};

  --sw-input-bg: ${swatch.inputBg};
  --sw-input-border: ${swatch.inputBorder};

  --sw-selection-bg: ${swatch.selectionBg};

  --sw-code: ${swatch.codeFg};
`
}

// ── CSS layer ─────────────────────────────────────────────────────────────────

// Guard: never apply theme rules inside extension-owned subtrees.
// :not([data-my-ext] *)  — excludes descendants of marked nodes
// :not([data-my-ext])    — excludes the marked node itself
// Exported so adapter/actuator.ts's dynamic per-surface rules use the same guard.
export const EXT_GUARD = ":not([data-my-ext]):not([data-my-ext] *)"

export function buildDarkThemeCSS(
  swatch: Swatch = SWATCHES[DEFAULT_SWATCH_ID]
): string {
  return `
/* ── SW Dark Theme ──────────────────────────────────────────────────────── */

/* Tokens on :root */
:root {
  ${swatchTokens(swatch)}
}

/* Dark canvas on html and body — but not if they are somehow extension-owned
   (they won't be, but the guard is cheap and makes the rule self-documenting) */
html${EXT_GUARD},
body${EXT_GUARD} {
  background-color: var(--sw-bg-0) !important;
  color: var(--sw-text-0) !important;
  color-scheme: dark !important;
}

/* ── Text ───────────────────────────────────────────────────────────────── */

:where(h1, h2, h3, h4, h5, h6)${EXT_GUARD} {
  color: var(--sw-text-0) !important;
}

:where(p, span, label, caption, figcaption, blockquote, cite, li, dt, dd)${EXT_GUARD} {
  color: var(--sw-text-1) !important;
}

:where(small, sub, sup, abbr, time)${EXT_GUARD} {
  color: var(--sw-text-2) !important;
}

/* ── Links ──────────────────────────────────────────────────────────────── */

:where(a)${EXT_GUARD} {
  color: var(--sw-link) !important;
}

:where(a:visited)${EXT_GUARD} {
  color: var(--sw-link-visited) !important;
}

/* ── Borders ────────────────────────────────────────────────────────────── */

:where(*):not([data-my-ext]):not([data-my-ext] *) {
  border-color: var(--sw-border) !important;
  outline-color: rgba(255, 255, 255, 0.12) !important;
}

:where(hr)${EXT_GUARD} {
  border-color: var(--sw-border) !important;
  background-color: var(--sw-border) !important;
}

/* ── Code ───────────────────────────────────────────────────────────────── */

:where(code, kbd, samp)${EXT_GUARD} {
  background-color: var(--sw-bg-3) !important;
  color: var(--sw-code) !important;
}

:where(pre)${EXT_GUARD} {
  background-color: var(--sw-bg-2) !important;
  color: var(--sw-text-0) !important;
}

/* ── Tables ─────────────────────────────────────────────────────────────── */

:where(table, thead, tbody, tfoot, tr)${EXT_GUARD} {
  border-color: var(--sw-border) !important;
}

:where(th)${EXT_GUARD} {
  background-color: var(--sw-bg-2) !important;
  color: var(--sw-text-0) !important;
}

:where(td)${EXT_GUARD} {
  color: var(--sw-text-1) !important;
}

/* ── Forms ──────────────────────────────────────────────────────────────── */

:where(input, textarea, select)${EXT_GUARD} {
  background-color: var(--sw-input-bg) !important;
  color: var(--sw-text-0) !important;
  border-color: var(--sw-input-border) !important;
}

:where(input::placeholder, textarea::placeholder) {
  color: var(--sw-text-2) !important;
}

/* ── Scrollbars ─────────────────────────────────────────────────────────── */

:where(*)${EXT_GUARD} {
  scrollbar-color: var(--sw-bg-3) var(--sw-bg-0);
}

/* ── Selection ──────────────────────────────────────────────────────────── */

::selection {
  background-color: var(--sw-selection-bg) !important;
}

/* ── Dialogs ────────────────────────────────────────────────────────────── */

:where(dialog, [popover])${EXT_GUARD} {
  background-color: var(--sw-surface) !important;
  color: var(--sw-text-0) !important;
}

/* ── Media: never touch ─────────────────────────────────────────────────── */

:where(img, video, canvas, picture, embed, object)${EXT_GUARD} {
  filter: none !important;
  opacity: 1 !important;
}

:where(svg text, svg tspan)${EXT_GUARD} {
  fill: var(--sw-text-1) !important;
}

/* ── Actuator targets (adapter/actuator.ts) ────────────────────────────── */

/* Light backgrounds are tagged with their own canonical color as the
   attribute value; the matching hue-preserving dark rule is appended to a
   separate dynamic stylesheet by the actuator's emit-surface-color action.
   Near-black backgrounds are tagged "preserve" and revert here. */

[data-sw-patched="preserve"]${EXT_GUARD} {
  background-color: revert !important;
  color: revert !important;
}
`
}

// ── Dark theme injection (static layer only) ───────────────────────────────────

const STYLE_ID = "__sw_dark_theme"

export function injectDarkTheme(
  swatch: Swatch = SWATCHES[DEFAULT_SWATCH_ID]
): void {
  const existing = document.getElementById(STYLE_ID)
  const style: HTMLStyleElement =
    existing instanceof HTMLStyleElement
      ? existing
      : document.createElement("style")
  if (!(existing instanceof HTMLStyleElement)) {
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = buildDarkThemeCSS(swatch)
  // Per-surface tagging and the dynamic color stylesheet are the actuator's
  // job now (adapter/actuator.ts), driven by decide()'s returned actions —
  // not this function's. Veil removal is the caller's responsibility: inject
  // theme first, then call commitVisualState() so the dark CSS is in the
  // cascade before the veil is lifted (atomic swap, F1).
}

export function removeDarkTheme(): void {
  document.getElementById(STYLE_ID)?.remove()
  // Veil removal is the caller's responsibility.
}

// ── Legacy filter ─────────────────────────────────────────────────────────────

const LEGACY_FILTER_STYLE_ID = "__sw_legacy_filter"

function buildFilterString(config: FilterConfig): string {
  const parts: Array<string> = []

  if (config.invert !== undefined) parts.push(`invert(${config.invert})`)
  if (config.hueRotate !== undefined)
    parts.push(`hue-rotate(${config.hueRotate}deg)`)
  if (config.sepia !== undefined) parts.push(`sepia(${config.sepia})`)
  if (config.brightness !== undefined)
    parts.push(`brightness(${config.brightness})`)
  if (config.contrast !== undefined) parts.push(`contrast(${config.contrast})`)

  return parts.join(" ")
}

function applyLegacyFilter(config: FilterConfig): void {
  // Set the attribute on html so prepaint CSS can react instantly
  document.documentElement.setAttribute(LEGACY_THEME_ATTR, "")

  let style = document.getElementById(LEGACY_FILTER_STYLE_ID)

  if (!style) {
    style = document.createElement("style")
    style.id = LEGACY_FILTER_STYLE_ID

    const root = document.head
    root.appendChild(style)
  }

  // "dim" style (no invert): the browser's native dark theme already darkened
  // the background, so forcing a canvas colour here would fight it, and
  // counter-inverting media would be a no-op filter applied for nothing.
  // Only the "invert" style needs both.
  const isInverted = Boolean(config.invert)
  const canvasRule = isInverted ? "background-color: #0d1117 !important;" : ""
  const mediaRule = isInverted
    ? "img, video, canvas, picture { filter: invert(1) hue-rotate(180deg) !important; }"
    : ""

  style.textContent = `
    html { filter: ${buildFilterString(config)} !important; ${canvasRule} }
    ${mediaRule}
  `
}

function removeLegacyFilter(): void {
  document.documentElement.removeAttribute(LEGACY_THEME_ATTR)
  document.getElementById(LEGACY_FILTER_STYLE_ID)?.remove()
}

// ── Dark theme activation (internal) ────────────────────────────────────────────

function activateDarkTheme(swatch: Swatch): void {
  document.documentElement.setAttribute(DARK_THEME_ATTR, "")
  injectDarkTheme(swatch)
}

function deactivateDarkTheme(): void {
  document.documentElement.removeAttribute(DARK_THEME_ATTR)
  removeDarkTheme()
}

// ── Public surface ──────────────────────────────────────────────────────────────

export type ThemeMode = "dark" | "legacy"

/**
 * Apply a theme. `dark` injects the static dark-theme CSS layer only (the
 * per-surface patcher is `adapter/actuator.ts`'s job now — this is just the
 * page-wide switch); `legacy` installs the global invert filter (pass
 * `config` for legacy — omitted/undefined is a no-op). Does not clear the
 * other mode — the orchestrator calls restoreVendor() first when switching.
 */
export function applyTheme(
  mode: ThemeMode,
  config?: FilterConfig,
  swatch: Swatch = SWATCHES[DEFAULT_SWATCH_ID]
): void {
  try {
    if (mode === "legacy") {
      if (config !== undefined) applyLegacyFilter(config)
      return
    }
    activateDarkTheme(swatch)
  } finally {
    commitVisualState()
  }
}

/**
 * Remove all theming and return the page to its native vendor styles.
 * Veil teardown remains the orchestrator's responsibility.
 */
export function restoreVendor(): void {
  deactivateDarkTheme()
  removeLegacyFilter()
}
