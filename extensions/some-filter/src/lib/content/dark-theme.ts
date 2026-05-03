
/**
 * Dark theme stylesheet.
 *
 * Architecture:
 *   - Applied ONLY to #__sw_page_layer (vendor DOM wrapper)
 *   - Never touches #__sw_overlay_root or [data-my-ext] subtrees
 *   - Primary mechanism: color/bg token overrides (NOT filter)
 *   - Optional subtle brightness pass as final layer (configurable)
 *   - Uses :where() for low-specificity overrides that vendor !important can still win
 *
 * Selector pattern:
 *   #__sw_page_layer:not([data-my-ext]) :where(...)
 *
 * This means:
 *   - Only vendor DOM inside the page layer is affected
 *   - Extension-owned subtrees with [data-my-ext] are unconditionally excluded
 */

export const DARK_THEME_ATTR = "data-sw-dark"

// ── Token definitions ────────────────────────────────────────────────────────

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

// ── Stylesheet template ──────────────────────────────────────────────────────

/**
 * Generates the full dark theme CSS string.
 * brightness: optional final global brightness reduction (0–1). Set to 1.0 to disable.
 */
export function buildDarkThemeCSS(brightness = 0.92): string {
  const LAYER = `#__sw_page_layer`
  // Exclusion: never style extension-owned subtrees
  const SCOPE = `${LAYER}:not([data-my-ext] *)`

  return `
/* ── SW Dark Theme ── injected by some-filter ────────────────────────────── */

/* Token injection on page layer root */
${LAYER} {
  ${TOKENS}
}

/* Optional subtle brightness reduction on entire page layer.
   This is the ONLY filter — narrow, intentional, on the layer boundary.
   Not on html/body. Not per-element. */
${LAYER} {
  filter: brightness(${brightness});
}

/* ── Root & body reset ──────────────────────────────────────────────────── */

${SCOPE} :where(html, body) {
  background-color: var(--sw-bg-0) !important;
  color: var(--sw-text-0) !important;
  color-scheme: dark !important;
}

/* ── Transparent containers → inherit dark bg ───────────────────────────── */
/* We set transparent so they inherit --sw-bg-0 from the root,
   instead of painting over it with a white or near-white bg. */

${SCOPE} :where(
  div, section, article, main, header, footer, aside, nav,
  form, fieldset, figure, details, summary,
  ul, ol, li, dl, dt, dd
) {
  background-color: transparent !important;
}

/* Headings and labels pick up their natural inherit color */
${SCOPE} :where(h1, h2, h3, h4, h5, h6) {
  color: var(--sw-text-0) !important;
}

/* ── Text nodes ─────────────────────────────────────────────────────────── */

${SCOPE} :where(p, span, label, caption, figcaption, blockquote, cite) {
  color: var(--sw-text-1) !important;
}

${SCOPE} :where(small, sub, sup, abbr, time) {
  color: var(--sw-text-2) !important;
}

/* ── Links ──────────────────────────────────────────────────────────────── */

${SCOPE} :where(a:link) {
  color: var(--sw-link) !important;
}

${SCOPE} :where(a:visited) {
  color: var(--sw-link-visited) !important;
}

/* ── Table ──────────────────────────────────────────────────────────────── */

${SCOPE} :where(table, thead, tbody, tfoot, tr) {
  background-color: transparent !important;
  border-color: var(--sw-border) !important;
}

${SCOPE} :where(th) {
  background-color: var(--sw-bg-2) !important;
  color: var(--sw-text-0) !important;
  border-color: var(--sw-border) !important;
}

${SCOPE} :where(td) {
  color: var(--sw-text-1) !important;
  border-color: var(--sw-border) !important;
}

/* ── Borders ────────────────────────────────────────────────────────────── */

${SCOPE} :where(*) {
  border-color: var(--sw-border) !important;
  outline-color: rgba(255, 255, 255, 0.12) !important;
}

/* ── Horizontal rules ───────────────────────────────────────────────────── */

${SCOPE} :where(hr) {
  border-color: var(--sw-border) !important;
  background-color: var(--sw-border) !important;
}

/* ── Code and pre ───────────────────────────────────────────────────────── */

${SCOPE} :where(code, kbd, samp) {
  background-color: var(--sw-bg-3) !important;
  color: #e879f9 !important;
  border-color: var(--sw-border) !important;
}

${SCOPE} :where(pre) {
  background-color: var(--sw-bg-2) !important;
  color: var(--sw-text-0) !important;
  border-color: var(--sw-border) !important;
}

/* ── Form elements ──────────────────────────────────────────────────────── */

${SCOPE} :where(input, textarea, select) {
  background-color: var(--sw-input-bg) !important;
  color: var(--sw-text-0) !important;
  border-color: var(--sw-input-border) !important;
}

${SCOPE} :where(input::placeholder, textarea::placeholder) {
  color: var(--sw-text-2) !important;
}

${SCOPE} :where(button) {
  background-color: var(--sw-bg-3) !important;
  color: var(--sw-text-0) !important;
  border-color: var(--sw-border) !important;
}

${SCOPE} :where(button:hover) {
  background-color: var(--sw-bg-2) !important;
}

/* ── Scrollbars ─────────────────────────────────────────────────────────── */

${SCOPE} :where(*) {
  scrollbar-color: var(--sw-bg-3) var(--sw-bg-0);
}

/* ── Selection ──────────────────────────────────────────────────────────── */

${SCOPE} ::selection {
  background-color: var(--sw-selection-bg) !important;
}

/* ── Dialogs & popovers ─────────────────────────────────────────────────── */

${SCOPE} :where(dialog, [popover]) {
  background-color: var(--sw-surface) !important;
  color: var(--sw-text-0) !important;
  border-color: var(--sw-border) !important;
}

/* ── Surfaces with explicit light backgrounds ───────────────────────────── */
/* Cards, panels, sidebars that paint white/near-white explicitly */

${SCOPE} :where(
  [class*="card"], [class*="panel"], [class*="sidebar"],
  [class*="modal"], [class*="drawer"], [class*="sheet"],
  [class*="tooltip"], [class*="popover"], [class*="dropdown"]
) {
  background-color: var(--sw-surface) !important;
  color: var(--sw-text-0) !important;
}

/* ── Media: never touch ─────────────────────────────────────────────────── */
/* Images, video, canvas are opaque content — do not invert or recolor */

${SCOPE} :where(img, video, canvas, svg, picture, embed, object) {
  filter: none !important;
  opacity: 1 !important;
}

/* SVG text and shapes can be colored but not filtered */
${SCOPE} :where(svg text, svg tspan) {
  fill: var(--sw-text-1) !important;
}

/* ── Inline style override for common white backgrounds ─────────────────── */
/* Catches cases where vendor JS sets element.style.backgroundColor = "white" */
/* We can't override inline !important, but we can win without it in most cases */

/* ── Extension exclusion (belt and suspenders) ──────────────────────────── */
/* These selectors should never fire because ext UI is in __sw_overlay_root
   which is a sibling of __sw_page_layer, not inside it.
   These are defensive redundancy only. */

[data-my-ext],
[data-my-ext] * {
  /* Intentionally empty — these are never inside __sw_page_layer */
  /* Presence of this block signals intent to future readers */
}
`
}

// ── Injection ────────────────────────────────────────────────────────────────

const STYLE_ID = "__sw_dark_theme"

export function injectDarkTheme(brightness?: number): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = STYLE_ID
    const root = document.head ?? document.documentElement
    root.appendChild(style)
  }
  style.textContent = buildDarkThemeCSS(brightness)
}

export function removeDarkTheme(): void {
  document.getElementById(STYLE_ID)?.remove()
}
