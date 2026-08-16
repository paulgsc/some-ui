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

import { parseColor } from "./color"
import { rgbaToCss } from "./modify-colors"
import { commitVisualState } from "./prepaint"
import { counterInvertColor, detectVendorInvert } from "./vendor-filter"

/**
 * Every `<style>` this extension injects carries `[data-my-ext]`. Two
 * separate consumers depend on it: `EXT_GUARD` (below) keeps theme rules
 * off extension-owned nodes, and the Sensor (`adapter/pipeline.ts`) uses
 * the same marker to recognise a mutation record as its own actuation echo
 * rather than vendor evidence (Axiom 3.5). An unmarked stylesheet is
 * invisible to the first and indistinguishable from vendor churn to the
 * second — which is how injecting one ended up re-triggering the very scan
 * that injected it (#831).
 */
function createExtensionStyle(id: string): HTMLStyleElement {
  const style = document.createElement("style")
  style.id = id
  style.setAttribute("data-my-ext", "")
  return style
}

/**
 * Assigns `css` only when it differs from what the element already holds.
 * `textContent =` replaces the element's child text node unconditionally,
 * which is a childList mutation the Sensor observes — so an unguarded
 * re-assignment of identical CSS is a phantom "the page changed" signal
 * (Theorem 7.2's idempotence requirement, at the level of *DOM writes*, not
 * just of resulting state).
 */
function setStyleText(style: HTMLStyleElement, css: string): void {
  if (style.textContent === css) return
  style.textContent = css
}

export const DARK_THEME_ATTR = "data-sw-dark"
export const LEGACY_THEME_ATTR = "data-sw-legacy"

/**
 * Counter-inverts every color a `Swatch` carries so that, once composited
 * through a still-active *vendor* `filter: invert(...)` (#741 — a real
 * accessibility toggle some sites ship on their own `<html>`, distinct from
 * this extension's own legacy filter mode), a human/screenshot sees the
 * swatch's real, intended dark tokens rather than their bright inverse. A
 * no-op (`invertAmount = 0`, the overwhelming majority case) returns
 * `swatch` unchanged.
 */
function compensateSwatch(swatch: Swatch, invertAmount: number): Swatch {
  if (invertAmount === 0) return swatch

  const counter = (css: string): string => {
    const parsed = parseColor(css)
    return parsed === null
      ? css
      : rgbaToCss(counterInvertColor(parsed, invertAmount))
  }

  return {
    ...swatch,
    bg0: counter(swatch.bg0),
    bg1: counter(swatch.bg1),
    bg2: counter(swatch.bg2),
    bg3: counter(swatch.bg3),
    surface: counter(swatch.surface),
    border: counter(swatch.border),
    text0: counter(swatch.text0),
    text1: counter(swatch.text1),
    text2: counter(swatch.text2),
    link: counter(swatch.link),
    linkVisited: counter(swatch.linkVisited),
    inputBg: counter(swatch.inputBg),
    inputBorder: counter(swatch.inputBorder),
    selectionBg: counter(swatch.selectionBg),
    codeFg: counter(swatch.codeFg),
  }
}

// ── Tokens ────────────────────────────────────────────────────────────────────
// Values come from the active swatch (default: SWATCHES.default, byte-for-byte
// today's palette) rather than a hardcoded literal — see src/adapter/swatches/index.ts.

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

export const DARK_THEME_STYLE_ID = "__sw_dark_theme"

const STYLE_ID = DARK_THEME_STYLE_ID

export function injectDarkTheme(
  swatch: Swatch = SWATCHES[DEFAULT_SWATCH_ID]
): void {
  const existing = document.getElementById(STYLE_ID)
  const style: HTMLStyleElement =
    existing instanceof HTMLStyleElement
      ? existing
      : createExtensionStyle(STYLE_ID)
  if (!(existing instanceof HTMLStyleElement)) {
    document.head.appendChild(style)
  }
  // The compensation is recomputed per call (a vendor's own invert toggle
  // can flip at any time), but the assignment still goes through
  // setStyleText: an unchanged filter state rebuilds byte-identical CSS,
  // and rewriting it would be a mutation the Sensor reacts to (#831).
  setStyleText(
    style,
    buildDarkThemeCSS(compensateSwatch(swatch, detectVendorInvert()))
  )
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
  const existing = document.getElementById(LEGACY_FILTER_STYLE_ID)
  const style =
    existing instanceof HTMLStyleElement
      ? existing
      : createExtensionStyle(LEGACY_FILTER_STYLE_ID)

  // "dim" style (no invert): the browser's native dark theme already darkened
  // the background, so forcing a canvas colour here would fight it, and
  // counter-inverting media would be a no-op filter applied for nothing.
  // Only the "invert" style needs both.
  const isInverted = Boolean(config.invert)
  // This declaration is inside the filtered <html> subtree. Its source colour
  // therefore has to be white: invert(1) composites it to black. A dark source
  // such as #0d1117 is inverted to a near-white canvas precisely when the veil
  // is released, recreating the flash that prepaint is meant to prevent.
  const canvasRule = isInverted ? "background-color: #fff !important;" : ""
  const mediaRule = isInverted
    ? "img, video, canvas, picture { filter: invert(1) hue-rotate(180deg) !important; }"
    : ""

  setStyleText(
    style,
    `
    html { filter: ${buildFilterString(config)} !important; ${canvasRule} }
    ${mediaRule}
  `
  )

  // Install the filter before advertising it to prepaint.css. That stylesheet
  // makes the veil white while this attribute is present, relying on invert()
  // to composite it back to black. Setting the attribute first exposes the
  // raw white veil until the filter style is live. A dim-only legacy config is
  // not inverted at all, so it must never opt into that compensation.
  if (existing === null) {
    document.head.appendChild(style)
  }
  if (isInverted) {
    document.documentElement.setAttribute(LEGACY_THEME_ATTR, "")
  } else {
    document.documentElement.removeAttribute(LEGACY_THEME_ATTR)
  }
}

function removeLegacyFilter(): void {
  document.getElementById(LEGACY_FILTER_STYLE_ID)?.remove()
  document.documentElement.removeAttribute(LEGACY_THEME_ATTR)
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
