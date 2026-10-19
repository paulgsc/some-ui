/**
 * Popup (`popup.html`), after the 2026-10-19 prototype (#1966): the on/off
 * switch, the mode, "Show videos older than", what autoplay does at a held
 * video, and links to the settings page and Diagnostics.
 *
 * `storage.local` is the only state: a click writes the settings, and the
 * popup renders from {@link followSettings}, so what it shows is what the
 * content script applies.
 */
import { onSwitch, segments } from "@censor/lib/settings/choices"
import type { Settings } from "@censor/lib/settings/settings"
import {
  AUTOPLAYS,
  BOUNDARIES,
  BOUNDARY_LABEL,
  createSaver,
  followSettings,
  MODES,
} from "@censor/lib/settings/settings"
import {
  AGE_QUESTION,
  AUTOPLAY_QUESTION,
  AUTOPLAY_WORDS,
  MODE_WORDS,
} from "@censor/lib/settings/words"
import { ext } from "@censor/platform/content"
import { diagnosticsLink } from "@some-extension/common/lib/diagnostics"

import "./popup.css"

const save = createSaver(ext.storage.local)

function header(settings: Settings): HTMLElement {
  const el = document.createElement("header")
  el.className = "popup__header"

  const name = document.createElement("span")
  name.className = "popup__name"
  name.textContent = "BOYO"

  el.append(
    name,
    onSwitch(settings.enabled, () => {
      save((stored) => ({ ...stored, enabled: !stored.enabled }))
    })
  )
  return el
}

function choices(settings: Settings): HTMLElement {
  const el = document.createElement("div")
  el.className = "popup__choices"
  el.append(
    segments({
      id: "mode",
      question: "Mode",
      values: MODES,
      label: (mode) => MODE_WORDS[mode].name,
      current: settings.mode,
      onPick: (mode) => save((stored) => ({ ...stored, mode })),
      line: MODE_WORDS[settings.mode].tag,
    }),
    segments({
      id: "age",
      question: AGE_QUESTION,
      values: BOUNDARIES,
      label: (boundary) => BOUNDARY_LABEL[boundary],
      current: settings.boundary,
      onPick: (boundary) => save((stored) => ({ ...stored, boundary })),
    }),
    segments({
      id: "autoplay",
      question: AUTOPLAY_QUESTION,
      values: AUTOPLAYS,
      label: (autoplay) => AUTOPLAY_WORDS[autoplay].label,
      current: settings.autoplay,
      onPick: (autoplay) => save((stored) => ({ ...stored, autoplay })),
      line: AUTOPLAY_WORDS[settings.autoplay].line,
    })
  )
  return el
}

function footer(): HTMLElement {
  const el = document.createElement("div")
  el.className = "popup__links"
  const all = document.createElement("button")
  all.type = "button"
  all.className = "popup__link"
  all.textContent = "All settings"
  all.addEventListener("click", () => {
    void ext.runtime.openOptionsPage()
  })
  el.append(
    all,
    diagnosticsLink({
      href: ext.runtime.getURL("debug.html"),
      tooltip: "Card resolution health, metrics and the masking event timeline",
    })
  )
  return el
}

function render(settings: Settings): void {
  const root = document.getElementById("app")
  if (!root) return
  root.classList.toggle("boyo-popup-off", !settings.enabled)
  root.replaceChildren(header(settings), choices(settings), footer())
}

followSettings(ext.storage, render)
