// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Browser adapter: everything `discard.ts` needs to know about how
 * `chrome.tabs.discard` / `chrome.scripting.executeScript` actually behave,
 * normalized into plain result types.
 *
 * This is the ONLY module that calls `chrome.tabs.discard` or injects the
 * title-marker scripts. It knows about retries, callback-vs-lastError
 * normalization, and transient-rejection quirks — none of which are domain
 * concerns (see suspend-fsm.ts) and none of which the orchestrator
 * (discard.ts) should have to reason about beyond "did it work."
 */

import {
  markBeforeDiscard,
  RESUME_FLAG_KEY,
  unmarkAfterDiscard,
} from "./title-marker"
import { log } from "./utils"

export type MarkOutcome = "applied" | "skipped"
export type DiscardResult = { ok: true } | { ok: false; message: string }

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** How long to let the browser settle before retrying a failed discard. */
const RETRY_DELAY_MS = 250

/**
 * Injects the sleep marker into the page. Returns `"skipped"` rather than
 * throwing when the tab isn't script-injectable (chrome://, about:, …) — that
 * is an expected, non-exceptional outcome the caller must branch on (the
 * FSM's PREPARING → SUSPENDING_BARE edge), not a failure.
 */
export async function injectMark(
  tabId: number,
  marker: string
): Promise<MarkOutcome> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: markBeforeDiscard,
      args: [RESUME_FLAG_KEY, marker],
    })
    return "applied"
  } catch (e) {
    // No content-injectable document — discard still proceeds; that tab
    // simply won't get the veil or marker.
    log("could not prepare tab for discard", e)
    return "skipped"
  }
}

/**
 * Strips a marker that was applied for a discard that did not stick. Safe to
 * call on a tab with no marker (e.g. one that was never scripted) or one
 * that's already gone (a discard that *did* land) — both are no-ops.
 */
export async function injectUnmark(
  tabId: number,
  marker: string
): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: unmarkAfterDiscard,
      args: [RESUME_FLAG_KEY, marker],
    })
  } catch (e) {
    log("could not roll back discard marker", e)
  }
}

/** One `chrome.tabs.discard` call, normalized to a result instead of a callback. */
function discardOnce(tabId: number): Promise<DiscardResult> {
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

/**
 * `chrome.tabs.discard`, with one retry on rejection.
 *
 * `discard()` is called immediately after a script injection into this same
 * tab (`injectMark`), and — for the manual-suspend caller (menu.ts) — often
 * right after a `tabs.update` focus switch away from this very tab. Both can
 * leave the tab looking "recently touched" to the browser's own
 * discard-eligibility check for a brief moment. That's transient: a single
 * retry after a short delay is enough to let it clear, rather than treating
 * every such race as a real, permanent refusal.
 */
export async function requestDiscard(tabId: number): Promise<DiscardResult> {
  let attempt = await discardOnce(tabId)
  if (!attempt.ok) {
    log("discard failed, retrying once", attempt.message)
    await wait(RETRY_DELAY_MS)
    attempt = await discardOnce(tabId)
  }
  return attempt
}

/**
 * Callback wrapper over `chrome.tabs.get`, normalizing the stale-id/lastError
 * case to `undefined`. Deliberately callback-shaped (not a `Promise`) to
 * match `chrome.tabs.onActivated`'s own synchronous-dispatch semantics in
 * `reconcileActivatedTab`.
 */
export function getTab(
  tabId: number,
  callback: (tab: chrome.tabs.Tab | undefined) => void
): void {
  chrome.tabs.get(tabId, (tab) => {
    // the typings mark `tab` non-optional, but it is undefined at runtime
    // when the id is stale (tab closed between activation and this callback)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (chrome.runtime.lastError || !tab) {
      callback(undefined)
      return
    }
    callback(tab)
  })
}
