// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/core/discard.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import { prefs, storage } from "./prefs"
import { log } from "./utils"

/**
 * The single suspend operation this extension performs. There is intentionally
 * **no** `close` variant: suspender-ledger discards a tab natively — it never
 * removes a tab. This type exists to make that invariant structural rather
 * than incidental.
 */
export type SuspendOperation = { tabId: number }

const RESUME_FLAG_KEY = "__sl_resuming"

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
function markBeforeDiscard(key: string, prefix: string): void {
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

async function prepareForDiscard(tabId: number, marker: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: markBeforeDiscard,
      args: [RESUME_FLAG_KEY, marker],
    })
  } catch (e) {
    // No content-injectable document (e.g. chrome:// or an about: page) —
    // discard still proceeds; that tab simply won't get the veil or marker.
    log("could not prepare tab for discard", e)
  }
}

/**
 * Inverse of `markBeforeDiscard`: runs in the page and undoes the marker.
 * Removes the sleep prefix from the live `document.title` (only when it is
 * actually present) and clears the one-shot resume flag. Idempotent — safe to
 * run on a tab that was never marked.
 */
function unmarkAfterDiscard(key: string, prefix: string): void {
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

/**
 * The `ROLLING_BACK → MARKER_CLEARED` edge of the suspend FSM, made real: strip
 * a marker that was applied for a discard that did not stick. Without this the
 * page would sit live, playing, and wearing the sleep prefix forever — the
 * ORPHANED state the FSM invariant forbids (see suspend-fsm.ts, #344/#345).
 */
async function rollbackMark(tabId: number, marker: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: unmarkAfterDiscard,
      args: [RESUME_FLAG_KEY, marker],
    })
  } catch (e) {
    // The page may be gone (a discard that *did* land) or unscriptable — either
    // way there is no live marker left to strand.
    log("could not roll back discard marker", e)
  }
}

/** Tab ids currently mid-suspend, used to debounce duplicate requests. */
const inprogress = new Set<number>()

/**
 * The queued discard mechanism. `discard.count` tracks in-flight discards;
 * once it exceeds `simultaneous-jobs`, further tabs are parked in
 * `discard.tabs` and drained as earlier discards complete.
 */
type DiscardFn = {
  (tab: chrome.tabs.Tab): Promise<void> | void
  tabs: Array<chrome.tabs.Tab>
  count: number
  time: number
  perform(tab: chrome.tabs.Tab): Promise<void>
}

type DiscardAttempt = { ok: true } | { ok: false; message: string }

/** One `chrome.tabs.discard` call, normalized to a result instead of a callback. */
function discardOnce(tabId: number): Promise<DiscardAttempt> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.discard(tabId, () => {
        const err = chrome.runtime.lastError
        resolve(
          err
            ? { ok: false, message: err.message ?? String(err) }
            : { ok: true }
        )
      })
    } catch (e) {
      resolve({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** How long to let the browser settle before retrying a failed discard. */
const RETRY_DELAY_MS = 250

/**
 * The terminal action: natively discard the tab. This is the ONLY place a
 * tab's state is changed, and it is `chrome.tabs.discard` — never
 * `chrome.tabs.remove`.
 *
 * Native discard (rather than navigating to an owned `suspend.html`) keeps the
 * browser's own tab.url/title/favIconUrl intact — no `moz-extension://` URL,
 * full awesome-bar / "switch to tab" fidelity. `prepareForDiscard` runs first
 * so `resume-veil.ts` can cover the reactivation reload before first paint
 * (verified empirically: a document_start veil pre-empts the reload's own
 * background every time, since document_start content scripts run before
 * first paint regardless of what triggered the navigation) and so the tab
 * strip shows the `prepends` marker while the tab stays discarded.
 *
 * `discard()` is called immediately after `prepareForDiscard` injects a
 * script into this same tab. That injection can itself leave the tab looking
 * "recently touched" to the browser's own discard-eligibility check for a
 * brief moment — and for the manual-suspend caller (menu.ts), this also runs
 * right after a `tabs.update` focus switch away from this very tab, another
 * transition the browser may not have fully settled yet. Both are transient:
 * a single retry after a short delay is enough to let them clear, rather than
 * immediately rolling back a mark that a moment later would have stuck.
 */
const perform = (tab: chrome.tabs.Tab): Promise<void> =>
  new Promise<void>((resolve) => {
    if (tab.id === undefined) {
      resolve()
      return
    }
    const tabId = tab.id
    void prepareForDiscard(tabId, prefs.prepends).finally(() => {
      void (async () => {
        let attempt = await discardOnce(tabId)
        if (!attempt.ok) {
          log("discard failed, retrying once", attempt.message)
          await wait(RETRY_DELAY_MS)
          attempt = await discardOnce(tabId)
        }
        if (!attempt.ok) {
          // Still refused after the retry — a real block (audible, policy),
          // not a transient race. We already marked the page, so strip the
          // marker before resolving — otherwise it is stranded on a live tab
          // (ORPHANED).
          log("discard failed", attempt.message)
          await rollbackMark(tabId, prefs.prepends)
        }
        resolve()
      })()
    })
  })

function discardImpl(tab: chrome.tabs.Tab): Promise<void> | void {
  if (tab.id === undefined) {
    return
  }
  const tabId = tab.id

  if (inprogress.has(tabId)) {
    return
  }

  // https://github.com/rNeomy/auto-tab-discard/issues/248 — cooldown against
  // rapid duplicate requests. Release is tied to the LATER of this cooldown
  // and actual completion of whatever this call decides to do below: a fixed
  // timer alone can expire while a queued or slow-to-complete suspend is still
  // in flight, letting a second concurrent request re-enter and re-mark the
  // same live tab.
  inprogress.add(tabId)
  const cooldown = new Promise<void>((resolve) => setTimeout(resolve, 2000))
  const release = (op: Promise<void>): void => {
    void Promise.all([cooldown, op]).finally(() => inprogress.delete(tabId))
  }

  if (tab.active) {
    log("tab is active", tab)
    release(Promise.resolve())
    return
  }
  if (tab.discarded) {
    log("already discarded", tab)
    release(Promise.resolve())
    return
  }
  // The browser refuses to discard a tab that is playing audio (a YouTube tab,
  // a music player). Skipping here — before marking — is the BLOCKED edge of
  // the suspend FSM: it avoids applying a marker we would only have to roll
  // back, and avoids the misleading "tab wears 💤 but keeps playing" state.
  if (tab.audible) {
    log("tab is audible; suspend skipped", tab)
    release(Promise.resolve())
    return
  }

  const op = storage(prefs).then((ps) => {
    if (
      discard.count > ps["simultaneous-jobs"] &&
      discard.time + 5000 < Date.now()
    ) {
      discard.count = 0
    }
    if (discard.count > ps["simultaneous-jobs"]) {
      // A duplicate request for a tab already sitting in the queue must not
      // push a second copy — that would eventually run perform() twice for
      // the same tab and re-mark a title the first copy already marked.
      if (!discard.tabs.some((qt) => qt.id === tabId)) {
        log("discarding queue for", tab)
        discard.tabs.push(tab)
      }
      return
    }

    return new Promise<void>((resolve) => {
      discard.count += 1
      discard.time = Date.now()
      void discard.perform(tab).then(() => {
        discard.count -= 1
        const nextTab = discard.tabs.shift()
        if (nextTab) {
          if (nextTab.id !== undefined) {
            inprogress.delete(nextTab.id)
          }
          void discard(nextTab)
        }
        resolve()
      })
    })
  })
  release(op)
  return op
}

const discard: DiscardFn = Object.assign(discardImpl, {
  tabs: new Array<chrome.tabs.Tab>(),
  count: 0,
  time: 0,
  perform,
})

/**
 * Heal a stranded marker on tab activation.
 *
 * If an activated tab is still live (not discarded) yet its title carries the
 * sleep prefix, the marker was left behind — a discard the browser refused, a
 * refocus that raced the discard callback, or a tab orphaned by an older build.
 * A reactivated *discarded* tab reloads and resets its own title, so those are
 * left alone; only live, marker-bearing tabs are cleaned. Idempotent.
 */
function reconcileActivatedTab(tabId: number): void {
  const marker = prefs.prepends
  if (!marker) {
    return
  }
  chrome.tabs.get(tabId, (tab) => {
    // the typings mark `tab` non-optional, but it is undefined at runtime when
    // the id is stale (tab closed between activation and this callback)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (chrome.runtime.lastError || !tab || tab.discarded) {
      return
    }
    if (typeof tab.title === "string" && tab.title.startsWith(`${marker} `)) {
      log("stripping stranded marker on activated tab", tabId)
      void rollbackMark(tabId, marker)
    }
  })
}

chrome.tabs.onActivated.addListener(({ tabId }) => reconcileActivatedTab(tabId))

export { discard, inprogress, reconcileActivatedTab }
