// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/core/utils.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import { prefs } from "./prefs"

/** Timestamped console logging, gated on the `log` preference. */
export function log(...args: Array<unknown>): void {
  if (prefs.log) {
    // eslint-disable-next-line no-console -- this is the project's logging primitive
    console.log(new Date().toLocaleTimeString(), ...args)
  }
}

/** Surface an error/message as a basic notification. */
export function notify(e: Error | string): void {
  chrome.notifications.create({
    title: chrome.runtime.getManifest().name,
    type: "basic",
    iconUrl: "/assets/icon-48.png",
    message: typeof e === "string" ? e : e.message,
  })
}

/** Promise wrapper over `chrome.tabs.query`. */
export function query(
  options: chrome.tabs.QueryInfo
): Promise<Array<chrome.tabs.Tab>> {
  return new Promise((resolve) => chrome.tabs.query(options, resolve))
}

/**
 * Returns true when `hostname`/`href` matches any rule in `list`. Plain entries
 * match the hostname exactly; `re:`-prefixed entries are tested as regexps
 * against the full href.
 */
export function match(
  list: Array<string>,
  hostname: string,
  href: string
): boolean {
  if (list.filter((s) => !s.startsWith("re:")).indexOf(hostname) !== -1) {
    return true
  }
  return list
    .filter((s) => s.startsWith("re:"))
    .map((s) => s.slice(3))
    .some((s) => {
      try {
        return new RegExp(s).test(href)
      } catch {
        return false
      }
    })
}
