/**
 * Popup (`popup.html`), built to prototype D (`QD16`, #1807): the on/off
 * switch, "Show videos older than", and the Diagnostics link
 * (`@some-extension/common`'s `diagnosticsLink`, as in the sibling popups).
 * No counts and no history.
 *
 * `storage.local` is the only state: a click writes the settings, and the
 * popup renders from `storage.onChanged`, so what it shows is what the
 * content script applies.
 */
import type { Settings } from "@censor/lib/settings/settings"
import {
  BOUNDARIES,
  BOUNDARY_CHANGES_KEY,
  BOUNDARY_LABEL,
  parseSettings,
  SETTINGS_KEY,
  settingsWrite,
} from "@censor/lib/settings/settings"
import { ext } from "@censor/platform/content"
import { diagnosticsLink } from "@some-extension/common/lib/diagnostics"

import "./popup.css"

async function save(next: Settings): Promise<void> {
  const stored = await ext.storage.local.get([
    SETTINGS_KEY,
    BOUNDARY_CHANGES_KEY,
  ])
  await ext.storage.local.set(settingsWrite(stored, next, Date.now()))
}

function header(settings: Settings): HTMLElement {
  const el = document.createElement("header")
  el.className = "popup__header"

  const name = document.createElement("span")
  name.className = "popup__name"
  name.textContent = "BOYO"

  const toggle = document.createElement("button")
  toggle.type = "button"
  toggle.className = "popup__switch"
  toggle.setAttribute("role", "switch")
  toggle.setAttribute("aria-checked", String(settings.enabled))
  toggle.setAttribute("aria-label", "On")
  toggle.addEventListener("click", () => {
    void save({ ...settings, enabled: !settings.enabled })
  })

  el.append(name, toggle)
  return el
}

function boundaryChoice(settings: Settings): HTMLElement {
  const el = document.createElement("div")
  el.className = "popup__question"

  const label = document.createElement("div")
  label.className = "popup__label"
  label.id = "boundary-label"
  label.textContent = "Show videos older than"

  const group = document.createElement("div")
  group.className = "popup__segments"
  group.setAttribute("role", "group")
  group.setAttribute("aria-labelledby", label.id)
  for (const boundary of BOUNDARIES) {
    const option = document.createElement("button")
    option.type = "button"
    option.textContent = BOUNDARY_LABEL[boundary]
    option.setAttribute("aria-pressed", String(boundary === settings.boundary))
    option.addEventListener("click", () => {
      void save({ ...settings, boundary })
    })
    group.appendChild(option)
  }

  el.append(label, group)
  return el
}

function render(settings: Settings): void {
  const root = document.getElementById("app")
  if (!root) return

  root.replaceChildren(
    header(settings),
    boundaryChoice(settings),
    diagnosticsLink({
      href: ext.runtime.getURL("debug.html"),
      tooltip: "Card resolution health, metrics and the masking event timeline",
    })
  )
}

// Lifetime: the popup document's own; closing the popup ends it.
ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && SETTINGS_KEY in changes)
    render(parseSettings(changes[SETTINGS_KEY].newValue))
})

void ext.storage.local
  .get(SETTINGS_KEY)
  .then((stored) => render(parseSettings(stored[SETTINGS_KEY])))
