
/**
 *
 * Two-part dark theme application:
 *
 * Part A — CSS layer (static rules):
 *   Previously scoped to #__sw_page_layer. Now scoped to body (and html),
 *   with :not([data-my-ext]) / :not([data-my-ext] *) guards on rules that
 *   could bleed into extension-owned subtrees.
 *
 *   The [data-my-ext] attribute marks extension-owned nodes. Any node
 *   carrying it — or descended from one — is excluded from theming.
 *
 * Part B — JS luminance patcher (dynamic):
 *   Unchanged in contract. Walks document.body, skips [data-my-ext] nodes
 *   and their descendants via shouldSkip().
 *
 * The #__sw_page_layer wrapper div has been removed entirely. Vendor DOM
 * is left in place; extension nodes self-exclude via the attribute.
 */

import { parseColor, relativeLuminance } from "./classify"

export const DARK_THEME_ATTR = "data-sw-dark"
export const PRE_FILTER_STYLE_ID = "__sw_pre_filter"

// ── Tokens ────────────────────────────────────────────────────────────────────

const TOKENS = `
  --sw-bg-0: #0d1117;
  --sw-bg-1: #13161d;
  --sw-bg-2: #1a1e27;
  --sw-bg-3: #21252f;
  --sw-surface: #1e222b;
  --sw-border: rgba(255, 255, 255, 0.08);

  --sw-text-0: #e2e8f0;
  --sw-text-1: #94a3b8;
  --sw-text-2: #475569;

  --sw-link: #7aa2f7;
  --sw-link-visited: #9d8cf7;

  --sw-input-bg: #1a1e27;
  --sw-input-border: rgba(255, 255, 255, 0.15);

  --sw-selection-bg: rgba(122, 162, 247, 0.25);
`

// ── CSS layer ─────────────────────────────────────────────────────────────────

// Guard: never apply theme rules inside extension-owned subtrees.
// :not([data-my-ext] *)  — excludes descendants of marked nodes
// :not([data-my-ext])    — excludes the marked node itself
const EXT_GUARD = ":not([data-my-ext]):not([data-my-ext] *)"

export function buildDarkThemeCSS(): string {
  return `
/* ── SW Dark Theme ──────────────────────────────────────────────────────── */

/* Tokens on :root */
:root {
  ${TOKENS}
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
  color: #e879f9 !important;
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

[data-sw-patched="surface"]${EXT_GUARD} {
  background-color: var(--sw-surface) !important;
  color: var(--sw-text-0) !important;
}

[data-sw-patched="bg-1"]${EXT_GUARD} {
  background-color: var(--sw-bg-1) !important;
}

[data-sw-patched="bg-2"]${EXT_GUARD} {
  background-color: var(--sw-bg-2) !important;
}

[data-sw-patched="preserve"]${EXT_GUARD} {
  background-color: revert !important;
  color: revert !important;
}
`
}

// ── JS luminance patcher ──────────────────────────────────────────────────────

const LIGHT_THRESHOLD = 0.3

function classifyElement(
  el: Element
): "surface" | "bg-1" | "bg-2" | "preserve" | null {
  const bg = getComputedStyle(el).backgroundColor
  const c = parseColor(bg)

  if (!c) return null

  const lum = relativeLuminance(c[0], c[1], c[2])

  if (lum > LIGHT_THRESHOLD) {
    if (lum > 0.7) return "surface"
    if (lum > 0.5) return "bg-1"
    return "bg-2"
  }

  if (lum < 0.06) return "preserve"

  return null
}

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT",
  "IMG", "VIDEO", "CANVAS", "AUDIO", "PICTURE",
  "EMBED", "OBJECT", "SVG", "IFRAME",
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
  while (node) {
    patchElement(node as Element)
    node = walker.nextNode()
  }
}

let patchObserver: MutationObserver | null = null

function startPatchObserver(root: Element): void {
  if (patchObserver) return

  patchObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          patchElement(node)
          patchAll(node)
        }
      }
    }
  })

  patchObserver.observe(root, { childList: true, subtree: true })
}

function stopPatchObserver(): void {
  patchObserver?.disconnect()
  patchObserver = null
}

// ── Injection ─────────────────────────────────────────────────────────────────

const STYLE_ID = "__sw_dark_theme"

export function injectDarkTheme(): void {
  // Remove the pre-filter style now that the real theme is taking over.
  // This avoids a double-application and lets our more precise rules win.
  document.getElementById(PRE_FILTER_STYLE_ID)?.remove()

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = STYLE_ID
    ;(document.head ?? document.documentElement).appendChild(style)
  }
  style.textContent = buildDarkThemeCSS()

  // Walk from body — patcher already skips [data-my-ext] nodes
  patchAll(document.body)
  startPatchObserver(document.body)
}

export function removeDarkTheme(): void {
  document.getElementById(STYLE_ID)?.remove()
  document.getElementById(PRE_FILTER_STYLE_ID)?.remove()
  stopPatchObserver()

  document.querySelectorAll("[data-sw-patched]").forEach((el) => {
    ;(el as HTMLElement).removeAttribute("data-sw-patched")
  })
}
