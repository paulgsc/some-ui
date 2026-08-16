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
  getTabSnapshot,
  injectMark,
  injectUnmark,
  requestDiscard,
} from "./discard-adapter"
import { clearSkipped, markSkipped } from "./discard-state"
import {
  count,
  forgetTab,
  observe,
  record,
  registerStateProbe,
  safeOrigin,
  snapshotTab,
} from "./observability"
import { prefs, storage } from "./prefs"
import {
  INITIAL_STATE,
  invariant,
  isSettled,
  reduce,
  type SuspendEvent,
  type SuspendState,
} from "./suspend-fsm"
import { trace } from "./trace"
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
  trace("fsm.transition", tabId, `${from.kind} + ${event.type} -> ${next.kind}`)
  if (!invariant(next)) {
    // Unreachable given the fixed transition table (see suspend-fsm.ts) — a
    // future edge that produces this has a bug, not this tab a bad day.
    log("suspend-fsm invariant violated", { tabId, from, event, next })
    count("fsm_violations")
    record(
      "fsm.violation",
      tabId,
      { from: from.kind, event: event.type, next: next.kind },
      "error"
    )
  }
  if (isSettled(next)) {
    tabStates.delete(tabId)
  } else {
    tabStates.set(tabId, next)
  }
  return next
}

/**
 * Tab ids currently mid-suspend, mapped to when the attempt started. Used to
 * debounce duplicate requests; the timestamps additionally let the
 * NoStuckInFlightSuspend invariant notice an attempt that never settles, which
 * would otherwise block every later suspend of that tab forever and in total
 * silence.
 */
const inprogress = new Map<number, number>()

// Publish in-flight state to the health checks. Registered rather than
// imported so `observability.ts` — which this module records into — never has
// to import back.
registerStateProbe(() => ({
  inFlight: [...inprogress].map(([tabId, startedAt]) => ({ tabId, startedAt })),
}))

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
 * Did the discard actually land?
 *
 * Returns `true` when the browser now reports the tab as discarded, `false`
 * when it is demonstrably still live (the silent no-op), and `undefined` when
 * we cannot tell — the tab is gone, or `tabs.get` failed. Unknown is
 * deliberately *not* folded into failure: rolling a marker back on a guess
 * would run `executeScript` against a possibly-discarded tab and reload it,
 * which is a strictly worse bug than the one being detected.
 *
 * The browser updates a tab's `discarded` flag asynchronously with respect to
 * the `discard()` promise, so a single immediate read would report a false
 * no-op on a discard that was merely still settling. One short re-check is
 * enough to separate "slow" from "didn't happen".
 */
async function confirmDiscarded(tabId: number): Promise<boolean | undefined> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>((r) => setTimeout(r, VERIFY_DELAY_MS))
    }
    const snapshot = await getTabSnapshot(tabId)
    if (!snapshot) {
      // Tab closed out from under us — nothing left to be wrong about.
      return undefined
    }
    if (snapshot.discarded) {
      return true
    }
  }
  return false
}

/** How long to let a discard settle before calling it a no-op. */
const VERIFY_DELAY_MS = 250

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
    const startedAt = Date.now()
    const origin = safeOrigin(tab.url)
    trace("perform:start", tabId, { url: tab.url, title: tab.title })
    count("suspend_attempts")
    snapshotTab(tabId, { fsm: "PREPARING", origin, lastAttemptAt: startedAt })

    /** Terminal bookkeeping for one suspend attempt. */
    const settle = (
      outcome: "succeeded" | "noop" | "failed" | "rolled_back"
    ): void => {
      observe("suspend_latency_ms", Date.now() - startedAt)
      snapshotTab(tabId, { origin, lastAttemptAt: startedAt, outcome })
    }

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
      record("suspend.marked", tabId, { outcome, origin })

      void requestDiscard(tabId).then(async (attempt) => {
        trace("perform:requestDiscard-result", tabId, attempt)
        if (attempt.ok) {
          // A resolved `tabs.discard` is a claim, not a receipt. Firefox
          // resolves it happily for tabs it then declines to discard (a
          // beforeunload handler, a tab the browser considers too recently
          // used) — a silent no-op that leaves the tab live and wearing the
          // sleep marker, which is indistinguishable from success at this
          // call site and was invisible in every log we had. Confirm against
          // the browser's own view before believing it. `tabs.get` reads
          // cached metadata, so unlike executeScript it can never
          // materialize (reload) a tab that really did discard.
          const landed = await confirmDiscarded(tabId)
          if (landed !== false) {
            transition(tabId, state, { type: "DISCARD_SUCCEEDED" })
            count("suspend_succeeded")
            record("suspend.discarded", tabId, {
              origin,
              verified: landed === true,
            })
            clearSkipped(tabId)
            settle("succeeded")
            trace("perform:done-success", tabId)
            resolve()
            return
          }

          // Reported success, still live: the silent no-op. Treat it exactly
          // as a refusal — strip the marker rather than strand it on a tab the
          // user can still see and use.
          count("suspend_noop")
          record(
            "suspend.noop",
            tabId,
            { origin, why: "discard resolved but tab is still live" },
            "warn"
          )
          markSkipped(tabId, "protected")
          state = transition(tabId, state, { type: "DISCARD_FAILED" })
          if (state.kind !== "ROLLING_BACK") {
            settle("noop")
            resolve()
            return
          }
          void injectUnmark(tabId, prefs.prepends).then(() => {
            transition(tabId, state, { type: "MARKER_CLEARED" })
            count("suspend_rolled_back")
            record("suspend.rolled_back", tabId, { origin, after: "noop" })
            settle("rolled_back")
            resolve()
          })
          return
        }

        // A reported discard failure is NOT proof the tab is still live. On
        // Firefox a discard can succeed while still surfacing `lastError`, and
        // the adapter's retry can land on an already-discarded tab. Trusting
        // the error alone and rolling back would run `executeScript`
        // (injectUnmark) against a tab the browser has already discarded —
        // which has no live renderer, so Firefox can only satisfy the
        // injection by RELOADING the tab in the background: fresh document,
        // marker gone, focus unchanged. That is the "suspended tab silently
        // refreshes" bug. Verify ground truth first; `getTabSnapshot`
        // (`tabs.get`) reads cached metadata and never materializes the tab.
        const snapshot = await getTabSnapshot(tabId)
        trace(
          "perform:post-failure-snapshot",
          tabId,
          snapshot && {
            discarded: snapshot.discarded,
            status: snapshot.status,
          }
        )
        if (snapshot?.discarded !== false) {
          // Gone, or actually discarded despite the error — the marker is now
          // the browser's cached title, exactly as intended. Never inject into
          // a non-live tab.
          log(
            "discard reported failure but tab is not live; keeping marker",
            attempt.message
          )
          transition(tabId, state, { type: "DISCARD_SUCCEEDED" })
          count("suspend_succeeded")
          record("suspend.discarded", tabId, {
            origin,
            verified: true,
            despiteError: attempt.message,
          })
          clearSkipped(tabId)
          settle("succeeded")
          trace("perform:done-false-negative", tabId)
          resolve()
          return
        }

        // Genuinely still live → a real block (audible, policy), not a
        // transient race. Strip the marker so it is not stranded on a live tab
        // (the ORPHANED state the FSM forbids).
        log(
          "discard refused; tab still live, rolling back marker",
          attempt.message
        )
        count("suspend_failed")
        record(
          "suspend.failed",
          tabId,
          { origin, error: attempt.message },
          "warn"
        )
        markSkipped(tabId, "protected")
        state = transition(tabId, state, { type: "DISCARD_FAILED" })

        if (state.kind !== "ROLLING_BACK") {
          // Bare tab (never marked) — nothing to strip, just fall back to ACTIVE.
          settle("failed")
          trace("perform:done-bare-refused", tabId)
          resolve()
          return
        }

        void injectUnmark(tabId, prefs.prepends).then(() => {
          transition(tabId, state, { type: "MARKER_CLEARED" })
          count("suspend_rolled_back")
          record("suspend.rolled_back", tabId, { origin, after: "refused" })
          settle("rolled_back")
          trace("perform:done-rolled-back", tabId)
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
  trace("discardImpl:called", tabId, {
    active: tab.active,
    discarded: tab.discarded,
    audible: tab.audible,
    status: tab.status,
  })

  if (inprogress.has(tabId)) {
    trace("discardImpl:skip-inprogress", tabId)
    return
  }

  // https://github.com/rNeomy/auto-tab-discard/issues/248 — cooldown against
  // rapid duplicate requests. Release is tied to the LATER of this cooldown
  // and actual completion of whatever this call decides to do below: a fixed
  // timer alone can expire while a queued or slow-to-complete suspend is still
  // in flight, letting a second concurrent request re-enter and re-mark the
  // same live tab.
  inprogress.set(tabId, Date.now())
  const cooldown = new Promise<void>((resolve) => setTimeout(resolve, 2000))
  const release = (op: Promise<void>): void => {
    void Promise.all([cooldown, op]).finally(() => inprogress.delete(tabId))
  }

  if (tab.active) {
    log("tab is active", tab)
    trace("discardImpl:skip-active", tabId)
    release(Promise.resolve())
    return
  }
  if (tab.discarded) {
    log("already discarded", tab)
    trace("discardImpl:skip-already-discarded", tabId)
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
    trace("discardImpl:skip-audible", tabId)
    markSkipped(tabId, "media")
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
        count("suspend_queued")
        record("suspend.queued", tabId, {
          origin: safeOrigin(tab.url),
          depth: discard.tabs.length + 1,
          inFlight: discard.count,
        })
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
  trace("reconcileActivatedTab:called", tabId, {
    tracked: tabStates.get(tabId)?.kind,
  })
  const marker = prefs.prepends
  if (!marker) {
    return
  }

  const tracked = tabStates.get(tabId)
  if (tracked?.kind === "SUSPENDING") {
    trace("reconcileActivatedTab:refocus-mid-suspend", tabId)
    const rollingBack = transition(tabId, tracked, { type: "TAB_ACTIVATED" })
    if (rollingBack.kind === "ROLLING_BACK") {
      record("reconcile.activated", tabId, { case: "refocus-mid-suspend" })
      void injectUnmark(tabId, marker).then(() => {
        transition(tabId, rollingBack, { type: "MARKER_CLEARED" })
        count("reconcile_repairs")
        record("reconcile.repaired", tabId, { via: "fsm-rollback" })
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
      trace("reconcileActivatedTab:title-heuristic-rollback", tabId, tab.title)
      count("reconcile_repairs")
      record(
        "reconcile.repaired",
        tabId,
        { via: "title-heuristic", origin: safeOrigin(tab.url) },
        "warn"
      )
      void injectUnmark(tabId, marker)
    }
  })
}

chrome.tabs.onActivated.addListener(({ tabId }) => reconcileActivatedTab(tabId))

/**
 * Ground truth from the browser about tabs we are mid-decision on.
 *
 * This listener used to record *every* `onUpdated` — every favicon, every
 * title change, every load-progress tick across every tab. That is a firehose
 * that would fill a 500-event ring in under a minute of normal browsing and
 * bury the handful of events worth reading. It is filtered to the two signals
 * that actually settle a question: a change in the `discarded` flag (did the
 * suspend land? did something silently un-suspend it?), and any update at all
 * on a tab we are currently acting on.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const tracked = tabStates.get(tabId)?.kind
  const acting = tracked !== undefined || inprogress.has(tabId)
  if (changeInfo.discarded === undefined && !acting) {
    return
  }
  if (changeInfo.discarded === true) {
    // The tab is no longer being kept awake, however it got discarded — the
    // periodic sweep only ever queries `discarded: false` tabs, so a tab
    // discarded by the browser's own memory pressure, another extension, or
    // this extension's own success would otherwise never revisit this tab to
    // clear a stale entry itself.
    clearSkipped(tabId)
  }
  record("browser.tab_updated", tabId, {
    changeInfo: {
      discarded: changeInfo.discarded ?? null,
      status: changeInfo.status ?? null,
      title: changeInfo.title === undefined ? null : "(changed)",
    },
    discarded: tab.discarded === true,
    active: tab.active,
    tracked: tracked ?? null,
    inprogress: inprogress.has(tabId),
  })
})
chrome.tabs.onRemoved.addListener((tabId) => {
  record("browser.tab_removed", tabId)
  // Drop per-tab belief with the tab, so the snapshot map tracks the current
  // profile rather than every tab ever opened.
  forgetTab(tabId)
  clearSkipped(tabId)
})

export { discard, inprogress, reconcileActivatedTab }
