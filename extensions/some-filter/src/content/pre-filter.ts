/**
 * pre-filter.ts — document_start content script
 *
 * Runs before any page content is parsed or painted. Injects a minimal
 * aggressive dark baseline onto <html> so the user never sees a white flash
 * while the main content script (document_end) is loading.
 *
 * Lifecycle:
 *   document_start  → this script runs, injects __sw_pre_filter <style>
 *   ...page loads...
 *   document_end    → content.ts runs, calls applyState()
 *                     → injectDarkTheme() removes __sw_pre_filter and
 *                       replaces it with the precise __sw_dark_theme rules
 *                     → or if page is already dark / filter is "off",
 *                       __sw_pre_filter is removed without replacement
 *
 * The pre-filter is intentionally coarse — it only sets background and
 * text color on html/body. The real theme handles precision.
 *
 * It does NOT modify the DOM structure in any way.
 * It does NOT apply to extension-owned nodes (they don't exist yet at
 * document_start, but the [data-my-ext] guard is included for safety
 * in case of future re-injection).
 */

const PRE_FILTER_STYLE_ID = "__sw_pre_filter"

function injectPreFilter(): void {
  // Avoid double-injection (e.g. bfcache navigation)
  if (document.getElementById(PRE_FILTER_STYLE_ID)) return

  const style = document.createElement("style")
  style.id = PRE_FILTER_STYLE_ID
  style.textContent = `
    html:not([data-my-ext]),
    body:not([data-my-ext]) {
      background-color: #0d1117 !important;
      color: #e2e8f0 !important;
      color-scheme: dark !important;
    }
  `
  // At document_start, <head> may not exist yet — append to documentElement
  document.documentElement.appendChild(style)
}

injectPreFilter()

export {}
