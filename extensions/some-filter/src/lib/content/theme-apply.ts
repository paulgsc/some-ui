/**
 * Theme applier — owns every DOM write involved in theming a page.
 *
 * Two strategies live here behind one surface:
 *   - dark theme: a static CSS layer (buildDarkThemeCSS) plus a JS luminance
 *     patcher (patchAll + MutationObserver) that tags vendor backgrounds.
 *   - legacy filter: a single global root `filter: invert(...)` rule.
 *
 * Public surface:
 *   - applyTheme(mode, config?) — apply the dark theme or the legacy filter.
 *   - restoreVendor()           — remove all theming, returning to native styles.
 * The granular dark-theme exports (injectDarkTheme/removeDarkTheme/repatchPage)
 * are retained for the SPA re-patch path and unit tests.
 *
 * Part A — CSS layer (static rules):
 *   Scoped to body (and html) with :not([data-my-ext]) / :not([data-my-ext] *)
 *   guards on rules that could bleed into extension-owned subtrees.
 *
 * Part B — JS luminance patcher (dynamic):
 *   Walks document.body, skips [data-my-ext] nodes and their descendants via
 *   shouldSkip(). Vendor DOM is left in place; extension nodes self-exclude.
 */

import {
  DEFAULT_SWATCH_ID,
  SWATCHES,
  type Swatch,
} from "@filter/adapter/swatches"
import type { FilterConfig } from "@filter/types/config"

import { parseColor, relativeLuminance } from "./color"
import { modifyBackgroundColor, rgbaToCss } from "./modify-colors"
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
const EXT_GUARD = ":not([data-my-ext]):not([data-my-ext] *)"

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

/* ── JS luminance patcher targets ───────────────────────────────────────── */

/* Light backgrounds are tagged with a generated token (c0, c1, …) whose
   hue-preserving dark color is emitted into the dynamic stylesheet by the
   patcher (see tokenForBackground). Near-black backgrounds are preserved. */

[data-sw-patched="preserve"]${EXT_GUARD} {
  background-color: revert !important;
  color: revert !important;
}
`
}

// ── JS luminance patcher ──────────────────────────────────────────────────────

const LIGHT_THRESHOLD = 0.3

// ── Dynamic per-element color registry ──────────────────────────────────────────
// Light backgrounds get a hue-preserving dark color computed via modify-colors.
// To keep the patcher attribute-only (so restoreVendor is byte-identical — no
// inline-style clobbering of vendor nodes), each distinct modified color is
// assigned a token and a matching `[data-sw-patched="<token>"]` rule is appended
// to a dynamic stylesheet. Elements only ever receive a data attribute.

const DYNAMIC_STYLE_ID = "__sw_dark_dynamic"
const colorTokens = new Map<string, string>()
let colorTokenSeq = 0

function dynamicStyleEl(): HTMLStyleElement {
  const existing = document.getElementById(DYNAMIC_STYLE_ID)
  if (existing instanceof HTMLStyleElement) return existing
  const style = document.createElement("style")
  style.id = DYNAMIC_STYLE_ID
  document.head.appendChild(style)
  return style
}

function tokenForBackground(modifiedCss: string): string {
  const cached = colorTokens.get(modifiedCss)
  if (cached !== undefined) return cached

  const token = `c${colorTokenSeq++}`
  colorTokens.set(modifiedCss, token)
  dynamicStyleEl().textContent += `[data-sw-patched="${token}"]${EXT_GUARD}{background-color:${modifiedCss}!important}\n`
  return token
}

function clearDynamicColors(): void {
  document.getElementById(DYNAMIC_STYLE_ID)?.remove()
  colorTokens.clear()
  colorTokenSeq = 0
}

function classifyElement(el: Element): string | null {
  const bg = getComputedStyle(el).backgroundColor
  const c = parseColor(bg)

  if (!c) return null

  // Near-transparent elements are glass layers over the dark body canvas.
  // Tagging them would revert/repaint their background once the transition or
  // opacity settles, permanently leaking white.
  if (c[3] < 0.1) return null

  const lum = relativeLuminance(c[0], c[1], c[2])

  if (lum > LIGHT_THRESHOLD) {
    // Hue-preserving dark surface instead of a flat grey bucket.
    return tokenForBackground(rgbaToCss(modifyBackgroundColor(c)))
  }

  if (lum < 0.06) return "preserve"

  return null
}

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "NOSCRIPT",
  "IMG",
  "VIDEO",
  "CANVAS",
  "AUDIO",
  "PICTURE",
  "EMBED",
  "OBJECT",
  "SVG",
  "IFRAME",
])

function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true
  if (el.id === "__sw_overlay_root") return true
  // Skip extension-owned nodes and their descendants.
  // The attribute check on el covers the root; the closest() check covers
  // descendants that don't carry the attr themselves.
  if (el.hasAttribute("data-my-ext")) return true
  if (el.closest("[data-my-ext]")) return true
  return false
}

function patchElement(el: Element): void {
  if (!(el instanceof HTMLElement)) return
  if (shouldSkip(el)) return

  const token = classifyElement(el)
  if (token !== null) {
    el.dataset.swPatched = token
  }
}

function patchAll(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.nextNode()
  while (node !== null) {
    if (node instanceof Element) {
      patchElement(node)
    }
    node = walker.nextNode()
  }
}

let patchObserver: MutationObserver | null = null

function startPatchObserver(root: Element): void {
  if (patchObserver) return

  patchObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            patchElement(node)
            patchAll(node)
          }
        }
      } else if (mutation.type === "attributes") {
        // Re-evaluate when class/style changes — the element's background
        // may have changed during SPA re-renders or dynamic theming.
        if (mutation.target instanceof Element) {
          patchElement(mutation.target)
        }
      }
    }
  })

  patchObserver.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  })
}

function stopPatchObserver(): void {
  patchObserver?.disconnect()
  patchObserver = null
}

// ── Dark theme injection ────────────────────────────────────────────────────────

const STYLE_ID = "__sw_dark_theme"

export function injectDarkTheme(): void {
  const existing = document.getElementById(STYLE_ID)
  const style: HTMLStyleElement =
    existing instanceof HTMLStyleElement
      ? existing
      : document.createElement("style")
  if (!(existing instanceof HTMLStyleElement)) {
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = buildDarkThemeCSS()

  // Walk from body — patcher already skips [data-my-ext] nodes.
  patchAll(document.body)
  startPatchObserver(document.body)
  // Veil removal is the caller's responsibility: inject theme first,
  // then call commitVisualState() so the dark CSS is in the cascade
  // before the veil's invert filter is lifted (atomic swap, F1).
}

export function removeDarkTheme(): void {
  document.getElementById(STYLE_ID)?.remove()
  clearDynamicColors()
  stopPatchObserver()

  document.querySelectorAll("[data-sw-patched]").forEach((el) => {
    el.removeAttribute("data-sw-patched")
  })
  // Veil removal is the caller's responsibility.
}

/**
 * Re-run the luminance patcher over the full document body.
 * Used after SPA navigation (e.g. YouTube pushState swaps) to catch
 * subtrees that were re-rendered without being re-added via childList.
 */
export function repatchPage(): void {
  patchAll(document.body)
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

function activateDarkTheme(): void {
  document.documentElement.setAttribute(DARK_THEME_ATTR, "")
  injectDarkTheme()
}

function deactivateDarkTheme(): void {
  document.documentElement.removeAttribute(DARK_THEME_ATTR)
  removeDarkTheme()
}

// ── Public surface ──────────────────────────────────────────────────────────────

export type ThemeMode = "dark" | "legacy"

/**
 * Apply a theme. `dark` injects the dark-theme CSS layer + patcher; `legacy`
 * installs the global invert filter (pass `config` for legacy — omitted/undefined
 * is a no-op). Does not clear the other mode — the orchestrator calls
 * restoreVendor() first when switching.
 */
export function applyTheme(mode: ThemeMode, config?: FilterConfig): void {
  try {
    if (mode === "legacy") {
      if (config !== undefined) applyLegacyFilter(config)
      return
    }
    activateDarkTheme()
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
