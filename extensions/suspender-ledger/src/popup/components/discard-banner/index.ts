// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { svgNode } from "@suspender/popup/svg"

export type DiscardBannerProps = {
  /**
   * Deduplicated, plain-language reasons at least one background tab could
   * not be suspended (see `worker/core/discard-state.ts`). Empty renders
   * nothing — most opens of the popup have nothing to report.
   */
  reasons: Array<string>
}

const ICON_WARNING = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`

/**
 * A single ambient callout, not a per-tab audit. The browser's own discard
 * veto exposes no reason string to extensions, so a per-tab breakdown would either
 * fabricate specificity the API can't back up, or dump raw internal state on
 * a user who never asked to be a developer. This renders only the unique
 * reasons present right now, phrased as the browser's own decision — never
 * "this extension failed to suspend your tab."
 *
 * Postcondition: returns a detached, hidden `HTMLElement` when `reasons` is
 * empty, so callers can mount it unconditionally alongside the rest of the
 * popup.
 */
export function DiscardBanner({ reasons }: DiscardBannerProps): HTMLElement {
  const el = document.createElement("div")
  el.className = "discard-banner"

  if (reasons.length === 0) {
    el.hidden = true
    return el
  }

  const icon = document.createElement("div")
  icon.className = "discard-banner__icon"
  icon.appendChild(svgNode(ICON_WARNING))

  const body = document.createElement("div")
  body.className = "discard-banner__body"

  const heading = document.createElement("p")
  heading.className = "discard-banner__heading"
  heading.textContent = "Some tabs were kept awake by Firefox"

  const list = document.createElement("ul")
  list.className = "discard-banner__list"
  for (const reason of reasons) {
    const item = document.createElement("li")
    item.textContent = reason
    list.appendChild(item)
  }

  body.append(heading, list)
  el.append(icon, body)
  return el
}
