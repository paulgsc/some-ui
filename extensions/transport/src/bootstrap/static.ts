/**
 * Definition D.2 (Bootstrap), Theorem D.1 — canon §D.0.
 *
 * Bootstrap owns exactly the mechanism for installing and detecting itself,
 * scoped to the document lifetime `L_D` rather than the content lifetime
 * `L_C` (Definition D.1) — nothing about what a pessimistic default *does*,
 * which is an Adapter's concern (Definition D.3, story S7) once a content
 * session exists.
 *
 * The sentinel lives on `root` (default `document.documentElement`) rather
 * than in module-scoped memory: a same-document (SPA) navigation leaves
 * `root` and its attribute untouched, so Bootstrap is not reinstalled
 * (Theorem D.1(a)); a refresh begins a new `L_D` with a fresh document —
 * and therefore a fresh `root` with no attribute — so the next `install`
 * call installs again (Theorem D.1(b)). The attribute's value is the
 * installation epoch itself, so no separate store is needed to correlate
 * it with Session's epoch (S3).
 */

const SENTINEL_ATTR = "data-transport-bootstrap"

export type BootstrapLayer = {
  readonly root: Element
  readonly installedAt: number
}

export function install(
  root: Element = document.documentElement
): BootstrapLayer {
  const existing = root.getAttribute(SENTINEL_ATTR)
  if (existing !== null) {
    return { root, installedAt: Number(existing) }
  }
  const installedAt = Date.now()
  root.setAttribute(SENTINEL_ATTR, String(installedAt))
  return { root, installedAt }
}

export function isInstalled(root: Element = document.documentElement): boolean {
  return root.hasAttribute(SENTINEL_ATTR)
}

export function installedAt(
  root: Element = document.documentElement
): number | undefined {
  const value = root.getAttribute(SENTINEL_ATTR)
  return value === null ? undefined : Number(value)
}

/**
 * Removes the sentinel so a subsequent `install()` call reinstalls fresh.
 * Only Lifecycle's `teardownDocument()` (S10) calls this — it is Theorem
 * D.1(b)'s "Bootstrap is reinstalled" half, made callable without waiting
 * for an actual page refresh to supply a new `root`.
 */
export function uninstall(root: Element = document.documentElement): void {
  root.removeAttribute(SENTINEL_ATTR)
}
