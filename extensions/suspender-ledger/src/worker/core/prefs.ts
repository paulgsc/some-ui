// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/core/prefs.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

/**
 * Preference schema and storage helpers for the service worker.
 *
 * Upstream `prefs.mjs` layered a `managed` storage area on top of `local` for
 * enterprise policy overrides. The suspender-ledger beta drops the managed
 * layer (not relevant to an unlisted sign) and reads/writes `local` (and
 * `session` for ephemeral whitelists). The live, mutable `prefs` object is kept
 * up to date by `chrome.storage.onChanged` exactly as upstream.
 */

/** Every persisted preference key with its concrete type. */
export type Prefs = {
  favicon: boolean
  prepends: string
  number: number
  /** discard age threshold, in seconds */
  period: number
  click: string
  "go-hidden": boolean
  "page.context": boolean
  "tab.context": boolean
  "link.context": boolean
  /** whitelisted hostnames and `re:`-prefixed regexp rules */
  whitelist: Array<string>
  "favicon-delay": number
  log: boolean
  "simultaneous-jobs": number
  /** idle detection threshold, in seconds */
  "idle-timeout": number
  /** pinned === true => do not discard pinned tabs */
  pinned: boolean
  "startup-unpinned": boolean
  "startup-pinned": boolean
  "startup-release-pinned": boolean
  /** in seconds */
  "startup-discarding-period": number
}

const isFirefox =
  typeof navigator !== "undefined" && /Firefox/.test(navigator.userAgent)

/** Default values — mirrors upstream `prefs.mjs`. */
export const defaults: Prefs = {
  favicon: false,
  prepends: "💤",
  number: 6,
  period: 10 * 60,
  click: "click.popup",
  "go-hidden": false,
  "page.context": false,
  "tab.context": true,
  "link.context": true,
  whitelist: [],
  "favicon-delay": isFirefox ? 500 : 100,
  log: false,
  "simultaneous-jobs": 10,
  "idle-timeout": 5 * 60,
  pinned: false,
  "startup-unpinned": false,
  "startup-pinned": false,
  "startup-release-pinned": false,
  "startup-discarding-period": 10,
}

/**
 * Live preference object. Starts at defaults and is patched in place by the
 * `onChanged` listener below and by the startup sequence. Modules read from
 * this for synchronous, up-to-date values.
 */
export const prefs: Prefs = { ...defaults }

/** Read the effective preferences, merging stored values over `defaults`. */
export function getPrefs(): Promise<Prefs> {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, (stored) => {
      resolve({ ...defaults, ...stored })
    })
  })
}

/** Persist a partial preference patch to `local` storage. */
export function setPrefs(partial: Partial<Prefs>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(partial, () => resolve())
  })
}

export type StorageArea = "local" | "session"

/**
 * Generic storage reader: resolves the supplied defaults merged with whatever
 * is persisted in the given area. Also exposes `.on(key, cb)` to subscribe to
 * changes for a specific key (ported from upstream `storage.on`).
 */
export type StorageReader = {
  <T extends object>(defaults: T, area?: StorageArea): Promise<T>
  on(key: string, callback: () => void): void
}

const listeners: Record<string, Array<() => void>> = {}

function readStorage<T extends object>(
  fallback: T,
  area: StorageArea = "local"
): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage[area].get(fallback, (stored) => {
      resolve({ ...fallback, ...stored })
    })
  })
}

export const storage: StorageReader = Object.assign(readStorage, {
  on(key: string, callback: () => void): void {
    ;(listeners[key] ??= []).push(callback)
  },
})

// Keep the live `prefs` object and subscribers in sync with persisted changes.
chrome.storage.onChanged.addListener((changes) => {
  for (const key of Object.keys(changes)) {
    const change = changes[key]
    if (!change || !("newValue" in change)) {
      continue
    }
    if (key in prefs) {
      Reflect.set(prefs, key, change.newValue)
    }
    const callbacks = listeners[key]
    if (callbacks) {
      callbacks.forEach((c) => c())
    }
  }
})
