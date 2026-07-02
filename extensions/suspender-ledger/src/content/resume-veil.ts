// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * document_start veil for tabs coming back from a native `chrome.tabs.discard`.
 *
 * Reactivating a discarded tab is an ordinary top-level navigation (the
 * browser reloads the last-committed URL) — content scripts registered at
 * document_start still run before first paint, exactly as they would for any
 * other load. This script uses that guarantee to cover the reload with a dark
 * veil instead of letting the page's own (often light) background flash
 * before the user sees anything.
 *
 * `discard.ts` sets a one-shot sessionStorage flag on the tab immediately
 * before calling `chrome.tabs.discard`. sessionStorage survives the
 * discard → reload cycle (it is scoped to the tab's browsing context, not the
 * renderer process), so it is readable synchronously here, before the page's
 * own stylesheet has had a chance to paint. The flag is consumed (removed) on
 * read so a later, unrelated manual reload of the same page doesn't re-veil.
 */

const RESUME_FLAG_KEY = "__sl_resuming"
const VEIL_ID = "__sl_resume_veil"

function consumeResumeFlag(): boolean {
  try {
    // eslint-disable-next-line extension-charter/no-raw-storage -- one-shot cross-reload signal; chrome.storage is async and can't be read before first paint.
    if (sessionStorage.getItem(RESUME_FLAG_KEY) !== "1") return false
    // eslint-disable-next-line extension-charter/no-raw-storage
    sessionStorage.removeItem(RESUME_FLAG_KEY)
    return true
  } catch {
    return false
  }
}

function paintVeil(): void {
  const veil = document.createElement("div")
  veil.id = VEIL_ID
  veil.style.cssText =
    "position:fixed;inset:0;background:#0d1117;z-index:2147483647;"
  document.documentElement.appendChild(veil)
}

function liftVeil(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.getElementById(VEIL_ID)?.remove()
    })
  )
}

if (consumeResumeFlag()) {
  paintVeil()
  if (document.readyState === "complete") {
    liftVeil()
  } else {
    window.addEventListener("load", liftVeil, { once: true })
  }
}

export {}
