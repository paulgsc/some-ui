/**
 * Popup (`popup.html`), built to prototype D (`QD16`, #1807): the on/off
 * switch, "Show videos older than", and the Diagnostics link.
 *
 * `storage.local` is the only state: a click writes the settings, and the
 * popup renders from {@link followSettings}, so what it shows is what the
 * content script applies.
 */
import type { Settings } from "@censor/lib/settings/settings"
import {
  BOUNDARIES,
  BOUNDARY_CHANGES_KEY,
  BOUNDARY_LABEL,
  followSettings,
  parseSettings,
  SETTINGS_KEY,
  settingsWrite,
} from "@censor/lib/settings/settings"
import { ext } from "@censor/platform/content"
import { diagnosticsLink } from "@some-extension/common/lib/diagnostics"

import "./popup.css"

let saving: Promise<void> = Promise.resolve()

/**
 * Apply `change` to what is stored, one save at a time: two quick clicks each
 * build on the other's write, and neither drops a log entry.
 */
function save(change: (stored: Settings) => Settings): void {
  saving = saving
    .then(async () => {
      const stored = await ext.storage.local.get([
        SETTINGS_KEY,
        BOUNDARY_CHANGES_KEY,
      ])
      const next = change(parseSettings(stored[SETTINGS_KEY]))
      await ext.storage.local.set(settingsWrite(stored, next, Date.now()))
    })
    // A failed save leaves storage, and so the popup, as it was.
    .catch(() => undefined)
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
    save((stored) => ({ ...stored, enabled: !stored.enabled }))
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
      save((stored) => ({ ...stored, boundary }))
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

followSettings(ext.storage, render)
