/**
 * dark-theme.ts
 *
 * Two-part dark theme application:
 *
 * Part A — CSS layer (static rules):
 *   - Sets __sw_page_layer background to our dark base
 *   - Resets html/body inside the layer
 *   - Sets text/link/border tokens
 *   - Does NOT blanket-transparent all divs (that was the bug)
 *   - Does NOT use class name substring matching for cards (too fragile)
 *
 * Part B — JS luminance patcher (dynamic):
 *   - Walks the DOM inside __sw_page_layer
 *   - Finds elements whose computed background-color is high luminance
 *   - Stamps data-sw-patched="<token>" and lets CSS do the actual painting
 *   - Preserves already-dark elements (does not touch them)
 *   - Runs once on load, then incrementally via MutationObserver
 *
 * Why this split:
 *   CSS alone cannot read computed luminance — it can't know if a div is
 *   actually white vs transparent. JS can. CSS is fast for the structural
 *   pieces (root bg, text colors). JS patches the per-element exceptions.
 */

import { parseColor, relativeLuminance } from "./classify"

export const DARK_THEME_ATTR = "data-sw-dark"

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

export function buildDarkThemeCSS(): string {
  const L = `#__sw_page_layer`

  return `
/* ── SW Dark Theme ──────────────────────────────────────────────────────── */

/* Tokens on layer root */
${L} {
  ${TOKENS}
}

/* Layer itself is the dark canvas.
   Everything transparent falls through to this — no need to set
   body bg separately in most cases, but we belt-and-suspenders it. */
${L} {
  background-color: var(--sw-bg-0) !important;
  color: var(--sw-text-0) !important;
  color-scheme: dark !important;
}

/* html and body inside layer — belt-and-suspenders for the root bg.
   Some pages set bg on <body> explicitly; this overrides that. */
${L} :where(html, body) {
  background-color: var(--sw-bg-0) !important;
  color: var(--sw-text-0) !important;
  color-scheme: dark !important;
}

/* ── Text ───────────────────────────────────────────────────────────────── */

${L} :where(h1, h2, h3, h4, h5, h6) {
  color: var(--sw-text-0) !important;
}

${L} :where(p, span, label, caption, figcaption, blockquote, cite, li, dt, dd) {
  color: var(--sw-text-1) !important;
}

${L} :where(small, sub, sup, abbr, time) {
  color: var(--sw-text-2) !important;
}

/* ── Links ──────────────────────────────────────────────────────────────── */

${L} :where(a) {
  color: var(--sw-link) !important;
}

${L} :where(a:visited) {
  color: var(--sw-link-visited) !important;
}

/* ── Borders ────────────────────────────────────────────────────────────── */

${L} :where(*) {
  border-color: var(--sw-border) !important;
  outline-color: rgba(255, 255, 255, 0.12) !important;
}

${L} :where(hr) {
  border-color: var(--sw-border) !important;
  background-color: var(--sw-border) !important;
}

/* ── Code ───────────────────────────────────────────────────────────────── */

${L} :where(code, kbd, samp) {
  background-color: var(--sw-bg-3) !important;
  color: #e879f9 !important;
}

${L} :where(pre) {
  background-color: var(--sw-bg-2) !important;
  color: var(--sw-text-0) !important;
}

/* ── Tables ─────────────────────────────────────────────────────────────── */

${L} :where(table, thead, tbody, tfoot, tr) {
  border-color: var(--sw-border) !important;
}

${L} :where(th) {
  background-color: var(--sw-bg-2) !important;
  color: var(--sw-text-0) !important;
}

${L} :where(td) {
  color: var(--sw-text-1) !important;
}

/* ── Forms ──────────────────────────────────────────────────────────────── */

${L} :where(input, textarea, select) {
  background-color: var(--sw-input-bg) !important;
  color: var(--sw-text-0) !important;
  border-color: var(--sw-input-border) !important;
}

${L} :where(input::placeholder, textarea::placeholder) {
  color: var(--sw-text-2) !important;
}

/* ── Scrollbars ─────────────────────────────────────────────────────────── */

${L} :where(*) {
  scrollbar-color: var(--sw-bg-3) var(--sw-bg-0);
}

/* ── Selection ──────────────────────────────────────────────────────────── */

${L} ::selection {
  background-color: var(--sw-selection-bg) !important;
}

/* ── Dialogs ────────────────────────────────────────────────────────────── */

${L} :where(dialog, [popover]) {
  background-color: var(--sw-surface) !important;
  color: var(--sw-text-0) !important;
}

/* ── Media: never touch ─────────────────────────────────────────────────── */

${L} :where(img, video, canvas, picture, embed, object) {
  filter: none !important;
  opacity: 1 !important;
}

${L} :where(svg text, svg tspan) {
  fill: var(--sw-text-1) !important;
}

/* ── JS luminance patcher targets ───────────────────────────────────────── */
/* Elements the patcher identifies as high-luminance get stamped with
   data-sw-patched. CSS maps the token to the right surface color. */

${L} [data-sw-patched="surface"] {
  background-color: var(--sw-surface) !important;
  color: var(--sw-text-0) !important;
}

${L} [data-sw-patched="bg-1"] {
  background-color: var(--sw-bg-1) !important;
}

${L} [data-sw-patched="bg-2"] {
  background-color: var(--sw-bg-2) !important;
}

/* Already-dark elements: patcher stamps these to prevent CSS text rules
   from making dark-on-dark text. */
${L} [data-sw-patched="preserve"] {
  background-color: revert !important;
  color: revert !important;
}
`
}

// ── JS luminance patcher ──────────────────────────────────────────────────────

/**
 * Luminance threshold above which we consider a bg "light" and patch it.
 * 0.3 catches whites, light greys, and light-colored surfaces.
 * Below 0.3 = already reasonably dark — leave it alone.
 */
const LIGHT_THRESHOLD = 0.3

/**
 * Classify an element's own background-color (not inherited) and return
 * which patch token to apply, or null if it should be left alone.
 */
function classifyElement(
  el: Element
): "surface" | "bg-1" | "bg-2" | "preserve" | null {
  const bg = getComputedStyle(el).backgroundColor
  const c = parseColor(bg)

  if (!c) {
    // Transparent — don't patch. It will inherit from __sw_page_layer (dark).
    return null
  }

  const lum = relativeLuminance(c[0], c[1], c[2])

  if (lum > LIGHT_THRESHOLD) {
    // Light background — patch it dark.
    // Distinguish cards/surfaces (mid-lum) from near-white (high-lum).
    if (lum > 0.7) return "surface"
    if (lum > 0.5) return "bg-1"
    return "bg-2"
  }

  if (lum < 0.06) {
    // Very dark bg (near-black) — the element is already dark.
    // Stamp "preserve" so our text color rules don't make dark-on-dark.
    return "preserve"
  }

  // Mid-range dark — leave alone.
  return null
}

// Tags we never patch (media, scripts, extension internals)
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
  if (el.id === "__sw_page_layer" || el.id === "__sw_overlay_root") return true
  if (el.hasAttribute("data-my-ext")) return true
  return false
}

/**
 * Patch a single element if needed.
 */
function patchElement(el: Element): void {
  if (!(el instanceof HTMLElement)) return
  if (shouldSkip(el)) return

  const token = classifyElement(el)
  if (token !== null) {
    el.dataset.swPatched = token
  }
  // If token is null (transparent or mid-dark), leave data-sw-patched alone.
  // This means we never un-patch an element once patched; that's intentional
  // for the initial pass. MutationObserver handles new nodes.
}

/**
 * Walk the entire page layer and patch all visible elements.
 * Uses TreeWalker for efficiency — avoids boxing every element into an array.
 */
function patchAll(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.nextNode()
  while (node) {
    patchElement(node as Element)
    node = walker.nextNode()
  }
}

let patchObserver: MutationObserver | null = null

/**
 * Start the incremental patcher.
 * Watches for new nodes added to the page layer and patches them.
 */
function startPatchObserver(pageLayer: Element): void {
  if (patchObserver) return

  patchObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          patchElement(node)
          // Also patch children of newly added subtrees
          patchAll(node)
        }
      }
    }
  })

  patchObserver.observe(pageLayer, { childList: true, subtree: true })
}

function stopPatchObserver(): void {
  patchObserver?.disconnect()
  patchObserver = null
}

// ── Injection ─────────────────────────────────────────────────────────────────

const STYLE_ID = "__sw_dark_theme"

export function injectDarkTheme(): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = STYLE_ID
    ;(document.head ?? document.documentElement).appendChild(style)
  }
  style.textContent = buildDarkThemeCSS()

  // Run the JS patcher after CSS is in place
  const pageLayer = document.getElementById("__sw_page_layer")
  if (pageLayer) {
    patchAll(pageLayer)
    startPatchObserver(pageLayer)
  }
}

export function removeDarkTheme(): void {
  document.getElementById(STYLE_ID)?.remove()
  stopPatchObserver()

  // Remove all patcher stamps
  document.querySelectorAll("[data-sw-patched]").forEach((el) => {
    ;(el as HTMLElement).removeAttribute("data-sw-patched")
  })
}
