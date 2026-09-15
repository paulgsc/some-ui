/**
 * Diagnostics entry-point typestate — defined once in commons.
 *
 * Every workspace with a `debug.html` diagnostics page (some-filter,
 * suspender-ledger, some-censor) exposes the same two entry points into it: a
 * "Diagnostics" link in the popup footer, and a right-click "tab"
 * context-menu item. Per Charter idiom #3 ("commands are more important than
 * inputs"), both are just inputs feeding one command — open this workspace's
 * `debug.html` — so this module owns that command's shape once instead of
 * each workspace hand-authoring the same DOM node and menu-id bookkeeping.
 *
 * What stays local, deliberately: registering `contextMenus.create` and
 * `contextMenus.onClicked` against a workspace's own `ext` object, and
 * calling `ext.tabs.create`. Those are the "mechanical plumbing" — a couple
 * of lines each — and the Chrome/Firefox `contexts` typing already disagrees
 * per workspace (Chrome's `ContextType` has no "tab"), so hoisting the call
 * itself would just relocate a type fight rather than remove it. What
 * commons can own without depending on any `chrome`/`browser` types at all
 * is the id, the click-match, and the link's DOM — that's what is here.
 *
 * Model lifted from some-filter's `src/popup/popup.ts` `diagnosticsLink()`
 * (verbatim-duplicated in suspender-ledger's `src/popup/index.ts`) and
 * some-filter's `src/background/background.ts` "Open diagnostics" tab menu
 * item. See GOOD_CITIZEN.md § 3.
 */

/** Namespaced context-menu item id for a workspace's "Open diagnostics" tab
 * menu entry. Namespacing follows Charter idiom #4 — each workspace owns one
 * prefix, so ids can never collide across workspaces sharing a profile. */
export function diagnosticsMenuId(namespace: string): string {
  return `${namespace}-open-diagnostics`
}

/** True when a `contextMenus.onClicked` event fired the workspace's own
 * diagnostics entry, keyed by the id `diagnosticsMenuId` produced. */
export function isDiagnosticsMenuClick(
  menuItemId: string | number,
  id: string
): boolean {
  return String(menuItemId) === id
}

export type DiagnosticsMenuItem = {
  readonly id: string
  readonly title: string
}

/**
 * Plain data for `contextMenus.create` — deliberately untyped against any
 * specific `chrome`/`browser` `CreateProperties` shape. The caller spreads
 * this into its own platform-specific call (adding `contexts` itself, since
 * Chrome and Firefox disagree on whether `"tab"` is a valid context).
 */
export function diagnosticsMenuItem(
  namespace: string,
  title = "Open diagnostics"
): DiagnosticsMenuItem {
  return { id: diagnosticsMenuId(namespace), title }
}

export type DiagnosticsLinkOptions = {
  /** Absolute extension-page URL for `debug.html`, e.g.
   * `ext.runtime.getURL("debug.html")`. */
  readonly href: string
  /** Tooltip text — what this workspace's diagnostics page covers. */
  readonly tooltip: string
  /** Link text. Defaults to "Diagnostics". */
  readonly label?: string
}

/**
 * Builds the popup's "Diagnostics" footer link.
 *
 * Deliberately just a link, not a live health summary: the popup must stay
 * fast to open, and the diagnostics page it opens computes health on demand
 * instead of over a message round trip to the background/worker on every
 * popup open. This is the DOM some-filter and suspender-ledger each
 * hand-authored identically (`popup__footer` > `popup__diagnostics`), now
 * defined once.
 */
export function diagnosticsLink({
  href,
  tooltip,
  label = "Diagnostics",
}: DiagnosticsLinkOptions): HTMLElement {
  const footer = document.createElement("footer")
  footer.className = "popup__footer"

  const link = document.createElement("a")
  link.className = "popup__diagnostics"
  link.href = href
  link.target = "_blank"
  link.rel = "noopener"
  link.textContent = label
  link.title = tooltip

  footer.appendChild(link)
  return footer
}
