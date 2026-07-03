// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/core/discard.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

/**
 * Orchestrator: composes the domain FSM (`suspend-fsm.ts`) with the browser
 * adapter (`discard-adapter.ts`) to drive one tab's suspend lifecycle, plus
 * the multi-tab runtime coordination (queueing, cooldown, de-duplication)
 * that the FSM — which only knows about a single tab in isolation — has no
 * opinion on.
 *
 * `discard.ts` itself does not call `chrome.tabs.discard` or
 * `chrome.scripting.executeScript` directly; every browser side effect goes
 * through the adapter. That keeps this file answering "what should happen
 * next for this tab" (via `reduce`) rather than "how does the browser behave
 * today."
 */

import {
  getTab,
  injectMark,
  injectUnmark,
  requestDiscard,
} from "./discard-adapter"
import { prefs, storage } from "./prefs"
import {
  INITIAL_STATE,
  invariant,
  isSettled,
  reduce,
  type SuspendEvent,
  type SuspendState,
} from "./suspend-fsm"
import { log } from "./utils"

/**
 * The single suspend operation this extension performs. There is intentionally
 * **no** `close` variant: suspender-ledger discards a tab natively — it never
 * removes a tab. This type exists to make that invariant structural rather
 * than incidental.
 */
export type SuspendOperation = { tabId: number }

/**
 * In-flight FSM state per tab, for the lifetime of this worker instance. Only
 * *unsettled* tabs are present — once a tab reaches a settled state (idle,
 * blocked, or cleanly discarded) there is no follow-up obligation left to
 * track, so its entry is dropped rather than kept around forever.
 *
 * MV3 service workers are recycled, so this map does not survive a worker
 * restart. `reconcileActivatedTab` below has an explicit fallback for the
 * case where a tab's marker outlived this map's memory of it.
 */
const tabStates = new Map<number, SuspendState>()

/** Apply one FSM transition for `tabId`, updating (or clearing) `tabStates`. */
function transition(
  tabId: number,
  from: SuspendState,
  event: SuspendEvent
): SuspendState {
  const next = reduce(from, event)
  if (!invariant(next)) {
    // Unreachable given the fixed transition table (see suspend-fsm.ts) — a
    // future edge that produces this has a bug, not this tab a bad day.
    log("suspend-fsm invariant violated", { tabId, from, event, next })
  }
  if (isSettled(next)) {
    tabStates.delete(tabId)
  } else {
    tabStates.set(tabId, next)
  }
  return next
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

/**
 * The terminal action: drive one tab through its suspend lifecycle by
 * dispatching FSM events and letting the *resulting state* pick the next
 * adapter call — never the other way around. This is the ONLY place a tab's
 * state is changed, and it always routes through `chrome.tabs.discard` via
 * the adapter — never `chrome.tabs.remove`.
 *
 * Native discard (rather than navigating to an owned `suspend.html`) keeps the
 * browser's own tab.url/title/favIconUrl intact — no `moz-extension://` URL,
 * full awesome-bar / "switch to tab" fidelity. Marking runs first so
 * `resume-veil.ts` can cover the reactivation reload before first paint, and
 * so the tab strip shows the `prepends` marker while the tab stays discarded.
 */
const perform = (tab: chrome.tabs.Tab): Promise<void> =>
  new Promise<void>((resolve) => {
    if (tab.id === undefined) {
      resolve()
      return
    }
    const tabId = tab.id

    let state = transition(tabId, tabStates.get(tabId) ?? INITIAL_STATE, {
      type: "SUSPEND_REQUESTED",
    })

    void injectMark(tabId, prefs.prepends).then((outcome) => {
      state = transition(
        tabId,
        state,
        outcome === "applied"
          ? { type: "MARK_APPLIED" }
          : { type: "MARK_SKIPPED" }
      )

      void requestDiscard(tabId).then((attempt) => {
        if (attempt.ok) {
          transition(tabId, state, { type: "DISCARD_SUCCEEDED" })
          resolve()
          return
        }

        // Still refused after the adapter's own retry — a real block
        // (audible, policy), not a transient race.
        log("discard failed", attempt.message)
        state = transition(tabId, state, { type: "DISCARD_FAILED" })

        if (state.kind !== "ROLLING_BACK") {
          // Bare tab (never marked) — nothing to strip, just fall back to ACTIVE.
          resolve()
          return
        }

        // We already marked the page; strip it before resolving, otherwise it
        // is stranded on a live tab (the ORPHANED state the FSM forbids).
        void injectUnmark(tabId, prefs.prepends).then(() => {
          transition(tabId, state, { type: "MARKER_CLEARED" })
          resolve()
        })
      })
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
    transition(tabId, tabStates.get(tabId) ?? INITIAL_STATE, {
      type: "MEDIA_PLAYING",
    })
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
 * Heal a marker on tab activation.
 *
 * Two distinct cases, in order:
 *
 *   1. This worker instance has a tracked in-flight suspend for the tab and
 *      it is still `SUSPENDING` (marked, discard not yet confirmed) — the
 *      user refocused mid-suspend. This is the FSM's own
 *      `SUSPENDING + TAB_ACTIVATED → ROLLING_BACK` edge; route the actual
 *      unmark through it rather than re-deriving the decision from scratch.
 *
 *   2. Nothing is tracked for this tab in `tabStates` — either it never
 *      carried a marker, it's a cleanly discarded tab, or (the case this
 *      exists for) an MV3 service-worker restart erased this module's memory
 *      of an in-flight suspend between marking and discard. `tab.title` is a
 *      projection of state, not the state itself, but once our own
 *      bookkeeping is gone it is the only signal left — so it is used here
 *      strictly as a recovery heuristic for that amnesia case, never as the
 *      primary decision path.
 *
 * Idempotent either way.
 */
function reconcileActivatedTab(tabId: number): void {
  const marker = prefs.prepends
  if (!marker) {
    return
  }

  const tracked = tabStates.get(tabId)
  if (tracked?.kind === "SUSPENDING") {
    const rollingBack = transition(tabId, tracked, { type: "TAB_ACTIVATED" })
    if (rollingBack.kind === "ROLLING_BACK") {
      void injectUnmark(tabId, marker).then(() => {
        transition(tabId, rollingBack, { type: "MARKER_CLEARED" })
      })
    }
    return
  }

  getTab(tabId, (tab) => {
    if (!tab || tab.discarded) {
      return
    }
    if (typeof tab.title === "string" && tab.title.startsWith(`${marker} `)) {
      log("stripping stranded marker on activated tab", tabId)
      void injectUnmark(tabId, marker)
    }
  })
}

chrome.tabs.onActivated.addListener(({ tabId }) => reconcileActivatedTab(tabId))

export { discard, inprogress, reconcileActivatedTab }
