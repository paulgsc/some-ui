// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/firefox.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

/**
 * Firefox platform adapter.
 *
 * Importing this module installs the `autoDiscardable` compatibility shim:
 * Firefox does not honor the `autoDiscardable` property on `tabs.update` /
 * `tabs.query`, so it is emulated here via a local cache. The shim is a no-op
 * outside Firefox.
 *
 * The upstream popup branch relied on `chrome.runtime.getBackgroundPage`, which
 * is removed under MV3; that branch is intentionally dropped.
 */

/** Convenience handle on the Firefox `browser.*` namespace. */
export const ext: typeof browser = globalThis.browser

const isFirefox =
  typeof navigator !== "undefined" && /Firefox/.test(navigator.userAgent)

if (isFirefox) {
  // tab ids whose autoDiscardable was set to false
  const cache: Record<number, boolean> = {}
  chrome.tabs.onRemoved.addListener((id) => {
    delete cache[id]
  })

  chrome.tabs.update = new Proxy(chrome.tabs.update, {
    apply(target, self, args: Array<unknown>): void {
      // args is either (updateProps) or (tabId, updateProps)
      const props = args.length > 1 ? args[1] : args[0]
      if (props !== null && typeof props === "object") {
        if ("autoDiscardable" in props) {
          if (typeof args[0] === "number") {
            const id = args[0]
            if (Reflect.get(props, "autoDiscardable")) {
              delete cache[id]
            } else {
              cache[id] = true
            }
          }
          Reflect.deleteProperty(props, "autoDiscardable")
        }
        if (Object.keys(props).length) {
          Reflect.apply(target, self, args)
        }
      }
    },
  })

  chrome.tabs.query = new Proxy(chrome.tabs.query, {
    apply(target, self, args: Array<unknown>): void {
      const queryInfo = args[0]
      const callback = args[1]
      if (
        queryInfo === null ||
        typeof queryInfo !== "object" ||
        typeof callback !== "function"
      ) {
        Reflect.apply(target, self, args)
        return
      }
      const wantAutoDiscardable = Reflect.get(queryInfo, "autoDiscardable")
      Reflect.deleteProperty(queryInfo, "autoDiscardable")
      const wantStatus = Reflect.get(queryInfo, "status")
      Reflect.deleteProperty(queryInfo, "status")

      Reflect.apply(target, self, [
        queryInfo,
        (tabs: Array<chrome.tabs.Tab>): void => {
          let result = tabs
          if (wantAutoDiscardable) {
            result = result.filter(
              (t) => t.id === undefined || cache[t.id] !== true
            )
          }
          if (wantStatus) {
            result = result.filter((t) => t.status === wantStatus)
          }
          for (const tab of result) {
            if (tab.id !== undefined && cache[tab.id]) {
              tab.autoDiscardable = false
            }
          }
          callback(result)
        },
      ])
    },
  })
}
