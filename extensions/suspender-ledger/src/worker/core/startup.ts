// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/core/startup.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import { prefs, storage } from "./prefs"

/**
 * Startup gate. Callbacks pushed before the worker is `ready` are cached and
 * fired once preferences have been hydrated on the first `onStartup` /
 * `onInstalled` event; callbacks pushed afterwards run immediately.
 */
export type Starters = {
  ready: boolean
  cache: Array<() => void>
  push(c: () => void): void
}

const starters: Starters = {
  ready: false,
  cache: [],
  push(c) {
    if (starters.ready) {
      c()
      return
    }
    starters.cache.push(c)
  },
}

{
  // preferences are only hydrated once here; everywhere else, call storage().then()
  const once = (): Promise<void> => {
    if (starters.ready) return Promise.resolve()
    return storage(prefs).then((ps) => {
      Object.assign(prefs, ps)
      starters.ready = true
      starters.cache.forEach((c) => c())
      starters.cache.length = 0
    })
  }

  // MV3 SW respawn: neither onStartup nor onInstalled fires when the worker is
  // respawned by an event — call once() at module evaluation so the gate opens
  // regardless of how the worker started.
  void once()

  chrome.runtime.onStartup.addListener(() => {
    void once()
  })
  chrome.runtime.onInstalled.addListener(() => {
    void once()
  })
}

export { starters }
