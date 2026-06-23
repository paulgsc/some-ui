// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/core/navigate.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import { query } from "./utils"

/**
 * Tab focus navigation. Upstream also supported a `close` method that called
 * `chrome.tabs.remove`; that variant is intentionally **removed** here to honor
 * the never-close invariant. Only focus movement remains.
 */
export type NavigateMethod = "move-next" | "move-previous"

/** Narrowing guard for dispatching string commands to `navigate`. */
export function isMoveCommand(value: string): value is NavigateMethod {
  return value === "move-next" || value === "move-previous"
}

export function navigate(
  method: NavigateMethod,
  discarded = false
): Promise<void> {
  return query({ currentWindow: true }).then((tbs): void | Promise<void> => {
    const active = tbs.filter((t) => t.active).shift()
    if (!active) {
      return undefined
    }

    const next = tbs.filter(
      (t) => t.discarded === discarded && t.index > active.index
    )
    const previous = tbs.filter(
      (t) => t.discarded === discarded && t.index < active.index
    )

    let ntab: chrome.tabs.Tab | undefined
    if (method === "move-next") {
      ntab = next.length ? next.shift() : previous.shift()
    } else {
      ntab = previous.length ? previous.pop() : next.pop()
    }

    if (ntab?.id !== undefined) {
      void chrome.tabs.update(ntab.id, { active: true })
      return undefined
    }

    // prevent infinite loop — fall through to discarded tabs once
    // https://github.com/rNeomy/auto-tab-discard/issues/41#issuecomment-422923307
    if (discarded === false) {
      return navigate(method, true)
    }

    return undefined
  })
}
