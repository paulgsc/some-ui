/**
 * Popup (`popup.html`), after the 2026-10-19 prototype (#1966): the on/off
 * switch, the mode, "Show videos older than", what autoplay does at a held
 * video, and links to the settings page and Diagnostics.
 *
 * `storage.local` is the only state: a click writes the settings, and the
 * popup renders from {@link followSettings}, so what it shows is what the
 * content script applies. When the toolbar button carries the notice
 * (R13, `lib/notice`), the popup says what it means at the top.
 */
import { stoppedOn } from "@censor/lib/notice/notice"
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
  MODE_QUESTION,
  MODE_WORDS,
  PAGE_WORDS,
  STOP_WORDS,
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
  el.toggleAttribute("inert", !settings.enabled)
  el.append(
    segments({
      id: "mode",
      question: MODE_QUESTION,
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
  all.textContent = PAGE_WORDS.allSettings
  all.addEventListener("click", () => {
    void ext.runtime.openOptionsPage()
  })
  el.append(
    all,
    diagnosticsLink({
      href: ext.runtime.getURL("debug.html"),
      label: PAGE_WORDS.diagnostics,
      tooltip: PAGE_WORDS.diagnosticsTip,
    })
  )
  return el
}

/** R13: what the toolbar button's notice means. */
function stopNote(): HTMLElement {
  const el = document.createElement("p")
  el.className = "popup__stopped"
  const headline = document.createElement("strong")
  headline.textContent = STOP_WORDS.headline
  el.append(headline, document.createElement("br"), STOP_WORDS.line)
  return el
}

/** Whether the notice is on the active tab's button. */
async function stoppedHere(): Promise<boolean> {
  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
    return tab?.id === undefined ? false : await stoppedOn(ext.action, tab.id)
  } catch {
    // No tab or no button to read: no notice to explain.
    return false
  }
}

let shown: Settings | null = null
let stopped = false

function render(settings: Settings): void {
  shown = settings
  const root = document.getElementById("app")
  if (!root) return
  root.classList.toggle("boyo-popup-off", !settings.enabled)
  root.replaceChildren(
    header(settings),
    ...(stopped && settings.enabled ? [stopNote()] : []),
    choices(settings),
    footer()
  )
}

followSettings(ext.storage, render)
void stoppedHere().then((here) => {
  stopped = here
  if (here && shown !== null) render(shown)
})
