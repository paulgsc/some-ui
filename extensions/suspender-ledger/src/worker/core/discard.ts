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
 * **no** `close` variant: suspender-ledger only ever calls
 * `chrome.tabs.discard` — it never removes a tab. This type exists to make that
 * invariant structural rather than incidental.
 */
export type SuspendOperation = { tabId: number }

/** Tab ids currently mid-discard, used to debounce duplicate requests. */
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
 * The terminal action: discard the tab natively. This is the ONLY place a tab
 * state is changed, and it is `chrome.tabs.discard` — never `chrome.tabs.remove`.
 */
const perform = (tab: chrome.tabs.Tab): Promise<void> =>
  new Promise<void>((resolve) => {
    if (tab.id === undefined) {
      resolve()
      return
    }
    try {
      chrome.tabs.discard(tab.id, () => {
        void chrome.runtime.lastError
        resolve()
      })
    } catch (e) {
      log("discarding failed", e)
      resolve()
    }
  })

function discardImpl(tab: chrome.tabs.Tab): Promise<void> | void {
  if (tab.id === undefined) {
    return
  }
  const tabId = tab.id

  if (inprogress.has(tabId)) {
    return
  }

  // https://github.com/rNeomy/auto-tab-discard/issues/248
  inprogress.add(tabId)
  setTimeout(() => inprogress.delete(tabId), 2000)

  if (tab.active) {
    log("tab is active", tab)
    return
  }
  if (tab.discarded) {
    log("already discarded", tab)
    return
  }

  return storage(prefs).then((ps) => {
    if (
      discard.count > ps["simultaneous-jobs"] &&
      discard.time + 5000 < Date.now()
    ) {
      discard.count = 0
    }
    if (discard.count > ps["simultaneous-jobs"]) {
      log("discarding queue for", tab)
      discard.tabs.push(tab)
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
}

const discard: DiscardFn = Object.assign(discardImpl, {
  tabs: new Array<chrome.tabs.Tab>(),
  count: 0,
  time: 0,
  perform,
})

export { discard, inprogress }
