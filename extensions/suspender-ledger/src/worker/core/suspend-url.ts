// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Builds the `suspend.html` URL for a tab about to be suspended.
 *
 * The original address and the tab-strip marker are carried in the page's
 * **hash fragment**, not the query string, and the original URL is the verbatim
 * tail after `uri=`:
 *
 *   moz-extension://…/suspend.html#title=💤+Example&uri=https://example.com/a?b=c
 *
 * Why this shape (#339): Firefox's `%` awesome-bar restricts matching to open
 * tabs and matches against tab title + URL. The previous `?url=<encoded>` form
 * percent-encoded the whole address into a wall of `%3A%2F%2F` soup that the
 * awesome bar could neither read nor usefully match, and a reflected favicon
 * `data:` URI made it worse. Keeping the address as the readable, unencoded tail
 * of the fragment means the real URL shows through; pairing it with the prefixed
 * title (set by the suspend page) makes `%`-search land on the right tab.
 *
 * The address is the *last* field and is read by slicing everything after
 * `uri=`, never by splitting on `&`, so a query string of its own (`?a=1&b=2`)
 * survives intact. The favicon is deliberately not embedded at all — the suspend
 * page shows its own suspended badge (see #317).
 *
 * The companion reader is `parseSuspendParams` in `src/suspend/params.ts`. The
 * two are intentionally split across the worker/page boundary so this module
 * never becomes a chunk shared with the classic background script (which cannot
 * use ESM `import`); `suspend-url.test.ts` round-trips them to keep the format
 * in lockstep. The `uri=` separator below must match that reader.
 */

/** Field marker for the verbatim original address; keep in sync with the reader. */
const URI_FIELD = "uri="

/**
 * Constructs the `suspend.html` URL for a tab about to be suspended. The marker
 * is guaranteed non-empty so the resulting tab title can never be the verbatim
 * original (a deceptive-pattern trigger — see #317): an empty user marker falls
 * back to a literal `[Suspended]` prefix.
 */
export function buildSuspendUrl(tab: chrome.tabs.Tab, marker: string): string {
  const base = chrome.runtime.getURL("suspend.html")
  const safeMarker = marker || "[Suspended]"
  const title = [safeMarker, tab.title].filter(Boolean).join(" ")

  const fields = new URLSearchParams()
  if (title) {
    fields.set("title", title)
  }
  let fragment = fields.toString()
  if (tab.url) {
    // Appended raw and last so the address stays human-readable; everything
    // after `uri=` is the original URL, `&`-and-all.
    fragment += `${fragment ? "&" : ""}${URI_FIELD}${tab.url}`
  }
  return fragment ? `${base}#${fragment}` : base
}

/**
 * True when the tab is already showing our suspend page, used to prevent
 * double-suspending a parked tab. Matches both the current hash form and the
 * legacy query form (they share the `suspend.html` prefix).
 */
export function isSuspendTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? ""
  return url.startsWith(chrome.runtime.getURL("suspend.html"))
}
