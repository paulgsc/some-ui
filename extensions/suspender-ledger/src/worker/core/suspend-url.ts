// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Constructs the `suspend.html` URL for a tab about to be suspended. Embeds
 * the original URL (for restore), the prefixed title (for the tab-strip
 * marker), and the favicon so the suspend page can reflect the tab's identity
 * while it is parked.
 */
export function buildSuspendUrl(tab: chrome.tabs.Tab, marker: string): string {
  const base = chrome.runtime.getURL("suspend.html")
  const params = new URLSearchParams()
  if (tab.url) {
    params.set("url", tab.url)
  }
  const title = [marker, tab.title].filter(Boolean).join(" ")
  if (title) {
    params.set("title", title)
  }
  if (tab.favIconUrl) {
    params.set("favicon", tab.favIconUrl)
  }
  return `${base}?${params.toString()}`
}

/**
 * True when the tab is already showing our suspend page, used to prevent
 * double-suspending a parked tab.
 */
export function isSuspendTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? ""
  return url.startsWith(chrome.runtime.getURL("suspend.html"))
}
