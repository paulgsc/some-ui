// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Presentation layer: the sleep-marker UI convention, expressed as the two
 * page-context functions that `chrome.scripting.executeScript` injects.
 *
 * These are the ONLY functions in the suspend pipeline that touch
 * `document.title` / `sessionStorage`. They do not decide *when* to run — the
 * domain FSM (`suspend-fsm.ts`) decides that — they only know how to paint and
 * erase the marker once told to. Nothing here reasons about tab lifecycle.
 */

export const RESUME_FLAG_KEY = "__sl_resuming"

/**
 * Runs in the page just before it is discarded:
 *   1. Sets a one-shot sessionStorage flag so `resume-veil.ts` (document_start)
 *      paints a dark cover the instant the browser reloads this tab on
 *      reactivation, instead of letting the page's own background flash first.
 *      sessionStorage survives the discard → reload cycle because it's scoped
 *      to the tab's browsing context, not the renderer process discard tears
 *      down.
 *   2. Prefixes the live `document.title` with the sleep marker. The browser
 *      caches title/favicon at the moment a tab is discarded and keeps
 *      showing that cached value in the tab strip while the tab stays
 *      unloaded, so this is what gives a suspended tab its "💤" without
 *      touching the tab's real address or requiring a second page.
 */
export function markBeforeDiscard(key: string, prefix: string): void {
  try {
    // eslint-disable-next-line extension-charter/no-raw-storage -- runs inside the target page, not extension code; see docstring above.
    sessionStorage.setItem(key, "1")
  } catch {
    // Storage unavailable (e.g. a sandboxed frame) — resume just won't veil.
  }
  // Idempotent: a repeated suspend attempt against a tab snapshot that was
  // never re-queried (so still reports discarded:false) must not re-stack the
  // marker on top of itself.
  if (prefix && !document.title.startsWith(`${prefix} `)) {
    document.title = `${prefix} ${document.title}`
  }
}

/**
 * Inverse of `markBeforeDiscard`: runs in the page and undoes the marker.
 * Removes the sleep prefix from the live `document.title` (only when it is
 * actually present) and clears the one-shot resume flag. Idempotent — safe to
 * run on a tab that was never marked.
 */
export function unmarkAfterDiscard(key: string, prefix: string): void {
  try {
    // eslint-disable-next-line extension-charter/no-raw-storage -- runs inside the target page, mirrors markBeforeDiscard.
    sessionStorage.removeItem(key)
  } catch {
    // Storage unavailable — nothing to clear.
  }
  // Strip every stacked occurrence, not just one — belt-and-suspenders
  // alongside markBeforeDiscard's own idempotency guard.
  while (prefix && document.title.startsWith(`${prefix} `)) {
    document.title = document.title.slice(prefix.length + 1)
  }
}
