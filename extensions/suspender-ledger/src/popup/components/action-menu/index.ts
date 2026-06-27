// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Adapted from auto-tab-discard v3/data/popup (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import type { PopupCommand } from "@suspender/types/messages"
import { svgNode } from "@suspender/popup/svg"

export type ActionMenuProps = {
  /** True when the active tab's host is whitelisted (drives the toggle label). */
  whitelisted: boolean
  /** True when the active tab is auto-suspendable (`autoDiscardable !== false`). */
  autoSuspendable: boolean
  /**
   * Dispatch a command against the active tab. `shiftKey` mirrors the menu
   * dispatcher's modifier (e.g. suspend *all* eligible vs. exact-URL whitelist);
   * `checked` carries the desired state for the toggle actions.
   */
  onCommand: (
    cmd: PopupCommand,
    opts?: { shiftKey?: boolean; checked?: boolean; value?: boolean }
  ) => void
}

const ICONS = {
  suspend: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>`,
  layers: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  windows: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>`,
  prev: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  next: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
} as const

/**
 * Primary action grid for the popup: suspend the current tab, suspend every
 * discardable tab, suspend other windows, jump focus between tabs, and two
 * per-tab toggles (whitelist host, auto-suspendable).
 *
 * Postcondition: returns a detached `HTMLElement` ready to mount.
 */
export function ActionMenu({
  whitelisted,
  autoSuspendable,
  onCommand,
}: ActionMenuProps): HTMLElement {
  const el = document.createElement("div")
  el.className = "action-menu"

  const primary = document.createElement("div")
  primary.className = "action-menu__grid"

  primary.append(
    actionButton(ICONS.suspend, "Suspend tab", () =>
      onCommand("discard-tab")
    ),
    actionButton(ICONS.layers, "Suspend all", () =>
      // shiftKey forces every eligible tab rather than honouring the count cap
      onCommand("discard-tabs", { shiftKey: true })
    ),
    actionButton(ICONS.windows, "Other windows", () =>
      onCommand("discard-other-windows", { shiftKey: true })
    ),
  )
  el.appendChild(primary)

  // ── Focus navigation ──────────────────────────────────────────────────────
  const nav = document.createElement("div")
  nav.className = "action-menu__nav"
  nav.append(
    actionButton(ICONS.prev, "Prev tab", () => onCommand("move-previous"), {
      compact: true,
    }),
    actionButton(ICONS.next, "Next tab", () => onCommand("move-next"), {
      compact: true,
    }),
  )
  el.appendChild(nav)

  // ── Per-tab toggles ───────────────────────────────────────────────────────
  const toggles = document.createElement("div")
  toggles.className = "action-menu__toggles"

  toggles.appendChild(
    toggleRow(
      "Whitelist this domain",
      "Never auto-suspend tabs on this host",
      whitelisted,
      (checked) => onCommand("whitelist-domain", { checked })
    )
  )
  toggles.appendChild(
    toggleRow(
      "Auto-suspendable",
      "Allow this tab to be suspended automatically",
      autoSuspendable,
      (checked) => onCommand("auto-discardable", { value: checked, checked })
    )
  )
  el.appendChild(toggles)

  return el
}

function actionButton(
  icon: string,
  label: string,
  onClick: () => void,
  opts: { compact?: boolean } = {}
): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = `action-menu__btn${opts.compact ? " action-menu__btn--compact" : ""}`
  const text = document.createElement("span")
  text.textContent = label
  btn.replaceChildren(svgNode(icon), text)
  btn.addEventListener("click", onClick)
  return btn
}

function toggleRow(
  label: string,
  hint: string,
  checked: boolean,
  onToggle: (checked: boolean) => void
): HTMLElement {
  const row = document.createElement("label")
  row.className = "action-menu__toggle"

  const text = document.createElement("div")
  text.className = "action-menu__toggle-text"
  const main = document.createElement("span")
  main.className = "action-menu__toggle-label"
  main.textContent = label
  const sub = document.createElement("span")
  sub.className = "action-menu__toggle-hint"
  sub.textContent = hint
  text.append(main, sub)

  const input = document.createElement("input")
  input.type = "checkbox"
  input.className = "action-menu__toggle-input"
  input.checked = checked
  input.addEventListener("change", () => onToggle(input.checked))

  const track = document.createElement("span")
  track.className = "action-menu__toggle-track"
  track.setAttribute("aria-hidden", "true")

  row.append(text, input, track)
  return row
}
