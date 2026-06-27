// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/core/discard.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import { prefs, storage } from "./prefs"
import { buildSuspendUrl, isSuspendTab } from "./suspend-url"
import { log } from "./utils"

/**
 * The single suspend operation this extension performs. There is intentionally
 * **no** `close` variant: suspender-ledger navigates a tab to its themed
 * suspend page — it never removes a tab. This type exists to make that
 * invariant structural rather than incidental.
 */
export type SuspendOperation = { tabId: number }

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
 * The terminal action: natively discard the tab to free renderer memory.
 * Before discarding, a `prepends` title marker is injected via
 * `scripting.executeScript` so the browser tab strip shows the "💤" prefix.
 * If native discard is rejected (pinned tab, protected page, etc.), we fall
 * back to navigating to the themed suspend page.
 *
 * This is the ONLY place tab state is changed — `chrome.tabs.discard` (or on
 * failure `chrome.tabs.update`) — never `chrome.tabs.remove`.
 */
const perform = async (tab: chrome.tabs.Tab): Promise<void> => {
  if (tab.id === undefined) return
  const tabId = tab.id
  const marker = prefs.prepends

  if (marker && tab.title) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (m: string): void => {
          document.title = `${m} ${document.title}`
        },
        args: [marker],
      })
    } catch (e) {
      log("title injection rejected (protected page)", e)
    }
  }

  try {
    await chrome.tabs.discard(tabId)
  } catch (e) {
    log("native discard rejected — falling back to suspend page", e)
    try {
      await chrome.tabs.update(tabId, { url: buildSuspendUrl(tab, marker) })
    } catch (e2) {
      log("suspend fallback navigation failed", e2)
    }
  }
}

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
  if (isSuspendTab(tab)) {
    log("tab already suspended", tab)
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
