// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Adapted from auto-tab-discard v3/data/popup (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import { svgNode } from "@suspender/popup/svg"

/** The discard state of the active tab, as surfaced to the popup header. */
export type TabState = "suspended" | "active"

export type TabStatusProps = {
  /** Page title of the active tab (falls back to a placeholder when empty). */
  title: string
  /** Favicon URL; omitted/empty renders the generic glyph instead of an image. */
  favIconUrl?: string
  /** Whether the tab is currently discarded. */
  state: TabState
  /** True when the tab's host is whitelisted (never auto-suspended). */
  whitelisted: boolean
}

/**
 * Header card describing the active tab: favicon, title, and a state pill that
 * reads `Suspended` / `Active`, plus a `Whitelisted` marker when the host is
 * exempt from auto-suspend.
 *
 * Postcondition: returns a detached `HTMLElement` ready to mount.
 */
export function TabStatus({
  title,
  favIconUrl,
  state,
  whitelisted,
}: TabStatusProps): HTMLElement {
  const el = document.createElement("header")
  el.className = "tab-status"
  el.setAttribute("data-state", state)

  const iconWrap = document.createElement("div")
  iconWrap.className = "tab-status__icon"
  if (favIconUrl) {
    const img = document.createElement("img")
    img.className = "tab-status__favicon"
    img.src = favIconUrl
    img.alt = ""
    // A broken favicon should not leave an empty box — swap to the glyph.
    img.addEventListener("error", () => {
      img.remove()
      iconWrap.appendChild(glyph())
    })
    iconWrap.appendChild(img)
  } else {
    iconWrap.appendChild(glyph())
  }

  const body = document.createElement("div")
  body.className = "tab-status__body"

  const titleEl = document.createElement("span")
  titleEl.className = "tab-status__title"
  titleEl.textContent = title || "Untitled tab"
  titleEl.title = title

  const meta = document.createElement("div")
  meta.className = "tab-status__meta"

  const pill = document.createElement("span")
  pill.className = `tab-status__pill tab-status__pill--${state}`
  pill.textContent = state === "suspended" ? "Suspended" : "Active"
  meta.appendChild(pill)

  if (whitelisted) {
    const wl = document.createElement("span")
    wl.className = "tab-status__pill tab-status__pill--whitelisted"
    wl.textContent = "Whitelisted"
    meta.appendChild(wl)
  }

  body.append(titleEl, meta)
  el.append(iconWrap, body)
  return el
}

/** Generic globe glyph used when a tab has no usable favicon. */
function glyph(): Node {
  return svgNode(
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
  )
}
